import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export async function seedPhase2AEatsData() {
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
  });

  const client = await pool.connect();
  console.log('[Seed] Seeding Phase 2A synthetic development data...');

  try {
    await client.query('BEGIN;');

    // 1. Configurable Commission Rule (2.5%)
    let cr = await client.query("SELECT id FROM commission_rules WHERE target_role = 'TUXI_REP' AND is_active = true LIMIT 1;");
    let commissionRuleId: string;
    if (cr.rows.length === 0) {
      const insCr = await client.query(`
        INSERT INTO commission_rules (id, rule_version, name, target_role, percentage_rate, effective_from, is_active)
        VALUES (uuid_generate_v4(), 1, 'Standard TUXI Rep Qualifying Sales Rule', 'TUXI_REP', 0.0250, NOW(), true)
        RETURNING id;
      `);
      commissionRuleId = insCr.rows[0].id;
    } else {
      commissionRuleId = cr.rows[0].id;
    }

    // 2. Synthetic Customer User & Profile
    const custEmail = 'customer@tuxi-seed.dev';
    let custUser = await client.query('SELECT id FROM users WHERE email = $1;', [custEmail]);
    let customerUserId: string;
    if (custUser.rows.length === 0) {
      const passwordHash = await bcrypt.hash('SecurePassword123!', 10);
      const insUser = await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
        VALUES (uuid_generate_v4(), $1, $2, 'John', 'Customer', '+27821234567', true, true)
        RETURNING id;
      `, [custEmail, passwordHash]);
      customerUserId = insUser.rows[0].id;

      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'CUSTOMER');
      `, [customerUserId]);
    } else {
      customerUserId = custUser.rows[0].id;
    }

    // Customer Profile
    let custProfile = await client.query('SELECT id FROM customer_profiles WHERE user_id = $1;', [customerUserId]);
    let customerProfileId: string;
    if (custProfile.rows.length === 0) {
      const insProf = await client.query(`
        INSERT INTO customer_profiles (id, user_id, preferred_language, preferred_currency, loyalty_points, loyalty_tier)
        VALUES (uuid_generate_v4(), $1, 'en', 'ZAR', 150, 'SILVER')
        RETURNING id;
      `, [customerUserId]);
      customerProfileId = insProf.rows[0].id;
    } else {
      customerProfileId = custProfile.rows[0].id;
    }

    // Customer Addresses (Home & Work)
    let homeAddr = await client.query("SELECT id FROM addresses WHERE user_id = $1 AND label = 'Home';", [customerUserId]);
    let homeAddressId: string;
    if (homeAddr.rows.length === 0) {
      const insAddr = await client.query(`
        INSERT INTO addresses (id, user_id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address, label, is_default, delivery_instructions)
        VALUES (
          uuid_generate_v4(), $1, '15 Long St', 'Cape Town', '8001', 'ZAF', -33.9200, 18.4200,
          ST_SetSRID(ST_Point(18.4200, -33.9200), 4326), '15 LONG ST, CAPE TOWN, 8001, ZAF',
          'Home', true, 'Ring apartment 4B on intercom'
        )
        RETURNING id;
      `, [customerUserId]);
      homeAddressId = insAddr.rows[0].id;

      await client.query('UPDATE customer_profiles SET default_address_id = $1 WHERE id = $2;', [homeAddressId, customerProfileId]);
    } else {
      homeAddressId = homeAddr.rows[0].id;
    }

    let workAddr = await client.query("SELECT id FROM addresses WHERE user_id = $1 AND label = 'Work';", [customerUserId]);
    if (workAddr.rows.length === 0) {
      await client.query(`
        INSERT INTO addresses (id, user_id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address, label, is_default, delivery_instructions)
        VALUES (
          uuid_generate_v4(), $1, '22 Bree St', 'Cape Town', '8001', 'ZAF', -33.9180, 18.4190,
          ST_SetSRID(ST_Point(18.4190, -33.9180), 4326), '22 BREE ST, CAPE TOWN, 8001, ZAF',
          'Work', false, 'Leave at front security desk for John'
        );
      `, [customerUserId]);
    }

    // 3. Synthetic Rep User & Profile (Marcus Rivera)
    const repEmail = 'marcus.rep@tuxi-seed.dev';
    let repUser = await client.query('SELECT id FROM users WHERE email = $1;', [repEmail]);
    let repUserId: string;
    if (repUser.rows.length === 0) {
      const passHash = await bcrypt.hash('SecurePassword123!', 10);
      const insRepUser = await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active)
        VALUES (uuid_generate_v4(), $1, $2, 'Marcus', 'Rivera', '+27829876543', true)
        RETURNING id;
      `, [repEmail, passHash]);
      repUserId = insRepUser.rows[0].id;

      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'TUXI_REP');
      `, [repUserId]);

      const repAddr = await client.query(`
        INSERT INTO addresses (id, user_id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address)
        VALUES (
          uuid_generate_v4(), $1, '10 Kloof St', 'Cape Town', '8001', 'ZAF', -33.9249, 18.4241,
          ST_SetSRID(ST_Point(18.4241, -33.9249), 4326), '10 KLOOF ST, CAPE TOWN, 8001, ZAF'
        )
        RETURNING id;
      `, [repUserId]);

      const insRepProf = await client.query(`
        INSERT INTO rep_profiles (id, user_id, birth_date, has_mobile_phone, has_mobile_data, has_own_transport, verification_status, hub_address_id, territory_radius_km)
        VALUES (uuid_generate_v4(), $1, '1990-04-12', true, true, true, 'VERIFIED', $2, 20.000)
        RETURNING id;
      `, [repUserId, repAddr.rows[0].id]);

      await client.query(`
        INSERT INTO rep_territories (id, rep_profile_id, hub_latitude, hub_longitude, hub_geom, radius_meters)
        VALUES (uuid_generate_v4(), $1, -33.9249, 18.4241, ST_SetSRID(ST_Point(18.4241, -33.9249), 4326), 20000.00);
      `, [insRepProf.rows[0].id]);
    } else {
      repUserId = repUser.rows[0].id;
    }

    const repProfRow = await client.query('SELECT id FROM rep_profiles WHERE user_id = $1;', [repUserId]);
    const repProfileId = repProfRow.rows[0]?.id;

    // 4. Approved Eats Business 1: "Kloof Street Bistro" (WITH Rep Attribution)
    let biz1 = await client.query("SELECT id FROM businesses WHERE tax_or_vat_id = 'VAT-SEED-EATS-001';");
    let biz1Id: string;
    if (biz1.rows.length === 0) {
      const bAddr = await client.query(`
        INSERT INTO addresses (id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address)
        VALUES (
          uuid_generate_v4(), '45 Kloof St', 'Cape Town', '8001', 'ZAF', -33.9300, 18.4200,
          ST_SetSRID(ST_Point(18.4200, -33.9300), 4326), '45 KLOOF ST, CAPE TOWN, 8001, ZAF'
        )
        RETURNING id;
      `);

      const insBiz1 = await client.query(`
        INSERT INTO businesses (id, type, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone, address_id, latitude, longitude, geom, status, is_active, image_url, banner_url, opening_hours)
        VALUES (
          uuid_generate_v4(), 'EATS', 'Kloof Street Bistro', 'Kloof Culinary Group (Pty) Ltd',
          'VAT-SEED-EATS-001', 'orders@kloofbistro.co.za', '+27214240001', $1, -33.9300, 18.4200,
          ST_SetSRID(ST_Point(18.4200, -33.9300), 4326), 'APPROVED', true,
          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
          'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
          '{"mon_fri": "11:00-22:00", "sat_sun": "10:00-23:00"}'::jsonb
        )
        RETURNING id;
      `, [bAddr.rows[0].id]);
      biz1Id = insBiz1.rows[0].id;

      await client.query(`
        INSERT INTO eats_profiles (id, business_id, cuisine_types, prep_time_minutes, price_rating)
        VALUES (uuid_generate_v4(), $1, ARRAY['Italian', 'Gourmet Pizza', 'Handmade Pasta'], 25, '$$');
      `, [biz1Id]);

      // Rep Attribution for Business 1
      if (repProfileId) {
        await client.query(`
          INSERT INTO rep_business_attributions (id, rep_profile_id, business_id, distance_at_origination_km, attribution_status)
          VALUES (uuid_generate_v4(), $1, $2, 0.681, 'ACTIVE')
          ON CONFLICT (business_id) DO NOTHING;
        `, [repProfileId, biz1Id]);
      }

      // Categories and Items for Business 1
      const catPizza = await client.query(`
        INSERT INTO menu_categories (id, business_id, name, sort_order)
        VALUES (uuid_generate_v4(), $1, 'Artisan Pizzas', 1)
        RETURNING id;
      `, [biz1Id]);

      const itemTruffle = await client.query(`
        INSERT INTO menu_items (id, category_id, name, description, base_price_cents, is_available, image_url)
        VALUES (
          uuid_generate_v4(), $1, 'Truffle & Wild Mushroom Pizza',
          'Fior di latte mozzarella, black truffle cream, roasted king oyster mushrooms, thyme, parmesan shavings',
          16500, true, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80'
        )
        RETURNING id;
      `, [catPizza.rows[0].id]);

      // Modifiers for Truffle Pizza
      await client.query(`
        INSERT INTO menu_item_modifiers (id, menu_item_id, group_name, name, extra_price_cents)
        VALUES 
          (uuid_generate_v4(), $1, 'Cheese Options', 'Extra Fior di Latte Cheese', 2500),
          (uuid_generate_v4(), $1, 'Base Options', 'Gluten-Free Base', 3000),
          (uuid_generate_v4(), $1, 'Finishing Touches', 'Fresh Basil & Garlic Chili Infusion', 1000);
      `, [itemTruffle.rows[0].id]);

      await client.query(`
        INSERT INTO menu_items (id, category_id, name, description, base_price_cents, is_available, image_url)
        VALUES 
          (uuid_generate_v4(), $1, 'Classic Margherita DOP', 'San Marzano tomatoes, buffalo mozzarella, fresh basil, extra virgin olive oil', 12500, true, 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?auto=format&fit=crop&w=600&q=80'),
          (uuid_generate_v4(), $1, 'Seasonal White Truffle Special', 'Ultra-rare Alba white truffle on fontina cheese base (limited season)', 24000, false, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80');
      `, [catPizza.rows[0].id]);

      const catPasta = await client.query(`
        INSERT INTO menu_categories (id, business_id, name, sort_order)
        VALUES (uuid_generate_v4(), $1, 'Fresh Pastas', 2)
        RETURNING id;
      `, [biz1Id]);

      await client.query(`
        INSERT INTO menu_items (id, category_id, name, description, base_price_cents, is_available, image_url)
        VALUES 
          (uuid_generate_v4(), $1, 'Slow-Cooked Beef Ragù Pappardelle', '12-hour braised beef short rib in Chianti reduction with fresh egg pappardelle', 15500, true, 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=600&q=80'),
          (uuid_generate_v4(), $1, 'Wild Garlic & Prawn Tagliolini', 'Handmade ribbons with pan-seared black tiger prawns, cherry tomatoes, white wine and parsley', 17000, true, 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80');
      `, [catPasta.rows[0].id]);
    } else {
      biz1Id = biz1.rows[0].id;
    }

    // 5. Approved Eats Business 2: "Table Mountain Burgers" (WITHOUT Rep Attribution)
    let biz2 = await client.query("SELECT id FROM businesses WHERE tax_or_vat_id = 'VAT-SEED-EATS-002';");
    if (biz2.rows.length === 0) {
      const bAddr2 = await client.query(`
        INSERT INTO addresses (id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address)
        VALUES (
          uuid_generate_v4(), '12 Rheede St', 'Cape Town', '8001', 'ZAF', -33.9280, 18.4180,
          ST_SetSRID(ST_Point(18.4180, -33.9280), 4326), '12 RHEEDE ST, CAPE TOWN, 8001, ZAF'
        )
        RETURNING id;
      `);

      const insBiz2 = await client.query(`
        INSERT INTO businesses (id, type, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone, address_id, latitude, longitude, geom, status, is_active, image_url, banner_url, opening_hours)
        VALUES (
          uuid_generate_v4(), 'EATS', 'Table Mountain Burgers', 'Table Mountain Hospitality Ltd',
          'VAT-SEED-EATS-002', 'orders@tmburgers.co.za', '+27214240002', $1, -33.9280, 18.4180,
          ST_SetSRID(ST_Point(18.4180, -33.9280), 4326), 'APPROVED', true,
          'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
          'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80',
          '{"all_days": "11:30-22:30"}'::jsonb
        )
        RETURNING id;
      `, [bAddr2.rows[0].id]);
      const biz2Id = insBiz2.rows[0].id;

      await client.query(`
        INSERT INTO eats_profiles (id, business_id, cuisine_types, prep_time_minutes, price_rating)
        VALUES (uuid_generate_v4(), $1, ARRAY['Burgers', 'Craft Beer', 'Wings'], 20, '$');
      `, [biz2Id]);

      const catBurger = await client.query(`
        INSERT INTO menu_categories (id, business_id, name, sort_order)
        VALUES (uuid_generate_v4(), $1, 'Signature Smashburgers', 1)
        RETURNING id;
      `, [biz2Id]);

      const itemWagyu = await client.query(`
        INSERT INTO menu_items (id, category_id, name, description, base_price_cents, is_available, image_url)
        VALUES (
          uuid_generate_v4(), $1, 'The Karoo Wagyu Smashburger',
          '200g grass-fed Karoo wagyu beef patty, double melted cheddar, caramelized onions, house pickles, smoked brioche bun',
          13500, true, 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=600&q=80'
        )
        RETURNING id;
      `, [catBurger.rows[0].id]);

      await client.query(`
        INSERT INTO menu_item_modifiers (id, menu_item_id, group_name, name, extra_price_cents)
        VALUES 
          (uuid_generate_v4(), $1, 'Toppings', 'Smoked Maple Bacon Strips', 2000),
          (uuid_generate_v4(), $1, 'Sides', 'Crispy Golden Onion Rings', 1500),
          (uuid_generate_v4(), $1, 'Sauces', 'Truffle Mayo Dip', 1200);
      `, [itemWagyu.rows[0].id]);

      await client.query(`
        INSERT INTO menu_items (id, category_id, name, description, base_price_cents, is_available, image_url)
        VALUES 
          (uuid_generate_v4(), $1, 'Crispy Peri-Peri Chicken Burger', 'Buttermilk fried chicken breast drenched in flame-grilled peri-peri glaze with crunchy slaw', 11500, true, 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=600&q=80');
      `, [catBurger.rows[0].id]);
    }

    // 6. Pending Eats Business: "Greenmarket Juice & Bowls" (PENDING_VERIFICATION - should be hidden)
    let bizPending = await client.query("SELECT id FROM businesses WHERE tax_or_vat_id = 'VAT-SEED-EATS-003';");
    if (bizPending.rows.length === 0) {
      const bAddr3 = await client.query(`
        INSERT INTO addresses (id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address)
        VALUES (
          uuid_generate_v4(), '8 Shortmarket St', 'Cape Town', '8001', 'ZAF', -33.9220, 18.4210,
          ST_SetSRID(ST_Point(18.4210, -33.9220), 4326), '8 SHORTMARKET ST, CAPE TOWN, 8001, ZAF'
        )
        RETURNING id;
      `);

      await client.query(`
        INSERT INTO businesses (id, type, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone, address_id, latitude, longitude, geom, status, is_active)
        VALUES (
          uuid_generate_v4(), 'EATS', 'Greenmarket Juice & Bowls', 'Greenmarket Organic (Pty) Ltd',
          'VAT-SEED-EATS-003', 'pending@greenmarket.co.za', '+27214240003', $1, -33.9220, 18.4210,
          ST_SetSRID(ST_Point(18.4210, -33.9220), 4326), 'PENDING_VERIFICATION', false
        );
      `, [bAddr3.rows[0].id]);
    }

    // 7. Suspended Eats Business: "Bree Street Smokehouse" (SUSPENDED - should be hidden)
    let bizSuspended = await client.query("SELECT id FROM businesses WHERE tax_or_vat_id = 'VAT-SEED-EATS-004';");
    if (bizSuspended.rows.length === 0) {
      const bAddr4 = await client.query(`
        INSERT INTO addresses (id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address)
        VALUES (
          uuid_generate_v4(), '80 Bree St', 'Cape Town', '8001', 'ZAF', -33.9210, 18.4190,
          ST_SetSRID(ST_Point(18.4190, -33.9210), 4326), '80 BREE ST, CAPE TOWN, 8001, ZAF'
        )
        RETURNING id;
      `);

      await client.query(`
        INSERT INTO businesses (id, type, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone, address_id, latitude, longitude, geom, status, is_active)
        VALUES (
          uuid_generate_v4(), 'EATS', 'Bree Street Smokehouse', 'Bree Smoke Co.',
          'VAT-SEED-EATS-004', 'info@breesmoke.co.za', '+27214240004', $1, -33.9210, 18.4190,
          ST_SetSRID(ST_Point(18.4190, -33.9210), 4326), 'SUSPENDED', false
        );
      `, [bAddr4.rows[0].id]);
    }

    await client.query('COMMIT;');
    console.log('[Seed] Phase 2A synthetic development data seeded successfully.');
    return { success: true };
  } catch (err: any) {
    await client.query('ROLLBACK;');
    console.error('[Seed Error]', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('seedEatsData.ts') || process.argv[1]?.endsWith('seedEatsData.js')) {
  seedPhase2AEatsData().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
