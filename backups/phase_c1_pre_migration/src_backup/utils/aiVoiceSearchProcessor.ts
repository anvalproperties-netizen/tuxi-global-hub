import { GoogleGenAI, Type } from '@google/genai';

export interface VoiceSearchRequest {
  query: string;
  activeCity?: {
    city: string;
    country: string;
    currencySymbol: string;
    currencyCode: string;
  };
  businesses?: {
    id: string;
    type: 'eats' | 'shop';
    name: string;
    category: string;
    address: string;
    rating: number;
    menuItems?: {
      id: string;
      name: string;
      description?: string;
      price: number;
      category?: string;
      isAvailable?: boolean;
    }[];
    products?: {
      id: string;
      name: string;
      description?: string;
      price: number;
      category?: string;
      isAvailable?: boolean;
    }[];
  }[];
}

export interface MatchedItemResult {
  itemId: string;
  name: string;
  description: string;
  price: number;
  businessId: string;
  businessName: string;
  businessType: 'eats' | 'shop';
  category: string;
  matchScore: number;
  highlightReason: string;
}

export interface MatchedBusinessResult {
  businessId: string;
  name: string;
  type: 'eats' | 'shop';
  category: string;
  address: string;
  rating: number;
  highlightReason: string;
}

export interface CourierBookingIntent {
  isCourierRequest: boolean;
  suggestedPickup?: string;
  suggestedDropoff?: string;
  suggestedParcelType?: string;
}

export interface VoiceSearchResponse {
  interpretedQuery: string;
  intent: 'eats' | 'shop' | 'courier' | 'all';
  aiSpokenSummary: string;
  matchedItems: MatchedItemResult[];
  matchedBusinesses: MatchedBusinessResult[];
  courierIntent?: CourierBookingIntent;
  confidenceScore: number;
  suggestedActions: string[];
  source: 'gemini_3.8_flash' | 'intelligent_matcher_fallback';
}

export function fallbackVoiceSearch(request: VoiceSearchRequest): VoiceSearchResponse {
  const q = (request.query || '').trim().toLowerCase();
  const currency = request.activeCity?.currencySymbol || '£';
  const businesses = request.businesses || [];

  const matchedItems: MatchedItemResult[] = [];
  const matchedBusinesses: MatchedBusinessResult[] = [];

  const isCourier = q.includes('courier') || q.includes('parcel') || q.includes('package') || q.includes('deliver') && (q.includes('document') || q.includes('box') || q.includes('to '));
  const isShop = q.includes('shop') || q.includes('grocery') || q.includes('market') || q.includes('organic') || q.includes('bread') || q.includes('fruit') || q.includes('vegetable');
  const isEats = q.includes('pizza') || q.includes('food') || q.includes('eat') || q.includes('ramen') || q.includes('burger') || q.includes('lunch') || q.includes('dinner') || q.includes('restaurant');

  // Search items across businesses
  for (const biz of businesses) {
    let bizMatched = false;
    if (biz.name.toLowerCase().includes(q) || biz.category.toLowerCase().includes(q)) {
      bizMatched = true;
      matchedBusinesses.push({
        businessId: biz.id,
        name: biz.name,
        type: biz.type,
        category: biz.category,
        address: biz.address,
        rating: biz.rating,
        highlightReason: `Direct match with store category "${biz.category}".`
      });
    }

    const items = [...(biz.menuItems || []), ...(biz.products || [])];
    for (const item of items) {
      const nameMatch = item.name.toLowerCase().includes(q) || q.split(' ').some(word => word.length > 2 && item.name.toLowerCase().includes(word));
      const descMatch = item.description?.toLowerCase().includes(q) || false;
      const catMatch = item.category?.toLowerCase().includes(q) || false;

      if (nameMatch || descMatch || catMatch || (bizMatched && matchedItems.length < 4)) {
        matchedItems.push({
          itemId: item.id,
          name: item.name,
          description: item.description || '',
          price: item.price,
          businessId: biz.id,
          businessName: biz.name,
          businessType: biz.type,
          category: item.category || biz.category,
          matchScore: nameMatch ? 0.95 : (descMatch ? 0.82 : 0.75),
          highlightReason: nameMatch 
            ? `Top match for your vocal query "${q}".` 
            : `Related item available at ${biz.name}.`
        });
      }
    }
  }

  // Deduplicate and limit
  const uniqueItems = matchedItems.slice(0, 6);
  const uniqueBiz = matchedBusinesses.slice(0, 4);

  let intent: 'eats' | 'shop' | 'courier' | 'all' = 'all';
  if (isCourier) intent = 'courier';
  else if (isEats && !isShop) intent = 'eats';
  else if (isShop && !isEats) intent = 'shop';

  const courierIntent: CourierBookingIntent = {
    isCourierRequest: isCourier,
    suggestedPickup: 'Central Business Hub',
    suggestedDropoff: 'Downtown Residential District',
    suggestedParcelType: q.includes('document') ? 'Urgent Document Tube' : 'Standard Express Parcel'
  };

  let aiSpokenSummary = '';
  if (isCourier) {
    aiSpokenSummary = `I detected a request for TUXI Courier on-demand parcel dispatch. You can book an immediate courier pickup right away.`;
  } else if (uniqueItems.length > 0) {
    const topItem = uniqueItems[0];
    aiSpokenSummary = `I found ${uniqueItems.length} option${uniqueItems.length > 1 ? 's' : ''} for "${request.query}". The top recommendation is ${topItem.name} for ${currency}${topItem.price.toFixed(2)} from ${topItem.businessName}.`;
  } else if (uniqueBiz.length > 0) {
    aiSpokenSummary = `I found ${uniqueBiz.length} merchant${uniqueBiz.length > 1 ? 's' : ''} matching "${request.query}", including ${uniqueBiz[0].name}.`;
  } else {
    aiSpokenSummary = `I searched for "${request.query}" across TUXI Eats, Shop, and Courier. Browse all live stores in your active city below.`;
  }

  return {
    interpretedQuery: request.query,
    intent,
    aiSpokenSummary,
    matchedItems: uniqueItems,
    matchedBusinesses: uniqueBiz,
    courierIntent,
    confidenceScore: 0.91,
    suggestedActions: [
      uniqueItems.length > 0 ? `Add ${uniqueItems[0].name} to Cart` : 'Explore Marketplace',
      'Filter Category',
      'Voice Search Again'
    ],
    source: 'intelligent_matcher_fallback'
  };
}

export async function processAIVoiceSearch(request: VoiceSearchRequest): Promise<VoiceSearchResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !request.query?.trim()) {
    return fallbackVoiceSearch(request);
  }

  const { query, activeCity, businesses = [] } = request;
  const currency = activeCity?.currencySymbol || '$';
  const cityName = activeCity?.city || 'Local Area';

  // Build a concise catalog context for Gemini
  const catalogSummary = businesses.slice(0, 15).map(b => ({
    id: b.id,
    name: b.name,
    type: b.type,
    category: b.category,
    rating: b.rating,
    items: [...(b.menuItems || []), ...(b.products || [])].slice(0, 8).map(i => ({
      id: i.id,
      name: i.name,
      price: i.price,
      desc: i.description || '',
      category: i.category || ''
    }))
  }));

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const prompt = `You are the autonomous AI Voice Search Assistant for TUXI, a global multi-role marketplace combining TUXI Eats (restaurant dining & delivery), TUXI Shop (groceries & retail), and TUXI Courier (instant parcel delivery).
Current Active City: ${cityName}, ${activeCity?.country || 'Global'}
Current Platform Currency: ${currency} (${activeCity?.currencyCode || 'USD'})

User Spoken Voice Query: "${query}"

Available Marketplace Catalog:
${JSON.stringify(catalogSummary, null, 2)}

Instructions:
1. Interpret the user's vocal query and determine their intent ('eats', 'shop', 'courier', or 'all').
2. Identify any matching products or dishes from the catalog that satisfy the user's dietary, category, price, or taste requirements.
3. Identify matching restaurants or stores.
4. If the query implies parcel delivery or shipping (e.g. "deliver package", "send documents", "courier"), set courierIntent with relevant details.
5. Create a concise, conversational 1-2 sentence AI spoken summary suitable for text-to-speech audio feedback.
6. Provide an array of suggested immediate user actions.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are an intelligent marketplace search and voice navigation assistant. Return accurate semantic matches and conversational voice responses.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            interpretedQuery: { type: Type.STRING, description: 'Refined search query string' },
            intent: { type: Type.STRING, description: 'eats, shop, courier, or all' },
            aiSpokenSummary: { type: Type.STRING, description: 'Natural 1-2 sentence spoken summary for voice feedback' },
            confidenceScore: { type: Type.NUMBER, description: 'Confidence between 0.0 and 1.0' },
            suggestedActions: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: 'Quick clickable actions'
            },
            matchedItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  itemId: { type: Type.STRING },
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                  businessId: { type: Type.STRING },
                  businessName: { type: Type.STRING },
                  businessType: { type: Type.STRING },
                  category: { type: Type.STRING },
                  matchScore: { type: Type.NUMBER },
                  highlightReason: { type: Type.STRING }
                },
                required: ['itemId', 'name', 'price', 'businessId', 'businessName', 'businessType', 'matchScore', 'highlightReason']
              }
            },
            matchedBusinesses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  businessId: { type: Type.STRING },
                  name: { type: Type.STRING },
                  type: { type: Type.STRING },
                  category: { type: Type.STRING },
                  address: { type: Type.STRING },
                  rating: { type: Type.NUMBER },
                  highlightReason: { type: Type.STRING }
                },
                required: ['businessId', 'name', 'type', 'category', 'highlightReason']
              }
            },
            courierIntent: {
              type: Type.OBJECT,
              properties: {
                isCourierRequest: { type: Type.BOOLEAN },
                suggestedPickup: { type: Type.STRING },
                suggestedDropoff: { type: Type.STRING },
                suggestedParcelType: { type: Type.STRING }
              },
              required: ['isCourierRequest']
            }
          },
          required: [
            'interpretedQuery',
            'intent',
            'aiSpokenSummary',
            'confidenceScore',
            'matchedItems',
            'matchedBusinesses',
            'suggestedActions'
          ]
        }
      }
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    return {
      ...parsed,
      intent: (parsed.intent === 'eats' || parsed.intent === 'shop' || parsed.intent === 'courier') ? parsed.intent : 'all',
      source: 'gemini_3.8_flash'
    };
  } catch (err: any) {
    console.warn('[AI Voice Search Gemini fallback]', err?.message);
    return fallbackVoiceSearch(request);
  }
}
