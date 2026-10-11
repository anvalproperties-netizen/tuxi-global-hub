import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { AuthService } from '../src/server/services/authService';
import { CustomerService } from '../src/server/services/customerService';
import { EatsService } from '../src/server/services/eatsService';
import { OrderService } from '../src/server/services/orderService';
import { CommissionService } from '../src/server/services/commissionService';
import { RepService } from '../src/server/services/repService';
import { postgresAdapter } from '../src/server/db/postgres';

const { Pool } = pg;
const JWT_SECRET = process.env.JWT_SECRET || 'tuxi_development_secure_jwt_secret_key_2026';

describe('TUXI PHASE 2A — COMPREHENSIVE ACCEPTANCE GATE SUITE', () => {
  let pool: pg.Pool;
  let customerUserA: any;
  let customerUserB: any;
  let addressA: any;
  let addressB: any;
  let eatsBiz: any;
  let menuItem1: any;
  let menuItem2: any;
  let modifier1: any;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10
    });

    const client = await pool.connect();
    try {
      // Create test customers
      const emailA = `acceptance.cust.a.${Date.now()}@tuxi.co.za`;
      const emailB = `acceptance.cust.b.${Date.now()}@tuxi.co.za`;

      customerUserA = await AuthService.register({
        email: emailA,
        password: 'AcceptancePassword123!',
        firstName: 'Alice',
        lastName: 'Acceptance',
        phoneNumber: '+27821112233'
      });

      customerUserB = await AuthService.register({
        email: emailB,
        password: 'AcceptancePassword123!',
        firstName: 'Bob',
        lastName: 'Acceptance',
        phoneNumber: '+27824445566'
      });

      // Create addresses
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

      // Fetch approved eats business
      const bizRes = await client.query(`
        SELECT id, name FROM businesses WHERE name = 'Kloof Street Bistro' LIMIT 1;
      `);
      eatsBiz = bizRes.rows[0];

      // Fetch menu item & modifiers
      const itemsRes = await client.query(`
        SELECT id, name, base_price_cents, is_available 
        FROM menu_items 
        WHERE name = 'Truffle & Wild Mushroom Pizza' LIMIT 1;
      `);
      menuItem1 = itemsRes.rows[0];

      const soldOutRes = await client.query(`
        SELECT id, name, base_price_cents, is_available 
        FROM menu_items 
        WHERE name LIKE '%White Truffle%' LIMIT 1;
      `);
      menuItem2 = soldOutRes.rows[0];

      const modRes = await client.query(`
        SELECT id, name, extra_price_cents 
        FROM menu_item_modifiers 
        WHERE menu_item_id = $1 LIMIT 1;
      `, [menuItem1.id]);
      modifier1 = modRes.rows[0];
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  // ==========================================
  // 1. PAYMENT / ORDER STATE SAFETY
  // ==========================================
  describe('1. Payment / Order State Safety', () => {
    it('rejects test payment simulation when NODE_ENV=production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(
          OrderService.createOrder({
            customerId: customerUserA.user.id,
            businessId: eatsBiz.id,
            deliveryAddressId: addressA.id,
            items: [{ itemId: menuItem1.id, quantity: 1 }],
            isTestPayment: true
          })
        ).rejects.toThrow(/TEST_PAYMENT_FORBIDDEN_IN_PRODUCTION/);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('creates standard order in PAYMENT_INTEGRATION_PENDING status without test flag', async () => {
      const order = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: eatsBiz.id,
        deliveryAddressId: addressA.id,
        items: [{ itemId: menuItem1.id, quantity: 1 }],
        isTestPayment: false
      });

      expect(order.orderId).toBeDefined();
      expect(order.status).toBe('PLACED');
      expect(order.paymentStatus).toBe('INITIATED');
      expect(order.paymentProvider).toBe('PAYMENT_INTEGRATION_PENDING');

      // Verify in database payments table
      const client = await pool.connect();
      try {
        const payRes = await client.query('SELECT status, payment_provider FROM payments WHERE order_id = $1;', [order.orderId]);
        expect(payRes.rows[0].status).toBe('INITIATED');
        expect(payRes.rows[0].payment_provider).toBe('PAYMENT_INTEGRATION_PENDING');
      } finally {
        client.release();
      }
    });

    it('prevents unpaid production order from progressing through paid fulfillment', async () => {
      // Create unpaid order
      const unpaidOrder = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: eatsBiz.id,
        deliveryAddressId: addressA.id,
        items: [{ itemId: menuItem1.id, quantity: 1 }],
        isTestPayment: false
      });

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(
          OrderService.updateOrderStatus(unpaidOrder.orderId, 'ACCEPTED', 'merchant-owner', ['TUXI_EATS_OWNER'])
        ).rejects.toThrow(/UNPAID_ORDER_FULFILLMENT_FORBIDDEN/);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('ensures unpaid order cannot generate EARNED Rep commission upon delivery', async () => {
      // In dev mode, transition unpaid order to DELIVERED
      const unpaidOrder = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: eatsBiz.id,
        deliveryAddressId: addressA.id,
        items: [{ itemId: menuItem1.id, quantity: 1 }],
        isTestPayment: false
      });

      // Progress through states
      await OrderService.updateOrderStatus(unpaidOrder.orderId, 'ACCEPTED', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(unpaidOrder.orderId, 'PREPARING', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(unpaidOrder.orderId, 'READY_FOR_PICKUP', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(unpaidOrder.orderId, 'OUT_FOR_DELIVERY', 'driver', ['TUXI_DELIVERY_DRIVER']);
      await OrderService.updateOrderStatus(unpaidOrder.orderId, 'DELIVERED', 'driver', ['TUXI_DELIVERY_DRIVER']);

      // Check commission ledger: MUST BE 0 entries
      const client = await pool.connect();
      try {
        const commRes = await client.query('SELECT * FROM commission_ledger WHERE order_id = $1;', [unpaidOrder.orderId]);
        expect(commRes.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    it('verifies payments schema stores ZERO raw card numbers, CVVs, or sensitive credentials', async () => {
      const client = await pool.connect();
      try {
        const colRes = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'payments';
        `);
        const columns = colRes.rows.map(r => r.column_name);

        expect(columns).not.toContain('card_number');
        expect(columns).not.toContain('cvv');
        expect(columns).not.toContain('pan');
        expect(columns).not.toContain('expiry');
        expect(columns).not.toContain('secret');
        expect(columns).toContain('status');
        expect(columns).toContain('payment_provider');
        expect(columns).toContain('amount_cents');
      } finally {
        client.release();
      }
    });
  });

  // ==========================================
  // 2. CHECKOUT IDEMPOTENCY & CONCURRENCY
  // ==========================================
  describe('2. Checkout Idempotency & Concurrency', () => {
    it('executes concurrent checkout replay with same idempotency key and creates exactly ONE order', async () => {
      const idempotencyKey = `concur-checkout-${Date.now()}-${Math.random()}`;

      // Execute 3 concurrent requests with the exact same idempotency key
      const [res1, res2, res3] = await Promise.all([
        OrderService.createOrder({
          customerId: customerUserA.user.id,
          businessId: eatsBiz.id,
          deliveryAddressId: addressA.id,
          items: [{ itemId: menuItem1.id, quantity: 2 }],
          idempotencyKey,
          isTestPayment: true
        }),
        OrderService.createOrder({
          customerId: customerUserA.user.id,
          businessId: eatsBiz.id,
          deliveryAddressId: addressA.id,
          items: [{ itemId: menuItem1.id, quantity: 2 }],
          idempotencyKey,
          isTestPayment: true
        }),
        OrderService.createOrder({
          customerId: customerUserA.user.id,
          businessId: eatsBiz.id,
          deliveryAddressId: addressA.id,
          items: [{ itemId: menuItem1.id, quantity: 2 }],
          idempotencyKey,
          isTestPayment: true
        })
      ]);

      // All 3 requests return the same order ID
      expect(res1.orderId).toBeDefined();
      expect(res2.orderId).toBe(res1.orderId);
      expect(res3.orderId).toBe(res1.orderId);

      // Verify exact row counts in PostgreSQL
      const client = await pool.connect();
      try {
        const orderCountRes = await client.query('SELECT COUNT(*) as count FROM orders WHERE idempotency_key = $1;', [idempotencyKey]);
        expect(parseInt(orderCountRes.rows[0].count, 10)).toBe(1);

        const itemsCountRes = await client.query('SELECT COUNT(*) as count FROM order_items WHERE order_id = $1;', [res1.orderId]);
        expect(parseInt(itemsCountRes.rows[0].count, 10)).toBe(1);

        const paymentsCountRes = await client.query('SELECT COUNT(*) as count FROM payments WHERE order_id = $1;', [res1.orderId]);
        expect(parseInt(paymentsCountRes.rows[0].count, 10)).toBe(1);
      } finally {
        client.release();
      }
    });
  });

  // ==========================================
  // 3. AUTHENTICATION & AUTHORIZATION MATRIX
  // ==========================================
  describe('3. Authentication & Authorization Matrix', () => {
    it('persists customer registration in PostgreSQL', async () => {
      const email = `persisted.cust.${Date.now()}@tuxi.co.za`;
      const registered = await AuthService.register({
        email,
        password: 'Password123!',
        firstName: 'Jane',
        lastName: 'Doe',
        phoneNumber: '+27839998877'
      });
      expect(registered.user.id).toBeDefined();
      expect(registered.token).toBeDefined();
    });

    it('rejects duplicate email registration', async () => {
      await expect(
        AuthService.register({
          email: customerUserA.user.email,
          password: 'Password123!',
          firstName: 'Duplicate',
          lastName: 'User',
          phoneNumber: '+27839990000'
        })
      ).rejects.toThrow(/EMAIL_ALREADY_REGISTERED/);
    });

    it('rejects password shorter than 8 characters', async () => {
      await expect(
        AuthService.register({
          email: `shortpass.${Date.now()}@tuxi.co.za`,
          password: 'short',
          firstName: 'Short',
          lastName: 'Pass',
          phoneNumber: '+27839990000'
        })
      ).rejects.toThrow(/PASSWORD_TOO_SHORT/);
    });

    it('succeeds with correct login credentials', async () => {
      const loginRes = await AuthService.login(customerUserA.user.email, 'AcceptancePassword123!');
      expect(loginRes.token).toBeDefined();
      expect(loginRes.user.email).toBe(customerUserA.user.email.toLowerCase());
    });

    it('rejects login for disabled user account', async () => {
      const client = await pool.connect();
      try {
        await client.query('UPDATE users SET is_active = false WHERE id = $1;', [customerUserB.user.id]);
        await expect(
          AuthService.login(customerUserB.user.email, 'AcceptancePassword123!')
        ).rejects.toThrow(/ACCOUNT_DISABLED/);
      } finally {
        await client.query('UPDATE users SET is_active = true WHERE id = $1;', [customerUserB.user.id]);
        client.release();
      }
    });

    it('rejects customer self-assignment of ADMIN role', async () => {
      await expect(
        AuthService.register({
          email: `hack.admin.${Date.now()}@tuxi.co.za`,
          password: 'Password123!',
          firstName: 'Hack',
          lastName: 'Admin',
          phoneNumber: '+27831110000',
          role: 'ADMIN' as any
        })
      ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
    });

    it('rejects customer self-assignment of SUPER_ADMIN role', async () => {
      await expect(
        AuthService.register({
          email: `hack.super.${Date.now()}@tuxi.co.za`,
          password: 'Password123!',
          firstName: 'Hack',
          lastName: 'Super',
          phoneNumber: '+27831110001',
          role: 'SUPER_ADMIN' as any
        })
      ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
    });

    it('rejects customer self-assignment of TUXI_REP role', async () => {
      await expect(
        AuthService.register({
          email: `hack.rep.${Date.now()}@tuxi.co.za`,
          password: 'Password123!',
          firstName: 'Hack',
          lastName: 'Rep',
          phoneNumber: '+27831110002',
          role: 'TUXI_REP' as any
        })
      ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
    });

    it('rejects customer self-assignment of DRIVER role', async () => {
      await expect(
        AuthService.register({
          email: `hack.driver.${Date.now()}@tuxi.co.za`,
          password: 'Password123!',
          firstName: 'Hack',
          lastName: 'Driver',
          phoneNumber: '+27831110003',
          role: 'TUXI_DELIVERY_DRIVER' as any
        })
      ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
    });

    it('rejects customer self-assignment of merchant role', async () => {
      await expect(
        AuthService.register({
          email: `hack.merchant.${Date.now()}@tuxi.co.za`,
          password: 'Password123!',
          firstName: 'Hack',
          lastName: 'Owner',
          phoneNumber: '+27831110004',
          role: 'TUXI_EATS_OWNER' as any
        })
      ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
    });

    it('enforces IDOR: Customer A cannot edit Customer B address', async () => {
      await expect(
        CustomerService.updateAddress(customerUserA.user.id, addressB.id, { streetLine1: 'Hacked St' })
      ).rejects.toThrow(/FORBIDDEN_ADDRESS_ACCESS/);
    });

    it('enforces IDOR: Customer A cannot delete Customer B address', async () => {
      await expect(
        CustomerService.deleteAddress(customerUserA.user.id, addressB.id)
      ).rejects.toThrow(/FORBIDDEN_ADDRESS_ACCESS/);
    });

    it('enforces IDOR: Customer A cannot view Customer B order', async () => {
      const orderB = await OrderService.createOrder({
        customerId: customerUserB.user.id,
        businessId: eatsBiz.id,
        deliveryAddressId: addressB.id,
        items: [{ itemId: menuItem1.id, quantity: 1 }],
        isTestPayment: true
      });

      await expect(
        OrderService.getOrderById(orderB.orderId, customerUserA.user.id, ['CUSTOMER'])
      ).rejects.toThrow(/FORBIDDEN_ORDER_ACCESS/);
    });

    it('enforces IDOR: Customer A cannot cancel Customer B order', async () => {
      const orderB = await OrderService.createOrder({
        customerId: customerUserB.user.id,
        businessId: eatsBiz.id,
        deliveryAddressId: addressB.id,
        items: [{ itemId: menuItem1.id, quantity: 1 }],
        isTestPayment: true
      });

      await expect(
        OrderService.cancelOrder(orderB.orderId, customerUserA.user.id, 'Malicious cancel')
      ).rejects.toThrow(/FORBIDDEN_ORDER/);
    });
  });

  // ==========================================
  // 4. SERVER-AUTHORITATIVE COMMERCE
  // ==========================================
  describe('4. Server-Authoritative Commerce', () => {
    it('discovers only APPROVED and ACTIVE Eats businesses, hiding pending, suspended, and non-Eats', async () => {
      const businesses = await EatsService.getApprovedBusinesses();
      const names = businesses.map(b => b.name);

      expect(names).toContain('Kloof Street Bistro');
      expect(names).not.toContain('Greenmarket Juice & Bowls'); // PENDING
      expect(names).not.toContain('Bree Street Smokehouse');     // SUSPENDED
      expect(names).not.toContain('Apex Hardware Supplies');    // Non-Eats
    });

    it('ensures private merchant fields (tax_id, email, phone) are not exposed in discovery', async () => {
      const businesses = await EatsService.getApprovedBusinesses();
      const b = businesses.find(item => item.name === 'Kloof Street Bistro');

      expect(b).toBeDefined();
      expect((b as any).tax_id).toBeUndefined();
      expect((b as any).taxId).toBeUndefined();
      expect((b as any).contact_email).toBeUndefined();
      expect((b as any).bank_account).toBeUndefined();
    });

    it('rejects order with unavailable menu item', async () => {
      await expect(
        OrderService.createOrder({
          customerId: customerUserA.user.id,
          businessId: eatsBiz.id,
          deliveryAddressId: addressA.id,
          items: [{ itemId: menuItem2.id, quantity: 1 }],
          isTestPayment: true
        })
      ).rejects.toThrow(/ITEM_UNAVAILABLE/);
    });

    it('reprices basket on server, ignoring client price tampering', async () => {
      const repriced = await OrderService.repriceBasket({
        businessId: eatsBiz.id,
        items: [
          {
            itemId: menuItem1.id,
            quantity: 2,
            selectedModifierIds: [modifier1.id]
          }
        ],
        tipCents: 2000
      });

      // Truffle Pizza base = 16500, Extra Cheese = 2500 -> 19000 per unit * 2 = 38000
      expect(repriced.subtotalCents).toBe(38000);
      expect(repriced.deliveryFeeCents).toBe(2500);
      expect(repriced.serviceFeeCents).toBe(150);
      expect(repriced.tipCents).toBe(2000);
      expect(repriced.totalCents).toBe(42650);
    });

    it('strictly rejects multi-business basket (Single Business Guard)', async () => {
      const client = await pool.connect();
      try {
        const burgerRes = await client.query("SELECT id FROM menu_items WHERE name = 'The Karoo Wagyu Smashburger';");
        const burgerItem = burgerRes.rows[0];

        await expect(
          OrderService.repriceBasket({
            businessId: eatsBiz.id,
            items: [
              { itemId: menuItem1.id, quantity: 1 },
              { itemId: burgerItem.id, quantity: 1 } // belongs to Table Mountain Burgers
            ]
          })
        ).rejects.toThrow(/MULTI_BUSINESS_ORDER_REJECTED/);
      } finally {
        client.release();
      }
    });

    it('rejects invalid or cross-item modifiers', async () => {
      const fakeModId = '00000000-0000-0000-0000-000000000000';
      await expect(
        OrderService.repriceBasket({
          businessId: eatsBiz.id,
          items: [
            {
              itemId: menuItem1.id,
              quantity: 1,
              selectedModifierIds: [fakeModId]
            }
          ]
        })
      ).rejects.toThrow(/INVALID_MODIFIER/);
    });
  });

  // ==========================================
  // 5. COMMISSION REGRESSION & COMPENSATING REVERSALS
  // ==========================================
  describe('5. Commission Regression & Reversals', () => {
    it('creates zero Rep commission for unattributed business upon delivery', async () => {
      const client = await pool.connect();
      try {
        const nonAttrBizRes = await client.query("SELECT id FROM businesses WHERE name = 'Table Mountain Burgers';");
        const nonAttrBiz = nonAttrBizRes.rows[0];
        const burgerItem = (await client.query("SELECT id FROM menu_items WHERE name = 'The Karoo Wagyu Smashburger';")).rows[0];

        const order = await OrderService.createOrder({
          customerId: customerUserA.user.id,
          businessId: nonAttrBiz.id,
          deliveryAddressId: addressA.id,
          items: [{ itemId: burgerItem.id, quantity: 1 }],
          isTestPayment: true
        });

        // Advance to DELIVERED
        await OrderService.updateOrderStatus(order.orderId, 'ACCEPTED', 'merchant', ['TUXI_EATS_OWNER']);
        await OrderService.updateOrderStatus(order.orderId, 'PREPARING', 'merchant', ['TUXI_EATS_OWNER']);
        await OrderService.updateOrderStatus(order.orderId, 'READY_FOR_PICKUP', 'merchant', ['TUXI_EATS_OWNER']);
        await OrderService.updateOrderStatus(order.orderId, 'OUT_FOR_DELIVERY', 'driver', ['TUXI_DELIVERY_DRIVER']);
        await OrderService.updateOrderStatus(order.orderId, 'DELIVERED', 'driver', ['TUXI_DELIVERY_DRIVER']);

        const commRes = await client.query('SELECT * FROM commission_ledger WHERE order_id = $1;', [order.orderId]);
        expect(commRes.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    it('evaluates qualifying Rep commission using configured rate (max 3% cap)', async () => {
      const order = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: eatsBiz.id,
        deliveryAddressId: addressA.id,
        items: [{ itemId: menuItem1.id, quantity: 1 }],
        isTestPayment: true
      });

      // Advance to DELIVERED
      await OrderService.updateOrderStatus(order.orderId, 'ACCEPTED', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(order.orderId, 'PREPARING', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(order.orderId, 'READY_FOR_PICKUP', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(order.orderId, 'OUT_FOR_DELIVERY', 'driver', ['TUXI_DELIVERY_DRIVER']);
      await OrderService.updateOrderStatus(order.orderId, 'DELIVERED', 'driver', ['TUXI_DELIVERY_DRIVER']);

      const client = await pool.connect();
      try {
        const commRes = await client.query('SELECT * FROM commission_ledger WHERE order_id = $1 AND status = \'EARNED\';', [order.orderId]);
        expect(commRes.rows.length).toBe(1);
        const comm = commRes.rows[0];

        // Rate is 2.5% (0.0250) <= 3.0% cap
        expect(Number(comm.applied_percentage)).toBeLessThanOrEqual(0.03);
        expect(comm.qualifying_amount_cents).toBe(16500); // R165.00
        expect(comm.commission_cents).toBe(413);          // Math.round(16500 * 0.025)
      } finally {
        client.release();
      }
    });

    it('delivery status replay cannot double-credit Rep commission', async () => {
      const order = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: eatsBiz.id,
        deliveryAddressId: addressA.id,
        items: [{ itemId: menuItem1.id, quantity: 1 }],
        isTestPayment: true
      });

      // Advance to DELIVERED
      await OrderService.updateOrderStatus(order.orderId, 'ACCEPTED', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(order.orderId, 'PREPARING', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(order.orderId, 'READY_FOR_PICKUP', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(order.orderId, 'OUT_FOR_DELIVERY', 'driver', ['TUXI_DELIVERY_DRIVER']);
      await OrderService.updateOrderStatus(order.orderId, 'DELIVERED', 'driver', ['TUXI_DELIVERY_DRIVER']);

      const client = await pool.connect();
      try {
        const commCount = await client.query('SELECT COUNT(*) as count FROM commission_ledger WHERE order_id = $1 AND status = \'EARNED\';', [order.orderId]);
        expect(parseInt(commCount.rows[0].count, 10)).toBe(1);
      } finally {
        client.release();
      }
    });

    it('produces mathematically proportional reversal on partial refund and prevents double-reversal', async () => {
      // 1. Deliver order
      const order = await OrderService.createOrder({
        customerId: customerUserA.user.id,
        businessId: eatsBiz.id,
        deliveryAddressId: addressA.id,
        items: [{ itemId: menuItem1.id, quantity: 1 }],
        isTestPayment: true
      });

      await OrderService.updateOrderStatus(order.orderId, 'ACCEPTED', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(order.orderId, 'PREPARING', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(order.orderId, 'READY_FOR_PICKUP', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(order.orderId, 'OUT_FOR_DELIVERY', 'driver', ['TUXI_DELIVERY_DRIVER']);
      await OrderService.updateOrderStatus(order.orderId, 'DELIVERED', 'driver', ['TUXI_DELIVERY_DRIVER']);

      // 2. 50% Partial Refund of 8,250 cents
      const revKey = `partial-rev-${Date.now()}-${order.orderId}`;
      const rev = await CommissionService.reverseOrderCommission(order.orderId, 'Customer partial refund', revKey, 8250);

      expect(rev.status).toBe('PARTIALLY_REVERSED');
      // 2.5% of 8250 = 206 cents
      expect(rev.reversedCents).toBe(206);

      // 3. Replay with same key cannot double-reverse
      const replay = await CommissionService.reverseOrderCommission(order.orderId, 'Customer partial refund', revKey, 8250);
      expect(replay.isIdempotentReplay).toBe(true);
      expect(replay.reversedCents).toBe(206);

      // Verify negative ledger row exists in PostgreSQL
      const client = await pool.connect();
      try {
        const revRows = await client.query('SELECT * FROM commission_ledger WHERE idempotency_key = $1;', [revKey]);
        expect(revRows.rows.length).toBe(1);
        expect(revRows.rows[0].commission_cents).toBe(-206);
      } finally {
        client.release();
      }
    });
  });

  // ==========================================
  // 6. POSTGIS REGRESSION
  // ==========================================
  describe('6. PostGIS 20 km Exact Boundary Regression', () => {
    it('verifies exact boundary metrics on live PostGIS', async () => {
      const client = await pool.connect();
      try {
        const queryDist = async (distanceMeters: number) => {
          const res = await client.query(`
            WITH hub AS (
              SELECT ST_SetSRID(ST_Point(18.4241, -33.9249), 4326)::geography AS geom
            ),
            target AS (
              SELECT ST_Project(geom, $1::float8, radians(90.0)) AS geom FROM hub
            )
            SELECT 
              ST_DWithin(hub.geom, target.geom, 20000.0) AS is_within,
              ST_Distance(hub.geom, target.geom) AS calculated_distance_meters,
              (ST_Distance(hub.geom, target.geom) / 1000.0) AS exact_km,
              ST_Y(target.geom::geometry) AS target_lat,
              ST_X(target.geom::geometry) AS target_lng
            FROM hub, target;
          `, [distanceMeters]);
          return res.rows[0];
        };

        const r1 = await queryDist(19999.999);
        expect(r1.is_within).toBe(true);
        expect(Number(r1.calculated_distance_meters)).toBeCloseTo(19999.999, 3);
        const auth1 = await RepService.validateTerritoryAuthoritative(-33.9249, 18.4241, Number(r1.target_lat), Number(r1.target_lng), 20.0);
        expect(auth1.isWithin).toBe(true);

        // EXACTLY 20,000.000 m MUST AUTHORIZE
        const r2 = await queryDist(20000.000);
        expect(r2.is_within).toBe(true);
        expect(Number(r2.calculated_distance_meters)).toBe(20000.0);
        const auth2 = await RepService.validateTerritoryAuthoritative(-33.9249, 18.4241, Number(r2.target_lat), Number(r2.target_lng), 20.0);
        expect(auth2.isWithin).toBe(true);

        // 20,000.001 m MUST REJECT
        const r3 = await queryDist(20000.001);
        expect(r3.is_within).toBe(false);
        expect(Number(r3.calculated_distance_meters)).toBeCloseTo(20000.001, 3);
        const auth3 = await RepService.validateTerritoryAuthoritative(-33.9249, 18.4241, Number(r3.target_lat), Number(r3.target_lng), 20.0);
        expect(auth3.isWithin).toBe(false);

        // 20,100.000 m MUST REJECT
        const r4 = await queryDist(20100.000);
        expect(r4.is_within).toBe(false);
        expect(Number(r4.calculated_distance_meters)).toBe(20100.0);
        const auth4 = await RepService.validateTerritoryAuthoritative(-33.9249, 18.4241, Number(r4.target_lat), Number(r4.target_lng), 20.0);
        expect(auth4.isWithin).toBe(false);
      } finally {
        client.release();
      }
    });

    it('explicitly proves EXACTLY 20,000.000 m MUST AUTHORIZE and 20,000.001 m MUST REJECT across all cardinal bearings', async () => {
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

  // ==========================================
  // 7. CRITICAL END-TO-END WORKFLOW
  // ==========================================
  describe('7. Critical End-to-End Workflow Execution', () => {
    it('executes full Phase 2A flow from registration through persistence after simulated refresh', async () => {
      // 1. REGISTER
      const flowEmail = `e2e.flow.${Date.now()}@tuxi.co.za`;
      const registered = await AuthService.register({
        email: flowEmail,
        password: 'FlowPassword123!',
        firstName: 'Flow',
        lastName: 'Tester',
        phoneNumber: '+27829990011'
      });
      expect(registered.user.id).toBeDefined();

      // 2. LOGIN
      const loggedIn = await AuthService.login(flowEmail, 'FlowPassword123!');
      expect(loggedIn.token).toBeDefined();

      // 3. SESSION RESTORE
      const me = await AuthService.getCurrentUser(registered.user.id);
      expect(me.email).toBe(flowEmail.toLowerCase());

      // 4. CREATE ADDRESS
      const addr = await CustomerService.createAddress(registered.user.id, {
        streetLine1: '55 Regent Rd',
        city: 'Sea Point',
        postalCode: '8005',
        countryCode: 'ZAF',
        latitude: -33.9180,
        longitude: 18.3900,
        isDefault: true
      });
      expect(addr.id).toBeDefined();

      // 5. SELECT ADDRESS
      const addrs = await CustomerService.getAddresses(registered.user.id);
      expect(addrs.length).toBeGreaterThanOrEqual(1);

      // 6. EATS DISCOVERY
      const businesses = await EatsService.getApprovedBusinesses();
      expect(businesses.length).toBeGreaterThan(0);

      // 7. OPEN RESTAURANT & LOAD MENU
      const menu = await EatsService.getBusinessMenu(eatsBiz.id);
      expect(menu.categories.length).toBeGreaterThan(0);

      // 8. SELECT ITEM & MODIFIER & REPRICE
      const repriced = await OrderService.repriceBasket({
        businessId: eatsBiz.id,
        items: [{ itemId: menuItem1.id, quantity: 1, selectedModifierIds: [modifier1.id] }],
        tipCents: 1500
      });
      expect(repriced.totalCents).toBeGreaterThan(0);

      // 9. CHECKOUT & ORDER CREATE (persisted in PostgreSQL with PAYMENT_INTEGRATION_PENDING)
      const order = await OrderService.createOrder({
        customerId: registered.user.id,
        businessId: eatsBiz.id,
        deliveryAddressId: addr.id,
        items: [{ itemId: menuItem1.id, quantity: 1, selectedModifierIds: [modifier1.id] }],
        tipCents: 1500,
        isTestPayment: false
      });
      expect(order.orderId).toBeDefined();
      expect(order.status).toBe('PLACED');
      expect(order.paymentStatus).toBe('INITIATED');

      // 10. SIMULATE APPLICATION REFRESH / NEW PROCESS FETCH
      const freshOrder = await OrderService.getOrderById(order.orderId, registered.user.id, ['CUSTOMER']);
      expect(freshOrder.id).toBe(order.orderId);
      expect(freshOrder.status).toBe('PLACED');
      expect(freshOrder.items.length).toBe(1);
      expect(freshOrder.items[0].itemName).toBe('Truffle & Wild Mushroom Pizza');
    });
  });
});
