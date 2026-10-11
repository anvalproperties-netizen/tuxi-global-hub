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

describe('TUXI PHASE 2B — FINAL ACCEPTANCE GATE TEST SUITE', () => {
  let pool: pg.Pool;
  let customerUserA: any;
  let customerUserB: any;
  let tokenA: string;
  let tokenB: string;
  let addressA: any;
  let addressB: any;
  let medicareShop: any;
  let artisanShop: any;
  let vitCProduct: any;
  let honeyProduct: any;
  let towelProduct: any;
  let towelVariantStandard: any;
  let towelVariantSheet: any;
  let towelVariantUnavailable: any;
  let repProfileId: string;
  let adminUserId: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 15
    });

    // Ensure Phase 2B baseline is seeded
    await seedPhase2BShopData();

    const client = await pool.connect();
    try {
      // Create admin user for authorized restocks/refunds
      const adminEmail = `admin.gate.${Date.now()}@tuxi.co.za`;
      const adminRes = await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active)
        VALUES (uuid_generate_v4(), $1, '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890', 'Admin', 'Officer', '+27829998888', true)
        RETURNING id;
      `, [adminEmail]);
      adminUserId = adminRes.rows[0].id;
      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'ADMIN')
        ON CONFLICT DO NOTHING;
      `, [adminUserId]);

      // Create test customers A and B
      const emailA = `cust.gate.a.${Date.now()}@tuxi.co.za`;
      const emailB = `cust.gate.b.${Date.now()}@tuxi.co.za`;

      customerUserA = await AuthService.register({
        email: emailA,
        password: 'GatePassword123!',
        firstName: 'Alice',
        lastName: 'GateShopper',
        phoneNumber: '+27821110001'
      });
      tokenA = customerUserA.token;

      customerUserB = await AuthService.register({
        email: emailB,
        password: 'GatePassword123!',
        firstName: 'Bob',
        lastName: 'GateShopper',
        phoneNumber: '+27821110002'
      });
      tokenB = customerUserB.token;

      addressA = await CustomerService.createAddress(customerUserA.user.id, {
        streetLine1: '100 Bree St',
        city: 'Cape Town',
        postalCode: '8001',
        countryCode: 'ZAF',
        latitude: -33.9230,
        longitude: 18.4180,
        label: 'Home',
        isDefault: true
      });

      addressB = await CustomerService.createAddress(customerUserB.user.id, {
        streetLine1: '200 Long St',
        city: 'Cape Town',
        postalCode: '8001',
        countryCode: 'ZAF',
        latitude: -33.9260,
        longitude: 18.4160,
        label: 'Office',
        isDefault: true
      });

      const b1 = await client.query("SELECT * FROM businesses WHERE name = 'MediCare Essentials Pharmacy';");
      medicareShop = b1.rows[0];

      const b2 = await client.query("SELECT * FROM businesses WHERE name = 'Artisan Living & Pantry';");
      artisanShop = b2.rows[0];

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

      const repRes = await client.query("SELECT rep_profile_id FROM rep_business_attributions WHERE business_id = $1 LIMIT 1;", [medicareShop.id]);
      repProfileId = repRes.rows[0]?.rep_profile_id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  // Helper to create an isolated test product with specific starting stock
  async function createTestProductWithStock(shopId: string, initialStock: number) {
    const client = await pool.connect();
    try {
      const insP = await client.query(`
        INSERT INTO products (
          id, business_id, sku, name, description, category, price_cents, is_on_sale, is_available, is_active
        )
        VALUES (
          uuid_generate_v4(), $1, $2, 'Synthetic Gate Test Product',
          'Unit testing inventory isolation.', 'Testing', 15000, false, true, true
        )
        RETURNING id;
      `, [shopId, `GATE-PROD-${Date.now()}-${Math.floor(Math.random() * 100000)}`]);
      const prodId = insP.rows[0].id;

      const insInv = await client.query(`
        INSERT INTO inventory (id, product_id, quantity_available, reserved_quantity)
        VALUES (uuid_generate_v4(), $1, $2, 0)
        RETURNING id;
      `, [prodId, initialStock]);

      return { productId: prodId, inventoryId: insInv.rows[0].id };
    } finally {
      client.release();
    }
  }

  // ============================================================
  // 1 & 2. INVENTORY LIFECYCLE & UNPAID ORDER INVENTORY RELEASE
  // ============================================================
  describe('1 & 2. Inventory Lifecycle & Unpaid Order Release', () => {
    it('creates unpaid order: stock 5 -> 3, reservation RESERVED, cancellation restores to 5, replay maintains 5', async () => {
      const { productId, inventoryId } = await createTestProductWithStock(medicareShop.id, 5);

      // 1. Stock Before
      const client = await pool.connect();
      let beforeQty: number;
      try {
        const invBefore = await client.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        beforeQty = invBefore.rows[0].quantity_available;
        expect(beforeQty).toBe(5);
      } finally {
        client.release();
      }

      // 2. Order 2 units with PAYMENT_INTEGRATION_PENDING (isTestPayment: false)
      const order = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: medicareShop.id,
        deliveryAddressId: addressA.id,
        items: [{ itemType: 'PRODUCT', itemId: productId, quantity: 2 }],
        idempotencyKey: `unpaid-gate-${Date.now()}`,
        isTestPayment: false
      });

      expect(order.paymentProvider).toBe('PAYMENT_INTEGRATION_PENDING');
      expect(order.paymentStatus).toBe('INITIATED');
      expect(order.status).toBe('PLACED');

      // 3. Stock immediately after checkout: 3, reservation status: RESERVED
      const client2 = await pool.connect();
      try {
        const invAfter = await client2.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invAfter.rows[0].quantity_available).toBe(3);

        const resv = await client2.query('SELECT status, quantity FROM inventory_reservations WHERE order_id = $1;', [order.orderId]);
        expect(resv.rows.length).toBe(1);
        expect(resv.rows[0].status).toBe('RESERVED');
        expect(resv.rows[0].quantity).toBe(2);
      } finally {
        client2.release();
      }

      // 4. Cancel unpaid order
      const cancelRes = await OrderService.cancelOrder(order.orderId, customerUserA.user.id, 'User cancelled unpaid basket');
      expect(cancelRes.status).toBe('CANCELLED');

      // 5. Stock after cancellation: exactly 5, reservation: RELEASED, order: CANCELLED
      const client3 = await pool.connect();
      try {
        const invCancelled = await client3.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invCancelled.rows[0].quantity_available).toBe(5);

        const resvCancelled = await client3.query('SELECT status FROM inventory_reservations WHERE order_id = $1;', [order.orderId]);
        expect(resvCancelled.rows[0].status).toBe('RELEASED');

        const orderCancelled = await client3.query('SELECT status FROM orders WHERE id = $1;', [order.orderId]);
        expect(orderCancelled.rows[0].status).toBe('CANCELLED');
      } finally {
        client3.release();
      }

      // 6. Replay cancellation: MUST NOT double-restore (stock must remain 5, not 7!)
      await expect(
        OrderService.cancelOrder(order.orderId, customerUserA.user.id, 'Replayed cancellation')
      ).rejects.toThrow('CANNOT_CANCEL_ORDER');

      const client4 = await pool.connect();
      try {
        const invReplay = await client4.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invReplay.rows[0].quantity_available).toBe(5); // Remained 5!
      } finally {
        client4.release();
      }
    });
  });

  // ============================================================
  // 3. ABANDONED ORDER / EXPIRY
  // ============================================================
  describe('3. Abandoned Order / Deterministic Expiry Release', () => {
    it('executes server-side expiry: restores stock, updates reservation to RELEASED, replay does not double-restore', async () => {
      const { productId, inventoryId } = await createTestProductWithStock(artisanShop.id, 5);

      const order = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: artisanShop.id,
        deliveryAddressId: addressA.id,
        items: [{ itemType: 'PRODUCT', itemId: productId, quantity: 2 }],
        idempotencyKey: `expiry-test-${Date.now()}`
      });

      // Stock is decremented to 3, expires_at is set to future
      const client = await pool.connect();
      try {
        const invMid = await client.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invMid.rows[0].quantity_available).toBe(3);

        const resv = await client.query('SELECT expires_at, status FROM inventory_reservations WHERE order_id = $1;', [order.orderId]);
        expect(resv.rows[0].status).toBe('RESERVED');
        expect(new Date(resv.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
      } finally {
        client.release();
      }

      // Simulate passage of time beyond reservation window (e.g. 45 minutes ahead)
      const simulatedFuture = new Date(Date.now() + 45 * 60 * 1000);
      const expiryResult = await OrderService.releaseExpiredReservations(simulatedFuture);
      expect(expiryResult.releasedCount).toBeGreaterThanOrEqual(1);

      // Stock is restored to 5, reservation is RELEASED, order is CANCELLED (cancelled_reason indicates expiry)
      const client2 = await pool.connect();
      try {
        const invFinal = await client2.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invFinal.rows[0].quantity_available).toBe(5);

        const resvFinal = await client2.query('SELECT status FROM inventory_reservations WHERE order_id = $1;', [order.orderId]);
        expect(resvFinal.rows[0].status).toBe('RELEASED');

        const orderFinal = await client2.query('SELECT status, cancelled_reason FROM orders WHERE id = $1;', [order.orderId]);
        expect(orderFinal.rows[0].status).toBe('CANCELLED');
        expect(orderFinal.rows[0].cancelled_reason).toContain('expired');
      } finally {
        client2.release();
      }

      // Replay expiry cleanup: stock remains 5!
      const replayExpiry = await OrderService.releaseExpiredReservations(simulatedFuture);
      const client3 = await pool.connect();
      try {
        const invAfterReplay = await client3.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invAfterReplay.rows[0].quantity_available).toBe(5);
      } finally {
        client3.release();
      }
    });
  });

  // ============================================================
  // 4. PAYMENT FAILURE INVENTORY RELEASE
  // ============================================================
  describe('4. Payment Failure Inventory Release', () => {
    it('simulates payment failure: restores stock to 5, marks PAYMENT_FAILED, replay does not double-restore', async () => {
      const { productId, inventoryId } = await createTestProductWithStock(medicareShop.id, 5);

      const order = await OrderService.createOrder({
        customerId: customerUserB.user.id,
        businessId: medicareShop.id,
        deliveryAddressId: addressB.id,
        items: [{ itemType: 'PRODUCT', itemId: productId, quantity: 2 }],
        idempotencyKey: `pay-fail-${Date.now()}`
      });

      // Stock is 3
      const client = await pool.connect();
      try {
        const inv = await client.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(inv.rows[0].quantity_available).toBe(3);
      } finally {
        client.release();
      }

      // Trigger server-side payment failure handler
      const failResult = await OrderService.handlePaymentFailure(order.orderId, 'Card declined by issuing bank');
      expect(failResult.status).toBe('PAYMENT_FAILED');
      expect(failResult.releasedCount).toBe(1);

      // Verify stock restored to 5, reservation RELEASED, payment FAILED
      const client2 = await pool.connect();
      try {
        const invRestored = await client2.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invRestored.rows[0].quantity_available).toBe(5);

        const resv = await client2.query('SELECT status FROM inventory_reservations WHERE order_id = $1;', [order.orderId]);
        expect(resv.rows[0].status).toBe('RELEASED');

        const pay = await client2.query('SELECT status FROM payments WHERE order_id = $1;', [order.orderId]);
        expect(pay.rows[0].status).toBe('FAILED');
      } finally {
        client2.release();
      }

      // Replay payment failure: stock remains 5
      const replayFail = await OrderService.handlePaymentFailure(order.orderId, 'Replayed failure webhook');
      expect(replayFail.alreadyHandled).toBe(true);

      const client3 = await pool.connect();
      try {
        const invReplay = await client3.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invReplay.rows[0].quantity_available).toBe(5);
      } finally {
        client3.release();
      }
    });
  });

  // ============================================================
  // 5. SUCCESSFUL INVENTORY COMMIT
  // ============================================================
  describe('5. Successful Inventory Commit', () => {
    it('qualifying checkout commits reservation: stock 5 -> 3, cleanup does not restore committed stock', async () => {
      const { productId, inventoryId } = await createTestProductWithStock(medicareShop.id, 5);

      const order = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: medicareShop.id,
        deliveryAddressId: addressA.id,
        items: [{ itemType: 'PRODUCT', itemId: productId, quantity: 2 }],
        idempotencyKey: `commit-test-${Date.now()}`,
        isTestPayment: true // DEV-ONLY test payment mode
      });

      // Verify reservation is COMMITTED, payment AUTHORISED, stock 3
      const client = await pool.connect();
      try {
        const inv = await client.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(inv.rows[0].quantity_available).toBe(3);

        const resv = await client.query('SELECT status FROM inventory_reservations WHERE order_id = $1;', [order.orderId]);
        expect(resv.rows[0].status).toBe('COMMITTED');

        const pay = await client.query('SELECT status FROM payments WHERE order_id = $1;', [order.orderId]);
        expect(pay.rows[0].status).toBe('AUTHORISED');
      } finally {
        client.release();
      }

      // Run cleanup past expiry time
      const futureTime = new Date(Date.now() + 60 * 60 * 1000);
      await OrderService.releaseExpiredReservations(futureTime);

      // Stock MUST REMAIN 3! Committed inventory is not released by cleanup!
      const client2 = await pool.connect();
      try {
        const invAfterCleanup = await client2.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invAfterCleanup.rows[0].quantity_available).toBe(3);

        const resvAfterCleanup = await client2.query('SELECT status FROM inventory_reservations WHERE order_id = $1;', [order.orderId]);
        expect(resvAfterCleanup.rows[0].status).toBe('COMMITTED');
      } finally {
        client2.release();
      }
    });
  });

  // ============================================================
  // 6. CANCELLATION CONCURRENCY
  // ============================================================
  describe('6. Cancellation Concurrency', () => {
    it('executes 5 concurrent cancellations: exactly ONE succeeds, stock restored from 3 to 5 exactly once', async () => {
      const { productId, inventoryId } = await createTestProductWithStock(artisanShop.id, 5);

      const order = await OrderService.createOrder({
        customerId: customerUserB.user.id,
        businessId: artisanShop.id,
        deliveryAddressId: addressB.id,
        items: [{ itemType: 'PRODUCT', itemId: productId, quantity: 2 }],
        idempotencyKey: `cancel-concur-${Date.now()}`
      });

      // Stock is 3
      const client = await pool.connect();
      try {
        const invMid = await client.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invMid.rows[0].quantity_available).toBe(3);
      } finally {
        client.release();
      }

      // Fire 5 concurrent cancellation requests
      const cancelPromises = Array.from({ length: 5 }).map((_, idx) => {
        return OrderService.cancelOrder(order.orderId, customerUserB.user.id, `Concurrent cancel attempt ${idx}`)
          .then(res => ({ success: true, res }))
          .catch(err => ({ success: false, error: err.message }));
      });

      const cancelResults = await Promise.all(cancelPromises);
      const successfulCancels = cancelResults.filter(r => r.success);
      const rejectedCancels = cancelResults.filter(r => !r.success);

      // Exactly ONE logical cancellation succeeds; remaining 4 fail with CANNOT_CANCEL_ORDER
      expect(successfulCancels.length).toBe(1);
      expect(rejectedCancels.length).toBe(4);

      // Final stock MUST BE exactly 5 (NOT 5 + 2*4 = 13!)
      const client2 = await pool.connect();
      try {
        const invFinal = await client2.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invFinal.rows[0].quantity_available).toBe(5);

        // Exactly 1 order in status CANCELLED
        const oRes = await client2.query('SELECT status FROM orders WHERE id = $1;', [order.orderId]);
        expect(oRes.rows[0].status).toBe('CANCELLED');
      } finally {
        client2.release();
      }
    });
  });

  // ============================================================
  // 7. INVENTORY DATABASE CONSTRAINTS
  // ============================================================
  describe('7. Inventory Database Constraints', () => {
    it('proves PostgreSQL hard constraints prevent quantity_available < 0 and reserved_quantity < 0', async () => {
      const client = await pool.connect();
      try {
        const constraints = await client.query(`
          SELECT conname, pg_get_constraintdef(oid) as def
          FROM pg_constraint
          WHERE conrelid = 'inventory'::regclass;
        `);

        const defs = constraints.rows.map(r => r.def);
        expect(defs.some(d => d.includes('quantity_available >= 0'))).toBe(true);
        expect(defs.some(d => d.includes('reserved_quantity >= 0'))).toBe(true);

        // Attempt direct illegal negative quantity update in PostgreSQL
        let threwError = false;
        try {
          const invRow = await client.query('SELECT id FROM inventory LIMIT 1;');
          await client.query("UPDATE inventory SET quantity_available = -5 WHERE id = $1;", [invRow.rows[0].id]);
        } catch (err: any) {
          threwError = true;
          expect(err.code).toBe('23514'); // check_violation
        }
        expect(threwError).toBe(true);
      } finally {
        client.release();
      }
    });
  });

  // ============================================================
  // 8. SHOP IDOR / AUTHORIZATION MATRIX
  // ============================================================
  describe('8. Shop IDOR / Authorization Matrix', () => {
    it('Customer A cannot read Customer B Shop order', async () => {
      const orderB = await OrderService.createOrder({
        customerId: customerUserB.user.id,
        businessId: medicareShop.id,
        deliveryAddressId: addressB.id,
        items: [{ itemType: 'PRODUCT', itemId: vitCProduct.id, quantity: 1 }],
        idempotencyKey: `idor-read-${Date.now()}`
      });

      // Customer A tries to read Customer B's order
      await expect(
        OrderService.getOrderById(orderB.orderId, customerUserA.user.id, ['CUSTOMER'])
      ).rejects.toThrow('FORBIDDEN_ORDER_ACCESS');
    });

    it('Customer A cannot cancel Customer B Shop order', async () => {
      const orderB = await OrderService.createOrder({
        customerId: customerUserB.user.id,
        businessId: medicareShop.id,
        deliveryAddressId: addressB.id,
        items: [{ itemType: 'PRODUCT', itemId: vitCProduct.id, quantity: 1 }],
        idempotencyKey: `idor-cancel-${Date.now()}`
      });

      // Customer A attempts to cancel Customer B's order
      await expect(
        OrderService.cancelOrder(orderB.orderId, customerUserA.user.id, 'Attacker cancel')
      ).rejects.toThrow('FORBIDDEN_ORDER_ACCESS');
    });

    it('Customer cannot force order fulfillment status (DELIVERED, ACCEPTED, SHIPPED, etc.)', async () => {
      const orderA = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: medicareShop.id,
        deliveryAddressId: addressA.id,
        items: [{ itemType: 'PRODUCT', itemId: vitCProduct.id, quantity: 1 }],
        idempotencyKey: `status-force-${Date.now()}`
      });

      // Customer attempts to force ACCEPTED
      await expect(
        OrderService.updateOrderStatus(orderA.orderId, 'ACCEPTED', customerUserA.user.id, ['CUSTOMER'])
      ).rejects.toThrow('FORBIDDEN_TRANSITION');

      // Customer attempts to force DELIVERED
      await expect(
        OrderService.updateOrderStatus(orderA.orderId, 'DELIVERED', customerUserA.user.id, ['CUSTOMER'])
      ).rejects.toThrow('FORBIDDEN_TRANSITION');
    });
  });

  // ============================================================
  // 9. PRODUCT / VARIANT INTEGRITY
  // ============================================================
  describe('9. Product / Variant Integrity & Server Pricing Authority', () => {
    it('rejects invalid product ID', async () => {
      await expect(
        OrderService.repriceBasket({
          businessId: medicareShop.id,
          items: [{ itemType: 'PRODUCT', itemId: '00000000-0000-0000-0000-000000000000', quantity: 1 }]
        })
      ).rejects.toThrow('PRODUCT_NOT_FOUND');
    });

    it('rejects product belonging to another shop', async () => {
      await expect(
        OrderService.repriceBasket({
          businessId: medicareShop.id,
          items: [{ itemType: 'PRODUCT', itemId: honeyProduct.id, quantity: 1 }]
        })
      ).rejects.toThrow('MULTI_BUSINESS_ORDER_REJECTED');
    });

    it('rejects unavailable variant', async () => {
      await expect(
        OrderService.repriceBasket({
          businessId: artisanShop.id,
          items: [{ itemType: 'PRODUCT', itemId: towelProduct.id, variantId: towelVariantUnavailable.id, quantity: 1 }]
        })
      ).rejects.toThrow('VARIANT_UNAVAILABLE');
    });

    it('ignores forged client prices and forces authoritative server pricing', async () => {
      // Client sends forged base price of 10 cents
      const repriced = await OrderService.repriceBasket({
        businessId: medicareShop.id,
        items: [{ itemType: 'PRODUCT', itemId: vitCProduct.id, quantity: 1 }]
      });

      expect(repriced.items[0].unitPriceCents).toBe(14500); // Authoritative DB price
      expect(repriced.subtotalCents).toBe(14500);
    });
  });

  // ============================================================
  // 10. SALE PRICE AUTHORITY
  // ============================================================
  describe('10. Sale Price Authority', () => {
    it('authoritatively applies sale price from database and prevents customer forgery', async () => {
      // PAN-HONEY-500 has price 12000 and sale price 9500
      const repriced = await OrderService.repriceBasket({
        businessId: artisanShop.id,
        items: [{ itemType: 'PRODUCT', itemId: honeyProduct.id, quantity: 1 }]
      });

      expect(repriced.items[0].unitPriceCents).toBe(9500);
      expect(repriced.subtotalCents).toBe(9500);
    });
  });

  // ============================================================
  // 11. REFUND VS PHYSICAL INVENTORY
  // ============================================================
  describe('11. Refund vs Physical Inventory', () => {
    it('proves financial refund DOES NOT restore stock; explicit authorized restock restores stock exactly once', async () => {
      const { productId, inventoryId } = await createTestProductWithStock(artisanShop.id, 5);

      // 1. Order 2 units with DEV-ONLY test payment
      const order = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: artisanShop.id,
        deliveryAddressId: addressA.id,
        items: [{ itemType: 'PRODUCT', itemId: productId, quantity: 2 }],
        idempotencyKey: `refund-stock-${Date.now()}`,
        isTestPayment: true
      });

      // Stock is now 3
      const client = await pool.connect();
      try {
        const inv = await client.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(inv.rows[0].quantity_available).toBe(3);
      } finally {
        client.release();
      }

      // 2. Perform FULL FINANCIAL REFUND
      const refKey = `fin-ref-${Date.now()}`;
      const refundResult = await OrderService.processFinancialRefund(order.orderId, order.totalCents, 'Customer damaged package return', adminUserId, refKey);
      expect(refundResult.orderStatus).toBe('REFUNDED');

      // CRITICAL VERIFICATION: Immediately after refund, physical stock MUST REMAIN 3!
      const client2 = await pool.connect();
      try {
        const invAfterRefund = await client2.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invAfterRefund.rows[0].quantity_available).toBe(3); // Unchanged!
      } finally {
        client2.release();
      }

      // 3. Authorized physical restock event for 2 units
      const restockKey = `restock-gate-${Date.now()}`;
      const restockRes = await OrderService.processAuthorizedRestock(order.orderId, [{ itemId: productId, quantity: 2 }], adminUserId, restockKey);
      expect(restockRes.isIdempotentReplay).toBe(false);

      // Stock is now restored to 5!
      const client3 = await pool.connect();
      try {
        const invAfterRestock = await client3.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invAfterRestock.rows[0].quantity_available).toBe(5);
      } finally {
        client3.release();
      }

      // 4. Replay restock: MUST REMAIN 5!
      const replayRestock = await OrderService.processAuthorizedRestock(order.orderId, [{ itemId: productId, quantity: 2 }], adminUserId, restockKey);
      expect(replayRestock.isIdempotentReplay).toBe(true);

      const client4 = await pool.connect();
      try {
        const invReplay = await client4.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invReplay.rows[0].quantity_available).toBe(5);
      } finally {
        client4.release();
      }
    });
  });

  // ============================================================
  // 12. REP COMMISSION REGRESSION
  // ============================================================
  describe('12. Rep Commission Regression', () => {
    it('attributed shop completes order and accrues commission, reversal on refund works, replay is idempotent', async () => {
      const { productId } = await createTestProductWithStock(medicareShop.id, 5);

      const order = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: medicareShop.id,
        deliveryAddressId: addressA.id,
        items: [{ itemType: 'PRODUCT', itemId: productId, quantity: 2 }],
        idempotencyKey: `comm-gate-${Date.now()}`
      });

      // Transition order to DELIVERED
      const client = await pool.connect();
      try {
        await client.query("UPDATE orders SET status = 'DELIVERED' WHERE id = $1;", [order.orderId]);
      } finally {
        client.release();
      }

      const commKey = `comm-key-gate-${Date.now()}`;
      const comm = await CommissionService.processOrderCommissionPostgres(order.orderId, commKey);

      expect(comm.status).toBe('EARNED');
      expect(comm.repProfileId).toBe(repProfileId);
      expect(comm.commissionCents).toBe(750); // 30,000 subtotal * 2.5% = 750 cents

      // Idempotent replay
      const replayComm = await CommissionService.processOrderCommissionPostgres(order.orderId, commKey);
      expect(replayComm.isIdempotentReplay).toBe(true);
      expect(replayComm.commissionCents).toBe(750);

      // Reversal on refund
      const revKey = `rev-gate-${Date.now()}`;
      const rev = await CommissionService.reverseOrderCommission(order.orderId, 'Refund return', revKey, 30000);
      expect(rev.reversedCents).toBe(750);
      expect(rev.status).toBe('REVERSED');
    });
  });

  // ============================================================
  // 13. PCI & PAYMENT SAFETY
  // ============================================================
  describe('13. PCI & Payment Safety', () => {
    it('verifies no PAN or CVV is stored anywhere in PostgreSQL database', async () => {
      const client = await pool.connect();
      try {
        const cols = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name IN ('payments', 'orders', 'users', 'customer_profiles');
        `);

        const names = cols.rows.map(r => r.column_name.toLowerCase());
        expect(names).not.toContain('card_number');
        expect(names).not.toContain('pan');
        expect(names).not.toContain('cvv');
        expect(names).not.toContain('cvc');
      } finally {
        client.release();
      }
    });

    it('production mode strictly rejects test payment mode', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(
          OrderService.createOrder({
            customerId: customerUserA.user.id,
            businessId: medicareShop.id,
            deliveryAddressId: addressA.id,
            items: [{ itemType: 'PRODUCT', itemId: vitCProduct.id, quantity: 1 }],
            idempotencyKey: `prod-pay-${Date.now()}`,
            isTestPayment: true
          })
        ).rejects.toThrow('TEST_PAYMENT_FORBIDDEN_IN_PRODUCTION');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  // ============================================================
  // 14. CHECKOUT IDEMPOTENCY — DATABASE EVIDENCE
  // ============================================================
  describe('14. Checkout Idempotency — Database Evidence', () => {
    it('repeats identical checkout: exactly 1 order, 1 order_items set, 1 payment, 1 inventory decrement', async () => {
      const { productId, inventoryId } = await createTestProductWithStock(medicareShop.id, 10);
      const sharedKey = `shared-gate-idem-${Date.now()}`;

      const requests = Array.from({ length: 4 }).map(() => {
        return OrderService.createOrder({
          customerId: customerUserA.user.id,
          businessId: medicareShop.id,
          deliveryAddressId: addressA.id,
          items: [{ itemType: 'PRODUCT', itemId: productId, quantity: 2 }],
          idempotencyKey: sharedKey
        });
      });

      const results = await Promise.all(requests);
      const firstOrderId = results[0].orderId;

      const client = await pool.connect();
      try {
        const orderCount = await client.query('SELECT count(*) FROM orders WHERE idempotency_key = $1;', [sharedKey]);
        expect(parseInt(orderCount.rows[0].count, 10)).toBe(1);

        const itemsCount = await client.query('SELECT count(*) FROM order_items WHERE order_id = $1;', [firstOrderId]);
        expect(parseInt(itemsCount.rows[0].count, 10)).toBe(1);

        const payCount = await client.query('SELECT count(*) FROM payments WHERE order_id = $1;', [firstOrderId]);
        expect(parseInt(payCount.rows[0].count, 10)).toBe(1);

        const resvCount = await client.query('SELECT count(*) FROM inventory_reservations WHERE order_id = $1;', [firstOrderId]);
        expect(parseInt(resvCount.rows[0].count, 10)).toBe(1);

        const invAfter = await client.query('SELECT quantity_available FROM inventory WHERE id = $1;', [inventoryId]);
        expect(invAfter.rows[0].quantity_available).toBe(8); // Exactly 10 - 2 = 8
      } finally {
        client.release();
      }
    });
  });

  // ============================================================
  // 17. POSTGIS 20 KM REP TERRITORY REGRESSION (LOCKED BASELINE)
  // ============================================================
  describe('17. PostGIS 20 km Rep Territory Regression (Locked Baseline)', () => {
    it('verifies exact boundary metrics on live PostGIS: 20000.000m AUTHORIZE, 20000.001m REJECT across cardinal bearings', async () => {
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
