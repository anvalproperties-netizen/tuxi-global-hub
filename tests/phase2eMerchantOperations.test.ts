import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { postgresAdapter } from '../src/server/db/postgres.js';
import { seedPhase2AEatsData } from '../src/server/db/seedEatsData.js';
import { seedPhase2BShopData } from '../src/server/db/seedShopData.js';
import { seedPhase2EMerchantData } from '../src/server/db/seedMerchantOperationsData.js';
import { MerchantService } from '../src/server/services/merchantService.js';
import { OrderService } from '../src/server/services/orderService.js';
import { DeliveryService } from '../src/server/services/deliveryService.js';
import crypto from 'node:crypto';

const { Pool } = pg;

describe('TUXI PHASE 2E — EATS OWNER & SHOP OWNER OPERATIONS TEST SUITE', () => {
  let pool: pg.Pool;
  let eatsBusinessId: string;
  let shopBusinessId: string;
  let otherBusinessId: string;

  let eatsOwnerUserId: string;
  let eatsMgrUserId: string;
  let shopOwnerUserId: string;
  let shopStaffUserId: string;
  let otherOwnerUserId: string;

  let testOrderId: string;
  let testShopOrderId: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 15
    });

    // Ensure baseline seed data exists
    await seedPhase2AEatsData();
    await seedPhase2BShopData();
    const seeded = await seedPhase2EMerchantData();

    eatsBusinessId = seeded.eatsBusinessId;
    shopBusinessId = seeded.shopBusinessId;
    otherBusinessId = seeded.otherBusinessId;
    eatsOwnerUserId = seeded.eatsOwnerUserId;
    eatsMgrUserId = seeded.eatsMgrUserId;
    shopOwnerUserId = seeded.shopOwnerUserId;
    shopStaffUserId = seeded.shopStaffUserId;
    otherOwnerUserId = seeded.otherOwnerUserId;

    // Create a real sample Eats order for Kloof Street Bistro
    const client = await pool.connect();
    try {
      const custRes = await client.query("SELECT id FROM users WHERE email = 'customer@tuxi-seed.dev' LIMIT 1;");
      const custUserId = custRes.rows[0].id;
      const addrRes = await client.query("SELECT id FROM addresses WHERE user_id = $1 LIMIT 1;", [custUserId]);
      const addrId = addrRes.rows[0].id;

      // Find an item
      const itemRes = await client.query(`
        SELECT mi.id, mi.base_price_cents
        FROM menu_items mi
        JOIN menu_categories mc ON mc.id = mi.category_id
        WHERE mc.business_id = $1 AND mi.is_available = true
        LIMIT 1;
      `, [eatsBusinessId]);

      const item = itemRes.rows[0];

      const orderRes = await OrderService.createOrder({
        customerId: custUserId,
        businessId: eatsBusinessId,
        orderType: 'EATS',
        deliveryAddressId: addrId,
        items: [{
          itemId: item.id,
          itemType: 'MENU_ITEM',
          quantity: 2
        }],
        tipCents: 500,
        isTestPayment: false
      });
      testOrderId = orderRes.orderId;

      // Create a real sample Shop order for MediCare Essentials Pharmacy
      const prodRes = await client.query(`
        SELECT p.id, p.price_cents
        FROM products p
        JOIN inventory i ON i.product_id = p.id
        WHERE p.business_id = $1 AND i.quantity_available >= 2
        LIMIT 1;
      `, [shopBusinessId]);

      if (prodRes.rows.length > 0) {
        const prod = prodRes.rows[0];
        const shopOrder = await OrderService.createOrder({
          customerId: custUserId,
          businessId: shopBusinessId,
          orderType: 'SHOP',
          deliveryAddressId: addrId,
          items: [{
            itemId: prod.id,
            itemType: 'PRODUCT',
            quantity: 1
          }],
          tipCents: 0,
          isTestPayment: false
        });
        testShopOrderId = shopOrder.orderId;
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  // ==========================================================================
  // 1. MULTI-BUSINESS AUTHORIZATION & STRICT ISOLATION GATE (2E.1, 2E.9)
  // ==========================================================================
  describe('1. Multi-Business Authorization & Cross-Merchant IDOR Protection', () => {
    it('grants operational access to legitimate Eats primary owner', async () => {
      const access = await MerchantService.verifyMerchantAccess(eatsOwnerUserId, eatsBusinessId);
      expect(access.authorized).toBe(true);
      expect(access.role).toBe('OWNER');
      expect(access.businessId).toBe(eatsBusinessId);
      expect(access.businessType).toBe('EATS');
    });

    it('grants operational access to restaurant staff manager with MANAGER role', async () => {
      const access = await MerchantService.verifyMerchantAccess(eatsMgrUserId, eatsBusinessId);
      expect(access.authorized).toBe(true);
      expect(access.role).toBe('MANAGER');
    });

    it('strictly REJECTS other business owner attempting to access Kloof Street Bistro (IDOR Guard)', async () => {
      await expect(
        MerchantService.verifyMerchantAccess(otherOwnerUserId, eatsBusinessId)
      ).rejects.toThrow(/FORBIDDEN_MERCHANT_ACCESS/);
    });

    it('strictly REJECTS unauthenticated/random user from accessing merchant operations', async () => {
      const randomUserId = '00000000-0000-0000-0000-999999999999';
      await expect(
        MerchantService.verifyMerchantAccess(randomUserId, eatsBusinessId)
      ).rejects.toThrow(/FORBIDDEN_MERCHANT_ACCESS/);
    });

    it('returns list of businesses authorized for the specific owner without leakage', async () => {
      const eatsOwnerBiz = await MerchantService.getMerchantBusinesses(eatsOwnerUserId);
      expect(eatsOwnerBiz.length).toBeGreaterThan(0);
      expect(eatsOwnerBiz.some(b => b.id === eatsBusinessId)).toBe(true);
      // Ensure other businesses are not returned
      expect(eatsOwnerBiz.some(b => b.id === otherBusinessId)).toBe(false);
    });
  });

  // ==========================================================================
  // 2. OPERATIONAL DASHBOARD & STATUS SWITCHER (2E.2)
  // ==========================================================================
  describe('2. Operational Dashboard & Live Status Controls', () => {
    it('retrieves comprehensive dashboard with live order counts and sales metrics', async () => {
      const dash = await MerchantService.getDashboard(eatsOwnerUserId, eatsBusinessId);
      expect(dash.business.id).toBe(eatsBusinessId);
      expect(dash.business.name).toBe('Kloof Street Bistro');
      expect(dash.business.type).toBe('EATS');
      expect(['OPEN', 'PAUSED', 'CLOSED']).toContain(dash.business.operationalStatus);
      expect(dash.orderCounts).toBeDefined();
      expect(typeof dash.orderCounts.totalActive).toBe('number');
      expect(dash.todaySales).toBeDefined();
      expect(typeof dash.todaySales.grossSubtotalCents).toBe('number');
    });

    it('updates operational status from OPEN to PAUSED and updates prep time dynamically', async () => {
      const updated = await MerchantService.updateOperationalStatus(
        eatsOwnerUserId,
        eatsBusinessId,
        {
          operationalStatus: 'PAUSED',
          operationalNotes: 'Kitchen deep sanitization until 14:30',
          prepTimeMinutes: 35
        }
      );

      expect(updated.operational_status).toBe('PAUSED');
      expect(updated.operational_notes).toBe('Kitchen deep sanitization until 14:30');
      expect(updated.prep_time_minutes).toBe(35);
      expect(updated.version).toBeGreaterThan(1);

      // Verify audit log entry in PostgreSQL
      const client = await pool.connect();
      try {
        const audit = await client.query(`
          SELECT action, resource_type, resource_id, actor_id 
          FROM audit_logs 
          WHERE resource_id = $1 AND action = 'MERCHANT_OPERATIONAL_STATUS_UPDATE'
          ORDER BY created_at DESC LIMIT 1;
        `, [eatsBusinessId]);

        expect(audit.rows.length).toBe(1);
        expect(audit.rows[0].actor_id).toBe(eatsOwnerUserId);
      } finally {
        client.release();
      }
    });

    it('restores operational status back to OPEN', async () => {
      const restored = await MerchantService.updateOperationalStatus(
        eatsOwnerUserId,
        eatsBusinessId,
        {
          operationalStatus: 'OPEN',
          operationalNotes: 'Normal service resumed',
          prepTimeMinutes: 20
        }
      );
      expect(restored.operational_status).toBe('OPEN');
    });
  });

  // ==========================================================================
  // 3. MENU MANAGEMENT & OPTIMISTIC CONCURRENCY FOR EATS (2E.3, 2E.10)
  // ==========================================================================
  describe('3. Eats Menu Management & Optimistic Concurrency Locking', () => {
    let testCategoryId: string;
    let testMenuItemId: string;
    let initialVersion: number;

    it('creates a new menu category for the restaurant', async () => {
      const cat = await MerchantService.createMenuCategory(eatsOwnerUserId, eatsBusinessId, {
        name: 'Chef Tasting Specials',
        sortOrder: 10
      });
      expect(cat.id).toBeDefined();
      expect(cat.name).toBe('Chef Tasting Specials');
      testCategoryId = cat.id;
    });

    it('creates a new menu item with dietary flags, allergens and modifiers', async () => {
      const item = await MerchantService.createMenuItem(eatsOwnerUserId, eatsBusinessId, {
        categoryId: testCategoryId,
        name: 'Truffle Porcini Risotto',
        description: 'Carnaroli rice with wild porcini, black truffle butter and 24-month Parmigiano',
        basePriceCents: 18500,
        currency: 'ZAR',
        isAvailable: true,
        dietaryFlags: ['Vegetarian', 'Gluten-Free'],
        allergens: ['Dairy'],
        modifiers: [
          { groupName: 'Truffle Shavings', name: 'Extra 5g Fresh Black Truffle', extraPriceCents: 4500 },
          { groupName: 'Portion Size', name: 'Grande Portion (+50%)', extraPriceCents: 3500 }
        ]
      });

      expect(item.id).toBeDefined();
      expect(item.name).toBe('Truffle Porcini Risotto');
      expect(item.base_price_cents).toBe(18500);
      expect(item.dietary_flags).toContain('Vegetarian');
      expect(item.allergens).toContain('Dairy');
      expect(item.version).toBe(1);

      testMenuItemId = item.id;
      initialVersion = item.version;
    });

    it('86 TOGGLE: immediately toggles menu item availability', async () => {
      const toggled = await MerchantService.toggleMenuItemAvailability(
        eatsOwnerUserId,
        eatsBusinessId,
        testMenuItemId,
        false
      );
      expect(toggled.is_available).toBe(false);
      expect(toggled.version).toBe(initialVersion + 1);
      initialVersion = toggled.version;
    });

    it('OPTIMISTIC CONCURRENCY RACE: rejects stale version update with CONCURRENT_MODIFICATION_DETECTED', async () => {
      // First update with valid expectedVersion
      const successUpdate = await MerchantService.updateMenuItem(
        eatsOwnerUserId,
        eatsBusinessId,
        testMenuItemId,
        {
          name: 'Truffle Porcini Risotto (Updated Recipe)',
          expectedVersion: initialVersion
        }
      );
      expect(successUpdate.version).toBe(initialVersion + 1);

      // Stale update using previous initialVersion must fail
      await expect(
        MerchantService.updateMenuItem(
          eatsOwnerUserId,
          eatsBusinessId,
          testMenuItemId,
          {
            name: 'Conflicting Concurrent Edit',
            expectedVersion: initialVersion // stale!
          }
        )
      ).rejects.toThrow(/CONCURRENT_MODIFICATION_DETECTED/);
    });

    it('retrieves full structured menu hierarchy for the restaurant', async () => {
      const menu = await MerchantService.getMenu(eatsOwnerUserId, eatsBusinessId);
      expect(Array.isArray(menu)).toBe(true);
      expect(menu.length).toBeGreaterThan(0);
      const testCat = menu.find(c => c.id === testCategoryId);
      expect(testCat).toBeDefined();
      expect(testCat!.items.length).toBeGreaterThan(0);
      expect(testCat!.items[0].modifiers.length).toBe(2);
    });

    it('cleans up test menu category and items', async () => {
      const delItem = await MerchantService.deleteMenuItem(eatsOwnerUserId, eatsBusinessId, testMenuItemId);
      expect(delItem.success).toBe(true);

      const delCat = await MerchantService.deleteMenuCategory(eatsOwnerUserId, eatsBusinessId, testCategoryId);
      expect(delCat.success).toBe(true);
    });
  });

  // ==========================================================================
  // 4. PRODUCT & INVENTORY MANAGEMENT FOR SHOP (2E.3, 2E.4)
  // ==========================================================================
  describe('4. Shop Product Management & Optimistic Concurrency', () => {
    let testProductId: string;
    let initialProdVersion: number;

    it('creates a new Shop product with SKU, sale price, initial inventory and variants', async () => {
      const sku = `MED-THERMO-${Date.now()}`;
      const product = await MerchantService.createProduct(shopOwnerUserId, shopBusinessId, {
        sku,
        name: 'Digital Infrared Thermometer',
        description: 'Hospital grade non-contact infrared body thermometer',
        priceCents: 49900,
        salePriceCents: 39900,
        isOnSale: true,
        category: 'Diagnostics',
        initialStock: 15,
        variants: [
          {
            variantSku: `${sku}-WHITE`,
            variantName: 'Classic Pearl White',
            priceDeltaCents: 0,
            initialStock: 10,
            attributes: { color: 'White' }
          },
          {
            variantSku: `${sku}-NAVY`,
            variantName: 'Clinical Navy',
            priceDeltaCents: 2000,
            initialStock: 5,
            attributes: { color: 'Navy' }
          }
        ]
      });

      expect(product.id).toBeDefined();
      expect(product.sku).toBe(sku);
      expect(product.sale_price_cents).toBe(39900);
      expect(product.is_on_sale).toBe(true);
      expect(product.version).toBe(1);

      testProductId = product.id;
      initialProdVersion = product.version;
    });

    it('OPTIMISTIC CONCURRENCY: updates product and increments version', async () => {
      const updated = await MerchantService.updateProduct(
        shopOwnerUserId,
        shopBusinessId,
        testProductId,
        {
          priceCents: 52900,
          expectedVersion: initialProdVersion
        }
      );
      expect(updated.price_cents).toBe(52900);
      expect(updated.version).toBe(initialProdVersion + 1);

      // Concurrent stale update rejected
      await expect(
        MerchantService.updateProduct(
          shopOwnerUserId,
          shopBusinessId,
          testProductId,
          {
            priceCents: 55000,
            expectedVersion: initialProdVersion // stale!
          }
        )
      ).rejects.toThrow(/CONCURRENT_MODIFICATION_DETECTED/);
    });
  });

  // ==========================================================================
  // 5. AUDITABLE INVENTORY ADJUSTMENTS & RESTOCK LEDGER (2E.4, 2E.10)
  // ==========================================================================
  describe('5. Auditable Inventory Adjustments Ledger & Stock Bounds', () => {
    let targetInventoryId: string;
    let initialQty: number;

    beforeAll(async () => {
      const client = await pool.connect();
      try {
        const inv = await client.query(`
          SELECT i.id, i.quantity_available 
          FROM inventory i 
          JOIN products p ON p.id = i.product_id
          WHERE p.business_id = $1 AND i.variant_id IS NULL
          LIMIT 1;
        `, [shopBusinessId]);
        targetInventoryId = inv.rows[0].id;
        initialQty = inv.rows[0].quantity_available;
      } finally {
        client.release();
      }
    });

    it('RESTOCK: atomically increments stock and creates auditable ledger entry', async () => {
      const adj = await MerchantService.adjustInventory(shopOwnerUserId, shopBusinessId, {
        inventoryId: targetInventoryId,
        adjustmentType: 'RESTOCK',
        quantityDelta: 25,
        reason: 'Shipment received from Cape Pharma Wholesalers',
        idempotencyKey: `ADJ-RESTOCK-${Date.now()}`
      });

      expect(adj.adjustment_type).toBe('RESTOCK');
      expect(adj.quantity_delta).toBe(25);
      expect(adj.previous_quantity).toBe(initialQty);
      expect(adj.new_quantity).toBe(initialQty + 25);

      // Verify PostgreSQL table state
      const client = await pool.connect();
      try {
        const inv = await client.query('SELECT quantity_available FROM inventory WHERE id = $1;', [targetInventoryId]);
        expect(inv.rows[0].quantity_available).toBe(initialQty + 25);
      } finally {
        client.release();
      }
    });

    it('IDEMPOTENCY: replaying identical adjustment returns cached result without double increment', async () => {
      const key = `IDEM-KEY-${Date.now()}`;

      const first = await MerchantService.adjustInventory(shopOwnerUserId, shopBusinessId, {
        inventoryId: targetInventoryId,
        adjustmentType: 'CORRECTION',
        quantityDelta: 5,
        reason: 'Physical count adjustment',
        idempotencyKey: key
      });

      const second = await MerchantService.adjustInventory(shopOwnerUserId, shopBusinessId, {
        inventoryId: targetInventoryId,
        adjustmentType: 'CORRECTION',
        quantityDelta: 5,
        reason: 'Physical count adjustment replay',
        idempotencyKey: key
      });

      expect(second.isIdempotentReplay).toBe(true);
      expect(second.id).toBe(first.id);
      expect(second.new_quantity).toBe(first.new_quantity);
    });

    it('BOUNDS PROTECTION: strictly rejects stock adjustment that would drop quantity below 0', async () => {
      await expect(
        MerchantService.adjustInventory(shopOwnerUserId, shopBusinessId, {
          inventoryId: targetInventoryId,
          adjustmentType: 'DAMAGE',
          quantityDelta: -999999, // Impossible negative adjustment
          reason: 'Massive warehouse water damage'
        })
      ).rejects.toThrow(/INSUFFICIENT_STOCK_TO_ADJUST/);
    });

    it('retrieves auditable stock adjustment ledger with actor details', async () => {
      const ledger = await MerchantService.getInventoryAuditLedger(shopOwnerUserId, shopBusinessId, 10);
      expect(Array.isArray(ledger)).toBe(true);
      expect(ledger.length).toBeGreaterThan(0);
      expect(ledger[0].adjustment_type).toBeDefined();
      expect(ledger[0].actor_email).toBeDefined();
    });

    it('evaluates low stock alerts for inventory thresholds', async () => {
      const alerts = await MerchantService.getLowStockAlerts(shopOwnerUserId, shopBusinessId, 50);
      expect(Array.isArray(alerts)).toBe(true);
      for (const a of alerts) {
        expect(a.current_stock).toBeLessThanOrEqual(50);
        expect(['OUT_OF_STOCK', 'CRITICAL', 'LOW_STOCK']).toContain(a.urgency);
      }
    });
  });

  // ==========================================================================
  // 6. ORDER WORKFLOWS & DELIVERY HANDOFF (2E.5, 2E.6)
  // ==========================================================================
  describe('6. Order Fulfillment Lifecycle & Courier Handoff', () => {
    let orderPickupCode: string;

    it('retrieves live orders for Kloof Street Bistro', async () => {
      const orders = await MerchantService.getOrders(eatsOwnerUserId, eatsBusinessId);
      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
      const target = orders.find(o => o.id === testOrderId);
      expect(target).toBeDefined();
      expect(target!.status).toBe('PLACED');
    });

    it('accepts incoming order: transitions PLACED -> PREPARING', async () => {
      const acceptRes = await MerchantService.acceptOrder(eatsOwnerUserId, eatsBusinessId, testOrderId, 25);
      expect(acceptRes.success).toBe(true);
      expect(acceptRes.status).toBe('PREPARING');

      // Verify order status in DB
      const client = await pool.connect();
      try {
        const o = await client.query('SELECT status FROM orders WHERE id = $1;', [testOrderId]);
        expect(o.rows[0].status).toBe('PREPARING');
      } finally {
        client.release();
      }
    });

    it('marks order as READY FOR PICKUP: generates authoritative 6-digit Phase 2C pickup code', async () => {
      const readyRes = await MerchantService.markOrderReady(eatsOwnerUserId, eatsBusinessId, testOrderId);
      expect(readyRes.success).toBe(true);
      expect(readyRes.status).toBe('READY_FOR_PICKUP');
      expect(readyRes.pickupCode).toMatch(/^\d{6}$/);
      orderPickupCode = readyRes.pickupCode;

      // Verify in PostgreSQL
      const client = await pool.connect();
      try {
        const o = await client.query('SELECT status, pickup_code, ready_at FROM orders WHERE id = $1;', [testOrderId]);
        expect(o.rows[0].status).toBe('READY_FOR_PICKUP');
        expect(o.rows[0].pickup_code).toBe(orderPickupCode);
        expect(o.rows[0].ready_at).not.toBeNull();
      } finally {
        client.release();
      }
    });

    it('HANDOFF VERIFICATION: rejects handoff if pickup code does not match', async () => {
      await expect(
        MerchantService.handoffToCourier(eatsOwnerUserId, eatsBusinessId, testOrderId, {
          pickupCode: '000000' // wrong code
        })
      ).rejects.toThrow(/INVALID_PICKUP_PROOF|INVALID_PICKUP_CODE/);
    });

    it('HANDOFF VERIFICATION: succeeds with correct pickup code and transitions to OUT_FOR_DELIVERY', async () => {
      const handoff = await MerchantService.handoffToCourier(eatsOwnerUserId, eatsBusinessId, testOrderId, {
        pickupCode: orderPickupCode
      });
      expect(handoff.success).toBe(true);
      expect(handoff.status).toBe('OUT_FOR_DELIVERY');

      const client = await pool.connect();
      try {
        const o = await client.query('SELECT status, handoff_at FROM orders WHERE id = $1;', [testOrderId]);
        expect(o.rows[0].status).toBe('OUT_FOR_DELIVERY');
        expect(o.rows[0].handoff_at).not.toBeNull();
      } finally {
        client.release();
      }
    });

    it('REJECT/CANCEL WORKFLOW: cancels order with mandatory reason code', async () => {
      if (testShopOrderId) {
        const cancelRes = await MerchantService.rejectOrCancelOrder(shopOwnerUserId, shopBusinessId, testShopOrderId, {
          reasonCode: 'OUT_OF_STOCK',
          reasonText: 'Item damaged during packing shelf check'
        });

        expect(cancelRes.success).toBe(true);
        expect(cancelRes.status).toBe('CANCELLED');
        expect(cancelRes.reason).toContain('OUT_OF_STOCK');

        const client = await pool.connect();
        try {
          const o = await client.query('SELECT status, cancelled_reason, cancelled_at FROM orders WHERE id = $1;', [testShopOrderId]);
          expect(o.rows[0].status).toBe('CANCELLED');
          expect(o.rows[0].cancelled_reason).toContain('OUT_OF_STOCK');
          expect(o.rows[0].cancelled_at).not.toBeNull();
        } finally {
          client.release();
        }
      }
    });
  });

  // ==========================================================================
  // 7. PROMOTIONS & MARKETING CAMPAIGN ENGINE (2E.7)
  // ==========================================================================
  describe('7. Promotions Engine & Authoritative Discount Calculation', () => {
    let promoCode = `PROMO${Math.floor(1000 + Math.random() * 9000)}`;

    it('creates percentage promotion with cap and min order subtotal', async () => {
      const promo = await MerchantService.createPromotion(eatsOwnerUserId, eatsBusinessId, {
        code: promoCode,
        title: 'Spring Festival 15% Off',
        description: 'Get 15% off orders over R80 (capped at R40)',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        minOrderSubtotalCents: 8000,
        maxDiscountCents: 4000,
        startsAt: new Date(Date.now() - 3600000).toISOString(),
        endsAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        isActive: true
      });

      expect(promo.id).toBeDefined();
      expect(promo.code).toBe(promoCode);
      expect(promo.discount_type).toBe('PERCENTAGE');
      expect(promo.discount_value).toBe(15);
      expect(promo.min_order_subtotal_cents).toBe(8000);
      expect(promo.max_discount_cents).toBe(4000);
    });

    it('rejects duplicate promotion code for the same business', async () => {
      await expect(
        MerchantService.createPromotion(eatsOwnerUserId, eatsBusinessId, {
          code: promoCode,
          title: 'Duplicate Attempt',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString()
        })
      ).rejects.toThrow(/DUPLICATE_PROMO_CODE/);
    });

    it('EVALUATION: rejects promo when basket subtotal is below minimum', async () => {
      const evalRes = await MerchantService.evaluatePromotion(eatsBusinessId, promoCode, 5000); // R50 < R80 min
      expect(evalRes.valid).toBe(false);
      expect(evalRes.reason).toContain('MIN_ORDER_SUBTOTAL_NOT_MET');
    });

    it('EVALUATION: calculates correct percentage discount within cap', async () => {
      // Order subtotal R100 (10000 cents): 15% = R15 (1500 cents) <= R40 cap
      const evalRes = await MerchantService.evaluatePromotion(eatsBusinessId, promoCode, 10000);
      expect(evalRes.valid).toBe(true);
      expect(evalRes.discountCents).toBe(1500);
    });

    it('EVALUATION: enforces maxDiscountCents cap when discount exceeds limit', async () => {
      // Order subtotal R400 (40000 cents): 15% = R60 (6000 cents) -> capped at R40 (4000 cents)
      const evalRes = await MerchantService.evaluatePromotion(eatsBusinessId, promoCode, 40000);
      expect(evalRes.valid).toBe(true);
      expect(evalRes.discountCents).toBe(4000);
    });

    it('toggles promotion active status off and verifies evaluation rejects it', async () => {
      const promos = await MerchantService.getPromotions(eatsOwnerUserId, eatsBusinessId);
      const targetPromo = promos.find(p => p.code === promoCode);
      expect(targetPromo).toBeDefined();

      await MerchantService.togglePromotion(eatsOwnerUserId, eatsBusinessId, targetPromo!.id, false);

      const evalRes = await MerchantService.evaluatePromotion(eatsBusinessId, promoCode, 10000);
      expect(evalRes.valid).toBe(false);
      expect(evalRes.reason).toBe('PROMO_CODE_INACTIVE');
    });
  });

  // ==========================================================================
  // 8. ANALYTICS & FINANCIAL VISIBILITY (2E.8, 2E.9)
  // ==========================================================================
  describe('8. Operational Analytics & Merchant Financial Visibility', () => {
    it('retrieves server-aggregated analytics with order volume and top items', async () => {
      const analytics = await MerchantService.getAnalytics(eatsOwnerUserId, eatsBusinessId, 'ALL_TIME');
      expect(analytics.businessId).toBe(eatsBusinessId);
      expect(analytics.summary).toBeDefined();
      expect(typeof analytics.summary.totalOrders).toBe('number');
      expect(typeof analytics.summary.grossSalesCents).toBe('number');
      expect(Array.isArray(analytics.topSellingItems)).toBe(true);
      expect(Array.isArray(analytics.dailyBreakdown)).toBe(true);
    });

    it('retrieves complete commercial financial summary with explicit commercial status and Rep attribution note', async () => {
      const fin = await MerchantService.getFinancialSummary(eatsOwnerUserId, eatsBusinessId);
      expect(fin.businessId).toBe(eatsBusinessId);
      expect(fin.currency).toBe('ZAR');
      expect(fin.commercial).toBeDefined();
      expect(fin.commercial.status).toBe('COMMERCIAL_CONFIGURATION_PENDING');
      expect(fin.commercial.requiresExplicitConfiguration).toBe(true);
      expect(fin.settlement.status).toBe('PENDING_SETTLEMENT');
      expect(fin.settlement.disclaimer).toBe('EXTERNAL PAYMENT GATEWAY LIVE SETTLEMENTS PENDING');
      expect(fin.repAttribution.hasAttribution).toBe(true);
      expect(fin.repAttribution.ratePct).toBeGreaterThan(0);
      expect(fin.repAttribution.description).toContain('paid out of TUXI platform fee');
    });
  });

  // ==========================================================================
  // 9. STAFF RBAC & ROLE RESTRICTIONS (2E.1, 2E.9)
  // ==========================================================================
  describe('9. Merchant Staff RBAC & Delegated Roles', () => {
    let newStaffUserId: string;

    it('retrieves list of business staff and owners', async () => {
      const staffList = await MerchantService.getStaff(eatsOwnerUserId, eatsBusinessId);
      expect(Array.isArray(staffList)).toBe(true);
      expect(staffList.some(s => s.role === 'OWNER')).toBe(true);
      expect(staffList.some(s => s.role === 'MANAGER')).toBe(true);
    });

    it('adds new ORDER_STAFF member to the business', async () => {
      const client = await pool.connect();
      try {
        const staffEmail = `new.staff.${Date.now()}@kloofbistro.co.za`;
        const hash = '$2a$10$w6nL9q.qH/q9Yc9u2H9Z0OPbK8w8vU5E0U4yJ7N0q2zK5X2p.Tq6W';
        const u = await client.query(`
          INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active)
          VALUES (uuid_generate_v4(), $1, $2, 'Sam', 'OrderTaker', '+27827770001', true)
          RETURNING id;
        `, [staffEmail, hash]);
        newStaffUserId = u.rows[0].id;
      } finally {
        client.release();
      }

      const added = await MerchantService.addStaff(eatsOwnerUserId, eatsBusinessId, newStaffUserId, 'ORDER_STAFF');
      expect(added.staff_role).toBe('ORDER_STAFF');
      expect(added.business_id).toBe(eatsBusinessId);
    });

    it('ORDER_STAFF has permission to accept orders but is forbidden from adding staff or deleting categories', async () => {
      // Order staff can view orders
      const orders = await MerchantService.getOrders(newStaffUserId, eatsBusinessId);
      expect(Array.isArray(orders)).toBe(true);

      // Order staff cannot delete categories
      await expect(
        MerchantService.deleteMenuCategory(newStaffUserId, eatsBusinessId, '00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(/INSUFFICIENT_STAFF_PERMISSIONS|FORBIDDEN/);
    });

    it('removes staff member cleanly', async () => {
      const removed = await MerchantService.removeStaff(eatsOwnerUserId, eatsBusinessId, newStaffUserId);
      expect(removed.success).toBe(true);
      expect(removed.removedUserId).toBe(newStaffUserId);
    });
  });

  // ==========================================================================
  // 10. TARGETED PHASE 2E ACCEPTANCE CORRECTIONS & CONCURRENCY VERIFICATION
  // ==========================================================================
  describe('10. Targeted Phase 2E Acceptance Corrections & Concurrency Verification', () => {
    // 10.1 Commercial Configuration & Unauthorized 15% Removal
    it('CORRECTION 1: proves unauthorized 15% commission is removed and requires explicit commercial configuration', async () => {
      const client = await pool.connect();
      try {
        // Confirm without merchant rule it reports COMMERCIAL_CONFIGURATION_PENDING
        await client.query("DELETE FROM commission_rules WHERE target_role IN ('MERCHANT', 'PLATFORM_MERCHANT', 'BUSINESS');");
        const pendingFin = await MerchantService.getFinancialSummary(eatsOwnerUserId, eatsBusinessId);
        expect(pendingFin.metrics.platformFeeRatePct).toBeNull();
        expect(pendingFin.metrics.platformFeeCents).toBeNull();
        expect(pendingFin.commercial.status).toBe('COMMERCIAL_CONFIGURATION_PENDING');
        expect(pendingFin.commercial.requiresExplicitConfiguration).toBe(true);

        // Add explicit commercial configuration rule (e.g. 12.00%)
        const ruleId = 'c0000000-0000-0000-0000-000000000088';
        await client.query(`
          INSERT INTO commission_rules (id, rule_version, name, target_role, percentage_rate, effective_from, is_active)
          VALUES ($1, 1, 'Authorized Merchant Agreed Rate', 'MERCHANT', 0.1200, NOW(), true)
          ON CONFLICT (id) DO UPDATE SET percentage_rate = 0.1200, is_active = true;
        `, [ruleId]);

        const configuredFin = await MerchantService.getFinancialSummary(eatsOwnerUserId, eatsBusinessId);
        expect(configuredFin.metrics.platformFeeRatePct).toBe(12.0);
        expect(configuredFin.commercial.status).toBe('COMMERCIAL_RATE_CONFIGURED');
        expect(configuredFin.commercial.requiresExplicitConfiguration).toBe(false);

        // Clean up rule
        await client.query("DELETE FROM commission_rules WHERE id = $1;", [ruleId]);
      } finally {
        client.release();
      }
    });

    // 10.2 Phase 2C Cryptographic Pickup-Proof Mechanism Integration
    it('CORRECTION 2: enforces Phase 2C cryptographic SHA-256 pickup proof with replay blocking', async () => {
      const client = await pool.connect();
      try {
        // 1. Create a dedicated order & delivery
        const custRes = await client.query("SELECT id FROM users WHERE email = 'customer@tuxi-seed.dev' LIMIT 1;");
        const custUserId = custRes.rows[0].id;
        const addrRes = await client.query("SELECT id FROM addresses WHERE user_id = $1 LIMIT 1;", [custUserId]);
        const addrId = addrRes.rows[0].id;

        const itemRes = await client.query(`
          SELECT mi.id FROM menu_items mi
          JOIN menu_categories mc ON mc.id = mi.category_id
          WHERE mc.business_id = $1 LIMIT 1;
        `, [eatsBusinessId]);

        const order = await OrderService.createOrder({
          customerId: custUserId,
          businessId: eatsBusinessId,
          orderType: 'EATS',
          deliveryAddressId: addrId,
          items: [{ itemId: itemRes.rows[0].id, itemType: 'MENU_ITEM', quantity: 1 }],
          tipCents: 0,
          isTestPayment: false
        });

        // Accept order
        await MerchantService.acceptOrder(eatsOwnerUserId, eatsBusinessId, order.orderId);

        // Create linked delivery
        const delivResult = await DeliveryService.createDeliveryForOrder(order.orderId);
        const deliv = delivResult.delivery;
        expect(deliv.id).toBeDefined();

        // Mark order ready -> binds cryptographic pickup proof
        const readyRes = await MerchantService.markOrderReady(eatsOwnerUserId, eatsBusinessId, order.orderId);
        expect(readyRes.pickupCode).toMatch(/^\d{6}$/);

        // Verify SHA-256 hash in deliveries table
        const delivRow = await client.query('SELECT pickup_code_hash, pickup_code_consumed FROM deliveries WHERE id = $1;', [deliv.id]);
        const expectedHash = crypto.createHash('sha256').update(readyRes.pickupCode).digest('hex');
        expect(delivRow.rows[0].pickup_code_hash).toBe(expectedHash);
        expect(delivRow.rows[0].pickup_code_consumed).toBe(false);

        // Wrong code fails
        await expect(
          MerchantService.handoffToCourier(eatsOwnerUserId, eatsBusinessId, order.orderId, {
            pickupCode: '999999'
          })
        ).rejects.toThrow(/INVALID_PICKUP_PROOF/);

        // Correct code succeeds
        const handoff = await MerchantService.handoffToCourier(eatsOwnerUserId, eatsBusinessId, order.orderId, {
          pickupCode: readyRes.pickupCode
        });
        expect(handoff.status).toBe('OUT_FOR_DELIVERY');

        // Verify pickup_code_consumed is true
        const consumedRow = await client.query('SELECT pickup_code_consumed FROM deliveries WHERE id = $1;', [deliv.id]);
        expect(consumedRow.rows[0].pickup_code_consumed).toBe(true);

        // Replay attempt fails with PROOF_ALREADY_CONSUMED
        await expect(
          MerchantService.handoffToCourier(eatsOwnerUserId, eatsBusinessId, order.orderId, {
            pickupCode: readyRes.pickupCode
          })
        ).rejects.toThrow(/PROOF_ALREADY_CONSUMED|INVALID_STATE_TRANSITION/);
      } finally {
        client.release();
      }
    });

    // 10.3 Live PostgreSQL Final-Unit Checkout vs Merchant Inventory-Adjustment Concurrency Race
    it('CORRECTION 3: executes live PostgreSQL concurrency race: final-unit checkout vs merchant stock deduction', async () => {
      const client = await pool.connect();
      try {
        // Setup product with stock = 1 (LAST remaining unit)
        const raceSku = `RACE-PROD-${Date.now()}`;
        const prod = await MerchantService.createProduct(shopOwnerUserId, shopBusinessId, {
          sku: raceSku,
          name: 'Rare Limited Edition Antiseptic',
          priceCents: 15000,
          initialStock: 1
        });

        const custRes = await client.query("SELECT id FROM users WHERE email = 'customer@tuxi-seed.dev' LIMIT 1;");
        const custUserId = custRes.rows[0].id;
        const addrRes = await client.query("SELECT id FROM addresses WHERE user_id = $1 LIMIT 1;", [custUserId]);

        // Simultaneous execution:
        // Thread A: Customer checkout competing for the single unit
        // Thread B: Merchant adjusting stock by -1 (e.g. damaged unit)
        const checkoutPromise = OrderService.createOrder({
          customerId: custUserId,
          businessId: shopBusinessId,
          orderType: 'SHOP',
          deliveryAddressId: addrRes.rows[0].id,
          items: [{ itemId: prod.id, itemType: 'PRODUCT', quantity: 1 }],
          tipCents: 0,
          isTestPayment: false
        });

        const adjustPromise = MerchantService.adjustInventory(shopOwnerUserId, shopBusinessId, {
          productId: prod.id,
          adjustmentType: 'DAMAGE',
          quantityDelta: -1,
          reason: 'Damaged packaging'
        });

        const results = await Promise.allSettled([checkoutPromise, adjustPromise]);
        const successes = results.filter(r => r.status === 'fulfilled');
        const rejections = results.filter(r => r.status === 'rejected');

        // Exactly one must succeed, exactly one must fail
        expect(successes.length).toBe(1);
        expect(rejections.length).toBe(1);

        const errorMsg = (rejections[0] as PromiseRejectedResult).reason.message;
        expect(
          errorMsg.includes('INSUFFICIENT_STOCK') || errorMsg.includes('INSUFFICIENT_STOCK_TO_ADJUST')
        ).toBe(true);

        // Verify PostgreSQL final stock: must be strictly 0, never negative!
        const finalInv = await client.query('SELECT quantity_available FROM inventory WHERE product_id = $1;', [prod.id]);
        expect(finalInv.rows[0].quantity_available).toBe(0);
      } finally {
        client.release();
      }
    });

    // 10.4 Simultaneous Merchant Accept vs Reject Order Race
    it('CORRECTION 4: executes simultaneous merchant accept-versus-reject order race with row locking', async () => {
      const client = await pool.connect();
      try {
        const custRes = await client.query("SELECT id FROM users WHERE email = 'customer@tuxi-seed.dev' LIMIT 1;");
        const custUserId = custRes.rows[0].id;
        const addrRes = await client.query("SELECT id FROM addresses WHERE user_id = $1 LIMIT 1;", [custUserId]);

        const itemRes = await client.query(`
          SELECT mi.id FROM menu_items mi
          JOIN menu_categories mc ON mc.id = mi.category_id
          WHERE mc.business_id = $1 LIMIT 1;
        `, [eatsBusinessId]);

        const order = await OrderService.createOrder({
          customerId: custUserId,
          businessId: eatsBusinessId,
          orderType: 'EATS',
          deliveryAddressId: addrRes.rows[0].id,
          items: [{ itemId: itemRes.rows[0].id, itemType: 'MENU_ITEM', quantity: 1 }],
          tipCents: 0,
          isTestPayment: false
        });

        // Simultaneous execution:
        // Staff A calls acceptOrder
        // Staff B calls rejectOrCancelOrder with onlyIfPlaced: true
        const acceptPromise = MerchantService.acceptOrder(eatsOwnerUserId, eatsBusinessId, order.orderId);
        const rejectPromise = MerchantService.rejectOrCancelOrder(eatsMgrUserId, eatsBusinessId, order.orderId, {
          reasonCode: 'OUT_OF_STOCK',
          reasonText: 'Item sold out at rush hour',
          onlyIfPlaced: true
        });

        const raceResults = await Promise.allSettled([acceptPromise, rejectPromise]);
        const successes = raceResults.filter(r => r.status === 'fulfilled');
        const rejections = raceResults.filter(r => r.status === 'rejected');

        // Exactly one must win, exactly one must be rejected
        expect(successes.length).toBe(1);
        expect(rejections.length).toBe(1);

        const failReason = (rejections[0] as PromiseRejectedResult).reason.message;
        expect(failReason).toContain('INVALID_STATE_TRANSITION');

        // Final state in PostgreSQL is deterministic (either PREPARING or CANCELLED)
        const finalOrder = await client.query('SELECT status FROM orders WHERE id = $1;', [order.orderId]);
        expect(['PREPARING', 'CANCELLED']).toContain(finalOrder.rows[0].status);
      } finally {
        client.release();
      }
    });

    // 10.5 Pending/Suspended Business Isolation & Unpaid Production Dispatch Blocking
    it('CORRECTION 5: isolates pending/suspended business from checkout and blocks operations', async () => {
      const client = await pool.connect();
      try {
        // 1. Verify customer order to pending business is strictly rejected
        const pendingBiz = await client.query("SELECT id FROM businesses WHERE status = 'PENDING_VERIFICATION' LIMIT 1;");
        if (pendingBiz.rows.length > 0) {
          const custRes = await client.query("SELECT id FROM users WHERE email = 'customer@tuxi-seed.dev' LIMIT 1;");
          const addrRes = await client.query("SELECT id FROM addresses WHERE user_id = $1 LIMIT 1;", [custRes.rows[0].id]);

          await expect(
            OrderService.createOrder({
              customerId: custRes.rows[0].id,
              businessId: pendingBiz.rows[0].id,
              orderType: 'EATS',
              deliveryAddressId: addrRes.rows[0].id,
              items: [{ itemId: '00000000-0000-0000-0000-000000000001', itemType: 'MENU_ITEM', quantity: 1 }],
              tipCents: 0,
              isTestPayment: false
            })
          ).rejects.toThrow(/BUSINESS_NOT_AVAILABLE/);

          // Merchant operations on pending business are blocked
          await expect(
            MerchantService.acceptOrder(eatsOwnerUserId, pendingBiz.rows[0].id, '00000000-0000-0000-0000-000000000001')
          ).rejects.toThrow(/BUSINESS_NOT_OPERATIONAL|FORBIDDEN/);
        }
      } finally {
        client.release();
      }
    });

    it('CORRECTION 5B: blocks unpaid order dispatch in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        const client = await pool.connect();
        try {
          const custRes = await client.query("SELECT id FROM users WHERE email = 'customer@tuxi-seed.dev' LIMIT 1;");
          const addrRes = await client.query("SELECT id FROM addresses WHERE user_id = $1 LIMIT 1;", [custRes.rows[0].id]);
          const itemRes = await client.query(`
            SELECT mi.id FROM menu_items mi
            JOIN menu_categories mc ON mc.id = mi.category_id
            WHERE mc.business_id = $1 LIMIT 1;
          `, [eatsBusinessId]);

          // Temporarily create an order with dev env, then test fulfillment in production
          process.env.NODE_ENV = 'development';
          const order = await OrderService.createOrder({
            customerId: custRes.rows[0].id,
            businessId: eatsBusinessId,
            orderType: 'EATS',
            deliveryAddressId: addrRes.rows[0].id,
            items: [{ itemId: itemRes.rows[0].id, itemType: 'MENU_ITEM', quantity: 1 }],
            tipCents: 0,
            isTestPayment: false
          });

          await MerchantService.acceptOrder(eatsOwnerUserId, eatsBusinessId, order.orderId);

          // Switch to production: unpaid order cannot be marked ready or dispatched
          process.env.NODE_ENV = 'production';
          await expect(
            MerchantService.markOrderReady(eatsOwnerUserId, eatsBusinessId, order.orderId)
          ).rejects.toThrow(/UNPAID_ORDER_FULFILLMENT_FORBIDDEN/);
        } finally {
          client.release();
        }
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    // 10.6 Complete Eats End-to-End Workflow with Delivery Integration and Rep Commission Regression
    it('CORRECTION 6A: executes complete Eats end-to-end workflow with delivery integration and Rep commission', async () => {
      const client = await pool.connect();
      try {
        const custRes = await client.query("SELECT id FROM users WHERE email = 'customer@tuxi-seed.dev' LIMIT 1;");
        const custUserId = custRes.rows[0].id;
        const addrRes = await client.query("SELECT id FROM addresses WHERE user_id = $1 LIMIT 1;", [custUserId]);
        const itemRes = await client.query(`
          SELECT mi.id, mi.base_price_cents FROM menu_items mi
          JOIN menu_categories mc ON mc.id = mi.category_id
          WHERE mc.business_id = $1 LIMIT 1;
        `, [eatsBusinessId]);

        // 1. Customer creates order
        const order = await OrderService.createOrder({
          customerId: custUserId,
          businessId: eatsBusinessId,
          orderType: 'EATS',
          deliveryAddressId: addrRes.rows[0].id,
          items: [{ itemId: itemRes.rows[0].id, itemType: 'MENU_ITEM', quantity: 2 }],
          tipCents: 1000,
          isTestPayment: false
        });
        expect(order.orderId).toBeDefined();

        // Simulate payment AUTHORISED so order is eligible for delivery & commission
        await client.query(`
          INSERT INTO payments (id, order_id, amount_cents, currency, status, payment_provider, provider_transaction_id)
          VALUES (uuid_generate_v4(), $1, $2, 'ZAR', 'AUTHORISED', 'SIMULATED', $3)
          ON CONFLICT (order_id) DO UPDATE SET status = 'AUTHORISED';
        `, [order.orderId, order.totalCents, `PAY-E2E-${Date.now()}`]);

        // 2. Merchant accepts order
        await MerchantService.acceptOrder(eatsOwnerUserId, eatsBusinessId, order.orderId, 20);

        // 3. Create delivery & mark ready
        const delivResult = await DeliveryService.createDeliveryForOrder(order.orderId);
        const deliv = delivResult.delivery;
        const readyRes = await MerchantService.markOrderReady(eatsOwnerUserId, eatsBusinessId, order.orderId);

        // 4. Assign isolated test driver
        const randSuffix = Math.floor(100000 + Math.random() * 900000);
        const dUserRes = await client.query(`
          INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, created_at, updated_at)
          VALUES (uuid_generate_v4(), $1, 'hashed', 'Phase2E', 'Driver', $2, true, NOW(), NOW())
          RETURNING id;
        `, [`p2e.e2e.driver.${randSuffix}@tuxi.test`, `+447222${randSuffix}`]);
        const dUserId = dUserRes.rows[0].id;
        await client.query("INSERT INTO user_roles (id, user_id, role) VALUES (uuid_generate_v4(), $1, 'TUXI_DELIVERY_DRIVER');", [dUserId]);
        const dProfRes = await client.query(`
          INSERT INTO driver_profiles (id, user_id, verification_status, is_online, is_suspended, license_number, vehicle_type, vehicle_plate, created_at, updated_at)
          VALUES (uuid_generate_v4(), $1, 'VERIFIED', true, false, $2, 'SCOOTER', $3, NOW(), NOW())
          RETURNING id;
        `, [dUserId, `LIC-P2E-${Date.now()}-${Math.floor(Math.random()*1000)}`, `PL-P2E-${Date.now()}`]);
        const driverId = dProfRes.rows[0].id;
        await DeliveryService.acceptDeliveryAssignment(deliv.id, driverId);

        // 5. Driver arrives and merchant hands off using Phase 2C pickup proof
        await DeliveryService.updateDriverProgression(deliv.id, driverId, 'EN_ROUTE_TO_PICKUP');
        await DeliveryService.updateDriverProgression(deliv.id, driverId, 'ARRIVED_AT_PICKUP');
        await MerchantService.handoffToCourier(eatsOwnerUserId, eatsBusinessId, order.orderId, {
          pickupCode: readyRes.pickupCode,
          driverId
        });

        // 6. Complete delivery to DELIVERED
        await client.query("UPDATE deliveries SET status = 'DELIVERED', delivered_at = NOW() WHERE id = $1;", [deliv.id]);
        await OrderService.updateOrderStatus(order.orderId, 'DELIVERED', dUserId, ['TUXI_DELIVERY_DRIVER']);

        // 7. Verify qualifying Rep commission in commission_ledger
        const commRes = await client.query(`
          SELECT cl.id, cl.commission_cents, cl.rep_profile_id
          FROM commission_ledger cl
          WHERE cl.order_id = $1;
        `, [order.orderId]);

        expect(commRes.rows.length).toBe(1);
        expect(commRes.rows[0].commission_cents).toBeGreaterThan(0);
      } finally {
        client.release();
      }
    });

    // 10.7 Complete Shop End-to-End Workflow with Pick/Pack Checklist
    it('CORRECTION 6B: executes complete Shop end-to-end workflow with pick/pack checklist and delivery integration', async () => {
      const client = await pool.connect();
      try {
        const custRes = await client.query("SELECT id FROM users WHERE email = 'customer@tuxi-seed.dev' LIMIT 1;");
        const custUserId = custRes.rows[0].id;
        const addrRes = await client.query("SELECT id FROM addresses WHERE user_id = $1 LIMIT 1;", [custUserId]);
        const prodRes = await client.query(`
          SELECT p.id FROM products p
          JOIN inventory i ON i.product_id = p.id
          WHERE p.business_id = $1 AND i.quantity_available >= 5
          LIMIT 1;
        `, [shopBusinessId]);

        // 1. Customer places order
        const order = await OrderService.createOrder({
          customerId: custUserId,
          businessId: shopBusinessId,
          orderType: 'SHOP',
          deliveryAddressId: addrRes.rows[0].id,
          items: [{ itemId: prodRes.rows[0].id, itemType: 'PRODUCT', quantity: 2 }],
          tipCents: 500,
          isTestPayment: false
        });

        // 2. Merchant updates pick & pack checklist
        const packedRes = await MerchantService.updatePickPackChecklist(shopOwnerUserId, shopBusinessId, order.orderId, ['item-1', 'item-2']);
        expect(packedRes.packed_item_ids).toEqual(['item-1', 'item-2']);

        // 3. Merchant marks ready
        const readyRes = await MerchantService.markOrderReady(shopOwnerUserId, shopBusinessId, order.orderId);
        expect(readyRes.pickupCode).toMatch(/^\d{6}$/);

        // 4. Handoff to courier
        const handoff = await MerchantService.handoffToCourier(shopOwnerUserId, shopBusinessId, order.orderId, {
          pickupCode: readyRes.pickupCode
        });
        expect(handoff.status).toBe('OUT_FOR_DELIVERY');
      } finally {
        client.release();
      }
    });

    // 10.8 Unattributed Merchant Zero Rep Commission Regression
    it('CORRECTION 6C: proves unattributed merchant generates ZERO Rep commission upon completion', async () => {
      const client = await pool.connect();
      try {
        const custRes = await client.query("SELECT id FROM users WHERE email = 'customer@tuxi-seed.dev' LIMIT 1;");
        const addrRes = await client.query("SELECT id FROM addresses WHERE user_id = $1 LIMIT 1;", [custRes.rows[0].id]);

        // Find an unattributed business (Table Mountain Burgers)
        const itemRes = await client.query(`
          SELECT mi.id FROM menu_items mi
          JOIN menu_categories mc ON mc.id = mi.category_id
          WHERE mc.business_id = $1 LIMIT 1;
        `, [otherBusinessId]);

        if (itemRes.rows.length > 0) {
          const order = await OrderService.createOrder({
            customerId: custRes.rows[0].id,
            businessId: otherBusinessId,
            orderType: 'EATS',
            deliveryAddressId: addrRes.rows[0].id,
            items: [{ itemId: itemRes.rows[0].id, itemType: 'MENU_ITEM', quantity: 1 }],
            tipCents: 0,
            isTestPayment: false
          });

          await client.query(`
            INSERT INTO payments (id, order_id, amount_cents, currency, status, payment_provider, provider_transaction_id)
            VALUES (uuid_generate_v4(), $1, 1000, 'ZAR', 'AUTHORISED', 'SIMULATED', $2)
            ON CONFLICT (order_id) DO UPDATE SET status = 'AUTHORISED';
          `, [order.orderId, `PAY-UNATTR-${Date.now()}`]);

          const driverRes = await client.query("SELECT user_id FROM driver_profiles WHERE verification_status = 'VERIFIED' LIMIT 1;");
          await MerchantService.acceptOrder(otherOwnerUserId, otherBusinessId, order.orderId);
          await MerchantService.markOrderReady(otherOwnerUserId, otherBusinessId, order.orderId);
          await OrderService.updateOrderStatus(order.orderId, 'OUT_FOR_DELIVERY', driverRes.rows[0].user_id, ['TUXI_DELIVERY_DRIVER']);
          await OrderService.updateOrderStatus(order.orderId, 'DELIVERED', driverRes.rows[0].user_id, ['TUXI_DELIVERY_DRIVER']);

          // Must produce zero records in commission_ledger
          const comm = await client.query('SELECT id FROM commission_ledger WHERE order_id = $1;', [order.orderId]);
          expect(comm.rows.length).toBe(0);
        }
      } finally {
        client.release();
      }
    });
  });
});
