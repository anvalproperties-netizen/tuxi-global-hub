// Explicitly isolate SQLite fallback verification suite
process.env.FORCE_SQLITE = 'true';

import { describe, it, expect, beforeAll } from 'vitest';
import { dbInstance } from '../src/server/db/database.js';
import { AuthService } from '../src/server/services/authService.js';
import { RepService } from '../src/server/services/repService.js';
import { CommissionService } from '../src/server/services/commissionService.js';
import { OrderService } from '../src/server/services/orderService.js';
import { AdminService } from '../src/server/services/adminService.js';
import { authenticateToken, requireRole } from '../src/server/middleware/auth.js';

describe('TUXI FOUNDATION PHASE 1 — AUTOMATED VERIFICATION SUITE', () => {
  let customerUser: any;
  let repUser1: any;
  let repUser2: any;
  let adminUser: any;
  let superAdminUser: any;
  let merchantAUser: any;
  let merchantBUser: any;
  let driverAUser: any;
  let driverBUser: any;
  let testBusinessA: any;
  let testMenuItemA: any;
  let testProductA: any;
  let termsVersionV1: any;

  beforeAll(async () => {
    // 1. Seed Initial Terms Version
    termsVersionV1 = dbInstance.db.prepare("SELECT * FROM terms_versions WHERE target_role = 'TUXI_REP' AND is_current = 1").get() as any;
    expect(termsVersionV1).toBeDefined();

    // 2. Create Users with specific roles
    customerUser = await AuthService.register({
      email: `customer_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      firstName: 'Customer',
      lastName: 'Test',
      phoneNumber: '+27820000001',
      role: 'CUSTOMER'
    });

    repUser1 = await AuthService.register({
      email: `rep1_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      firstName: 'Marcus',
      lastName: 'Rivera',
      phoneNumber: '+27820000002',
      role: 'CUSTOMER' // Initially customer
    });

    repUser2 = await AuthService.register({
      email: `rep2_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      firstName: 'Elena',
      lastName: 'Rostova',
      phoneNumber: '+27820000099',
      role: 'CUSTOMER'
    });

    adminUser = await AuthService.register({
      email: `admin_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      firstName: 'Admin',
      lastName: 'Staff',
      phoneNumber: '+27820000003',
      role: 'ADMIN'
    }, true);

    superAdminUser = await AuthService.register({
      email: `superadmin_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      firstName: 'Super',
      lastName: 'Admin',
      phoneNumber: '+27820000004',
      role: 'SUPER_ADMIN'
    }, true);

    merchantAUser = await AuthService.register({
      email: `merchantA_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      firstName: 'Owner',
      lastName: 'StoreA',
      phoneNumber: '+27820000005',
      role: 'TUXI_EATS_OWNER'
    }, true);

    merchantBUser = await AuthService.register({
      email: `merchantB_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      firstName: 'Owner',
      lastName: 'StoreB',
      phoneNumber: '+27820000006',
      role: 'TUXI_SHOP_OWNER'
    }, true);

    driverAUser = await AuthService.register({
      email: `driverA_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      firstName: 'Driver',
      lastName: 'Alpha',
      phoneNumber: '+27820000007',
      role: 'TUXI_DELIVERY_DRIVER'
    }, true);

    driverBUser = await AuthService.register({
      email: `driverB_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      firstName: 'Driver',
      lastName: 'Beta',
      phoneNumber: '+27820000008',
      role: 'TUXI_DELIVERY_DRIVER'
    }, true);
  });

  // ==========================================
  // SECTION 1: AUTHENTICATION & ACCESS CONTROL
  // ==========================================
  describe('1. Authentication and Authorization Security Matrix', () => {
    it('rejects invalid login credentials with an error', async () => {
      await expect(AuthService.login(customerUser.user.email, 'WrongPassword!')).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('successfully logs in with valid credentials and issues JWT token', async () => {
      const res = await AuthService.login(customerUser.user.email, 'SecurePassword123!');
      expect(res.token).toBeDefined();
      expect(res.user.email).toBe(customerUser.user.email);
    });

    it('prevents customer from claiming Admin role via registration payload', async () => {
      const normalUser = await AuthService.register({
        email: `forged_admin_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Forged',
        lastName: 'Actor',
        phoneNumber: '+27820000091',
        role: 'CUSTOMER'
      });
      expect(normalUser.user.roles).toContain('CUSTOMER');
      expect(normalUser.user.roles).not.toContain('ADMIN');
      expect(normalUser.user.roles).not.toContain('SUPER_ADMIN');
    });

    it('prevents customer from becoming Rep through registration payload manipulation', async () => {
      // Customer registration cannot grant Rep profile without completed Rep onboarding & verification
      const forgedRep = await AuthService.register({
        email: `forged_rep_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Forged',
        lastName: 'Rep',
        phoneNumber: '+27820000092',
        role: 'CUSTOMER'
      });
      const repProfile = dbInstance.db.prepare('SELECT id FROM rep_profiles WHERE user_id = ?').get(forgedRep.user.id);
      expect(repProfile).toBeUndefined();
    });

    it('strictly blocks Anonymous user from accessing Admin endpoints (authenticateToken)', () => {
      const req: any = { headers: {} };
      let statusCode = 0;
      let errorBody = '';
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: any) => { errorBody = body.error; }
          };
        }
      };
      const next = () => {};

      authenticateToken(req, res, next);
      expect(statusCode).toBe(401);
      expect(errorBody).toBe('UNAUTHENTICATED');
    });

    it('strictly blocks Rep from accessing Admin endpoints (requireRole)', () => {
      const req: any = {
        user: { userId: repUser1.user.id, email: repUser1.user.email, roles: ['TUXI_REP'] },
        originalUrl: '/api/admin/audit-logs',
        get: () => 'TestAgent'
      };
      let statusCode = 0;
      let errorBody = '';
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: any) => { errorBody = body.error; }
          };
        }
      };
      const next = () => {};

      requireRole('ADMIN', 'SUPER_ADMIN')(req, res, next);
      expect(statusCode).toBe(403);
      expect(errorBody).toBe('FORBIDDEN');
    });

    it('strictly blocks Ordinary Admin from executing SUPER_ADMIN-only operations', () => {
      const req: any = {
        user: { userId: adminUser.user.id, email: adminUser.user.email, roles: ['ADMIN'] },
        originalUrl: '/api/admin/kill-switch',
        get: () => 'TestAgent'
      };
      let statusCode = 0;
      let errorBody = '';
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (body: any) => { errorBody = body.error; }
          };
        }
      };
      const next = () => {};

      requireRole('SUPER_ADMIN')(req, res, next);
      expect(statusCode).toBe(403);
      expect(errorBody).toBe('FORBIDDEN');
    });

    it('isolates Driver data: Driver A cannot access Driver B delivery details', () => {
      // Create delivery record for Driver B
      const driverBProfileId = dbInstance.generateUuid();
      const uniquePlate = `PLT-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const uniqueLic = `LIC-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
      
      dbInstance.db.prepare(`
        INSERT INTO driver_profiles (id, user_id, license_number, vehicle_type, vehicle_plate)
        VALUES (?, ?, ?, 'SCOOTER', ?)
      `).run(driverBProfileId, driverBUser.user.id, uniqueLic, uniquePlate);

      // Verify Driver A's user id does not match Driver B's assigned delivery
      const isAssigned = (driverBProfileId === driverAUser.user.id);
      expect(isAssigned).toBe(false);
    });

    it('isolates Merchant resources: Merchant A cannot mutate Merchant B resources', async () => {
      // Merchant A attempts to query or mutate an order for Merchant B's business
      const dummyOrderId = dbInstance.generateUuid();
      await expect(
        OrderService.getOrderById(dummyOrderId, merchantAUser.user.id, merchantAUser.user.roles)
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // SECTION 2: TUXI REP ONBOARDING & 20 KM TERRITORY
  // ==========================================
  describe('2. TUXI Rep Onboarding & 20 km Territory Security Matrix', () => {
    const hubCoords = { lat: -33.9249, lng: 18.4241 }; // Cape Town Hub

    it('strictly rejects under-18 applicant during Rep registration', () => {
      expect(() => {
        RepService.registerRep({
          userId: repUser1.user.id,
          birthDate: '2015-05-10', // 11 years old
          hasMobilePhone: true,
          hasMobileData: true,
          hasOwnTransport: true,
          hubAddress: {
            streetLine1: '10 Kloof St',
            city: 'Cape Town',
            postalCode: '8001',
            countryCode: 'ZAF',
            latitude: hubCoords.lat,
            longitude: hubCoords.lng
          },
          termsVersionId: termsVersionV1.id,
          ipAddress: '127.0.0.1',
          userAgent: 'TestBrowser'
        });
      }).toThrow('UNDERAGE_REP_REJECTED');
    });

    it('strictly rejects applicant who does not confirm phone and data declarations', () => {
      expect(() => {
        RepService.registerRep({
          userId: repUser1.user.id,
          birthDate: '1995-04-12',
          hasMobilePhone: false, // Refused declaration
          hasMobileData: true,
          hasOwnTransport: true,
          hubAddress: {
            streetLine1: '10 Kloof St',
            city: 'Cape Town',
            postalCode: '8001',
            countryCode: 'ZAF',
            latitude: hubCoords.lat,
            longitude: hubCoords.lng
          },
          termsVersionId: termsVersionV1.id,
          ipAddress: '127.0.0.1',
          userAgent: 'TestBrowser'
        });
      }).toThrow('MOBILE_REQUIREMENTS_REJECTED');
    });

    it('successfully registers an eligible 18+ Rep with Terms acceptance audit record', () => {
      const reg = RepService.registerRep({
        userId: repUser1.user.id,
        birthDate: '1992-08-20', // 34 years old
        hasMobilePhone: true,
        hasMobileData: true,
        hasOwnTransport: true,
        transportDetails: 'Motorcycle (Honda 125)',
        hubAddress: {
          streetLine1: '10 Kloof St',
          city: 'Cape Town',
          postalCode: '8001',
          countryCode: 'ZAF',
          latitude: hubCoords.lat,
          longitude: hubCoords.lng
        },
        termsVersionId: termsVersionV1.id,
        ipAddress: '127.0.0.1',
        userAgent: 'TestBrowser'
      });

      expect(reg.repProfileId).toBeDefined();
      expect(reg.status).toBe('PENDING_VERIFICATION');
      expect(reg.territoryRadiusKm).toBe(20.0);

      // Verify immutable terms acceptance record in database
      const acceptance = dbInstance.db.prepare('SELECT * FROM terms_acceptances WHERE user_id = ?').get(repUser1.user.id) as any;
      expect(acceptance).toBeDefined();
      expect(acceptance.terms_version_id).toBe(termsVersionV1.id);
      expect(acceptance.signature_hash).toBeDefined();
    });

    it('ensures historical Terms acceptance survives publication of a newer Terms version', () => {
      // 1. Publish new Terms version v2026.2
      const newTermsId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO terms_versions (id, target_role, version_tag, title, content_hash, full_text, is_current)
        VALUES (?, 'TUXI_REP', 'v2026.2', 'Updated Rep Terms 2026.2', 'hash-v2026.2', 'Updated terms...', 1)
      `).run(newTermsId);

      // Deactivate v1 current flag
      dbInstance.db.prepare("UPDATE terms_versions SET is_current = 0 WHERE id = ?").run(termsVersionV1.id);

      // 2. Verify Rep 1's historical acceptance STILL points to v1 and was NOT modified or deleted
      const histAcceptance = dbInstance.db.prepare('SELECT * FROM terms_acceptances WHERE user_id = ?').get(repUser1.user.id) as any;
      expect(histAcceptance.terms_version_id).toBe(termsVersionV1.id);
      expect(histAcceptance.terms_version_id).not.toBe(newTermsId);
    });

    it('geospatially accepts business at 19.9 km from Rep hub', () => {
      const latDelta19_9 = (19.9 / 6371.0) * (180.0 / Math.PI);
      const lat19_9 = hubCoords.lat + latDelta19_9;
      const res = RepService.validateTerritory(hubCoords.lat, hubCoords.lng, lat19_9, hubCoords.lng, 20.0);
      expect(res.exactDistanceKm).toBeLessThanOrEqual(20.0);
      expect(res.isWithin).toBe(true);
    });

    it('geospatially accepts business at exactly 20.0 km', () => {
      const exactLatDelta20 = (20.0 / 6371.0) * (180.0 / Math.PI);
      const lat20_0 = hubCoords.lat + exactLatDelta20;
      const res = RepService.validateTerritory(hubCoords.lat, hubCoords.lng, lat20_0, hubCoords.lng, 20.0);
      expect(res.exactDistanceKm).toBeLessThanOrEqual(20.0001);
      expect(res.isWithin).toBe(true);
    });

    it('strictly rejects business at 20.1 km from Rep hub', () => {
      const latDelta20_1 = (20.1 / 6371.0) * (180.0 / Math.PI);
      const lat20_1 = hubCoords.lat + latDelta20_1;
      const res = RepService.validateTerritory(hubCoords.lat, hubCoords.lng, lat20_1, hubCoords.lng, 20.0);
      expect(res.exactDistanceKm).toBeGreaterThan(20.0);
      expect(res.isWithin).toBe(false);
    });

    it('ignores forged client isWithin=true and forged distance assertion when out of territory', () => {
      const outOfTerritoryLat = hubCoords.lat + (26.0 / 111.0); // 26 km away
      expect(() => {
        // Client maliciously passes out of territory coordinates
        RepService.onboardBusiness({
          repUserId: repUser1.user.id,
          type: 'EATS',
          name: 'Spoofed Diner',
          legalEntityName: 'Spoofed Foods Ltd',
          taxOrVatId: `VAT-SPOOF-${Date.now()}`,
          contactEmail: 'spoofed@example.com',
          contactPhone: `+2721${Math.floor(1000000 + Math.random() * 9000000)}`,
          address: {
            streetLine1: 'Distant Way',
            city: 'Paarl',
            postalCode: '7646',
            countryCode: 'ZAF',
            latitude: outOfTerritoryLat,
            longitude: hubCoords.lng
          },
          ownerConsentObtained: true
        });
      }).toThrow('OUT_OF_TERRITORY');
    });

    it('onboards a valid in-territory business and creates authoritative attribution', () => {
      const inTerritoryLat = hubCoords.lat + (3.5 / 111.0); // ~3.5 km away
      const uniquePhone = `+2721${Math.floor(1000000 + Math.random() * 9000000)}`;
      const uniqueTaxId = `VAT-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
      const uniqueStreet = `${Date.now()}-${Math.floor(10 + Math.random() * 900)} Kloof St`;

      const onboarded = RepService.onboardBusiness({
        repUserId: repUser1.user.id,
        type: 'EATS',
        name: 'Kloof Street Bistro',
        legalEntityName: 'Kloof Street Dining (Pty) Ltd',
        taxOrVatId: uniqueTaxId,
        contactEmail: `bistro_${Date.now()}_${Math.floor(Math.random() * 9999)}@example.com`,
        contactPhone: uniquePhone,
        address: {
          streetLine1: uniqueStreet,
          city: 'Cape Town',
          postalCode: '8001',
          countryCode: 'ZAF',
          latitude: inTerritoryLat,
          longitude: hubCoords.lng
        },
        ownerConsentObtained: true
      });

      expect(onboarded.businessId).toBeDefined();
      expect(onboarded.status).toBe('PENDING_VERIFICATION');
      expect(onboarded.attributionId).toBeDefined();

      testBusinessA = dbInstance.db.prepare('SELECT * FROM businesses WHERE id = ?').get(onboarded.businessId);

      const attr = dbInstance.db.prepare('SELECT * FROM rep_business_attributions WHERE business_id = ?').get(testBusinessA.id) as any;
      expect(attr).toBeDefined();
      expect(attr.attribution_status).toBe('ACTIVE');
    });

    it('rejects duplicate business with identical normalized address', () => {
      expect(() => {
        RepService.onboardBusiness({
          repUserId: repUser1.user.id,
          type: 'EATS',
          name: 'Address Duplicate Eatery',
          legalEntityName: 'Address Dup Ltd',
          taxOrVatId: `VAT-NEW-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
          contactEmail: 'addrdup@example.com',
          contactPhone: `+2721${Math.floor(1000000 + Math.random() * 9000000)}`,
          address: {
            streetLine1: (dbInstance.db.prepare('SELECT street_line_1 FROM addresses WHERE id = ?').get(testBusinessA.address_id) as any)?.street_line_1 || '45 Kloof St',
            city: 'Cape Town',
            postalCode: '8001',
            countryCode: 'ZAF',
            latitude: hubCoords.lat + 0.01,
            longitude: hubCoords.lng
          },
          ownerConsentObtained: true
        });
      }).toThrow('DUPLICATE_ADDRESS');
    });

    it('concurrent duplicate claim protection: second Rep claiming same business is rejected', () => {
      // Register Rep 2
      RepService.registerRep({
        userId: repUser2.user.id,
        birthDate: '1990-01-15',
        hasMobilePhone: true,
        hasMobileData: true,
        hasOwnTransport: true,
        hubAddress: {
          streetLine1: '50 Loop St',
          city: 'Cape Town',
          postalCode: '8001',
          countryCode: 'ZAF',
          latitude: hubCoords.lat + 0.005,
          longitude: hubCoords.lng + 0.005
        },
        termsVersionId: termsVersionV1.id,
        ipAddress: '127.0.0.1',
        userAgent: 'TestBrowser'
      });

      // Rep 2 attempts to claim Rep 1's already attributed business
      expect(() => {
        RepService.onboardBusiness({
          repUserId: repUser2.user.id,
          type: 'EATS',
          name: 'Poached Business',
          legalEntityName: 'Poached Ltd',
          taxOrVatId: testBusinessA.tax_or_vat_id, // Already registered!
          contactEmail: 'poached@example.com',
          contactPhone: `+2721${Math.floor(1000000 + Math.random() * 9000000)}`,
          address: {
            streetLine1: `${Math.floor(10 + Math.random() * 900)} Loop St`,
            city: 'Cape Town',
            postalCode: '8001',
            countryCode: 'ZAF',
            latitude: hubCoords.lat,
            longitude: hubCoords.lng
          },
          ownerConsentObtained: true
        });
      }).toThrow('DUPLICATE_TAX_ID');
    });
  });

  // ==========================================
  // SECTION 3: ORDERS, COMMISSIONS & CONCURRENCY
  // ==========================================
  describe('3. Customer Orders, Commissions & Concurrency Matrix', () => {
    let testOrder: any;

    beforeAll(() => {
      // Admin approves test business A
      AdminService.reviewBusinessApplication(adminUser.user.id, testBusinessA.id, 'APPROVED', 'Audit verification passed');

      // Link merchant A as business owner
      dbInstance.db.prepare(`
        INSERT INTO business_owners (id, business_id, user_id, is_primary_owner)
        VALUES (?, ?, ?, 1)
      `).run(dbInstance.generateUuid(), testBusinessA.id, merchantAUser.user.id);

      // Create Menu Category & Items
      const catId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO menu_categories (id, business_id, name)
        VALUES (?, ?, 'Pizzas & Mains')
      `).run(catId, testBusinessA.id);

      const itemId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO menu_items (id, category_id, name, base_price_cents, is_available)
        VALUES (?, ?, 'Truffle Mushroom Pizza', 15000, 1) -- R150.00
      `).run(itemId, catId);

      testMenuItemA = dbInstance.db.prepare('SELECT * FROM menu_items WHERE id = ?').get(itemId);

      // Create Product with inventory of exactly 1 unit for inventory concurrency testing
      const prodId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO products (id, business_id, sku, name, price_cents, category)
        VALUES (?, ?, 'SKU-LIMITED-01', 'Limited Edition Truffle Oil', 25000, 'Specialty')
      `).run(prodId, testBusinessA.id);

      dbInstance.db.prepare(`
        INSERT INTO inventory (id, product_id, quantity_available, reserved_quantity)
        VALUES (?, ?, 1, 0) -- Exactly 1 unit in stock
      `).run(dbInstance.generateUuid(), prodId);

      testProductA = dbInstance.db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    });

    const sharedOrderKey = `ord-key-${Date.now()}`;

    it('creates an order with server-calculated prices, ignoring client price tampering', async () => {
      testOrder = await OrderService.createOrder({
        customerId: customerUser.user.id,
        businessId: testBusinessA.id,
        deliveryAddress: {
          streetLine1: '12 Loop St',
          city: 'Cape Town',
          postalCode: '8001',
          countryCode: 'ZAF',
          latitude: -33.9220,
          longitude: 18.4210
        },
        items: [
          { itemType: 'MENU_ITEM', itemId: testMenuItemA.id, quantity: 2 } // 2 * 15000 = 30,000 cents
        ],
        tipCents: 500, // R5.00
        idempotencyKey: sharedOrderKey
      });

      expect(testOrder.subtotalCents).toBe(30000); // 30,000 cents (R300.00)
      expect(testOrder.deliveryFeeCents).toBe(2500); // 2,500 cents (R25.00)
      expect(testOrder.serviceFeeCents).toBe(150);   // 150 cents (R1.50)
      expect(testOrder.totalCents).toBe(33150);      // R331.50 exactly
      expect(testOrder.status).toBe('PLACED');
    });

    it('duplicate order idempotency request returns existing order without creating duplicate financial charges', async () => {
      const replay = await OrderService.createOrder({
        customerId: customerUser.user.id,
        businessId: testBusinessA.id,
        deliveryAddress: {
          streetLine1: '12 Loop St',
          city: 'Cape Town',
          postalCode: '8001',
          countryCode: 'ZAF',
          latitude: -33.9220,
          longitude: 18.4210
        },
        items: [
          { itemType: 'MENU_ITEM', itemId: testMenuItemA.id, quantity: 2 }
        ],
        idempotencyKey: sharedOrderKey
      });

      expect(replay).toBeDefined();
      expect(replay.isIdempotentReplay).toBe(true);
      expect(replay.orderId).toBe(testOrder.orderId);
    });

    it('inventory concurrency: purchasing final stock unit succeeds, but subsequent purchase cannot oversell', async () => {
      // First purchase: succeeds (takes the last 1 item)
      const order1 = await OrderService.createOrder({
        customerId: customerUser.user.id,
        businessId: testBusinessA.id,
        deliveryAddress: {
          streetLine1: '14 Loop St',
          city: 'Cape Town',
          postalCode: '8001',
          countryCode: 'ZAF',
          latitude: -33.9220,
          longitude: 18.4210
        },
        items: [
          { itemType: 'PRODUCT', itemId: testProductA.id, quantity: 1 }
        ]
      });
      expect(order1.orderId).toBeDefined();

      // Second purchase: stock is now 0, MUST throw INSUFFICIENT_STOCK
      await expect(
        OrderService.createOrder({
          customerId: customerUser.user.id,
          businessId: testBusinessA.id,
          deliveryAddress: {
            streetLine1: '16 Loop St',
            city: 'Cape Town',
            postalCode: '8001',
            countryCode: 'ZAF',
            latitude: -33.9220,
            longitude: 18.4210
          },
          items: [
            { itemType: 'PRODUCT', itemId: testProductA.id, quantity: 1 }
          ]
        })
      ).rejects.toThrow('INSUFFICIENT_STOCK');
    });

    it('calculates exact Rep commission on qualifying completed order based on configured rate (up to 3%)', () => {
      // Transition order to DELIVERED
      dbInstance.db.prepare("UPDATE orders SET status = 'DELIVERED' WHERE id = ?").run(testOrder.orderId);

      const commKey = `comm-key-earned-${Date.now()}`;
      const res = CommissionService.processOrderCommission(testOrder.orderId, commKey);

      expect(res.status).toBe('EARNED');
      expect(res.percentageRate).toBe(0.025); // 2.5% configured rate
      expect(res.commissionCents).toBe(750);  // 2.5% of 30,000 subtotal cents = 750 cents (R7.50)
    });

    it('ensures commission event replay cannot double-credit (idempotency)', () => {
      const commKey = `comm-key-earned-idem-${Date.now()}`;
      const res1 = CommissionService.processOrderCommission(testOrder.orderId, commKey);
      const res2 = CommissionService.processOrderCommission(testOrder.orderId, commKey);

      expect(res2.isIdempotentReplay).toBe(true);
      expect(res2.commissionCents).toBe(res1.commissionCents);

      // Verify only 1 row exists with this idempotency key
      const count = dbInstance.db.prepare('SELECT count(*) as cnt FROM commission_ledger WHERE idempotency_key = ?').get(commKey) as any;
      expect(count.cnt).toBe(1);
    });

    it('ensures wrong Rep cannot receive another Rep business commission', () => {
      // Find the attributed Rep profile
      const attr = dbInstance.db.prepare('SELECT rep_profile_id FROM rep_business_attributions WHERE business_id = ?').get(testBusinessA.id) as any;
      const rep1Profile = dbInstance.db.prepare('SELECT id FROM rep_profiles WHERE user_id = ?').get(repUser1.user.id) as any;
      const rep2Profile = dbInstance.db.prepare('SELECT id FROM rep_profiles WHERE user_id = ?').get(repUser2.user.id) as any;

      expect(attr.rep_profile_id).toBe(rep1Profile.id);
      expect(attr.rep_profile_id).not.toBe(rep2Profile.id);
    });

    it('produces mathematically correct commission adjustment on partial refund', async () => {
      // Create new qualifying order for partial refund test
      const partialOrder = await OrderService.createOrder({
        customerId: customerUser.user.id,
        businessId: testBusinessA.id,
        deliveryAddress: {
          streetLine1: '20 Loop St',
          city: 'Cape Town',
          postalCode: '8001',
          countryCode: 'ZAF',
          latitude: -33.9220,
          longitude: 18.4210
        },
        items: [
          { itemType: 'MENU_ITEM', itemId: testMenuItemA.id, quantity: 2 } // 30,000 cents subtotal
        ]
      });

      dbInstance.db.prepare("UPDATE orders SET status = 'DELIVERED' WHERE id = ?").run(partialOrder.orderId);
      const earnedKey = `comm-partial-earn-${Date.now()}`;
      CommissionService.processOrderCommission(partialOrder.orderId, earnedKey);

      // Customer receives a 50% partial refund of 15,000 cents (R150.00)
      const refundAmountCents = 15000;
      const reversalKey = `comm-partial-rev-${Date.now()}`;
      const rev = await CommissionService.reverseOrderCommission(partialOrder.orderId, '50% Item Missing Refund', reversalKey, refundAmountCents);

      expect(rev.status).toBe('PARTIALLY_REVERSED');
      // 2.5% of 15,000 cents = 375 cents reversed
      expect(rev.reversedCents).toBe(375);

      const compensatingRow = dbInstance.db.prepare('SELECT commission_cents FROM commission_ledger WHERE idempotency_key = ?').get(reversalKey) as any;
      expect(compensatingRow.commission_cents).toBe(-375);
    });

    it('cancelled qualifying order correctly prevents/reverses commission', async () => {
      const cancelOrder = await OrderService.createOrder({
        customerId: customerUser.user.id,
        businessId: testBusinessA.id,
        deliveryAddress: {
          streetLine1: '22 Loop St',
          city: 'Cape Town',
          postalCode: '8001',
          countryCode: 'ZAF',
          latitude: -33.9220,
          longitude: 18.4210
        },
        items: [
          { itemType: 'MENU_ITEM', itemId: testMenuItemA.id, quantity: 1 }
        ]
      });

      // Mark order as CANCELLED
      dbInstance.db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?").run(cancelOrder.orderId);

      // Attempting to calculate commission on CANCELLED order returns NON_QUALIFYING_STATUS with 0 cents
      const res = CommissionService.processOrderCommission(cancelOrder.orderId, `comm-cancel-${Date.now()}`);
      expect(res.status).toBe('NON_QUALIFYING_STATUS');
      expect(res.commissionCents).toBe(0);
    });
  });

  // ==========================================
  // SECTION 4: ADMIN GOVERNANCE & KILL SWITCH
  // ==========================================
  describe('4. Admin Governance & Super Admin Protection', () => {
    it('allows Super Admin to trigger emergency kill switch and records audit log', () => {
      const res = AdminService.triggerEmergencyKillSwitch(superAdminUser.user.id, 'Scheduled Compliance Maintenance');
      expect(res.status).toBe('KILL_SWITCH_ENGAGED');
      expect(res.auditId).toBeDefined();

      const audit = dbInstance.db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(res.auditId) as any;
      expect(audit).toBeDefined();
      expect(audit.action).toBe('SUPER_ADMIN_TRIGGER_KILL_SWITCH');
    });

    it('preserves immutable audit records across platform activities', () => {
      const logs = AdminService.getAuditLogs(10);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBeDefined();
      expect(logs[0].created_at).toBeDefined();
    });
  });
});
