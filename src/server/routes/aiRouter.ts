import { Router, Request, Response } from 'express';
import { GeminiAIService } from '../services/geminiAIService.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { getGeminiClient, GEMINI_TEXT_MODEL } from '../ai/geminiClient.js';

export const aiRouter = Router();

// ==========================================
// 1. AI RAPID ONBOARDING & EXTRACTION
// ==========================================
aiRouter.post('/merchant/extract-catalog', authenticateToken, requireRole('TUXI_EATS_OWNER', 'TUXI_SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { businessId, rawText, extractionType } = req.body;
    if (!businessId || !rawText || !extractionType) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'businessId, rawText, and extractionType (EATS_MENU | SHOP_CATALOGUE) are required.' });
    }
    const result = await GeminiAIService.extractMenuOrCatalogue({
      merchantUserId: req.user!.userId,
      businessId,
      rawText,
      extractionType
    });
    res.status(200).json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : err.message.includes('MALICIOUS') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

aiRouter.post('/merchant/confirm-extraction-draft', authenticateToken, requireRole('TUXI_EATS_OWNER', 'TUXI_SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { draftId } = req.body;
    if (!draftId) {
      return res.status(400).json({ error: 'MISSING_DRAFT_ID' });
    }
    const result = await GeminiAIService.confirmExtractionDraft(req.user!.userId, draftId);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : err.message.includes('NOT_FOUND') ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 2. AI MERCHANT COMMAND CENTER (READ-ONLY)
// ==========================================
aiRouter.get('/merchant/:businessId/command-insights', authenticateToken, requireRole('TUXI_EATS_OWNER', 'TUXI_SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const insights = await GeminiAIService.generateMerchantInsights(req.user!.userId, req.params.businessId);
    res.json(insights);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 3. AI SEMANTIC CUSTOMER DISCOVERY
// ==========================================
aiRouter.post('/customer/semantic-search', async (req: any, res: Response) => {
  try {
    const { query, customerLat, customerLng, maxDistanceKm, businessType } = req.body;
    if (customerLat === undefined || customerLng === undefined) {
      return res.status(400).json({ error: 'MISSING_COORDINATES', message: 'customerLat and customerLng are required' });
    }
    const results = await GeminiAIService.semanticCustomerSearch({
      customerUserId: req.user?.userId,
      query: query || '',
      customerLat: Number(customerLat),
      customerLng: Number(customerLng),
      maxDistanceKm: maxDistanceKm ? Number(maxDistanceKm) : undefined,
      businessType
    });
    res.json(results);
  } catch (err: any) {
    const status = err.message.includes('MALICIOUS') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 4. AI CUSTOMER SUPPORT (ORDER-SCOPED)
// ==========================================
aiRouter.post('/support/order-query', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, question } = req.body;
    if (!orderId || !question) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'orderId and question are required' });
    }
    const reply = await GeminiAIService.orderScopedSupport({
      customerUserId: req.user!.userId,
      orderId,
      question
    });
    res.json(reply);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : err.message.includes('NOT_FOUND') ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 5. AI CUSTOMER MULTILINGUAL CHAT ASSISTANT
// ==========================================
aiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { prompt, detectedLang, orderNumber, businessName } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'MISSING_PROMPT' });
    }
    const ai = getGeminiClient();
    const resp = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
      config: {
        systemInstruction: `You are the polite, multilingual TUXI Customer Support AI.
The user is speaking in language code: "${detectedLang || 'en'}".
Translate and respond FLUENTLY in that exact language (${detectedLang || 'en'}).
Active Order: #${orderNumber || 'TX-8921'} (${businessName || 'Store'}), Status: in_transit with courier Alex Turner.
If the user asks to change the app language to another country or language, inform them that TUXI automatically localizes to their preference.`
      }
    });
    res.json({ text: resp.text || '' });
  } catch (err: any) {
    console.warn('[AI Chat Route Warning]', err.message);
    res.status(500).json({ error: err.message });
  }
});
