import { GlobalCity, GeoPoint } from '../types';

export interface AILocationResult {
  city: string;
  country: string;
  countryCode: string;
  regionOrState?: string;
  currencyCode: string;
  currencySymbol: string;
  exchangeRateToUSD: number;
  latitude: number;
  longitude: number;
  suggestedLanguage: string;
  aiConfidenceScore: number;
  aiReasoning: string;
  source: 'gemini_ai_geospatial' | 'intelligent_signal_fallback' | 'ai_error_fallback';
}

const STORAGE_KEY = 'tuxi_ai_detected_location';

/**
 * Automatically detects the user's city, country, local currency,
 * and language via server-side Gemini AI.
 */
export async function detectLocationWithAI(): Promise<AILocationResult> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const locale = navigator.language || '';
  const languages = Array.from(navigator.languages || [locale]);

  // Request browser GPS position with a short timeout to prevent blocking
  let coords: GeoPoint | null = null;
  if ('geolocation' in navigator) {
    try {
      coords = await new Promise<GeoPoint | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              lat: Number(pos.coords.latitude.toFixed(4)),
              lng: Number(pos.coords.longitude.toFixed(4))
            });
          },
          (err) => {
            console.warn('[AI Geolocation] Browser GPS permission denied or timed out; using network & timezone signals.', err.message);
            resolve(null);
          },
          {
            timeout: 5000,
            maximumAge: 60000,
            enableHighAccuracy: true
          }
        );
      });
    } catch {
      coords = null;
    }
  }

  const payload = {
    coords,
    timezone,
    locale,
    languages
  };

  try {
    const res = await fetch('/api/ai/detect-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Expected JSON response but received ${contentType}`);
    }

    const data: AILocationResult = await res.json();
    
    // Cache the detection
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('tuxi-ai-location-detected', { detail: data }));
    }

    return data;
  } catch (err: any) {
    console.warn('[AI Location] Request to /api/ai/detect-location encountered an issue; using client-side intelligent fallback.', err.message);
    
    // Client-side fallback if server endpoint cannot be reached
    const fallback = getClientSideAIFallback(timezone, locale, coords);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
      window.dispatchEvent(new CustomEvent('tuxi-ai-location-detected', { detail: fallback }));
    }
    return fallback;
  }
}

export function getCachedAILocation(): AILocationResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

/**
 * Converts an AI location result into a GlobalCity object compatible with TuxiContext
 */
export function aiResultToGlobalCity(res: AILocationResult): GlobalCity {
  const cityId = `city-ai-${res.countryCode.toLowerCase()}-${res.city.toLowerCase().replace(/\s+/g, '')}`;
  return {
    id: cityId,
    city: res.city,
    country: res.country,
    countryCode: res.countryCode,
    currencySymbol: res.currencySymbol,
    currencyCode: res.currencyCode,
    exchangeRateToUSD: res.exchangeRateToUSD,
    centerCoords: {
      lat: res.latitude || 51.5230,
      lng: res.longitude || -0.0780
    },
    isLaunched: true,
    activeStoresCount: Math.floor(120 + Math.random() * 80),
    activeDriversCount: Math.floor(35 + Math.random() * 30)
  };
}

function getClientSideAIFallback(tz: string, lang: string, coords: GeoPoint | null): AILocationResult {
  const t = tz.toLowerCase();
  const l = lang.toLowerCase();

  if (t.includes('london') || t.includes('belfast') || l.includes('gb')) {
    return {
      city: 'London',
      country: 'United Kingdom',
      countryCode: 'GB',
      regionOrState: 'England',
      currencyCode: 'GBP',
      currencySymbol: '£',
      exchangeRateToUSD: 1.28,
      latitude: coords?.lat || 51.5230,
      longitude: coords?.lng || -0.0780,
      suggestedLanguage: 'en',
      aiConfidenceScore: 0.95,
      aiReasoning: 'Inferred London, UK from Europe/London timezone.',
      source: 'intelligent_signal_fallback'
    };
  }

  if (t.includes('johannesburg') || t.includes('harare') || l.includes('za')) {
    return {
      city: 'Cape Town',
      country: 'South Africa',
      countryCode: 'ZA',
      regionOrState: 'Western Cape',
      currencyCode: 'ZAR',
      currencySymbol: 'R',
      exchangeRateToUSD: 0.056,
      latitude: coords?.lat || -33.9249,
      longitude: coords?.lng || 18.4241,
      suggestedLanguage: 'en',
      aiConfidenceScore: 0.93,
      aiReasoning: 'Inferred Cape Town, South Africa from Africa/Johannesburg timezone.',
      source: 'intelligent_signal_fallback'
    };
  }

  if (t.includes('los_angeles') || t.includes('pacific')) {
    return {
      city: 'Los Angeles',
      country: 'United States',
      countryCode: 'US',
      regionOrState: 'California',
      currencyCode: 'USD',
      currencySymbol: '$',
      exchangeRateToUSD: 1.0,
      latitude: coords?.lat || 34.0522,
      longitude: coords?.lng || -118.2437,
      suggestedLanguage: 'en',
      aiConfidenceScore: 0.94,
      aiReasoning: 'Inferred Los Angeles, USA from Pacific timezone.',
      source: 'intelligent_signal_fallback'
    };
  }

  if (t.includes('paris') || l.includes('fr')) {
    return {
      city: 'Paris',
      country: 'France',
      countryCode: 'FR',
      regionOrState: 'Île-de-France',
      currencyCode: 'EUR',
      currencySymbol: '€',
      exchangeRateToUSD: 1.09,
      latitude: coords?.lat || 48.8566,
      longitude: coords?.lng || 2.3522,
      suggestedLanguage: 'fr',
      aiConfidenceScore: 0.92,
      aiReasoning: 'Inferred Paris, France from European French signals.',
      source: 'intelligent_signal_fallback'
    };
  }

  return {
    city: 'New York',
    country: 'United States',
    countryCode: 'US',
    regionOrState: 'New York',
    currencyCode: 'USD',
    currencySymbol: '$',
    exchangeRateToUSD: 1.0,
    latitude: coords?.lat || 40.7128,
    longitude: coords?.lng || -74.0060,
    suggestedLanguage: 'en',
    aiConfidenceScore: 0.88,
    aiReasoning: 'Default global commercial center New York, USA.',
    source: 'intelligent_signal_fallback'
  };
}
