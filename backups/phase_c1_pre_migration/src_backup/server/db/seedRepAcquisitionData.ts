import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { postgresAdapter } from './postgres.js';

export async function seedPhase2DRepAcquisitionData() {
  const client = await postgresAdapter.pool.connect();
  try {
    console.log('[Seed 2D] Seeding Phase 2D synthetic Rep Acquisition data...');
    await client.query('BEGIN;');

    const testRepIds = [
      'a0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000011',
      'a0000000-0000-0000-0000-000000000012',
      'a0000000-0000-0000-0000-000000000013',
      'a0000000-0000-0000-0000-000000000014',
      'a0000000-0000-0000-0000-000000000015',
      'a0000000-0000-0000-0000-000000000098',
      'a0000000-0000-0000-0000-000000000099',
    ];

    // Clean up previous test artifacts for test idempotency
    const testBusinessNames = [
      'Unauthorized Cafe', 'No Terms Bakery', 'Paarl Eatery', 'Table Mountain Pizzeria',
      'Hijacked Pizzeria', 'Cape Botanicals Store', 'Consent Test Bistro', 'Unrelated Cafe',
      'Doc Security Diner', 'Hidden From Customer Cafe', 'Rep A Protected Wine Cellar',
      'Race Target Restaurant', 'Illegal Draft', 'Self Approve Test', 'Approved Pizza Co',
      'New Rep Hub', 'Original Gourmet Deli'
    ];

    await client.query(`
      DELETE FROM commission_ledger WHERE rep_profile_id IN (
        SELECT id FROM rep_profiles WHERE user_id = ANY($1::uuid[])
      ) OR order_id IN (
        SELECT id FROM orders WHERE order_number LIKE 'ORD-COMM-%' OR business_id IN (
          SELECT id FROM businesses WHERE name = ANY($2::text[])
        )
      );
    `, [testRepIds, testBusinessNames]);

    await client.query(`
      DELETE FROM orders WHERE order_number LIKE 'ORD-COMM-%' OR business_id IN (
        SELECT id FROM businesses WHERE name = ANY($1::text[])
      );
    `, [testBusinessNames]);

    await client.query(`
      DELETE FROM acquisition_documents WHERE uploader_id = ANY($1::uuid[]) OR acquisition_draft_id IN (
        SELECT id FROM business_acquisition_drafts WHERE rep_profile_id IN (
          SELECT id FROM rep_profiles WHERE user_id = ANY($1::uuid[])
        )
      );
    `, [testRepIds]);

    await client.query(`
      DELETE FROM business_owner_consents WHERE acquisition_draft_id IN (
        SELECT id FROM business_acquisition_drafts WHERE rep_profile_id IN (
          SELECT id FROM rep_profiles WHERE user_id = ANY($1::uuid[])
        )
      );
    `, [testRepIds]);

    await client.query(`
      UPDATE business_acquisition_drafts SET submitted_business_id = NULL WHERE rep_profile_id IN (
        SELECT id FROM rep_profiles WHERE user_id = ANY($1::uuid[])
      );
    `, [testRepIds]);

    await client.query(`
      DELETE FROM rep_business_attributions WHERE rep_profile_id IN (
        SELECT id FROM rep_profiles WHERE user_id = ANY($1::uuid[])
      ) OR business_id IN (
        SELECT id FROM businesses WHERE name = ANY($2::text[])
      );
    `, [testRepIds, testBusinessNames]);

    await client.query(`
      DELETE FROM business_acquisition_drafts WHERE rep_profile_id IN (
        SELECT id FROM rep_profiles WHERE user_id = ANY($1::uuid[])
      );
    `, [testRepIds]);

    await client.query(`
      DELETE FROM rep_territories WHERE rep_profile_id IN (
        SELECT id FROM rep_profiles WHERE user_id = ANY($1::uuid[])
      );
    `, [testRepIds]);

    await client.query('DELETE FROM rep_profiles WHERE user_id = ANY($1::uuid[]);', [testRepIds]);

    await client.query(`
      DELETE FROM businesses WHERE name = ANY($1::text[]);
    `, [testBusinessNames]);

    await client.query(`
      DELETE FROM addresses WHERE user_id = ANY($1::uuid[]);
    `, [testRepIds]);

    await client.query('DELETE FROM terms_acceptances WHERE user_id = ANY($1::uuid[]);', [testRepIds]);
    
    // Clean up dynamic test user created during tests
    await client.query(`
      DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE email = 'new_rep_test@example.com');
      DELETE FROM rep_territories WHERE rep_profile_id IN (
        SELECT id FROM rep_profiles WHERE user_id IN (SELECT id FROM users WHERE email = 'new_rep_test@example.com')
      );
      DELETE FROM rep_profiles WHERE user_id IN (SELECT id FROM users WHERE email = 'new_rep_test@example.com');
      DELETE FROM addresses WHERE user_id IN (SELECT id FROM users WHERE email = 'new_rep_test@example.com');
      DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = 'new_rep_test@example.com');
      DELETE FROM users WHERE email = 'new_rep_test@example.com';
    `);

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('RepPassword123!', salt);

    // 1. Ensure current TUXI_REP terms version exists and clean up test versions
    await client.query("DELETE FROM terms_acceptances WHERE terms_version_id IN (SELECT id FROM terms_versions WHERE version_tag != 'v2026.2' AND target_role = 'TUXI_REP');");
    await client.query("DELETE FROM terms_versions WHERE version_tag != 'v2026.2' AND target_role = 'TUXI_REP';");
    await client.query("UPDATE terms_versions SET is_current = true WHERE version_tag = 'v2026.2' AND target_role = 'TUXI_REP';");

    let termsRes = await client.query(`
      SELECT id, version_tag, content_hash FROM terms_versions 
      WHERE target_role = 'TUXI_REP' AND is_current = true 
      ORDER BY published_at DESC LIMIT 1;
    `);

    let currentTermsId: string;
    let currentContentHash: string;
    if (termsRes.rows.length === 0) {
      const insTerms = await client.query(`
        INSERT INTO terms_versions (id, target_role, version_tag, title, content_hash, full_text, is_current)
        VALUES (uuid_generate_v4(), 'TUXI_REP', 'v2026.2', 'TUXI Rep Terms v2026.2', 'hash-v2026.2', 'Official TUXI Rep Terms and Conditions...', true)
        RETURNING id, content_hash;
      `);
      currentTermsId = insTerms.rows[0].id;
      currentContentHash = insTerms.rows[0].content_hash;
    } else {
      currentTermsId = termsRes.rows[0].id;
      currentContentHash = termsRes.rows[0].content_hash;
    }

    // 2. Synthetic Rep Users
    const reps = [
      { id: 'a0000000-0000-0000-0000-000000000001', email: 'rep_alice@example.com', name: 'Alice', lat: -33.9249, lon: 18.4241 }, // Cape Town Kloof St Hub
      { id: 'a0000000-0000-0000-0000-000000000002', email: 'rep_bob@example.com', name: 'Bob', lat: -33.9180, lon: 18.4200 }, // Cape Town CBD Hub
      // 5 Race Reps
      { id: 'a0000000-0000-0000-0000-000000000011', email: 'race_rep_1@example.com', name: 'Racer One', lat: -33.9249, lon: 18.4241 },
      { id: 'a0000000-0000-0000-0000-000000000012', email: 'race_rep_2@example.com', name: 'Racer Two', lat: -33.9240, lon: 18.4230 },
      { id: 'a0000000-0000-0000-0000-000000000013', email: 'race_rep_3@example.com', name: 'Racer Three', lat: -33.9250, lon: 18.4250 },
      { id: 'a0000000-0000-0000-0000-000000000014', email: 'race_rep_4@example.com', name: 'Racer Four', lat: -33.9230, lon: 18.4220 },
      { id: 'a0000000-0000-0000-0000-000000000015', email: 'race_rep_5@example.com', name: 'Racer Five', lat: -33.9260, lon: 18.4260 },
    ];

    for (const r of reps) {
      // Create user
      await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
        VALUES ($1, $2, $3, $4, 'Rep', '+27820000001', true, true)
        ON CONFLICT (id) DO UPDATE SET is_active = true, email = $2;
      `, [r.id, r.email, hash, r.name]);

      // Assign TUXI_REP role
      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'TUXI_REP')
        ON CONFLICT DO NOTHING;
      `, [r.id]);

      // Create Hub Address
      const addrRes = await client.query(`
        INSERT INTO addresses (
          id, user_id, street_line_1, city, postal_code, country_code,
          latitude, longitude, geom, normalized_address
        )
        VALUES (
          uuid_generate_v4(), $1, '10 Kloof St', 'Cape Town', '8001', 'ZAF',
          $2::numeric, $3::numeric, ST_SetSRID(ST_Point($3::float8, $2::float8), 4326),
          '10 KLOOF ST, CAPE TOWN, 8001, ZAF'
        )
        RETURNING id;
      `, [r.id, r.lat, r.lon]);

      // Create Rep Profile
      const repProf = await client.query(`
        INSERT INTO rep_profiles (
          id, user_id, birth_date, has_mobile_phone, has_mobile_data,
          has_own_transport, transport_details, hub_address_id,
          territory_radius_km, verification_status
        )
        VALUES (
          uuid_generate_v4(), $1, '1992-05-15', true, true,
          true, 'Vehicle', $2, 20.000, 'VERIFIED'
        )
        RETURNING id;
      `, [r.id, addrRes.rows[0].id]);

      // Create Rep Territory
      await client.query(`
        INSERT INTO rep_territories (
          id, rep_profile_id, hub_latitude, hub_longitude, hub_geom, radius_meters
        )
        VALUES (
          uuid_generate_v4(), $1, $2::numeric, $3::numeric,
          ST_SetSRID(ST_Point($3::float8, $2::float8), 4326), 20000.00
        );
      `, [repProf.rows[0].id, r.lat, r.lon]);

      // Accept current terms with authoritative clickwrap record
      const auditEventId = crypto.randomUUID();
      await client.query(`
        INSERT INTO terms_acceptances (
          id, user_id, rep_profile_id, terms_version_id, content_hash,
          accepted_at, acceptance_method, ip_address, user_agent,
          audit_event_id, signature_hash, metadata
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4,
          NOW(), 'CLICKWRAP', '127.0.0.1', 'Vitest-2D',
          $5, $6, '{"role": "TUXI_REP", "acceptanceMethod": "CLICKWRAP", "affirmativeStatement": "I have read and accept the TUXI Rep Terms"}'::jsonb
        );
      `, [r.id, repProf.rows[0].id, currentTermsId, currentContentHash, auditEventId, `rec-${auditEventId}`]);
    }

    // 3. User with No Terms Accepted
    await client.query(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
      VALUES ('a0000000-0000-0000-0000-000000000098', 'no_terms_rep@example.com', $1, 'NoTerms', 'Rep', '+27820000098', true, true)
      ON CONFLICT (id) DO UPDATE SET is_active = true;
    `, [hash]);
    await client.query(`
      INSERT INTO user_roles (id, user_id, role)
      VALUES (uuid_generate_v4(), 'a0000000-0000-0000-0000-000000000098', 'TUXI_REP')
      ON CONFLICT DO NOTHING;
    `);
    const noTermsAddr = await client.query(`
      INSERT INTO addresses (id, user_id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address)
      VALUES (uuid_generate_v4(), 'a0000000-0000-0000-0000-000000000098', 'Hub', 'Cape Town', '8001', 'ZAF', -33.9249, 18.4241, ST_SetSRID(ST_Point(18.4241, -33.9249), 4326), 'HUB')
      RETURNING id;
    `);
    const noTermsProf = await client.query(`
      INSERT INTO rep_profiles (id, user_id, birth_date, has_mobile_phone, has_mobile_data, has_own_transport, hub_address_id, territory_radius_km, verification_status)
      VALUES (uuid_generate_v4(), 'a0000000-0000-0000-0000-000000000098', '1990-01-01', true, true, true, $1, 20.0, 'VERIFIED')
      RETURNING id;
    `, [noTermsAddr.rows[0].id]);
    await client.query(`
      INSERT INTO rep_territories (id, rep_profile_id, hub_latitude, hub_longitude, hub_geom, radius_meters)
      VALUES (uuid_generate_v4(), $1, -33.9249, 18.4241, ST_SetSRID(ST_Point(18.4241, -33.9249), 4326), 20000.0);
    `, [noTermsProf.rows[0].id]);

    // 4. Underage Candidate
    await client.query(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
      VALUES ('a0000000-0000-0000-0000-000000000099', 'underage_rep@example.com', $1, 'Junior', 'Rep', '+27820000099', true, true)
      ON CONFLICT (id) DO UPDATE SET is_active = true;
    `, [hash]);

    await client.query('COMMIT;');
    console.log('[Seed 2D] Phase 2D synthetic data seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('[Seed 2D Error]', err);
    throw err;
  } finally {
    client.release();
  }
}
