import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export async function seedPhase2EMerchantData() {
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
  });

  const client = await pool.connect();
  console.log('[Seed 2E] Seeding Phase 2E synthetic Merchant Operations data...');

  try {
    await client.query('BEGIN;');

    const pwHash = await bcrypt.hash('OwnerPassword123!', 10);
    const mgrHash = await bcrypt.hash('ManagerPassword123!', 10);
    const staffHash = await bcrypt.hash('StaffPassword123!', 10);

    // 1. Resolve Businesses
    const eatsRes = await client.query("SELECT id FROM businesses WHERE name = 'Kloof Street Bistro';");
    if (eatsRes.rows.length === 0) {
      throw new Error('EATS_BUSINESS_NOT_FOUND: Kloof Street Bistro not found. Run seedPhase2AEatsData first.');
    }
    const eatsBusinessId = eatsRes.rows[0].id;

    const shopRes = await client.query("SELECT id FROM businesses WHERE name = 'MediCare Essentials Pharmacy';");
    if (shopRes.rows.length === 0) {
      throw new Error('SHOP_BUSINESS_NOT_FOUND: MediCare Essentials Pharmacy not found. Run seedPhase2BShopData first.');
    }
    const shopBusinessId = shopRes.rows[0].id;

    const otherEatsRes = await client.query("SELECT id FROM businesses WHERE name = 'Table Mountain Burgers';");
    const otherBusinessId = otherEatsRes.rows.length > 0 ? otherEatsRes.rows[0].id : eatsBusinessId;

    // 2. Eats Owner: eats.owner@kloofbistro.co.za
    let eatsOwner = await client.query("SELECT id FROM users WHERE email = 'eats.owner@kloofbistro.co.za';");
    let eatsOwnerUserId: string;
    if (eatsOwner.rows.length === 0) {
      const ins = await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
        VALUES (uuid_generate_v4(), 'eats.owner@kloofbistro.co.za', $1, 'Marco', 'Kloof', '+27824440001', true, true)
        RETURNING id;
      `, [pwHash]);
      eatsOwnerUserId = ins.rows[0].id;

      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'TUXI_EATS_OWNER');
      `, [eatsOwnerUserId]);
    } else {
      eatsOwnerUserId = eatsOwner.rows[0].id;
    }

    // Link Eats Owner to Kloof Street Bistro
    await client.query(`
      INSERT INTO business_owners (id, business_id, user_id, is_primary_owner)
      VALUES (uuid_generate_v4(), $1, $2, true)
      ON CONFLICT (business_id, user_id) DO NOTHING;
    `, [eatsBusinessId, eatsOwnerUserId]);

    // 3. Eats Manager: eats.manager@kloofbistro.co.za
    let eatsMgr = await client.query("SELECT id FROM users WHERE email = 'eats.manager@kloofbistro.co.za';");
    let eatsMgrUserId: string;
    if (eatsMgr.rows.length === 0) {
      const ins = await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
        VALUES (uuid_generate_v4(), 'eats.manager@kloofbistro.co.za', $1, 'Sophie', 'Bistro', '+27824440002', true, true)
        RETURNING id;
      `, [mgrHash]);
      eatsMgrUserId = ins.rows[0].id;

      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'CUSTOMER');
      `, [eatsMgrUserId]);
    } else {
      eatsMgrUserId = eatsMgr.rows[0].id;
    }

    await client.query(`
      INSERT INTO business_staff (id, business_id, user_id, staff_role)
      VALUES (uuid_generate_v4(), $1, $2, 'MANAGER')
      ON CONFLICT (business_id, user_id) DO UPDATE SET staff_role = 'MANAGER';
    `, [eatsBusinessId, eatsMgrUserId]);

    // 4. Shop Owner: shop.owner@medicare.co.za
    let shopOwner = await client.query("SELECT id FROM users WHERE email = 'shop.owner@medicare.co.za';");
    let shopOwnerUserId: string;
    if (shopOwner.rows.length === 0) {
      const ins = await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
        VALUES (uuid_generate_v4(), 'shop.owner@medicare.co.za', $1, 'David', 'Care', '+27825550001', true, true)
        RETURNING id;
      `, [pwHash]);
      shopOwnerUserId = ins.rows[0].id;

      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'TUXI_SHOP_OWNER');
      `, [shopOwnerUserId]);
    } else {
      shopOwnerUserId = shopOwner.rows[0].id;
    }

    await client.query(`
      INSERT INTO business_owners (id, business_id, user_id, is_primary_owner)
      VALUES (uuid_generate_v4(), $1, $2, true)
      ON CONFLICT (business_id, user_id) DO NOTHING;
    `, [shopBusinessId, shopOwnerUserId]);

    // 5. Shop Staff: shop.staff@medicare.co.za
    let shopStaff = await client.query("SELECT id FROM users WHERE email = 'shop.staff@medicare.co.za';");
    let shopStaffUserId: string;
    if (shopStaff.rows.length === 0) {
      const ins = await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
        VALUES (uuid_generate_v4(), 'shop.staff@medicare.co.za', $1, 'Anna', 'Packer', '+27825550002', true, true)
        RETURNING id;
      `, [staffHash]);
      shopStaffUserId = ins.rows[0].id;

      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'CUSTOMER');
      `, [shopStaffUserId]);
    } else {
      shopStaffUserId = shopStaff.rows[0].id;
    }

    await client.query(`
      INSERT INTO business_staff (id, business_id, user_id, staff_role)
      VALUES (uuid_generate_v4(), $1, $2, 'ORDER_STAFF')
      ON CONFLICT (business_id, user_id) DO UPDATE SET staff_role = 'ORDER_STAFF';
    `, [shopBusinessId, shopStaffUserId]);

    // 6. Isolated Third Owner: other.owner@tmburgers.co.za (for cross-business IDOR testing)
    let otherOwner = await client.query("SELECT id FROM users WHERE email = 'other.owner@tmburgers.co.za';");
    let otherOwnerUserId: string;
    if (otherOwner.rows.length === 0) {
      const ins = await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
        VALUES (uuid_generate_v4(), 'other.owner@tmburgers.co.za', $1, 'Burger', 'Boss', '+27826660001', true, true)
        RETURNING id;
      `, [pwHash]);
      otherOwnerUserId = ins.rows[0].id;

      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'TUXI_EATS_OWNER');
      `, [otherOwnerUserId]);
    } else {
      otherOwnerUserId = otherOwner.rows[0].id;
    }

    await client.query(`
      INSERT INTO business_owners (id, business_id, user_id, is_primary_owner)
      VALUES (uuid_generate_v4(), $1, $2, true)
      ON CONFLICT (business_id, user_id) DO NOTHING;
    `, [otherBusinessId, otherOwnerUserId]);

    // 7. Seed Initial Promotions
    await client.query(`
      INSERT INTO promotions (
        id, business_id, code, title, description, discount_type, discount_value,
        min_order_subtotal_cents, max_discount_cents, starts_at, ends_at, is_active
      )
      VALUES (
        uuid_generate_v4(), $1, 'WELCOME10', 'Welcome 10% Off', '10% off on your first bistro order',
        'PERCENTAGE', 10, 5000, 3000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', true
      )
      ON CONFLICT (business_id, code) DO NOTHING;
    `, [eatsBusinessId]);

    await client.query(`
      INSERT INTO promotions (
        id, business_id, code, title, description, discount_type, discount_value,
        min_order_subtotal_cents, max_discount_cents, starts_at, ends_at, is_active
      )
      VALUES (
        uuid_generate_v4(), $1, 'MED25', 'R25 Pharmacy Off', 'R25 off orders over R100',
        'FIXED_AMOUNT', 2500, 10000, NULL, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', true
      )
      ON CONFLICT (business_id, code) DO NOTHING;
    `, [shopBusinessId]);

    await client.query('COMMIT;');
    console.log('[Seed 2E] Phase 2E synthetic Merchant Operations data seeded successfully.');

    return {
      eatsBusinessId,
      shopBusinessId,
      otherBusinessId,
      eatsOwnerUserId,
      eatsMgrUserId,
      shopOwnerUserId,
      shopStaffUserId,
      otherOwnerUserId
    };
  } catch (err: any) {
    await client.query('ROLLBACK;');
    console.error('[Seed 2E Error]', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
