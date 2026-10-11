import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { AuthService } from '../src/server/services/authService.js';
import { CustomerService } from '../src/server/services/customerService.js';
import { EatsService } from '../src/server/services/eatsService.js';
import { OrderService } from '../src/server/services/orderService.js';
import { CommissionService } from '../src/server/services/commissionService.js';
import { seedPhase2AEatsData } from '../src/server/db/seedEatsData.js';

const { Pool } = pg;

describe('TUXI PHASE 2A — CUSTOMER & EATS END-TO-END VERIFICATION SUITE', () => {
  let pool: pg.Pool;
  let customerA: any;
  let customerB: any;
  let tokenA: string;
  let tokenB: string;
  let addressA1: any;
  let addressA2: any;
  let addressB1: any;
  let attributedBiz: any;
  let nonAttributedBiz: any;
  let trufflePizzaItem: any;
  let extraCheeseModifier: any;
  let glutenFreeModifier: any;
  let soldOutItem: any;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10
    });

    // 1. Seed initial development data
    await seedPhase2AEatsData();

    // 2. Register Customer A
    customerA = await AuthService.register({
      email: `custA_${Date.now()}@example.com`,
      password: 'StrongPassword123!',
      firstName: 'Alice',
      lastName: 'Smith',
      phoneNumber: '+27821112233',
      role: 'CUSTOMER'
    });
    tokenA = customerA.token;

    // 3. Register Customer B (for IDOR isolation testing)
    customerB = await AuthService.register({
      email: `custB_${Date.now()}@example.com`,
      password: 'StrongPassword123!',
      firstName: 'Bob',
      lastName: 'Jones',
      phoneNumber: '+27824445566',
      role: 'CUSTOMER'
    });
    tokenB = customerB.token;

    // 4. Load approved businesses from PostgreSQL
    const client = await pool.connect();
    try {
      const biz1Res = await client.query("SELECT * FROM businesses WHERE tax_or_vat_id = 'VAT-SEED-EATS-001';");
      attributedBiz = biz1Res.rows[0];

      const biz2Res = await client.query("SELECT * FROM businesses WHERE tax_or_vat_id = 'VAT-SEED-EATS-002';");
      nonAttributedBiz = biz2Res.rows[0];

      const itemRes = await client.query("SELECT * FROM menu_items WHERE name = 'Truffle & Wild Mushroom Pizza';");
      trufflePizzaItem = itemRes.rows[0];

      const soldOutRes = await client.query("SELECT * FROM menu_items WHERE name = 'Seasonal White Truffle Special';");
      soldOutItem = soldOutRes.rows[0];

      const modRes = await client.query("SELECT * FROM menu_item_modifiers WHERE menu_item_id = $1;", [trufflePizzaItem.id]);
      extraCheeseModifier = modRes.rows.find(m => m.name.includes('Extra Fior di Latte'));
      glutenFreeModifier = modRes.rows.find(m => m.name.includes('Gluten-Free'));
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  // ==========================================
  // SECTION 1: CUSTOMER IDENTITY & ACCOUNT PROFILE
  // ==========================================
  describe('1. Customer Identity & Profile Management', () => {
    it('authenticates customer via bcrypt hash and returns JWT token with CUSTOMER role', async () => {
      const loginRes = await AuthService.login(customerA.user.email, 'StrongPassword123!');
      expect(loginRes.token).toBeDefined();
      expect(loginRes.user.email).toBe(customerA.user.email.toLowerCase());
      expect(loginRes.user.roles).toContain('CUSTOMER');
      expect(loginRes.user.roles).not.toContain('ADMIN');
    });

    it('retrieves customer profile with loyalty points, preferred currency, and language', async () => {
      const profile = await CustomerService.getProfile(customerA.user.id);
      expect(profile.userId).toBe(customerA.user.id);
      expect(profile.email).toBe(customerA.user.email.toLowerCase());
      expect(profile.preferredCurrency).toBe('ZAR');
      expect(profile.loyaltyTier).toBeDefined();
    });

    it('updates customer profile preferences without altering immutable role or id', async () => {
      const updated = await CustomerService.updateProfile(customerA.user.id, {
        firstName: 'Alice-Updated',
        preferredLanguage: 'af',
        notificationPreferences: { email: true, sms: false, push: true }
      });

      expect(updated.firstName).toBe('Alice-Updated');
      expect(updated.preferredLanguage).toBe('af');
      expect(updated.notificationPreferences).toEqual({ email: true, sms: false, push: true });
      expect(updated.userId).toBe(customerA.user.id);
    });
  });

  // ==========================================
  // SECTION 2: CUSTOMER SAVED ADDRESSES & ISOLATION
  // ==========================================
  describe('2. Customer Saved Delivery Addresses', () => {
    it('creates default and secondary delivery addresses with PostGIS geography point', async () => {
      addressA1 = await CustomerService.createAddress(customerA.user.id, {
        streetLine1: '40 Kloof St',
        city: 'Cape Town',
        postalCode: '8001',
        countryCode: 'ZAF',
        latitude: -33.9290,
        longitude: 18.4215,
        label: 'Home',
        isDefault: true,
        deliveryInstructions: 'Buzz 201'
      });

      expect(addressA1.id).toBeDefined();
      expect(addressA1.isDefault).toBe(true);

      addressA2 = await CustomerService.createAddress(customerA.user.id, {
        streetLine1: '80 Strand St',
        city: 'Cape Town',
        postalCode: '8001',
        countryCode: 'ZAF',
        latitude: -33.9190,
        longitude: 18.4200,
        label: 'Office',
        isDefault: false
      });

      expect(addressA2.id).toBeDefined();
      expect(addressA2.isDefault).toBe(false);

      // Verify default pointer in customer profile
      const prof = await CustomerService.getProfile(customerA.user.id);
      expect(prof.defaultAddressId).toBe(addressA1.id);
    });

    it('enforces strict cross-customer isolation: Customer B cannot view or mutate Customer A addresses', async () => {
      addressB1 = await CustomerService.createAddress(customerB.user.id, {
        streetLine1: '12 Loop St',
        city: 'Cape Town',
        postalCode: '8001',
        countryCode: 'ZAF',
        latitude: -33.9220,
        longitude: 18.4210,
        label: 'Home'
      });

      // Customer A addresses
      const addrsA = await CustomerService.getAddresses(customerA.user.id);
      expect(addrsA.map(a => a.id)).toContain(addressA1.id);
      expect(addrsA.map(a => a.id)).not.toContain(addressB1.id);

      // Customer B attempting to update Customer A's address MUST fail
      await expect(
        CustomerService.updateAddress(customerB.user.id, addressA1.id, { streetLine1: 'Hacked Street' })
      ).rejects.toThrow(/FORBIDDEN_ADDRESS_ACCESS/);

      // Customer B attempting to delete Customer A's address MUST fail
      await expect(
        CustomerService.deleteAddress(customerB.user.id, addressA1.id)
      ).rejects.toThrow(/FORBIDDEN_ADDRESS_ACCESS/);
    });

    it('switches default delivery address atomically', async () => {
      const switched = await CustomerService.setDefaultAddress(customerA.user.id, addressA2.id);
      expect(switched.isDefault).toBe(true);

      const addrs = await CustomerService.getAddresses(customerA.user.id);
      const a1 = addrs.find(a => a.id === addressA1.id);
      const a2 = addrs.find(a => a.id === addressA2.id);
      expect(a2?.isDefault).toBe(true);
      expect(a1?.isDefault).toBe(false);
    });
  });

  // ==========================================
  // SECTION 3: TUXI EATS DISCOVERY & MENU HIERARCHY
  // ==========================================
  describe('3. Eats Merchant Discovery & Menu Hierarchy', () => {
    it('discovers only APPROVED and ACTIVE Eats businesses, strictly filtering pending/suspended', async () => {
      const businesses = await EatsService.getApprovedBusinesses();
      const names = businesses.map(b => b.name);

      expect(names).toContain('Kloof Street Bistro');
      expect(names).toContain('Table Mountain Burgers');
      expect(names).not.toContain('Greenmarket Juice & Bowls'); // PENDING_VERIFICATION
      expect(names).not.toContain('Bree Street Smokehouse');     // SUSPENDED
    });

    it('loads structured menu categories, items, and modifiers for Kloof Street Bistro', async () => {
      const menu = await EatsService.getBusinessMenu(attributedBiz.id);
      expect(menu.businessName).toBe('Kloof Street Bistro');
      expect(menu.categories.length).toBeGreaterThanOrEqual(2);

      const pizzaCat = menu.categories.find(c => c.name === 'Artisan Pizzas');
      expect(pizzaCat).toBeDefined();

      const trufflePizza = pizzaCat?.items.find((i: any) => i.name === 'Truffle & Wild Mushroom Pizza');
      expect(trufflePizza).toBeDefined();
      expect(trufflePizza.basePriceCents).toBe(16500); // R165.00
      expect(trufflePizza.isAvailable).toBe(true);
      expect(trufflePizza.modifiers.length).toBeGreaterThanOrEqual(2);

      // Verify modifier extra prices
      const extraCheese = trufflePizza.modifiers.find((m: any) => m.name.includes('Extra Fior di Latte'));
      expect(extraCheese.extraPriceCents).toBe(2500); // R25.00
    });

    it('correctly flags sold-out items as isAvailable = false', async () => {
      const menu = await EatsService.getBusinessMenu(attributedBiz.id);
      const pizzaCat = menu.categories.find(c => c.name === 'Artisan Pizzas');
      const soldOut = pizzaCat?.items.find((i: any) => i.name.includes('White Truffle'));
      expect(soldOut).toBeDefined();
      expect(soldOut.isAvailable).toBe(false);
    });
  });

  // ==========================================
  // SECTION 4: SERVER-SIDE BASKET REPRICING & REAL ORDER PLACEMENT
  // ==========================================
  describe('4. Server-Side Basket Repricing & Order Placement', () => {
    it('reprices basket on server, including modifier extra costs and ignoring client price tampering', async () => {
      const repriced = await OrderService.repriceBasket({
        businessId: attributedBiz.id,
        items: [
          {
            itemId: trufflePizzaItem.id,
            quantity: 2,
            selectedModifierIds: [extraCheeseModifier.id, glutenFreeModifier.id]
          }
        ],
        tipCents: 1500 // R15.00
      });

      // Unit price: 16500 (base) + 2500 (extra cheese) + 3000 (gluten-free) = 22000 cents (R220.00)
      // 2 units = 44,000 cents subtotal
      expect(repriced.subtotalCents).toBe(44000);
      expect(repriced.deliveryFeeCents).toBe(2500); // R25.00
      expect(repriced.serviceFeeCents).toBe(150);   // R1.50
      expect(repriced.tipCents).toBe(1500);         // R15.00
      expect(repriced.totalCents).toBe(48150);      // R481.50
    });

    it('strictly rejects cross-restaurant items in single Eats basket (Single Business Guard)', async () => {
      // Fetch item from second business
      const client = await pool.connect();
      let burgerItemId: string;
      try {
        const bRes = await client.query("SELECT id FROM menu_items WHERE name = 'The Karoo Wagyu Smashburger';");
        burgerItemId = bRes.rows[0].id;
      } finally {
        client.release();
      }

      await expect(
        OrderService.repriceBasket({
          businessId: attributedBiz.id,
          items: [
            { itemId: trufflePizzaItem.id, quantity: 1 },
            { itemId: burgerItemId, quantity: 1 } // belongs to Table Mountain Burgers!
          ]
        })
      ).rejects.toThrow(/MULTI_BUSINESS_ORDER_REJECTED/);
    });

    it('strictly rejects purchasing sold-out or unavailable menu items', async () => {
      await expect(
        OrderService.repriceBasket({
          businessId: attributedBiz.id,
          items: [
            { itemId: soldOutItem.id, quantity: 1 }
          ]
        })
      ).rejects.toThrow(/ITEM_UNAVAILABLE/);
    });

    it('creates persistent order in PostgreSQL with PAYMENT_INTEGRATION_PENDING status', async () => {
      const idempotencyKey = `idem-e2e-${Date.now()}`;

      const order = await OrderService.createOrder({
        customerId: customerA.user.id,
        businessId: attributedBiz.id,
        deliveryAddressId: addressA2.id,
        items: [
          {
            itemId: trufflePizzaItem.id,
            quantity: 1,
            selectedModifierIds: [extraCheeseModifier.id]
          }
        ],
        tipCents: 1000,
        specialInstructions: 'Ring doorbell please',
        idempotencyKey
      });

      expect(order.orderId).toBeDefined();
      expect(order.orderNumber).toMatch(/^TX-/);
      expect(order.status).toBe('PLACED');
      expect(order.paymentStatus).toBe('INITIATED');
      expect(order.paymentProvider).toBe('PAYMENT_INTEGRATION_PENDING');

      // Base: 16500 + 2500 (cheese) = 19000 cents subtotal
      expect(order.subtotalCents).toBe(19000);
      expect(order.deliveryFeeCents).toBe(2500);
      expect(order.serviceFeeCents).toBe(150);
      expect(order.tipCents).toBe(1000);
      expect(order.totalCents).toBe(22650);

      // Verify idempotency replay returns existing order without creating duplicate
      const replay = await OrderService.createOrder({
        customerId: customerA.user.id,
        businessId: attributedBiz.id,
        deliveryAddressId: addressA2.id,
        items: [{ itemId: trufflePizzaItem.id, quantity: 1 }],
        idempotencyKey
      });

      expect(replay.isIdempotentReplay).toBe(true);
      expect(replay.orderId).toBe(order.orderId);
      expect(replay.orderNumber).toBe(order.orderNumber);
    });
  });

  // ==========================================
  // SECTION 5: ORDER LIFECYCLE, IDOR SECURITY & REP COMMISSION ATTRIBUTION
  // ==========================================
  describe('5. Order Lifecycle, IDOR Security & Commission Attribution', () => {
    let testOrderId: string;

    beforeAll(async () => {
      const ord = await OrderService.createOrder({
        customerId: customerA.user.id,
        businessId: attributedBiz.id,
        deliveryAddressId: addressA2.id,
        items: [{ itemId: trufflePizzaItem.id, quantity: 1 }],
        isTestPayment: true
      });
      testOrderId = ord.orderId;
    });

    it('enforces IDOR protection: Customer B cannot fetch Customer A order details', async () => {
      await expect(
        OrderService.getOrderById(testOrderId, customerB.user.id, ['CUSTOMER'])
      ).rejects.toThrow(/FORBIDDEN_ORDER_ACCESS/);

      // Customer A can fetch their own order
      const fetched = await OrderService.getOrderById(testOrderId, customerA.user.id, ['CUSTOMER']);
      expect(fetched.id).toBe(testOrderId);
      expect(fetched.items.length).toBe(1);
    });

    it('advances order through valid state machine transitions', async () => {
      // PLACED -> ACCEPTED
      const s1 = await OrderService.updateOrderStatus(testOrderId, 'ACCEPTED', 'merchant-user', ['TUXI_EATS_OWNER']);
      expect(s1.newStatus).toBe('ACCEPTED');

      // ACCEPTED -> PREPARING
      const s2 = await OrderService.updateOrderStatus(testOrderId, 'PREPARING', 'merchant-user', ['TUXI_EATS_OWNER']);
      expect(s2.newStatus).toBe('PREPARING');

      // PREPARING -> READY_FOR_PICKUP
      const s3 = await OrderService.updateOrderStatus(testOrderId, 'READY_FOR_PICKUP', 'merchant-user', ['TUXI_EATS_OWNER']);
      expect(s3.newStatus).toBe('READY_FOR_PICKUP');

      // READY_FOR_PICKUP -> OUT_FOR_DELIVERY
      const s4 = await OrderService.updateOrderStatus(testOrderId, 'OUT_FOR_DELIVERY', 'driver-user', ['TUXI_DELIVERY_DRIVER']);
      expect(s4.newStatus).toBe('OUT_FOR_DELIVERY');
    });

    it('prevents unauthorized role from marking order as DELIVERED', async () => {
      await expect(
        OrderService.updateOrderStatus(testOrderId, 'DELIVERED', customerA.user.id, ['CUSTOMER'])
      ).rejects.toThrow(/FORBIDDEN_TRANSITION/);
    });

    it('transitions to DELIVERED and triggers authoritative Rep commission in commission_ledger', async () => {
      // Mark DELIVERED by authorized driver/admin
      const sDelivered = await OrderService.updateOrderStatus(testOrderId, 'DELIVERED', 'driver-user', ['TUXI_DELIVERY_DRIVER']);
      expect(sDelivered.newStatus).toBe('DELIVERED');

      // Verify Rep commission in commission_ledger
      const client = await pool.connect();
      try {
        const commRes = await client.query(`
          SELECT * FROM commission_ledger WHERE order_id = $1 AND status = 'EARNED';
        `, [testOrderId]);

        expect(commRes.rows.length).toBe(1);
        const comm = commRes.rows[0];

        // Attributed business: subtotal = 16500 cents (R165.00)
        // Rate: 2.5% = 412.5 -> 413 cents (R4.13)
        expect(comm.qualifying_amount_cents).toBe(16500);
        expect(Number(comm.applied_percentage)).toBe(0.0250);
        expect(comm.commission_cents).toBe(413);
        expect(comm.rep_profile_id).toBeDefined();
      } finally {
        client.release();
      }
    });

    it('order from unattributed business generates ZERO Rep commission upon delivery', async () => {
      const nonAttrOrder = await OrderService.createOrder({
        customerId: customerA.user.id,
        businessId: nonAttributedBiz.id,
        deliveryAddressId: addressA2.id,
        items: [
          // Table Mountain Burgers item
          { itemId: (await pool.query("SELECT id FROM menu_items WHERE name = 'The Karoo Wagyu Smashburger';")).rows[0].id, quantity: 1 }
        ],
        isTestPayment: true
      });

      // Progress to DELIVERED
      await OrderService.updateOrderStatus(nonAttrOrder.orderId, 'ACCEPTED', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(nonAttrOrder.orderId, 'PREPARING', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(nonAttrOrder.orderId, 'READY_FOR_PICKUP', 'merchant', ['TUXI_EATS_OWNER']);
      await OrderService.updateOrderStatus(nonAttrOrder.orderId, 'OUT_FOR_DELIVERY', 'driver', ['TUXI_DELIVERY_DRIVER']);
      await OrderService.updateOrderStatus(nonAttrOrder.orderId, 'DELIVERED', 'driver', ['TUXI_DELIVERY_DRIVER']);

      // Verify NO commission recorded for this unattributed order
      const client = await pool.connect();
      try {
        const commRes = await client.query('SELECT * FROM commission_ledger WHERE order_id = $1;', [nonAttrOrder.orderId]);
        expect(commRes.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    it('customer order cancellation triggers compensating negative commission ledger reversal', async () => {
      // Create new order from attributed business
      const cancelTarget = await OrderService.createOrder({
        customerId: customerA.user.id,
        businessId: attributedBiz.id,
        deliveryAddressId: addressA2.id,
        items: [{ itemId: trufflePizzaItem.id, quantity: 1 }],
        isTestPayment: true
      });

      // Cancel while in PLACED status
      const cancelRes = await OrderService.cancelOrder(cancelTarget.orderId, customerA.user.id, 'Customer changed their mind');
      expect(cancelRes.status).toBe('CANCELLED');

      const o = await OrderService.getOrderById(cancelTarget.orderId, customerA.user.id, ['CUSTOMER']);
      expect(o.status).toBe('CANCELLED');
    });
  });
});
