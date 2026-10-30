import pg from 'pg';

const { Pool } = pg;

export async function seedPhase2BShopData() {
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
  });

  const client = await pool.connect();
  console.log('[Seed] Seeding Phase 2B synthetic Shop & Inventory data...');

  try {
    await client.query('BEGIN;');

    // 1. Resolve or Create Rep Profile for Marcus Rivera
    let repProfileRes = await client.query(`
      SELECT rp.id 
      FROM rep_profiles rp
      JOIN users u ON u.id = rp.user_id
      WHERE u.email = 'rep@tuxi-seed.dev' OR u.email = 'rep1@example.com'
      LIMIT 1;
    `);

    let repProfileId: string;
    if (repProfileRes.rows.length === 0) {
      // Find any rep_profile
      const anyRep = await client.query('SELECT id FROM rep_profiles LIMIT 1;');
      if (anyRep.rows.length > 0) {
        repProfileId = anyRep.rows[0].id;
      } else {
        const insUser = await client.query(`
          INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active)
          VALUES (uuid_generate_v4(), 'marcus.rep@tuxi-seed.dev', '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890', 'Marcus', 'Rivera', '+27829990001', true)
          RETURNING id;
        `);
        const insProf = await client.query(`
          INSERT INTO rep_profiles (id, user_id, identity_number, tax_number, status)
          VALUES (uuid_generate_v4(), $1, '9001015000080', '9000123456', 'ACTIVE')
          RETURNING id;
        `, [insUser.rows[0].id]);
        repProfileId = insProf.rows[0].id;
      }
    } else {
      repProfileId = repProfileRes.rows[0].id;
    }

    // 2. Resolve Addresses for Shops
    const addr1Res = await client.query(`
      INSERT INTO addresses (id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address, label)
      VALUES (
        uuid_generate_v4(), '120 Kloof St', 'Cape Town', '8001', 'ZAF',
        -33.9310, 18.4190, ST_SetSRID(ST_Point(18.4190, -33.9310), 4326),
        '120 Kloof St, Cape Town', 'MediCare Pharmacy Store'
      )
      ON CONFLICT DO NOTHING
      RETURNING id;
    `);
    const addr1Id = addr1Res.rows.length > 0 ? addr1Res.rows[0].id : (await client.query("SELECT id FROM addresses WHERE street_line_1 = '120 Kloof St' LIMIT 1;")).rows[0].id;

    const addr2Res = await client.query(`
      INSERT INTO addresses (id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address, label)
      VALUES (
        uuid_generate_v4(), '65 Bree St', 'Cape Town', '8001', 'ZAF',
        -33.9220, 18.4195, ST_SetSRID(ST_Point(18.4195, -33.9220), 4326),
        '65 Bree St, Cape Town', 'Artisan Living Store'
      )
      ON CONFLICT DO NOTHING
      RETURNING id;
    `);
    const addr2Id = addr2Res.rows.length > 0 ? addr2Res.rows[0].id : (await client.query("SELECT id FROM addresses WHERE street_line_1 = '65 Bree St' LIMIT 1;")).rows[0].id;

    // 3. Shop 1: MediCare Essentials Pharmacy (APPROVED, ACTIVE, ATTRIBUTED)
    let shop1 = await client.query("SELECT id FROM businesses WHERE name = 'MediCare Essentials Pharmacy';");
    let shop1Id: string;
    if (shop1.rows.length === 0) {
      const ins = await client.query(`
        INSERT INTO businesses (
          id, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone,
          type, status, address_id, latitude, longitude, geom,
          image_url, banner_url, opening_hours, is_active
        )
        VALUES (
          uuid_generate_v4(), 'MediCare Essentials Pharmacy', 'MediCare Retail Holdings (Pty) Ltd', '4120987654',
          'store@medicare-essentials.co.za', '+27214241122',
          'SHOP', 'APPROVED', $1, -33.9310, 18.4190, ST_SetSRID(ST_Point(18.4190, -33.9310), 4326),
          'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=600&q=80',
          'https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=1200&q=80',
          '{"monday": "08:00 - 20:00", "tuesday": "08:00 - 20:00", "wednesday": "08:00 - 20:00", "thursday": "08:00 - 20:00", "friday": "08:00 - 20:00", "saturday": "09:00 - 18:00", "sunday": "09:00 - 14:00"}'::jsonb,
          true
        )
        RETURNING id;
      `, [addr1Id]);
      shop1Id = ins.rows[0].id;

      await client.query(`
        INSERT INTO shop_profiles (id, business_id, store_category, fulfillment_mode)
        VALUES (uuid_generate_v4(), $1, 'Health & Pharmacy', 'shop_and_deliver')
        ON CONFLICT DO NOTHING;
      `, [shop1Id]);

      // Rep Attribution for Shop 1
      await client.query(`
        INSERT INTO rep_business_attributions (
          id, rep_profile_id, business_id, attribution_status, originated_at, distance_at_origination_km
        )
        VALUES (
          uuid_generate_v4(), $1, $2, 'ACTIVE', NOW(), 1.5
        )
        ON CONFLICT DO NOTHING;
      `, [repProfileId, shop1Id]);
    } else {
      shop1Id = shop1.rows[0].id;
    }

    // 4. Shop 2: Artisan Living & Pantry (APPROVED, ACTIVE, UNATTRIBUTED)
    let shop2 = await client.query("SELECT id FROM businesses WHERE name = 'Artisan Living & Pantry';");
    let shop2Id: string;
    if (shop2.rows.length === 0) {
      const ins = await client.query(`
        INSERT INTO businesses (
          id, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone,
          type, status, address_id, latitude, longitude, geom,
          image_url, banner_url, opening_hours, is_active
        )
        VALUES (
          uuid_generate_v4(), 'Artisan Living & Pantry', 'Artisan Goods & Grocers CC', '4987654321',
          'hello@artisanliving.co.za', '+27214223344',
          'SHOP', 'APPROVED', $1, -33.9220, 18.4195, ST_SetSRID(ST_Point(18.4195, -33.9220), 4326),
          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
          'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80',
          '{"monday": "09:00 - 18:00", "tuesday": "09:00 - 18:00", "wednesday": "09:00 - 18:00", "thursday": "09:00 - 18:00", "friday": "09:00 - 18:00", "saturday": "09:00 - 17:00", "sunday": "10:00 - 15:00"}'::jsonb,
          true
        )
        RETURNING id;
      `, [addr2Id]);
      shop2Id = ins.rows[0].id;

      await client.query(`
        INSERT INTO shop_profiles (id, business_id, store_category, fulfillment_mode)
        VALUES (uuid_generate_v4(), $1, 'Home & Groceries', 'merchant_pack')
        ON CONFLICT DO NOTHING;
      `, [shop2Id]);
    } else {
      shop2Id = shop2.rows[0].id;
    }

    // 5. Shop 3: Green Cape Organic Grocers (PENDING_VERIFICATION, INACTIVE)
    let shop3 = await client.query("SELECT id FROM businesses WHERE name = 'Green Cape Organic Grocers';");
    if (shop3.rows.length === 0) {
      await client.query(`
        INSERT INTO businesses (
          id, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone,
          type, status, address_id, latitude, longitude, geom, opening_hours, is_active
        )
        VALUES (
          uuid_generate_v4(), 'Green Cape Organic Grocers', 'Green Cape Organics (Pty) Ltd', '4550123987',
          'info@greencapeorganics.co.za', '+27214299887',
          'SHOP', 'PENDING_VERIFICATION', $1, -33.9240, 18.4200, ST_SetSRID(ST_Point(18.4200, -33.9240), 4326),
          '{"monday": "09:00 - 17:00"}'::jsonb, false
        );
      `, [addr1Id]);
    }

    // 6. Shop 4: Harbour Bay Convenience (SUSPENDED, INACTIVE)
    let shop4 = await client.query("SELECT id FROM businesses WHERE name = 'Harbour Bay Convenience';");
    if (shop4.rows.length === 0) {
      await client.query(`
        INSERT INTO businesses (
          id, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone,
          type, status, address_id, latitude, longitude, geom, opening_hours, is_active
        )
        VALUES (
          uuid_generate_v4(), 'Harbour Bay Convenience', 'Harbour Bay QuickStop CC', '4660987123',
          'admin@harbourbayconvenience.co.za', '+27214288776',
          'SHOP', 'SUSPENDED', $1, -33.9250, 18.4210, ST_SetSRID(ST_Point(18.4210, -33.9250), 4326),
          '{"monday": "07:00 - 23:00"}'::jsonb, false
        );
      `, [addr2Id]);
    }

    // 7. Seed Shop Products & Inventory for Shop 1 (MediCare Essentials)
    // Product 1: Normal Product
    let p1 = await client.query("SELECT id FROM products WHERE sku = 'MED-VITC-1000';");
    let p1Id: string;
    if (p1.rows.length === 0) {
      const insP = await client.query(`
        INSERT INTO products (
          id, business_id, sku, name, description, category, price_cents, is_on_sale, is_available, is_active
        )
        VALUES (
          uuid_generate_v4(), $1, 'MED-VITC-1000', 'Cold & Flu Defense Vitamin C 1000mg',
          'High potency buffered ascorbic acid with citrus bioflavonoids for immune support. 60 capsules.',
          'Vitamins & Supplements', 14500, false, true, true
        )
        RETURNING id;
      `, [shop1Id]);
      p1Id = insP.rows[0].id;

      // Inventory: 50 units
      await client.query(`
        INSERT INTO inventory (id, product_id, quantity_available, reserved_quantity)
        VALUES (uuid_generate_v4(), $1, 50, 0);
      `, [p1Id]);
    } else {
      p1Id = p1.rows[0].id;
      await client.query(`
        UPDATE inventory SET quantity_available = 50, reserved_quantity = 0
        WHERE product_id = $1 AND variant_id IS NULL;
      `, [p1Id]);
    }

    // Product 2: Standard Product 2
    let p2 = await client.query("SELECT id FROM products WHERE sku = 'MED-FAK-01';");
    if (p2.rows.length === 0) {
      const insP = await client.query(`
        INSERT INTO products (
          id, business_id, sku, name, description, category, price_cents, is_on_sale, is_available, is_active
        )
        VALUES (
          uuid_generate_v4(), $1, 'MED-FAK-01', 'Emergency Travel First Aid Kit',
          'Comprehensive 48-piece first aid kit with sterile dressings, antiseptic spray, and shears.',
          'First Aid', 29000, false, true, true
        )
        RETURNING id;
      `, [shop1Id]);
      await client.query(`
        INSERT INTO inventory (id, product_id, quantity_available, reserved_quantity)
        VALUES (uuid_generate_v4(), $1, 20, 0);
      `, [insP.rows[0].id]);
    } else {
      await client.query(`
        UPDATE inventory SET quantity_available = 20, reserved_quantity = 0
        WHERE product_id = $1 AND variant_id IS NULL;
      `, [p2.rows[0].id]);
    }

    // 8. Seed Shop Products & Inventory for Shop 2 (Artisan Living & Pantry)
    // Product 3: Sale-Priced Product
    let p3 = await client.query("SELECT id FROM products WHERE sku = 'PAN-HONEY-500';");
    if (p3.rows.length === 0) {
      const insP = await client.query(`
        INSERT INTO products (
          id, business_id, sku, name, description, category, price_cents, sale_price_cents, is_on_sale, is_available, is_active
        )
        VALUES (
          uuid_generate_v4(), $1, 'PAN-HONEY-500', 'Organic Raw Fynbos Honey 500g',
          'Single-origin unfiltered raw fynbos honey cold-harvested in the Western Cape floral kingdom.',
          'Pantry & Groceries', 12000, 9500, true, true, true
        )
        RETURNING id;
      `, [shop2Id]);
      await client.query(`
        INSERT INTO inventory (id, product_id, quantity_available, reserved_quantity)
        VALUES (uuid_generate_v4(), $1, 25, 0);
      `, [insP.rows[0].id]);
    } else {
      await client.query(`
        UPDATE inventory SET quantity_available = 25, reserved_quantity = 0
        WHERE product_id = $1 AND variant_id IS NULL;
      `, [p3.rows[0].id]);
    }

    // Product 4: Unavailable Product (Sold Out)
    let p4 = await client.query("SELECT id FROM products WHERE sku = 'PAN-SAFF-OIL';");
    if (p4.rows.length === 0) {
      const insP = await client.query(`
        INSERT INTO products (
          id, business_id, sku, name, description, category, price_cents, is_on_sale, is_available, is_active
        )
        VALUES (
          uuid_generate_v4(), $1, 'PAN-SAFF-OIL', 'Limited Edition Saffron Infused Olive Oil',
          'Cold pressed extra virgin olive oil steeped with organic Persian saffron threads.',
          'Gourmet Oils', 34000, false, false, true
        )
        RETURNING id;
      `, [shop2Id]);
      await client.query(`
        INSERT INTO inventory (id, product_id, quantity_available, reserved_quantity)
        VALUES (uuid_generate_v4(), $1, 0, 0);
      `, [insP.rows[0].id]);
    }

    // Product 5: Product with Variants (Towel with Size/Color)
    let p5 = await client.query("SELECT id FROM products WHERE sku = 'ART-TOWL';");
    let p5Id: string;
    if (p5.rows.length === 0) {
      const insP = await client.query(`
        INSERT INTO products (
          id, business_id, sku, name, description, category, price_cents, is_on_sale, is_available, is_active
        )
        VALUES (
          uuid_generate_v4(), $1, 'ART-TOWL', 'Premium Egyptian Cotton Bath Towel',
          '700 GSM plush combed long-staple cotton bath linen with ribbed dobby border.',
          'Bed & Bath', 28000, false, true, true
        )
        RETURNING id;
      `, [shop2Id]);
      p5Id = insP.rows[0].id;

      // Variant 1: Navy Standard Bath (stock 12)
      const v1 = await client.query(`
        INSERT INTO product_variants (
          id, product_id, variant_sku, variant_name, price_delta_cents, attributes, is_available
        )
        VALUES (
          uuid_generate_v4(), $1, 'ART-TOWL-NV-STD', 'Navy / Standard Bath (70x140cm)',
          0, '{"color": "Navy", "size": "Standard"}'::jsonb, true
        )
        RETURNING id;
      `, [p5Id]);
      await client.query(`
        INSERT INTO inventory (id, product_id, variant_id, quantity_available, reserved_quantity)
        VALUES (uuid_generate_v4(), $1, $2, 12, 0);
      `, [p5Id, v1.rows[0].id]);

      // Variant 2: Charcoal Bath Sheet (R70 extra, stock 8)
      const v2 = await client.query(`
        INSERT INTO product_variants (
          id, product_id, variant_sku, variant_name, price_delta_cents, attributes, is_available
        )
        VALUES (
          uuid_generate_v4(), $1, 'ART-TOWL-CH-SHT', 'Charcoal / Bath Sheet (100x150cm)',
          7000, '{"color": "Charcoal", "size": "Sheet"}'::jsonb, true
        )
        RETURNING id;
      `, [p5Id]);
      await client.query(`
        INSERT INTO inventory (id, product_id, variant_id, quantity_available, reserved_quantity)
        VALUES (uuid_generate_v4(), $1, $2, 8, 0);
      `, [p5Id, v2.rows[0].id]);

      // Variant 3: Sage Guest Hand (R50 less, stock 0)
      const v3 = await client.query(`
        INSERT INTO product_variants (
          id, product_id, variant_sku, variant_name, price_delta_cents, attributes, is_available
        )
        VALUES (
          uuid_generate_v4(), $1, 'ART-TOWL-SG-HND', 'Sage / Guest Hand (50x90cm)',
          -5000, '{"color": "Sage", "size": "Hand"}'::jsonb, false
        )
        RETURNING id;
      `, [p5Id]);
      await client.query(`
        INSERT INTO inventory (id, product_id, variant_id, quantity_available, reserved_quantity)
        VALUES (uuid_generate_v4(), $1, $2, 0, 0);
      `, [p5Id, v3.rows[0].id]);
    } else {
      p5Id = p5.rows[0].id;
      // Reset towel variants
      const vRows = await client.query('SELECT id, variant_sku FROM product_variants WHERE product_id = $1;', [p5Id]);
      for (const v of vRows.rows) {
        const qty = v.variant_sku === 'ART-TOWL-NV-STD' ? 12 : (v.variant_sku === 'ART-TOWL-CH-SHT' ? 8 : 0);
        await client.query('UPDATE inventory SET quantity_available = $1, reserved_quantity = 0 WHERE variant_id = $2;', [qty, v.id]);
      }
    }

    // Product 6: Final Unit Product for Concurrency Testing (stock = 1)
    let p6 = await client.query("SELECT id FROM products WHERE sku = 'CONCUR-PRESS-01';");
    if (p6.rows.length === 0) {
      const insP = await client.query(`
        INSERT INTO products (
          id, business_id, sku, name, description, category, price_cents, is_on_sale, is_available, is_active
        )
        VALUES (
          uuid_generate_v4(), $1, 'CONCUR-PRESS-01', 'Artisan Ceramic French Press (Limited Batch)',
          'Handmade stoneware body with precision double-micro mesh stainless steel plunger. Exactly 1 unit made.',
          'Coffee & Tea', 45000, false, true, true
        )
        RETURNING id;
      `, [shop2Id]);
      await client.query(`
        INSERT INTO inventory (id, product_id, quantity_available, reserved_quantity)
        VALUES (uuid_generate_v4(), $1, 1, 0);
      `, [insP.rows[0].id]);
    } else {
      await client.query(`
        UPDATE inventory SET quantity_available = 1, reserved_quantity = 0
        WHERE product_id = $1 AND variant_id IS NULL;
      `, [p6.rows[0].id]);
    }

    await client.query('COMMIT;');
    console.log('[Seed] Phase 2B synthetic development data seeded successfully.');
  } catch (err: any) {
    await client.query('ROLLBACK;');
    console.error('[Seed Error in Phase 2B]', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
