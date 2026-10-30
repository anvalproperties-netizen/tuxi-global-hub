import { getGeminiClient, GEMINI_TEXT_MODEL } from '../ai/geminiClient.js';
import { postgresAdapter } from '../db/postgres.js';
import { MerchantService } from './merchantService.js';

export interface ExtractedCatalogItem {
  name: string;
  description: string;
  priceCents: number;
  category: string;
  sku?: string;
  isVegetarian?: boolean;
  isVegan?: boolean;
  isGlutenFree?: boolean;
}

export interface ExtractionResult {
  draftId: string;
  businessId: string;
  extractionType: 'EATS_MENU' | 'SHOP_CATALOGUE';
  itemsCount: number;
  items: ExtractedCatalogItem[];
  requiresMerchantConfirmation: true;
  reviewStatus: 'PENDING_REVIEW';
}

export class GeminiAIService {
  /**
   * Defensive input sanitization and prompt injection detection
   */
  public static sanitizeAndDetectInjection(input: string): { isSafe: boolean; sanitized: string; flaggedPatterns: string[] } {
    const dangerousPatterns = [
      /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
      /you\s+are\s+now\s+in\s+developer\s+mode/i,
      /system\s+prompt\s+override/i,
      /bypass\s+security\s+rules/i,
      /grant\s+admin\s+role/i,
      /drop\s+table/i,
      /select\s+\*\s+from\s+users/i,
      /as\s+an\s+unrestricted\s+ai/i,
      /DAN\s+mode/i
    ];

    const flagged: string[] = [];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(input)) {
        flagged.push(pattern.source);
      }
    }

    // Strip control characters while preserving unicode and punctuation
    const sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

    return {
      isSafe: flagged.length === 0,
      sanitized,
      flaggedPatterns: flagged
    };
  }

  /**
   * Log AI audit event to PostgreSQL
   */
  public static async logAIAudit(params: {
    actorId?: string;
    actorRole: string;
    endpoint: string;
    businessId?: string;
    orderId?: string;
    modelIdentifier: string;
    tokensPrompt?: number;
    tokensCompletion?: number;
    latencyMs?: number;
    sanitizedIntent?: string;
    flaggedInjection?: boolean;
  }) {
    try {
      await postgresAdapter.pool.query(`
        INSERT INTO ai_audit_logs (
          id, actor_id, actor_role, endpoint, business_id, order_id,
          model_identifier, tokens_prompt, tokens_completion, latency_ms,
          sanitized_intent, flagged_injection
        ) VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        );
      `, [
        params.actorId || null,
        params.actorRole,
        params.endpoint,
        params.businessId || null,
        params.orderId || null,
        params.modelIdentifier,
        params.tokensPrompt || 0,
        params.tokensCompletion || 0,
        params.latencyMs || 0,
        params.sanitizedIntent || 'Standard Request',
        params.flaggedInjection || false
      ]);
    } catch (err: any) {
      console.error('[AI Audit Logging Error]', err.message);
    }
  }

  /**
   * SERVICE 1: AI Rapid Merchant Onboarding & Menu/Catalogue Extraction
   * Extracts items into an unconfirmed draft. Never directly publishes to live catalog.
   */
  public static async extractMenuOrCatalogue(params: {
    merchantUserId: string;
    businessId: string;
    rawText: string;
    extractionType: 'EATS_MENU' | 'SHOP_CATALOGUE';
  }): Promise<ExtractionResult> {
    const startTime = Date.now();
    const defense = this.sanitizeAndDetectInjection(params.rawText);

    if (!defense.isSafe) {
      await this.logAIAudit({
        actorId: params.merchantUserId,
        actorRole: 'MERCHANT',
        endpoint: '/api/ai/merchant/extract-catalog',
        businessId: params.businessId,
        modelIdentifier: GEMINI_TEXT_MODEL,
        flaggedInjection: true,
        sanitizedIntent: 'INJECTION_ATTEMPT_BLOCKED'
      });
      throw new Error('MALICIOUS_PROMPT_INJECTION_DETECTED: The input violates enterprise AI safety rules.');
    }

    // Verify merchant business ownership & tenancy
    try {
      await MerchantService.verifyMerchantAccess(params.merchantUserId, params.businessId);
    } catch (err: any) {
      throw new Error(`FORBIDDEN_TENANT_ACCESS: ${err.message}`);
    }

    let items: ExtractedCatalogItem[] = [];

    // Check if live API key is available
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'UNCONFIGURED_KEY') {
      try {
        const ai = getGeminiClient();
        const prompt = `You are the TUXI Enterprise AI Catalog Onboarding Assistant.
Extract menu or catalogue items from the following merchant input.
Return a valid JSON array of objects with the exact schema:
[
  {
    "name": "string",
    "description": "string",
    "priceCents": integer (price in South African cents, e.g. R45.00 = 4500),
    "category": "string",
    "sku": "string (optional)",
    "isVegetarian": boolean,
    "isVegan": boolean,
    "isGlutenFree": boolean
  }
]
Only return JSON. No markdown ticks, no preamble.

Merchant Input:
${defense.sanitized}`;

        const response = await ai.models.generateContent({
          model: GEMINI_TEXT_MODEL,
          contents: prompt,
        });

        const text = response.text || '';
        const cleanedJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedJson);
        if (Array.isArray(parsed)) {
          items = parsed.map(p => ({
            name: String(p.name || 'Untitled Item'),
            description: String(p.description || ''),
            priceCents: Math.max(0, parseInt(p.priceCents, 10) || 1000),
            category: String(p.category || 'General'),
            sku: p.sku ? String(p.sku) : undefined,
            isVegetarian: !!p.isVegetarian,
            isVegan: !!p.isVegan,
            isGlutenFree: !!p.isGlutenFree
          }));
        }
      } catch (err: any) {
        console.warn('[Gemini AI Extraction Failed - Falling back to safe regex parser]:', err.message);
        items = this.safeRegexExtractor(defense.sanitized, params.extractionType);
      }
    } else {
      // Deterministic server-side extractor fallback
      items = this.safeRegexExtractor(defense.sanitized, params.extractionType);
    }

    // Save extracted draft in PostgreSQL
    const draftRes = await postgresAdapter.pool.query(`
      INSERT INTO ai_extraction_drafts (
        id, business_id, merchant_user_id, extraction_type,
        raw_input_summary, extracted_items, review_status
      ) VALUES (
        uuid_generate_v4(), $1, $2, $3, $4, $5, 'PENDING_REVIEW'
      ) RETURNING id;
    `, [
      params.businessId,
      params.merchantUserId,
      params.extractionType,
      defense.sanitized.slice(0, 500),
      JSON.stringify(items)
    ]);

    const draftId = draftRes.rows[0].id;
    const latency = Date.now() - startTime;

    await this.logAIAudit({
      actorId: params.merchantUserId,
      actorRole: 'MERCHANT',
      endpoint: '/api/ai/merchant/extract-catalog',
      businessId: params.businessId,
      modelIdentifier: GEMINI_TEXT_MODEL,
      latencyMs: latency,
      sanitizedIntent: `EXTRACT_${params.extractionType}`
    });

    return {
      draftId,
      businessId: params.businessId,
      extractionType: params.extractionType,
      itemsCount: items.length,
      items,
      requiresMerchantConfirmation: true,
      reviewStatus: 'PENDING_REVIEW'
    };
  }

  /**
   * Deterministic regex catalog parser fallback when external model is unconfigured
   */
  private static safeRegexExtractor(text: string, type: string): ExtractedCatalogItem[] {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const results: ExtractedCatalogItem[] = [];

    for (const line of lines) {
      // Example line: "Margherita Pizza - Traditional thin crust - R120.00"
      // or "1. Burger - R85"
      const priceMatch = line.match(/R\s*([0-9]+(?:\.[0-9]{2})?)/i) || line.match(/([0-9]+(?:\.[0-9]{2})?)\s*ZAR/i);
      let priceCents = 2500;
      if (priceMatch) {
        priceCents = Math.round(parseFloat(priceMatch[1]) * 100);
      }

      const parts = line.split(/[-–—:]/);
      const name = (parts[0] || 'Item').replace(/^[0-9]+[\.\)]\s*/, '').trim();
      const desc = parts.length > 1 ? parts.slice(1).join(' - ').replace(/R\s*[0-9]+(?:\.[0-9]{2})?/i, '').trim() : '';

      results.push({
        name: name || 'Catalog Item',
        description: desc || 'Extracted via intelligent catalog analyzer',
        priceCents: priceCents > 0 ? priceCents : 2500,
        category: type === 'EATS_MENU' ? 'Mains' : 'General Inventory',
        isVegetarian: /veg|cheese|margherita|salad/i.test(name),
        isVegan: /vegan/i.test(name),
        isGlutenFree: /gluten\s*free/i.test(name)
      });
    }

    if (results.length === 0) {
      results.push({
        name: 'Standard Merchant Item',
        description: 'Auto-extracted catalog item pending merchant review',
        priceCents: 5000,
        category: 'General'
      });
    }

    return results;
  }

  /**
   * Explicit merchant confirmation of extracted AI draft to publish into authoritative catalog
   */
  public static async confirmExtractionDraft(merchantUserId: string, draftId: string): Promise<{ confirmed: boolean; publishedCount: number }> {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const draftRes = await client.query(`
        SELECT d.*
        FROM ai_extraction_drafts d
        WHERE d.id = $1 FOR UPDATE;
      `, [draftId]);

      if (draftRes.rows.length === 0) {
        throw new Error('DRAFT_NOT_FOUND');
      }

      const draft = draftRes.rows[0];
      try {
        await MerchantService.verifyMerchantAccess(merchantUserId, draft.business_id);
      } catch (err: any) {
        throw new Error(`FORBIDDEN_TENANT_ACCESS: ${err.message}`);
      }

      if (draft.review_status === 'CONFIRMED') {
        await client.query('COMMIT;');
        return { confirmed: true, publishedCount: 0 };
      }

      const items: ExtractedCatalogItem[] = draft.extracted_items;
      let publishedCount = 0;

      if (draft.extraction_type === 'EATS_MENU') {
        // Ensure default category exists
        let catIdRes = await client.query(`
          SELECT id FROM menu_categories WHERE business_id = $1 LIMIT 1;
        `, [draft.business_id]);

        let categoryId: string;
        if (catIdRes.rows.length === 0) {
          const newCat = await client.query(`
            INSERT INTO menu_categories (id, business_id, name, sort_order)
            VALUES (uuid_generate_v4(), $1, 'Main Menu', 1) RETURNING id;
          `, [draft.business_id]);
          categoryId = newCat.rows[0].id;
        } else {
          categoryId = catIdRes.rows[0].id;
        }

        for (const it of items) {
          await client.query(`
            INSERT INTO menu_items (
              id, category_id, name, description,
              base_price_cents, currency, is_available
            ) VALUES (
              uuid_generate_v4(), $1, $2, $3, $4, 'ZAR', TRUE
            );
          `, [
            categoryId,
            it.name,
            it.description,
            it.priceCents
          ]);
          publishedCount++;
        }
      } else {
        // SHOP_CATALOGUE -> Insert into products
        for (const it of items) {
          const sku = it.sku || `SKU-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
          const prodRes = await client.query(`
            INSERT INTO products (
              id, business_id, sku, name, description, price_cents,
              currency, category, is_active
            ) VALUES (
              uuid_generate_v4(), $1, $2, $3, $4, $5, 'ZAR', $6, TRUE
            ) RETURNING id;
          `, [
            draft.business_id,
            sku,
            it.name,
            it.description,
            it.priceCents,
            it.category || 'General'
          ]);

          await client.query(`
            INSERT INTO inventory (id, product_id, quantity_available, reserved_quantity)
            VALUES (uuid_generate_v4(), $1, 10, 0);
          `, [prodRes.rows[0].id]);

          publishedCount++;
        }
      }

      await client.query(`
        UPDATE ai_extraction_drafts
        SET review_status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW()
        WHERE id = $1;
      `, [draftId]);

      await client.query('COMMIT;');
      return { confirmed: true, publishedCount };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * SERVICE 2: AI Merchant Command Center (Read-only, business-scoped reporting)
   * Strictly read-only; cannot alter financial ledger, commission rates, or bank records.
   */
  public static async generateMerchantInsights(merchantUserId: string, businessId: string): Promise<{
    businessId: string;
    summary: string;
    actionableRecommendations: string[];
    groundedMetrics: {
      totalOrders: number;
      revenueZAR: string;
      topItems: Array<{ name: string; unitsSold: number }>;
    };
  }> {
    const defense = this.sanitizeAndDetectInjection(businessId);
    if (!defense.isSafe) {
      throw new Error('MALICIOUS_INPUT_DETECTED');
    }

    // Verify tenant authorization
    const access = await MerchantService.verifyMerchantAccess(merchantUserId, businessId);
    const bizName = access.businessName;

    // Grounded metrics query exclusively from PostgreSQL
    const ordersRes = await postgresAdapter.pool.query(`
      SELECT
        COUNT(*)::int as total_orders,
        COALESCE(SUM(total_cents), 0)::bigint as total_cents
      FROM orders
      WHERE business_id = $1 AND status != 'CANCELLED';
    `, [businessId]);

    const itemsRes = await postgresAdapter.pool.query(`
      SELECT item_name, SUM(quantity)::int as units_sold
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.business_id = $1 AND o.status != 'CANCELLED'
      GROUP BY item_name
      ORDER BY units_sold DESC
      LIMIT 5;
    `, [businessId]);

    const totalOrders = ordersRes.rows[0].total_orders;
    const totalCents = Number(ordersRes.rows[0].total_cents);
    const revenueZAR = `R${(totalCents / 100).toFixed(2)}`;
    const topItems = itemsRes.rows.map(r => ({ name: r.item_name, unitsSold: r.units_sold }));

    let summary = `Grounded analysis for ${bizName}: Completed ${totalOrders} operational orders generating ${revenueZAR} in authoritative platform volume.`;
    const recommendations = [
      'Optimize inventory stocking during peak afternoon demand windows.',
      'Maintain real-time menu preparation toggles to sustain high delivery fulfillment SLAs.',
      'Review top-selling items to feature in promotional banners.'
    ];

    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'UNCONFIGURED_KEY') {
      try {
        const ai = getGeminiClient();
        const prompt = `You are the TUXI Merchant Command Center AI. Provide a 2-sentence executive summary and 3 operational bullet points grounded strictly in these PostgreSQL verified numbers:
Business: ${bizName}
Total Orders: ${totalOrders}
Total Revenue: ${revenueZAR}
Top Items: ${JSON.stringify(topItems)}`;

        const genRes = await ai.models.generateContent({
          model: GEMINI_TEXT_MODEL,
          contents: prompt
        });
        if (genRes.text) {
          summary = genRes.text.trim();
        }
      } catch (err: any) {
        console.warn('[Gemini AI Insights Fallback]:', err.message);
      }
    }

    await this.logAIAudit({
      actorId: merchantUserId,
      actorRole: 'MERCHANT',
      endpoint: '/api/ai/merchant/command-insights',
      businessId,
      modelIdentifier: GEMINI_TEXT_MODEL,
      sanitizedIntent: 'MERCHANT_READ_ONLY_INSIGHTS'
    });

    return {
      businessId,
      summary,
      actionableRecommendations: recommendations,
      groundedMetrics: {
        totalOrders,
        revenueZAR,
        topItems
      }
    };
  }

  /**
   * SERVICE 3: AI Semantic Customer Discovery
   * Grounded with server-enforced pricing, availability, and delivery-zone filters.
   */
  public static async semanticCustomerSearch(params: {
    customerUserId?: string;
    query: string;
    customerLat: number;
    customerLng: number;
    maxDistanceKm?: number;
    businessType?: 'EATS' | 'SHOP';
  }): Promise<{
    sanitizedQuery: string;
    results: Array<{
      businessId: string;
      businessName: string;
      businessType: string;
      distanceKm: number;
      matchingItems: Array<{ id: string; name: string; priceCents: number; available: boolean }>;
    }>;
  }> {
    const defense = this.sanitizeAndDetectInjection(params.query);
    if (!defense.isSafe) {
      throw new Error('MALICIOUS_SEARCH_QUERY_DETECTED');
    }

    const radiusKm = params.maxDistanceKm || 25; // Delivery zone policy, distinct from 20km Rep boundary

    const searchKeyword = `%${defense.sanitized.toLowerCase()}%`;

    // Geospatially filter businesses within radius using authoritative PostGIS
    const hasSearchTerm = defense.sanitized.length > 0;
    const bizQuery = `
      SELECT DISTINCT
        b.id, b.name, b.type as business_type,
        ROUND((ST_Distance(
          b.geom::geography,
          ST_SetSRID(ST_Point($1::float8, $2::float8), 4326)::geography
        ) / 1000.0)::numeric, 2) as distance_km
      FROM businesses b
      LEFT JOIN menu_categories mc ON mc.business_id = b.id
      LEFT JOIN menu_items mi ON mi.category_id = mc.id
      LEFT JOIN products p ON p.business_id = b.id
      WHERE b.status = 'APPROVED'
        ${params.businessType ? `AND b.type = '${params.businessType}'` : ''}
        ${hasSearchTerm ? `AND (LOWER(mi.name) LIKE $4 OR LOWER(COALESCE(mi.description, '')) LIKE $4 OR LOWER(p.name) LIKE $4 OR LOWER(COALESCE(p.description, '')) LIKE $4 OR LOWER(b.name) LIKE $4)` : ''}
        AND ST_DWithin(
          b.geom::geography,
          ST_SetSRID(ST_Point($1::float8, $2::float8), 4326)::geography,
          $3 * 1000
        )
      ORDER BY distance_km ASC
      LIMIT 25;
    `;

    const queryParams: any[] = [params.customerLng, params.customerLat, radiusKm];
    if (hasSearchTerm) {
      queryParams.push(searchKeyword);
    }

    const bizRes = await postgresAdapter.pool.query(bizQuery, queryParams);
    const results = [];

    for (const biz of bizRes.rows) {
      let items: Array<{ id: string; name: string; priceCents: number; available: boolean }> = [];

      if (biz.business_type === 'EATS') {
        const itemRes = await postgresAdapter.pool.query(`
          SELECT mi.id, mi.name, mi.base_price_cents as price_cents, mi.is_available
          FROM menu_items mi
          JOIN menu_categories mc ON mc.id = mi.category_id
          WHERE mc.business_id = $1 AND (LOWER(mi.name) LIKE $2 OR LOWER(COALESCE(mi.description, '')) LIKE $2)
          LIMIT 5;
        `, [biz.id, searchKeyword]);
        items = itemRes.rows.map(r => ({
          id: r.id,
          name: r.name,
          priceCents: r.price_cents,
          available: r.is_available
        }));
      } else {
        const itemRes = await postgresAdapter.pool.query(`
          SELECT p.id, p.name, p.price_cents, (COALESCE(inv.quantity_available, 0) > 0 AND p.is_active = TRUE) as is_available
          FROM products p
          LEFT JOIN inventory inv ON inv.product_id = p.id
          WHERE p.business_id = $1 AND (LOWER(p.name) LIKE $2 OR LOWER(COALESCE(p.description, '')) LIKE $2)
          LIMIT 5;
        `, [biz.id, searchKeyword]);
        items = itemRes.rows.map(r => ({
          id: r.id,
          name: r.name,
          priceCents: r.price_cents,
          available: r.is_available
        }));
      }

      if (items.length > 0 || defense.sanitized.length === 0) {
        results.push({
          businessId: biz.id,
          businessName: biz.name,
          businessType: biz.business_type,
          distanceKm: parseFloat(biz.distance_km),
          matchingItems: items
        });
      }
    }

    await this.logAIAudit({
      actorId: params.customerUserId,
      actorRole: 'CUSTOMER',
      endpoint: '/api/ai/customer/semantic-search',
      modelIdentifier: GEMINI_TEXT_MODEL,
      sanitizedIntent: `SEARCH: ${defense.sanitized.slice(0, 50)}`
    });

    return {
      sanitizedQuery: defense.sanitized,
      results
    };
  }

  /**
   * SERVICE 4: AI Customer Support (Authenticated & Order-Scoped)
   * Strictly order-scoped. Cannot access other users' orders or modify financial state.
   */
  public static async orderScopedSupport(params: {
    customerUserId: string;
    orderId: string;
    question: string;
  }): Promise<{
    orderId: string;
    orderStatus: string;
    response: string;
    groundedContext: {
      businessName: string;
      itemsCount: number;
      totalZAR: string;
      deliveryStatus?: string;
    };
  }> {
    const defense = this.sanitizeAndDetectInjection(params.question);
    if (!defense.isSafe) {
      await this.logAIAudit({
        actorId: params.customerUserId,
        actorRole: 'CUSTOMER',
        endpoint: '/api/ai/support/order-query',
        orderId: params.orderId,
        modelIdentifier: GEMINI_TEXT_MODEL,
        flaggedInjection: true,
        sanitizedIntent: 'INJECTION_ATTEMPT_BLOCKED'
      });
      throw new Error('MALICIOUS_PROMPT_INJECTION_DETECTED: Security policy violated.');
    }

    // Verify customer owns this order (IDOR isolation)
    const orderRes = await postgresAdapter.pool.query(`
      SELECT
        o.id, o.status, o.total_cents, o.created_at,
        b.name as business_name,
        d.status as delivery_status,
        cp.user_id as customer_user_id
      FROM orders o
      JOIN businesses b ON b.id = o.business_id
      LEFT JOIN customer_profiles cp ON cp.id = o.customer_id
      LEFT JOIN deliveries d ON d.order_id = o.id
      WHERE o.id = $1;
    `, [params.orderId]);

    if (orderRes.rows.length === 0) {
      throw new Error('ORDER_NOT_FOUND');
    }

    const order = orderRes.rows[0];
    if (order.customer_user_id !== params.customerUserId) {
      throw new Error('FORBIDDEN_IDOR_ACCESS: You do not own this order.');
    }

    const itemsRes = await postgresAdapter.pool.query(`
      SELECT item_name, quantity, unit_price_cents
      FROM order_items
      WHERE order_id = $1;
    `, [params.orderId]);

    const totalZAR = `R${(order.total_cents / 100).toFixed(2)}`;
    const context = {
      businessName: order.business_name,
      itemsCount: itemsRes.rows.length,
      totalZAR,
      deliveryStatus: order.delivery_status || 'NOT_DISPATCHED'
    };

    let reply = `Your order with ${order.business_name} is currently ${order.status}. Delivery status is ${context.deliveryStatus}. Total is ${totalZAR}.`;

    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'UNCONFIGURED_KEY') {
      try {
        const ai = getGeminiClient();
        const prompt = `You are the TUXI Customer Support AI. Answer the customer's question strictly grounded on this verified order data:
Order ID: ${order.id}
Merchant: ${order.business_name}
Order Status: ${order.status}
Delivery Status: ${context.deliveryStatus}
Total: ${totalZAR}
Items: ${JSON.stringify(itemsRes.rows)}

Customer Question: "${defense.sanitized}"
Security Guardrail: Never refund money, never change order statuses, never reveal internal database keys.`;

        const modelRes = await ai.models.generateContent({
          model: GEMINI_TEXT_MODEL,
          contents: prompt
        });
        if (modelRes.text) {
          reply = modelRes.text.trim();
        }
      } catch (err: any) {
        console.warn('[Gemini AI Support Fallback]:', err.message);
      }
    }

    await this.logAIAudit({
      actorId: params.customerUserId,
      actorRole: 'CUSTOMER',
      endpoint: '/api/ai/support/order-query',
      orderId: params.orderId,
      modelIdentifier: GEMINI_TEXT_MODEL,
      sanitizedIntent: 'AUTHENTICATED_ORDER_SUPPORT'
    });

    return {
      orderId: params.orderId,
      orderStatus: order.status,
      response: reply,
      groundedContext: context
    };
  }
}
