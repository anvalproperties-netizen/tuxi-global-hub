import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { AuthService } from '../src/server/services/authService';
import { CustomerService } from '../src/server/services/customerService';
import { ShopService } from '../src/server/services/shopService';
import { OrderService } from '../src/server/services/orderService';
import { CommissionService } from '../src/server/services/commissionService';
import { RepService } from '../src/server/services/repService';
import { postgresAdapter } from '../src/server/db/postgres';
import { seedPhase2BShopData } from '../src/server/db/seedShopData';

const { Pool } = pg;
const JWT_SECRET = process.env.JWT_SECRET || 'tuxi_development_secure_jwt_secret_key_2026';

describe('TUXI PHASE 2B — SHOP & INVENTORY COMMERCE END-TO-END SUITE', () => {
  let pool: pg.Pool;
  let customerUser1: any;
  let customerUser2: any;
  let customerUser3: any;
  let address1: any;
  let address2: any;
  let medicareShop: any;
  let artisanShop: any;
  let pendingShop: any;
  let suspendedShop: any;
  let vitCProduct: any;
  let honeyProduct: any;
  let towelProduct: any;
  let towelVariantStandard: any;
  let towelVariantSheet: any;
  let towelVariantUnavailable: any;
  let concurProduct: any;
  let repProfileId: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 15
    });

    // Ensure Phase 2B data is seeded in PostgreSQL
    await seedPhase2BShopData();

    const client = await pool.connect();
    try {
      // 1. Create test customers
      const email1 = `shop.cust.1.${Date.now()}@tuxi.co.za`;
      const email2 = `shop.cust.2.${Date.now()}@tuxi.co.za`;
      const email3 = `shop.cust.3.${Date.now()}@tuxi.co.za`;

      customerUser1 = await AuthService.register({
        email: email1,
        password: 'ShopPassword123!',
        firstName: 'Sarah',
        lastName: 'Shopper',
        phoneNumber: '+27823334455'
      });

      customerUser2 = await AuthService.register({
        email: email2,
        password: 'ShopPassword123!',
        firstName: 'David',
        lastName: 'Buyer',
        phoneNumber: '+27825556677'
      });

      customerUser3 = await AuthService.register({
        email: email3,
        password: 'ShopPassword123!',
        firstName: 'Elena',
        lastName: 'Client',
        phoneNumber: '+27827778899'
      });

      // 2. Create customer addresses
      address1 = await CustomerService.createAddress(customerUser1.user.id, {
        streetLine1: '45 Kloof St',
        city: 'Cape Town',
        postalCode: '8001',
        countryCode: 'ZAF',
        latitude: -33.9290,
        longitude: 18.4120,
        label: 'Home',
        isDefault: true
      });

      address2 = await CustomerService.createAddress(customerUser2.user.id, {
        streetLine1: '12 Bree St',
        city: 'Cape Town',
        postalCode: '8001',
        countryCode: 'ZAF',
        latitude: -33.9210,
        longitude: 18.4200,
        label: 'Apartment',
        isDefault: true
      });

      // 3. Resolve businesses
      const b1 = await client.query("SELECT * FROM businesses WHERE name = 'MediCare Essentials Pharmacy';");
      medicareShop = b1.rows[0];

      const b2 = await client.query("SELECT * FROM businesses WHERE name = 'Artisan Living & Pantry';");
      artisanShop = b2.rows[0];

      const b3 = await client.query("SELECT * FROM businesses WHERE name = 'Green Cape Organic Grocers';");
      pendingShop = b3.rows[0];

      const b4 = await client.query("SELECT * FROM businesses WHERE name = 'Harbour Bay Convenience';");
      suspendedShop = b4.rows[0];

      // 4. Resolve products
      const p1 = await client.query("SELECT * FROM products WHERE sku = 'MED-VITC-1000';");
      vitCProduct = p1.rows[0];

      const p2 = await client.query("SELECT * FROM products WHERE sku = 'PAN-HONEY-500';");
      honeyProduct = p2.rows[0];

      const p3 = await client.query("SELECT * FROM products WHERE sku = 'ART-TOWL';");
      towelProduct = p3.rows[0];

      const vars = await client.query("SELECT * FROM product_variants WHERE product_id = $1;", [towelProduct.id]);
      towelVariantStandard = vars.rows.find(v => v.variant_sku === 'ART-TOWL-NV-STD');
      towelVariantSheet = vars.rows.find(v => v.variant_sku === 'ART-TOWL-CH-SHT');
      towelVariantUnavailable = vars.rows.find(v => v.variant_sku === 'ART-TOWL-SG-HND');

      const p4 = await client.query("SELECT * FROM products WHERE sku = 'CONCUR-PRESS-01';");
      concurProduct = p4.rows[0];

      // Resolve rep profile
      const repRes = await client.query("SELECT rep_profile_id FROM rep_business_attributions WHERE business_id = $1 LIMIT 1;", [medicareShop.id]);
      repProfileId = repRes.rows[0]?.rep_profile_id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  // ============================================================
  // 1. SHOP DISCOVERY & VISIBILITY ENFORCEMENT (2B.1)
  // ============================================================
  describe('1. Shop Discovery & Visibility Enforcement (2B.1)', () => {
    it('returns only businesses with type SHOP, status APPROVED, and is_active true', async () => {
      const shops = await ShopService.getApprovedShops();
      expect(shops.length).toBeGreaterThanOrEqual(2);

      const shopIds = shops.map(s => s.id);
      expect(shopIds).toContain(medicareShop.id);
      expect(shopIds).toContain(artisanShop.id);

      for (const s of shops) {
        expect(s.type).toBe('SHOP');
        expect(s.status).toBe('APPROVED');
      }
    });

    it('strictly hides pending shops from customer discovery', async () => {
      const shops = await ShopService.getApprovedShops();
      const shopIds = shops.map(s => s.id);
      expect(shopIds).not.toContain(pendingShop.id);
    });

    it('strictly hides suspended shops from customer discovery', async () => {
      const shops = await ShopService.getApprovedShops();
      const shopIds = shops.map(s => s.id);
      expect(shopIds).not.toContain(suspendedShop.id);
    });

    it('strictly separates Eats restaurants from Shop discovery', async () => {
      const client = await pool.connect();
      try {
        const eatsBiz = await client.query("SELECT id FROM businesses WHERE type = 'EATS' AND status = 'APPROVED' LIMIT 1;");
        if (eatsBiz.rows.length > 0) {
          const shops = await ShopService.getApprovedShops();
          const shopIds = shops.map(s => s.id);
          expect(shopIds).not.toContain(eatsBiz.rows[0].id);
        }
      } finally {
        client.release();
      }
    });

    it('strips all private merchant fields from customer discovery responses', async () => {
      const shops = await ShopService.getApprovedShops();
      for (const s of shops as any[]) {
        expect(s.tax_or_vat_id).toBeUndefined();
        expect(s.contact_email).toBeUndefined();
        expect(s.contact_phone).toBeUndefined();
        expect(s.legal_entity_name).toBeUndefined();
        expect(s.banking_details).toBeUndefined();
        expect(s.internal_notes).toBeUndefined();
        expect(s.risk_flags).toBeUndefined();
      }
    });

    it('retrieves single shop detail for approved shop', async () => {
      const detail = await ShopService.getShopDetail(medicareShop.id);
      expect(detail.id).toBe(medicareShop.id);
      expect(detail.name).toBe('MediCare Essentials Pharmacy');
      expect(detail.category).toBe('Health & Pharmacy');
      expect(detail.fulfillmentMode).toBe('shop_and_deliver');
    });

    it('rejects shop detail for pending or suspended shop', async () => {
      await expect(ShopService.getShopDetail(pendingShop.id)).rejects.toThrow('SHOP_NOT_FOUND');
      await expect(ShopService.getShopDetail(suspendedShop.id)).rejects.toThrow('SHOP_NOT_FOUND');
    });

    it('searches shops and products respecting visibility filters', async () => {
      const res = await ShopService.searchShopsAndProducts('vit');
      expect(res.products.some(p => p.sku === 'MED-VITC-1000')).toBe(true);

      const emptyRes = await ShopService.searchShopsAndProducts('nonexistentquery12345');
      expect(emptyRes.products.length).toBe(0);
    });
  });

  // ============================================================
  // 2. PRODUCT CATALOGUE & VARIANTS (2B.2)
  // ============================================================
  describe('2. Product Catalogue & Variants (2B.2)', () => {
    it('returns products for an approved active shop with authoritative stock and categories', async () => {
      const products = await ShopService.getShopProducts(medicareShop.id);
      expect(products.length).toBeGreaterThanOrEqual(2);

      const vitC = products.find(p => p.sku === 'MED-VITC-1000');
      expect(vitC).toBeDefined();
      expect(vitC!.name).toBe('Cold & Flu Defense Vitamin C 1000mg');
      expect(vitC!.priceCents).toBe(14500);
      expect(vitC!.isAvailable).toBe(true);
      expect(vitC!.stockAvailable).toBeGreaterThan(0);
      expect(vitC!.category).toBe('Vitamins & Supplements');
    });

    it('correctly handles sale-priced items with effectivePriceCents', async () => {
      const products = await ShopService.getShopProducts(artisanShop.id);
      const honey = products.find(p => p.sku === 'PAN-HONEY-500');
      expect(honey).toBeDefined();
      expect(honey!.isOnSale).toBe(true);
      expect(honey!.priceCents).toBe(12000);
      expect(honey!.salePriceCents).toBe(9500);
      expect(honey!.effectivePriceCents).toBe(9500);
    });

    it('correctly joins and presents product variants with attributes and price deltas', async () => {
      const products = await ShopService.getShopProducts(artisanShop.id);
      const towel = products.find(p => p.sku === 'ART-TOWL');
      expect(towel).toBeDefined();
      expect(towel!.variants.length).toBe(3);

      const std = towel!.variants.find(v => v.variantSku === 'ART-TOWL-NV-STD');
      expect(std).toBeDefined();
      expect(std!.priceDeltaCents).toBe(0);
      expect(std!.isAvailable).toBe(true);
      expect(std!.stockAvailable).toBe(12);
      expect(std!.attributes).toEqual({ color: 'Navy', size: 'Standard' });

      const sheet = towel!.variants.find(v => v.variantSku === 'ART-TOWL-CH-SHT');
      expect(sheet).toBeDefined();
      expect(sheet!.priceDeltaCents).toBe(7000); // R70 extra
      expect(sheet!.isAvailable).toBe(true);
      expect(sheet!.stockAvailable).toBe(8);

      const unavail = towel!.variants.find(v => v.variantSku === 'ART-TOWL-SG-HND');
      expect(unavail).toBeDefined();
      expect(unavail!.isAvailable).toBe(false);
      expect(unavail!.stockAvailable).toBe(0);
    });

    it('retrieves detailed single product with variants and live stock', async () => {
      const detail = await ShopService.getProductDetail(towelProduct.id);
      expect(detail.id).toBe(towelProduct.id);
      expect(detail.sku).toBe('ART-TOWL');
      expect(detail.variants.length).toBe(3);
    });
  });

  // ============================================================
  // 3. SERVER-AUTHORITATIVE PRICING & ONE-BUSINESS CART (2B.4)
  // ============================================================
  describe('3. Server-Authoritative Pricing & One-Business Cart (2B.4)', () => {
    it('authoritatively reprices Shop basket and ignores any client-sent prices', async () => {
      const repriced = await OrderService.repriceBasket({
        businessId: medicareShop.id,
        items: [
          {
            itemType: 'PRODUCT',
            itemId: vitCProduct.id,
            quantity: 2
          }
        ],
        tipCents: 500
      });

      // 2 * 14500 = 29000 cents subtotal
      expect(repriced.subtotalCents).toBe(29000);
      expect(repriced.deliveryFeeCents).toBe(2500); // R25 delivery
      expect(repriced.serviceFeeCents).toBe(150);   // R1.50 service
      expect(repriced.tipCents).toBe(500);          // R5 tip
      expect(repriced.totalCents).toBe(29000 + 2500 + 150 + 500); // 32150 cents
      expect(repriced.currency).toBe('ZAR');
    });

    it('correctly prices variants with price deltas', async () => {
      const repriced = await OrderService.repriceBasket({
        businessId: artisanShop.id,
        items: [
          {
            itemType: 'PRODUCT',
            itemId: towelProduct.id,
            variantId: towelVariantSheet.id,
            quantity: 1
          }
        ]
      });

      // Base 28000 + Delta 7000 = 35000 cents
      expect(repriced.items[0].unitPriceCents).toBe(35000);
      expect(repriced.subtotalCents).toBe(35000);
    });

    it('rejects multi-business orders combining items from different shops', async () => {
      await expect(
        OrderService.repriceBasket({
          businessId: medicareShop.id,
          items: [
            { itemType: 'PRODUCT', itemId: vitCProduct.id, quantity: 1 },
            { itemType: 'PRODUCT', itemId: honeyProduct.id, quantity: 1 } // belongs to artisanShop!
          ]
        })
      ).rejects.toThrow('MULTI_BUSINESS_ORDER_REJECTED');
    });

    it('rejects cart containing unavailable product or variant', async () => {
      await expect(
        OrderService.repriceBasket({
          businessId: artisanShop.id,
          items: [
            {
              itemType: 'PRODUCT',
              itemId: towelProduct.id,
              variantId: towelVariantUnavailable.id,
              quantity: 1
            }
          ]
        })
      ).rejects.toThrow('VARIANT_UNAVAILABLE');
    });
  });

  // ============================================================
  // 4. SERVER-AUTHORITATIVE INVENTORY & CONCURRENCY (2B.3)
  // ============================================================
  describe('4. Server-Authoritative Inventory & Concurrency (2B.3)', () => {
    it('creates persistent shop order and atomically decrements inventory in PostgreSQL', async () => {
      const client = await pool.connect();
      let beforeQty: number;
      try {
        const invBefore = await client.query('SELECT quantity_available FROM inventory WHERE product_id = $1 AND variant_id IS NULL;', [vitCProduct.id]);
        beforeQty = invBefore.rows[0].quantity_available;
      } finally {
        client.release();
      }

      const order = await OrderService.createOrder({
        customerId: customerUser1.user.id,
        businessId: medicareShop.id,
        deliveryAddressId: address1.id,
        items: [
          {
            itemType: 'PRODUCT',
            itemId: vitCProduct.id,
            quantity: 3
          }
        ],
        tipCents: 1000,
        idempotencyKey: `idem-shop-order-${Date.now()}`
      });

      expect(order.orderId).toBeDefined();
      expect(order.orderNumber).toMatch(/^TX-\d{6}$/);
      expect(order.subtotalCents).toBe(14500 * 3); // 43500

      // Check PostgreSQL inventory decrement
      const client2 = await pool.connect();
      try {
        const invAfter = await client2.query('SELECT quantity_available FROM inventory WHERE product_id = $1 AND variant_id IS NULL;', [vitCProduct.id]);
        const afterQty = invAfter.rows[0].quantity_available;
        expect(afterQty).toBe(beforeQty - 3);

        // Verify inventory reservation row created with status RESERVED for unpaid checkout
        const resv = await client2.query('SELECT * FROM inventory_reservations WHERE order_id = $1;', [order.orderId]);
        expect(resv.rows.length).toBe(1);
        expect(resv.rows[0].quantity).toBe(3);
        expect(resv.rows[0].status).toBe('RESERVED');

        // Verify order_items persisted with item_type PRODUCT and sku
        const oItems = await client2.query('SELECT * FROM order_items WHERE order_id = $1;', [order.orderId]);
        expect(oItems.rows.length).toBe(1);
        expect(oItems.rows[0].item_type).toBe('PRODUCT');
        expect(oItems.rows[0].sku).toBe('MED-VITC-1000');
        expect(oItems.rows[0].quantity).toBe(3);
      } finally {
        client2.release();
      }
    });

    it('rejects order attempting to purchase more stock than available', async () => {
      await expect(
        OrderService.createOrder({
          customerId: customerUser2.user.id,
          businessId: medicareShop.id,
          deliveryAddressId: address2.id,
          items: [
            {
              itemType: 'PRODUCT',
              itemId: vitCProduct.id,
              quantity: 100 // Exceeds available stock of 50 without SQL integer overflow
            }
          ],
          idempotencyKey: `idem-oversell-${Date.now()}`
        })
      ).rejects.toThrow('INSUFFICIENT_STOCK');
    });

    it('CONCURRENCY RACE TEST: 5 simultaneous checkouts competing for the LAST single unit', async () => {
      // Setup isolated product with exactly 1 unit of stock
      const client = await pool.connect();
      let testProdId: string;
      try {
        const insP = await client.query(`
          INSERT INTO products (
            id, business_id, sku, name, description, category, price_cents, is_on_sale, is_available, is_active
          )
          VALUES (
            uuid_generate_v4(), $1, $2, 'Concurrency Limited Stoneware Mug',
            'Collector single piece.', 'Ceramics', 25000, false, true, true
          )
          RETURNING id;
        `, [artisanShop.id, `CONCUR-MUG-${Date.now()}`]);
        testProdId = insP.rows[0].id;

        await client.query(`
          INSERT INTO inventory (id, product_id, quantity_available, reserved_quantity)
          VALUES (uuid_generate_v4(), $1, 1, 0);
        `, [testProdId]);
      } finally {
        client.release();
      }

      // 5 concurrent customers attempt to buy the 1 remaining unit at the exact same millisecond
      const customerIds = [
        customerUser1.user.id,
        customerUser2.user.id,
        customerUser3.user.id,
        customerUser1.user.id,
        customerUser2.user.id
      ];

      const checkoutPromises = customerIds.map((cId, idx) => {
        return OrderService.createOrder({
          customerId: cId,
          businessId: artisanShop.id,
          deliveryAddress: {
            streetLine1: `${idx + 10} Bree St`,
            city: 'Cape Town',
            postalCode: '8001',
            countryCode: 'ZAF',
            latitude: -33.9220,
            longitude: 18.4195
          },
          items: [
            {
              itemType: 'PRODUCT',
              itemId: testProdId,
              quantity: 1
            }
          ],
          idempotencyKey: `race-key-${Date.now()}-${idx}`
        }).then(res => ({ success: true, orderId: res.orderId }))
          .catch(err => ({ success: false, error: err.message }));
      });

      const results = await Promise.all(checkoutPromises);

      const successfulOrders = results.filter((r): r is { success: true; orderId: string } => r.success);
      const failedOrders = results.filter((r): r is { success: false; error: string } => !r.success);

      // EXACTLY ONE must succeed; the other four must fail with INSUFFICIENT_STOCK
      expect(successfulOrders.length).toBe(1);
      expect(failedOrders.length).toBe(4);

      for (const fail of failedOrders) {
        expect(fail.error).toContain('INSUFFICIENT_STOCK');
      }

      // Verify PostgreSQL database state: exactly 0 remaining stock, exactly 1 order
      const client2 = await pool.connect();
      try {
        const invFinal = await client2.query('SELECT quantity_available FROM inventory WHERE product_id = $1;', [testProdId]);
        expect(invFinal.rows[0].quantity_available).toBe(0);

        const ordersCreated = await client2.query(`
          SELECT count(*) FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          WHERE oi.item_id = $1;
        `, [testProdId]);
        expect(parseInt(ordersCreated.rows[0].count, 10)).toBe(1);
      } finally {
        client2.release();
      }
    });
  });

  // ============================================================
  // 5. CHECKOUT IDEMPOTENCY (2B.5)
  // ============================================================
  describe('5. Checkout Idempotency (2B.5)', () => {
    it('concurrent and repeated requests with the same idempotency key create exactly ONE order and decrement inventory ONCE', async () => {
      const sharedKey = `shared-idem-shop-${Date.now()}`;

      const client = await pool.connect();
      let beforeQty: number;
      try {
        const inv = await client.query('SELECT quantity_available FROM inventory WHERE product_id = $1 AND variant_id IS NULL;', [vitCProduct.id]);
        beforeQty = inv.rows[0].quantity_available;
      } finally {
        client.release();
      }

      // Fire 4 concurrent requests with the identical idempotency key
      const concurrentRequests = Array.from({ length: 4 }).map(() => {
        return OrderService.createOrder({
          customerId: customerUser1.user.id,
          businessId: medicareShop.id,
          deliveryAddressId: address1.id,
          items: [
            {
              itemType: 'PRODUCT',
              itemId: vitCProduct.id,
              quantity: 2
            }
          ],
          idempotencyKey: sharedKey
        });
      });

      const results = await Promise.all(concurrentRequests);

      // All returned orders must have identical orderId and orderNumber
      const firstOrderId = results[0].orderId;
      for (const r of results) {
        expect(r.orderId).toBe(firstOrderId);
        expect(r.orderNumber).toBe(results[0].orderNumber);
      }

      // Exactly ONE order exists in PostgreSQL database
      const client2 = await pool.connect();
      try {
        const oRes = await client2.query('SELECT count(*) FROM orders WHERE idempotency_key = $1;', [sharedKey]);
        expect(parseInt(oRes.rows[0].count, 10)).toBe(1);

        // Exactly ONE set of order_items
        const oiRes = await client2.query('SELECT count(*) FROM order_items WHERE order_id = $1;', [firstOrderId]);
        expect(parseInt(oiRes.rows[0].count, 10)).toBe(1);

        // Inventory must have been decremented by exactly 2 (NOT 2 * 4 = 8)
        const invAfter = await client2.query('SELECT quantity_available FROM inventory WHERE product_id = $1 AND variant_id IS NULL;', [vitCProduct.id]);
        const afterQty = invAfter.rows[0].quantity_available;
        expect(afterQty).toBe(beforeQty - 2);
      } finally {
        client2.release();
      }

      // Sequential replay also recovers original order without side-effects
      const replay = await OrderService.createOrder({
        customerId: customerUser1.user.id,
        businessId: medicareShop.id,
        deliveryAddressId: address1.id,
        items: [
          {
            itemType: 'PRODUCT',
            itemId: vitCProduct.id,
            quantity: 2
          }
        ],
        idempotencyKey: sharedKey
      });

      expect(replay.orderId).toBe(firstOrderId);
      expect(replay.isIdempotentReplay).toBe(true);
    });
  });

  // ============================================================
  // 6. PAYMENT STATE SAFETY & REP COMMISSION REGRESSION (2B.6)
  // ============================================================
  describe('6. Payment State Safety & Rep Commission Regression (2B.6)', () => {
    it('production mode strictly rejects isTestPayment: true', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(
          OrderService.createOrder({
            customerId: customerUser1.user.id,
            businessId: medicareShop.id,
            deliveryAddressId: address1.id,
            items: [{ itemType: 'PRODUCT', itemId: vitCProduct.id, quantity: 1 }],
            idempotencyKey: `prod-test-pay-${Date.now()}`,
            isTestPayment: true
          })
        ).rejects.toThrow('TEST_PAYMENT_FORBIDDEN_IN_PRODUCTION');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('records PAYMENT_INTEGRATION_PENDING and INITIATED for standard order in development', async () => {
      const order = await OrderService.createOrder({
        customerId: customerUser1.user.id,
        businessId: medicareShop.id,
        deliveryAddressId: address1.id,
        items: [{ itemType: 'PRODUCT', itemId: vitCProduct.id, quantity: 1 }],
        idempotencyKey: `dev-normal-pay-${Date.now()}`,
        isTestPayment: false
      });

      expect(order.paymentProvider).toBe('PAYMENT_INTEGRATION_PENDING');
      expect(order.paymentStatus).toBe('INITIATED');
    });

    it('attributed Shop generates Rep commission in PostgreSQL when order completes', async () => {
      const order = await OrderService.createOrder({
        customerId: customerUser1.user.id,
        businessId: medicareShop.id, // Attributed to Marcus Rivera (repProfileId)
        deliveryAddressId: address1.id,
        items: [{ itemType: 'PRODUCT', itemId: vitCProduct.id, quantity: 2 }],
        idempotencyKey: `comm-order-test-${Date.now()}`
      });

      // Transition order to DELIVERED
      const client = await pool.connect();
      try {
        await client.query("UPDATE orders SET status = 'DELIVERED' WHERE id = $1;", [order.orderId]);
      } finally {
        client.release();
      }

      // Process commission
      const commKey = `comm-key-shop-${Date.now()}`;
      const commResult = await CommissionService.processOrderCommissionPostgres(order.orderId, commKey);

      expect(commResult.status).toBe('EARNED');
      expect(commResult.repProfileId).toBe(repProfileId);
      // Subtotal is 2 * 14500 = 29000 cents. Configured rate is 2.5% = 0.025. 29000 * 0.025 = 725 cents
      expect(commResult.commissionCents).toBe(725);

      // Verify row in commission_ledger
      const client2 = await pool.connect();
      try {
        const ledgerRow = await client2.query('SELECT * FROM commission_ledger WHERE id = $1;', [commResult.ledgerId]);
        expect(ledgerRow.rows.length).toBe(1);
        expect(ledgerRow.rows[0].status).toBe('EARNED');
        expect(ledgerRow.rows[0].commission_cents).toBe(725);
      } finally {
        client2.release();
      }

      // Replay idempotency test
      const replayComm = await CommissionService.processOrderCommissionPostgres(order.orderId, commKey);
      expect(replayComm.isIdempotentReplay).toBe(true);
      expect(replayComm.commissionCents).toBe(725);

      // Compensating reversal test (e.g. 50% partial refund)
      const revKey = `comm-rev-shop-${Date.now()}`;
      const revResult = await CommissionService.reverseOrderCommission(order.orderId, 'Customer return', revKey, 14500);
      expect(revResult.reversedCents).toBe(363); // 14500 * 0.025 = 362.5 rounded = 363
      expect(revResult.status).toBe('PARTIALLY_REVERSED');
    });

    it('unattributed Shop generates NO rep commission', async () => {
      const order = await OrderService.createOrder({
        customerId: customerUser2.user.id,
        businessId: artisanShop.id, // Unattributed shop
        deliveryAddressId: address2.id,
        items: [{ itemType: 'PRODUCT', itemId: honeyProduct.id, quantity: 1 }],
        idempotencyKey: `no-attr-shop-comm-${Date.now()}`
      });

      // Transition order to DELIVERED
      const client = await pool.connect();
      try {
        await client.query("UPDATE orders SET status = 'DELIVERED' WHERE id = $1;", [order.orderId]);
      } finally {
        client.release();
      }

      const commResult = await CommissionService.processOrderCommissionPostgres(order.orderId, `no-attr-${Date.now()}`);
      expect(commResult.status).toBe('NO_ATTRIBUTED_REP');
      expect(commResult.commissionCents).toBe(0);
    });
  });

  // ============================================================
  // 7. POSTGIS 20 KM REP TERRITORY REGRESSION (LOCKED BASELINE)
  // ============================================================
  describe('7. PostGIS 20 km Rep Territory Regression (Locked Baseline)', () => {
    it('verifies exact boundary metrics on live PostGIS: 20000.000m AUTHORIZE, 20000.001m REJECT', async () => {
      const hubLat = -33.9249;
      const hubLng = 18.4241;
      const client = await pool.connect();
      try {
        const bearings = [0, 45, 90, 180, 270];

        for (const bearing of bearings) {
          // Exactly 20,000.000m target
          const resExact = await client.query(`
            WITH hub AS (
              SELECT ST_SetSRID(ST_Point($1::float8, $2::float8), 4326)::geography AS geom
            ),
            target AS (
              SELECT ST_Project(geom, 20000.000, radians($3::float8)) AS geom FROM hub
            )
            SELECT 
              ST_Y(target.geom::geometry) AS target_lat,
              ST_X(target.geom::geometry) AS target_lng,
              ST_Distance(hub.geom, target.geom) AS dist
            FROM hub, target;
          `, [hubLng, hubLat, bearing]);

          const authExact = await RepService.validateTerritoryAuthoritative(
            hubLat,
            hubLng,
            Number(resExact.rows[0].target_lat),
            Number(resExact.rows[0].target_lng),
            20.0
          );
          expect(authExact.isWithin).toBe(true);
          expect(Number(resExact.rows[0].dist)).toBe(20000.0);

          // 20,000.001m target
          const resOutside = await client.query(`
            WITH hub AS (
              SELECT ST_SetSRID(ST_Point($1::float8, $2::float8), 4326)::geography AS geom
            ),
            target AS (
              SELECT ST_Project(geom, 20000.001, radians($3::float8)) AS geom FROM hub
            )
            SELECT 
              ST_Y(target.geom::geometry) AS target_lat,
              ST_X(target.geom::geometry) AS target_lng,
              ST_Distance(hub.geom, target.geom) AS dist
            FROM hub, target;
          `, [hubLng, hubLat, bearing]);

          const authOutside = await RepService.validateTerritoryAuthoritative(
            hubLat,
            hubLng,
            Number(resOutside.rows[0].target_lat),
            Number(resOutside.rows[0].target_lng),
            20.0
          );
          expect(authOutside.isWithin).toBe(false);
          expect(Number(resOutside.rows[0].dist)).toBeGreaterThan(20000.0);
        }
      } finally {
        client.release();
      }
    });
  });
});
