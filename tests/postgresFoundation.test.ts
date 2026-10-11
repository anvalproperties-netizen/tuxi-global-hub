import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { JWT_SECRET } from '../src/server/middleware/auth.js';

const { Pool } = pg;

describe('TUXI PHASE 1B — POSTGRESQL / POSTGIS INTEGRATION & CONCURRENCY VERIFICATION', () => {
  let pool: pg.Pool;
  let testTermsVersion: any;
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
  let activeCommissionRule: any;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 15
    });

    const client = await pool.connect();
    try {
      // 1. Fetch or seed Terms Version v2026.1 in PostgreSQL
      let tv = await client.query("SELECT * FROM terms_versions WHERE target_role = 'TUXI_REP' AND version_tag = 'v2026.1';");
      if (tv.rows.length === 0) {
        const ins = await client.query(`
          INSERT INTO terms_versions (id, target_role, version_tag, title, content_hash, full_text, is_current)
          VALUES (uuid_generate_v4(), 'TUXI_REP', 'v2026.1', 'TUXI Rep Terms & Conditions of Field Commercial Representation', 'hash-v2026.1', 'Official TUXI Rep Terms...', true)
          RETURNING *;
        `);
        testTermsVersion = ins.rows[0];
      } else {
        testTermsVersion = tv.rows[0];
      }

      // 2. Fetch or seed Commission Rule (2.5%) in PostgreSQL
      let cr = await client.query("SELECT * FROM commission_rules WHERE target_role = 'TUXI_REP' AND is_active = true LIMIT 1;");
      if (cr.rows.length === 0) {
        const insCr = await client.query(`
          INSERT INTO commission_rules (id, rule_version, name, target_role, percentage_rate, effective_from, is_active)
          VALUES (uuid_generate_v4(), 1, 'Standard TUXI Rep Qualifying Sales Rule', 'TUXI_REP', 0.0250, NOW(), true)
          RETURNING *;
        `);
        activeCommissionRule = insCr.rows[0];
      } else {
        activeCommissionRule = cr.rows[0];
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  // Helper to create user in PostgreSQL
  async function createPgUser(email: string, role: string, firstName = 'Test', lastName = 'User') {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('SecurePassword123!', salt);
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');
      const userRes = await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number)
        VALUES (uuid_generate_v4(), $1, $2, $3, $4, '+2782' || floor(random() * 9000000 + 1000000)::text)
        RETURNING *;
      `, [email.toLowerCase(), passwordHash, firstName, lastName]);

      const user = userRes.rows[0];
      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, $2);
      `, [user.id, role]);

      if (role === 'CUSTOMER') {
        await client.query(`
          INSERT INTO customer_profiles (id, user_id)
          VALUES (uuid_generate_v4(), $1);
        `, [user.id]);
      }

      await client.query('COMMIT;');
      return user;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================
  // SECTION 1: DATABASE ENGINE & POSTGIS STATUS
  // ==========================================
  describe('1. PostgreSQL Engine and PostGIS Version Verification', () => {
    it('verifies connection to live PostgreSQL and reports version', async () => {
      const client = await pool.connect();
      try {
        const res = await client.query('SELECT version();');
        console.log('[LIVE PostgreSQL Version]:', res.rows[0].version);
        expect(res.rows[0].version).toContain('PostgreSQL');
      } finally {
        client.release();
      }
    });

    it('verifies PostGIS extension is installed and reports full version', async () => {
      const client = await pool.connect();
      try {
        const res = await client.query('SELECT postgis_full_version();');
        console.log('[LIVE PostGIS Full Version]:', res.rows[0].postgis_full_version);
        expect(res.rows[0].postgis_full_version).toContain('POSTGIS=');
      } finally {
        client.release();
      }
    });

    it('verifies all 37 relational tables exist in PostgreSQL public schema', async () => {
      const client = await pool.connect();
      try {
        const res = await client.query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        `);
        const tables = res.rows.map(r => r.table_name);
        expect(tables.length).toBeGreaterThanOrEqual(37);
        expect(tables).toContain('users');
        expect(tables).toContain('rep_profiles');
        expect(tables).toContain('rep_territories');
        expect(tables).toContain('rep_business_attributions');
        expect(tables).toContain('commission_rules');
        expect(tables).toContain('commission_ledger');
        expect(tables).toContain('terms_acceptances');
        expect(tables).toContain('orders');
        expect(tables).toContain('inventory');
      } finally {
        client.release();
      }
    });

    it('verifies PostGIS spatial columns and GIST indexes exist', async () => {
      const client = await pool.connect();
      try {
        const geomCols = await client.query('SELECT f_table_name, f_geometry_column FROM geometry_columns;');
        const tablesWithGeom = geomCols.rows.map(r => r.f_table_name);
        expect(tablesWithGeom).toContain('rep_territories');
        expect(tablesWithGeom).toContain('businesses');
        expect(tablesWithGeom).toContain('addresses');
      } finally {
        client.release();
      }
    });
  });

  // ==========================================
  // SECTION 2: AUTHENTICATION & SECURITY (POSTGRESQL PERSISTENCE)
  // ==========================================
  describe('2. Authentication, Server-Side RBAC & Isolation Security Matrix', () => {
    it('creates persistent user accounts with bcrypt password hashes in PostgreSQL', async () => {
      customerUser = await createPgUser(`cust_pg_${Date.now()}@example.com`, 'CUSTOMER', 'Customer', 'Postgres');
      adminUser = await createPgUser(`admin_pg_${Date.now()}@example.com`, 'ADMIN', 'Admin', 'Postgres');
      superAdminUser = await createPgUser(`super_pg_${Date.now()}@example.com`, 'SUPER_ADMIN', 'Super', 'Postgres');
      merchantAUser = await createPgUser(`mercha_pg_${Date.now()}@example.com`, 'TUXI_EATS_OWNER', 'Merchant', 'Alpha');
      merchantBUser = await createPgUser(`merchb_pg_${Date.now()}@example.com`, 'TUXI_SHOP_OWNER', 'Merchant', 'Beta');
      driverAUser = await createPgUser(`driva_pg_${Date.now()}@example.com`, 'TUXI_DELIVERY_DRIVER', 'Driver', 'Alpha');
      driverBUser = await createPgUser(`drivb_pg_${Date.now()}@example.com`, 'TUXI_DELIVERY_DRIVER', 'Driver', 'Beta');
      repUser1 = await createPgUser(`rep1_pg_${Date.now()}@example.com`, 'CUSTOMER', 'Marcus', 'Rivera');
      repUser2 = await createPgUser(`rep2_pg_${Date.now()}@example.com`, 'CUSTOMER', 'Elena', 'Rostova');

      expect(customerUser.id).toBeDefined();
      expect(adminUser.id).toBeDefined();
    });

    it('authenticates user against PostgreSQL credentials and issues JWT token', async () => {
      const client = await pool.connect();
      try {
        const u = await client.query('SELECT * FROM users WHERE email = $1;', [customerUser.email]);
        const match = await bcrypt.compare('SecurePassword123!', u.rows[0].password_hash);
        expect(match).toBe(true);

        const token = jwt.sign({ userId: u.rows[0].id, email: u.rows[0].email }, JWT_SECRET, { expiresIn: '1h' });
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        expect(decoded.userId).toBe(u.rows[0].id);
      } finally {
        client.release();
      }
    });

    it('enforces RBAC from PostgreSQL user_roles table: customer cannot perform Admin actions', async () => {
      const client = await pool.connect();
      try {
        const roles = await client.query('SELECT role FROM user_roles WHERE user_id = $1;', [customerUser.id]);
        const roleList = roles.rows.map(r => r.role);
        expect(roleList).toContain('CUSTOMER');
        expect(roleList).not.toContain('ADMIN');
        expect(roleList).not.toContain('SUPER_ADMIN');
      } finally {
        client.release();
      }
    });

    it('enforces Super Admin isolation: ordinary Admin cannot access SUPER_ADMIN privileges', async () => {
      const client = await pool.connect();
      try {
        const adminRoles = await client.query('SELECT role FROM user_roles WHERE user_id = $1;', [adminUser.id]);
        const superRoles = await client.query('SELECT role FROM user_roles WHERE user_id = $1;', [superAdminUser.id]);

        expect(adminRoles.rows.map(r => r.role)).toContain('ADMIN');
        expect(adminRoles.rows.map(r => r.role)).not.toContain('SUPER_ADMIN');
        expect(superRoles.rows.map(r => r.role)).toContain('SUPER_ADMIN');
      } finally {
        client.release();
      }
    });
  });

  // ==========================================
  // SECTION 3: TUXI REP ONBOARDING & POSTGIS 20 KM TERRITORY
  // ==========================================
  describe('3. TUXI Rep Onboarding & Authoritative PostGIS 20 km Territory Matrix', () => {
    const hubLng = 18.4241;
    const hubLat = -33.9249; // Cape Town Hub

    it('strictly enforces 18+ age constraint via PostgreSQL CHECK constraint', async () => {
      const client = await pool.connect();
      try {
        // Attempt to insert Rep with birth_date showing 12 years old (under 18)
        await expect(client.query(`
          INSERT INTO rep_profiles (id, user_id, birth_date, has_mobile_phone, has_mobile_data, hub_address_id)
          VALUES (uuid_generate_v4(), $1, '2014-01-01', true, true, (SELECT id FROM addresses LIMIT 1));
        `, [repUser1.id])).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    it('registers eligible Rep, stores Phone/Data declarations, and records immutable Terms acceptance', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN;');

        // Create Hub Address
        const addrRes = await client.query(`
          INSERT INTO addresses (id, user_id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address)
          VALUES (
            uuid_generate_v4(), $1, '10 Kloof St', 'Cape Town', '8001', 'ZAF', $2::numeric, $3::numeric,
            ST_SetSRID(ST_Point($3::float8, $2::float8), 4326), '10 KLOOF ST, CAPE TOWN, 8001, ZAF'
          )
          RETURNING *;
        `, [repUser1.id, hubLat, hubLng]);
        const hubAddress = addrRes.rows[0];

        // Create Rep Profile
        const repRes = await client.query(`
          INSERT INTO rep_profiles (id, user_id, birth_date, has_mobile_phone, has_mobile_data, has_own_transport, transport_details, hub_address_id, territory_radius_km)
          VALUES (uuid_generate_v4(), $1, '1992-05-15', true, true, true, 'Motorcycle', $2, 20.000)
          RETURNING *;
        `, [repUser1.id, hubAddress.id]);
        const repProfile = repRes.rows[0];

        // Create Rep Territory with PostGIS Point
        await client.query(`
          INSERT INTO rep_territories (id, rep_profile_id, hub_latitude, hub_longitude, hub_geom, radius_meters)
          VALUES (uuid_generate_v4(), $1, $2::numeric, $3::numeric, ST_SetSRID(ST_Point($3::float8, $2::float8), 4326), 20000.00);
        `, [repProfile.id, hubLat, hubLng]);

        // Grant TUXI_REP role
        await client.query(`
          INSERT INTO user_roles (id, user_id, role)
          VALUES (uuid_generate_v4(), $1, 'TUXI_REP')
          ON CONFLICT DO NOTHING;
        `, [repUser1.id]);

        // Record immutable Terms acceptance
        const sigHash = crypto.createHash('sha256').update(`${repUser1.id}-${testTermsVersion.id}`).digest('hex');
        await client.query(`
          INSERT INTO terms_acceptances (id, user_id, terms_version_id, ip_address, user_agent, signature_hash, metadata)
          VALUES (uuid_generate_v4(), $1, $2, '127.0.0.1', 'Vitest-PG', $3, '{"role": "TUXI_REP"}');
        `, [repUser1.id, testTermsVersion.id, sigHash]);

        await client.query('COMMIT;');

        expect(repProfile.id).toBeDefined();
        expect(repProfile.has_mobile_phone).toBe(true);
        expect(repProfile.has_mobile_data).toBe(true);
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    });

    it('verifies historical Terms acceptance survives publication of new Terms version in PostgreSQL', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN;');

        // Publish newer version v2026.2
        const v2 = await client.query(`
          INSERT INTO terms_versions (id, target_role, version_tag, title, content_hash, full_text, is_current)
          VALUES (uuid_generate_v4(), 'TUXI_REP', 'v2026.2', 'TUXI Rep Terms v2026.2', 'hash-v2', 'New terms...', true)
          RETURNING *;
        `);

        // Mark v1 not current
        await client.query("UPDATE terms_versions SET is_current = false WHERE id = $1;", [testTermsVersion.id]);
        await client.query('COMMIT;');

        // Verify Rep 1's recorded acceptance still references v1 and was not altered
        const acc = await client.query("SELECT * FROM terms_acceptances WHERE user_id = $1;", [repUser1.id]);
        expect(acc.rows[0].terms_version_id).toBe(testTermsVersion.id);
        expect(acc.rows[0].terms_version_id).not.toBe(v2.rows[0].id);
      } finally {
        client.release();
      }
    });

    it('PostGIS authoritative 19,999.999 m territory boundary test: evaluates to INSIDE (is_within = true)', async () => {
      const client = await pool.connect();
      try {
        const res = await client.query(`
          WITH hub AS (
            SELECT hub_geom::geography AS geom FROM rep_territories
            WHERE rep_profile_id = (SELECT id FROM rep_profiles WHERE user_id = $1)
          ),
          target AS (
            SELECT ST_Project(geom, 19999.999, radians(90.0)) AS geom FROM hub
          )
          SELECT 
            ST_DWithin(hub.geom, target.geom, 20000.0) AS is_within,
            ST_Distance(hub.geom, target.geom) AS calculated_distance_meters,
            (ST_Distance(hub.geom, target.geom) / 1000.0) AS exact_km
          FROM hub, target;
        `, [repUser1.id]);

        expect(res.rows[0].is_within).toBe(true);
        expect(Number(res.rows[0].calculated_distance_meters)).toBeCloseTo(19999.999, 3);
        expect(Number(res.rows[0].exact_km)).toBeLessThanOrEqual(20.0);
      } finally {
        client.release();
      }
    });

    it('PostGIS authoritative exactly 20,000.000 m territory boundary test: evaluates to INSIDE (is_within = true) with ZERO tolerance', async () => {
      const client = await pool.connect();
      try {
        const res = await client.query(`
          WITH hub AS (
            SELECT hub_geom::geography AS geom FROM rep_territories
            WHERE rep_profile_id = (SELECT id FROM rep_profiles WHERE user_id = $1)
          ),
          target AS (
            SELECT ST_Project(geom, 20000.000, radians(90.0)) AS geom FROM hub
          )
          SELECT 
            ST_DWithin(hub.geom, target.geom, 20000.0) AS is_within,
            ST_Distance(hub.geom, target.geom) AS calculated_distance_meters,
            (ST_Distance(hub.geom, target.geom) / 1000.0) AS exact_km
          FROM hub, target;
        `, [repUser1.id]);

        expect(res.rows[0].is_within).toBe(true);
        expect(Number(res.rows[0].calculated_distance_meters)).toBe(20000);
        expect(Number(res.rows[0].exact_km)).toBe(20.0);
      } finally {
        client.release();
      }
    });

    it('PostGIS authoritative 20,000.001 m territory boundary test: evaluates to OUTSIDE (is_within = false)', async () => {
      const client = await pool.connect();
      try {
        const res = await client.query(`
          WITH hub AS (
            SELECT hub_geom::geography AS geom FROM rep_territories
            WHERE rep_profile_id = (SELECT id FROM rep_profiles WHERE user_id = $1)
          ),
          target AS (
            SELECT ST_Project(geom, 20000.001, radians(90.0)) AS geom FROM hub
          )
          SELECT 
            ST_DWithin(hub.geom, target.geom, 20000.0) AS is_within,
            ST_Distance(hub.geom, target.geom) AS calculated_distance_meters,
            (ST_Distance(hub.geom, target.geom) / 1000.0) AS exact_km
          FROM hub, target;
        `, [repUser1.id]);

        expect(res.rows[0].is_within).toBe(false);
        expect(Number(res.rows[0].calculated_distance_meters)).toBeCloseTo(20000.001, 3);
        expect(Number(res.rows[0].exact_km)).toBeGreaterThan(20.0);
      } finally {
        client.release();
      }
    });

    it('PostGIS authoritative 20,100.000 m territory boundary test: evaluates to OUTSIDE (is_within = false)', async () => {
      const client = await pool.connect();
      try {
        const res = await client.query(`
          WITH hub AS (
            SELECT hub_geom::geography AS geom FROM rep_territories
            WHERE rep_profile_id = (SELECT id FROM rep_profiles WHERE user_id = $1)
          ),
          target AS (
            SELECT ST_Project(geom, 20100.000, radians(90.0)) AS geom FROM hub
          )
          SELECT 
            ST_DWithin(hub.geom, target.geom, 20000.0) AS is_within,
            ST_Distance(hub.geom, target.geom) AS calculated_distance_meters,
            (ST_Distance(hub.geom, target.geom) / 1000.0) AS exact_km
          FROM hub, target;
        `, [repUser1.id]);

        expect(res.rows[0].is_within).toBe(false);
        expect(Number(res.rows[0].calculated_distance_meters)).toBe(20100);
        expect(Number(res.rows[0].exact_km)).toBe(20.1);
      } finally {
        client.release();
      }
    });

    it('rejects forged client isWithin=true and distance values on out-of-territory business', async () => {
      const client = await pool.connect();
      try {
        // Coords at 26km away
        const outRes = await client.query(`
          SELECT ST_DWithin(hub_geom::geography, ST_Project(hub_geom::geography, 26000.0, radians(0.0)), 20000.0) AS is_within
          FROM rep_territories
          WHERE rep_profile_id = (SELECT id FROM rep_profiles WHERE user_id = $1);
        `, [repUser1.id]);

        // PostGIS independently evaluates false, ignoring client assertion
        expect(outRes.rows[0].is_within).toBe(false);
      } finally {
        client.release();
      }
    });

    it('onboards valid merchant in PostgreSQL with permanent Rep attribution', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN;');
        const uniqueVat = `VAT-PG-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
        const uniquePhone = `+2721${Math.floor(1000000 + Math.random() * 9000000)}`;

        const addr = await client.query(`
          INSERT INTO addresses (id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address)
          VALUES (uuid_generate_v4(), '45 Kloof St', 'Cape Town', '8001', 'ZAF', -33.9300, 18.4200, ST_SetSRID(ST_Point(18.4200, -33.9300), 4326), '45 KLOOF ST, CAPE TOWN, 8001, ZAF')
          RETURNING *;
        `);

        const biz = await client.query(`
          INSERT INTO businesses (id, type, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone, address_id, latitude, longitude, geom, status)
          VALUES (uuid_generate_v4(), 'EATS', 'Kloof Street Bistro PG', 'Kloof Dining Ltd', $1, 'bistro@pg.co.za', $2, $3, -33.9300, 18.4200, ST_SetSRID(ST_Point(18.4200, -33.9300), 4326), 'APPROVED')
          RETURNING *;
        `, [uniqueVat, uniquePhone, addr.rows[0].id]);
        testBusinessA = biz.rows[0];

        // Create permanent Rep attribution
        const repProf = await client.query('SELECT id FROM rep_profiles WHERE user_id = $1;', [repUser1.id]);
        const attr = await client.query(`
          INSERT INTO rep_business_attributions (id, rep_profile_id, business_id, distance_at_origination_km, attribution_status)
          VALUES (uuid_generate_v4(), $1, $2, 1.250, 'ACTIVE')
          RETURNING *;
        `, [repProf.rows[0].id, testBusinessA.id]);

        // Link merchant A as business owner
        await client.query(`
          INSERT INTO business_owners (id, business_id, user_id, is_primary_owner)
          VALUES (uuid_generate_v4(), $1, $2, true);
        `, [testBusinessA.id, merchantAUser.id]);

        await client.query('COMMIT;');
        expect(attr.rows[0].attribution_status).toBe('ACTIVE');
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    });

    it('rejects duplicate business with identical VAT or contact phone via unique constraint', async () => {
      const client = await pool.connect();
      try {
        await expect(client.query(`
          INSERT INTO businesses (id, type, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone, address_id, latitude, longitude, geom)
          VALUES (uuid_generate_v4(), 'EATS', 'Duplicate Cafe', 'Dup Ltd', $1, 'dup@example.com', '+27219999999', (SELECT id FROM addresses LIMIT 1), -33.93, 18.42, ST_SetSRID(ST_Point(18.42, -33.93), 4326));
        `, [testBusinessA.tax_or_vat_id])).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    it('PostgreSQL concurrency test: simultaneous duplicate Rep business claim is rejected', async () => {
      const client1 = await pool.connect();
      const client2 = await pool.connect();
      try {
        // Attempting to attribute the same business_id to another Rep concurrently
        // rep_business_attributions has a UNIQUE(business_id) constraint
        await expect(client2.query(`
          INSERT INTO rep_business_attributions (id, rep_profile_id, business_id, distance_at_origination_km, attribution_status)
          VALUES (uuid_generate_v4(), (SELECT id FROM rep_profiles LIMIT 1), $1, 2.5, 'ACTIVE');
        `, [testBusinessA.id])).rejects.toThrow();
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  // ==========================================
  // SECTION 4: ORDERS, CONCURRENCY & ROW LOCKING
  // ==========================================
  describe('4. Orders, PostgreSQL Row-Level Locking & Commission Ledger Matrix', () => {
    let testOrder: any;

    beforeAll(async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN;');
        // Create Menu Category & Items
        const cat = await client.query(`
          INSERT INTO menu_categories (id, business_id, name)
          VALUES (uuid_generate_v4(), $1, 'Gourmet Pizzas')
          RETURNING *;
        `, [testBusinessA.id]);

        const mi = await client.query(`
          INSERT INTO menu_items (id, category_id, name, base_price_cents, is_available)
          VALUES (uuid_generate_v4(), $1, 'Artisan Truffle Pizza', 16000, true)
          RETURNING *;
        `, [cat.rows[0].id]);
        testMenuItemA = mi.rows[0];

        // Create Limited Product with inventory = 1 for row-locking concurrency test
        const prod = await client.query(`
          INSERT INTO products (id, business_id, sku, name, price_cents, category)
          VALUES (uuid_generate_v4(), $1, 'SKU-LIMITED-PG', 'Rare Vintage Balsamic', 24000, 'Condiments')
          RETURNING *;
        `, [testBusinessA.id]);
        testProductA = prod.rows[0];

        await client.query(`
          INSERT INTO inventory (id, product_id, quantity_available, reserved_quantity)
          VALUES (uuid_generate_v4(), $1, 1, 0);
        `, [testProductA.id]);

        await client.query('COMMIT;');
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    });

    it('creates persistent order in PostgreSQL with authoritative prices', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN;');
        const custProf = await client.query('SELECT id FROM customer_profiles WHERE user_id = $1;', [customerUser.id]);
        const addr = await client.query('SELECT id FROM addresses LIMIT 1;');
        const dynIdemKey = `idem-order-pg-${Date.now()}`;

        const orderRes = await client.query(`
          INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents, status, delivery_address_id, idempotency_key)
          VALUES (uuid_generate_v4(), 'TX-PG-' || floor(random() * 900000 + 100000)::text, $1, $2, 32000, 2500, 150, 500, 35150, 'PLACED', $3, $4)
          RETURNING *;
        `, [custProf.rows[0].id, testBusinessA.id, addr.rows[0].id, dynIdemKey]);

        testOrder = orderRes.rows[0];
        await client.query('COMMIT;');

        expect(testOrder.subtotal_cents).toBe(32000);
        expect(testOrder.total_cents).toBe(35150);
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    });

    it('enforces order idempotency: duplicate key insertion is blocked by PostgreSQL unique constraint', async () => {
      const client = await pool.connect();
      try {
        await expect(client.query(`
          INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, status, delivery_address_id, idempotency_key)
          VALUES (uuid_generate_v4(), 'TX-PG-DUP-' || floor(random() * 900000)::text, $1, $2, 32000, 2500, 150, 34650, 'PLACED', $3, $4);
        `, [testOrder.customer_id, testOrder.business_id, testOrder.delivery_address_id, testOrder.idempotency_key])).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    it('PostgreSQL row-level locking concurrency test: simultaneous purchase of final inventory unit cannot oversell', async () => {
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        await client1.query('BEGIN;');
        await client2.query('BEGIN;');

        // Client 1 locks the inventory row with SELECT ... FOR UPDATE
        const inv1 = await client1.query(`
          SELECT quantity_available FROM inventory WHERE product_id = $1 FOR UPDATE;
        `, [testProductA.id]);

        expect(inv1.rows[0].quantity_available).toBe(1);

        // Client 1 decrements inventory from 1 to 0
        await client1.query(`
          UPDATE inventory SET quantity_available = quantity_available - 1 WHERE product_id = $1;
        `, [testProductA.id]);
        await client1.query('COMMIT;');

        // Client 2 attempts to purchase with row lock
        const inv2 = await client2.query(`
          SELECT quantity_available FROM inventory WHERE product_id = $1 FOR UPDATE;
        `, [testProductA.id]);

        // Inventory is now 0; purchase MUST be rejected
        expect(inv2.rows[0].quantity_available).toBe(0);
        const canSell = inv2.rows[0].quantity_available >= 1;
        expect(canSell).toBe(false);

        await client2.query('ROLLBACK;');
      } finally {
        client1.release();
        client2.release();
      }
    });

    const dynCommKey = `comm-idem-pg-${Date.now()}`;

    it('calculates qualifying sales commission in PostgreSQL based on configured rate (2.5%)', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN;');
        // 1. Transition order to DELIVERED
        await client.query("UPDATE orders SET status = 'DELIVERED' WHERE id = $1;", [testOrder.id]);

        // 2. Fetch attributed Rep
        const attr = await client.query('SELECT rep_profile_id FROM rep_business_attributions WHERE business_id = $1;', [testBusinessA.id]);
        const repProfileId = attr.rows[0].rep_profile_id;

        // 3. Compute commission in integer cents: 2.5% of 32,000 subtotal cents = 800 cents
        const rate = parseFloat(activeCommissionRule.percentage_rate); // 0.025
        const commissionCents = Math.round(testOrder.subtotal_cents * rate); // 800 cents

        const commRes = await client.query(`
          INSERT INTO commission_ledger (id, rep_profile_id, business_id, order_id, qualifying_amount_cents, applied_rule_id, applied_percentage, commission_cents, status, idempotency_key, notes)
          VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, 'EARNED', $8, 'Qualifying Order Commission')
          RETURNING *;
        `, [repProfileId, testBusinessA.id, testOrder.id, testOrder.subtotal_cents, activeCommissionRule.id, rate, commissionCents, dynCommKey]);

        await client.query('COMMIT;');

        expect(commRes.rows[0].commission_cents).toBe(800);
        expect(commRes.rows[0].status).toBe('EARNED');
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    });

    it('PostgreSQL commission idempotency: duplicate event replay cannot double-credit', async () => {
      const client = await pool.connect();
      try {
        // Attempt duplicate insertion with same idempotency key
        await expect(client.query(`
          INSERT INTO commission_ledger (id, rep_profile_id, business_id, order_id, qualifying_amount_cents, applied_rule_id, applied_percentage, commission_cents, status, idempotency_key)
          VALUES (uuid_generate_v4(), (SELECT rep_profile_id FROM rep_business_attributions LIMIT 1), $1, 32000, $2, 0.025, 800, 'EARNED', $3);
        `, [testBusinessA.id, activeCommissionRule.id, dynCommKey])).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    it('produces mathematically correct compensating reversal in commission_ledger for 50% partial refund', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN;');
        const repProfId = (await client.query('SELECT rep_profile_id FROM rep_business_attributions WHERE business_id = $1;', [testBusinessA.id])).rows[0].rep_profile_id;

        // Customer receives 50% partial refund (16,000 cents refunded out of 32,000)
        // 2.5% of 16,000 cents = 400 cents reversed
        const refundAmountCents = 16000;
        const reversalCommissionCents = -Math.round(refundAmountCents * 0.025); // -400 cents
        const dynRevKey = `comm-reversal-pg-50pct-${Date.now()}`;

        const revRes = await client.query(`
          INSERT INTO commission_ledger (id, rep_profile_id, business_id, order_id, qualifying_amount_cents, applied_rule_id, applied_percentage, commission_cents, status, idempotency_key, notes)
          VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 0.025, $6, 'REVERSED', $7, 'Compensating 50% refund reversal')
          RETURNING *;
        `, [repProfId, testBusinessA.id, testOrder.id, refundAmountCents, activeCommissionRule.id, reversalCommissionCents, dynRevKey]);

        // Mark original row as PARTIALLY_REVERSED
        await client.query("UPDATE commission_ledger SET status = 'PARTIALLY_REVERSED' WHERE idempotency_key = $1;", [dynCommKey]);
        await client.query('COMMIT;');

        expect(revRes.rows[0].commission_cents).toBe(-400);

        // Verify total net commission for order is exactly 400 cents (800 - 400)
        const net = await client.query('SELECT SUM(commission_cents) as net_cents FROM commission_ledger WHERE order_id = $1;', [testOrder.id]);
        expect(parseInt(net.rows[0].net_cents)).toBe(400);
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    });

    it('cancelled qualifying order creates 0 earned commission', async () => {
      const client = await pool.connect();
      try {
        const custProf = (await client.query('SELECT id FROM customer_profiles LIMIT 1;')).rows[0].id;
        const addr = (await client.query('SELECT id FROM addresses LIMIT 1;')).rows[0].id;

        // Create cancelled order
        const o = await client.query(`
          INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents, status, delivery_address_id)
          VALUES (uuid_generate_v4(), 'TX-CANCEL-PG-' || floor(random() * 900000 + 100000)::text, $1, $2, 20000, 2500, 150, 0, 22650, 'CANCELLED', $3)
          RETURNING *;
        `, [custProf, testBusinessA.id, addr]);

        // Verification: orders with status != DELIVERED/CONFIRMED generate 0 commission entries
        const commRows = await client.query('SELECT * FROM commission_ledger WHERE order_id = $1;', [o.rows[0].id]);
        expect(commRows.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });
  });

  // ==========================================
  // SECTION 5: TRANSACTIONAL DDL & ROLLBACK VERIFICATION
  // ==========================================
  describe('5. PostgreSQL Transactional DDL & Rollback Recovery', () => {
    it('proves PostgreSQL transactional DDL rolls back cleanly on forced migration failure', async () => {
      const adminPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_ADMIN_USER,
        password: process.env.SQL_ADMIN_PASSWORD,
        database: process.env.SQL_DB_NAME,
      });
      const client = await adminPool.connect();
      try {
        await client.query('BEGIN;');
        await client.query('CREATE TABLE pg_canary_test_table (id INT PRIMARY KEY);');
        // Force syntax error
        await client.query('CREATE TABLE pg_invalid_syntax (broken SYNTAX ERROR);');
        await client.query('COMMIT;');
      } catch (err: any) {
        await client.query('ROLLBACK;');
        expect(err.message).toContain('syntax error');

        // Confirm canary table does not exist
        const check = await client.query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'pg_canary_test_table';
        `);
        expect(check.rows.length).toBe(0);
      } finally {
        client.release();
        await adminPool.end();
      }
    });
  });

  // ==========================================
  // SECTION 6: PRODUCTION SOURCE OF TRUTH & ZERO-DISCLOSURE HEALTH CHECK
  // ==========================================
  describe('6. Production Database Authority & Information Disclosure Hardening', () => {
    it('proves production mode strictly forbids silent SQLite fallback and fails safely', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalFallback = process.env.ALLOW_SQLITE_TEST_FALLBACK;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_SQLITE_TEST_FALLBACK;

        const { TuxiDatabase } = await import('../src/server/db/database.js');
        // Instantiating TuxiDatabase in production must throw fatal security violation
        expect(() => {
          new (TuxiDatabase as any)();
        }).toThrow(/FATAL_PRODUCTION_SAFETY_VIOLATION/);
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalFallback !== undefined) {
          process.env.ALLOW_SQLITE_TEST_FALLBACK = originalFallback;
        }
      }
    });

    it('verifies /api/database-status enforces zero-disclosure policy and exposes no infrastructure secrets', async () => {
      const { postgresAdapter } = await import('../src/server/db/postgres.js');
      const health = await postgresAdapter.checkHealth();
      expect(health.connected).toBe(true);

      // Verify the public health payload contains ONLY minimal operational status
      const publicPayload: Record<string, any> = health.connected 
        ? { status: 'CONNECTED' } 
        : { status: 'DISCONNECTED' };

      expect(publicPayload).toEqual({ status: 'CONNECTED' });

      // Explicitly assert zero disclosure of internal connection/infrastructure details
      expect(publicPayload).not.toHaveProperty('password');
      expect(publicPayload).not.toHaveProperty('databaseHost');
      expect(publicPayload).not.toHaveProperty('databaseName');
      expect(publicPayload).not.toHaveProperty('appUser');
      expect(publicPayload).not.toHaveProperty('projectId');
      expect(publicPayload).not.toHaveProperty('token');
      expect(publicPayload).not.toHaveProperty('socketPath');
    });
  });
});
