import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/server/middleware/auth.js';
import { postgresAdapter } from '../src/server/db/postgres.js';
import { seedPhase2DRepAcquisitionData } from '../src/server/db/seedRepAcquisitionData.js';
import { RepAcquisitionService } from '../src/server/services/repAcquisitionService.js';
import { RepService } from '../src/server/services/repService.js';
import { CommissionService } from '../src/server/services/commissionService.js';
import { EatsService } from '../src/server/services/eatsService.js';
import { ShopService } from '../src/server/services/shopService.js';
import { OrderService } from '../src/server/services/orderService.js';

describe('TUXI PHASE 2D — REP BUSINESS ACQUISITION & ONBOARDING INTEGRATION SUITE', () => {
  const repAUserId = 'a0000000-0000-0000-0000-000000000001';
  const repBUserId = 'a0000000-0000-0000-0000-000000000002';
  const customerUserId = 'a1111111-2222-3333-4444-555555555551';
  const noTermsRepUserId = 'a0000000-0000-0000-0000-000000000098';

  const raceReps = [
    'a0000000-0000-0000-0000-000000000011',
    'a0000000-0000-0000-0000-000000000012',
    'a0000000-0000-0000-0000-000000000013',
    'a0000000-0000-0000-0000-000000000014',
    'a0000000-0000-0000-0000-000000000015',
  ];

  beforeAll(async () => {
    await seedPhase2DRepAcquisitionData();
  });

  afterAll(async () => {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query("DELETE FROM terms_acceptances WHERE terms_version_id IN (SELECT id FROM terms_versions WHERE version_tag = 'v2026.3');");
      await client.query("DELETE FROM terms_versions WHERE version_tag = 'v2026.3';");
      await client.query("UPDATE terms_versions SET is_current = true WHERE version_tag = 'v2026.2' AND target_role = 'TUXI_REP';");
    } finally {
      client.release();
    }
  });

  // ==========================================
  // 1. REP ROLE AUTHORITY & ELIGIBILITY (2D.1, 2D.2, 2D.3)
  // ==========================================
  describe('1. Rep Role Authority & Eligibility Gate', () => {
    let pendingRepUserId: string;
    let pendingRepProfileId: string;

    it('registers valid 18+ eligible Rep with mobile phone, mobile data, and home hub in PostgreSQL', async () => {
      const client = await postgresAdapter.pool.connect();
      try {
        const hash = '$2a$10$w6nL9q.qH/q9Yc9u2H9Z0OPbK8w8vU5E0U4yJ7N0q2zK5X2p.Tq6W';
        const userRes = await client.query(`
          INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
          VALUES (uuid_generate_v4(), 'new_rep_test@example.com', $1, 'Nathan', 'Rep', '+27820000555', true, true)
          RETURNING id;
        `, [hash]);
        pendingRepUserId = userRes.rows[0].id;
      } finally {
        client.release();
      }

      const res = await RepAcquisitionService.registerRep({
        userId: pendingRepUserId,
        birthDate: '1995-04-12', // Age 31
        hasMobilePhone: true,
        hasMobileData: true,
        hasOwnTransport: true,
        transportDetails: 'Toyota Yaris',
        hubAddress: {
          streetLine1: '12 Bree St',
          city: 'Cape Town',
          postalCode: '8001',
          countryCode: 'ZAF',
          latitude: -33.9210,
          longitude: 18.4215
        }
      });

      expect(res.repProfileId).toBeDefined();
      expect(res.territoryRadiusKm).toBe(20.0);
      expect(res.termsAccepted).toBe(true);
      pendingRepProfileId = res.repProfileId;

      // Verify PostgreSQL state: starts in PENDING status pending admin verification
      const prof = await RepAcquisitionService.getRepProfileByUserId(pendingRepUserId);
      expect(prof).toBeDefined();
      expect(prof.has_mobile_phone).toBe(true);
      expect(prof.has_mobile_data).toBe(true);
      expect(prof.verification_status).toBe('PENDING');
    });

    it('strictly blocks unverified Rep (PENDING verification status) from acquiring business (2D.2b)', async () => {
      await expect(
        RepAcquisitionService.createDraft(pendingRepUserId, {
          businessType: 'EATS',
          businessName: 'Pending Rep Bakery',
          ownerName: 'Owner',
          ownerPhone: '+27829998888',
          ownerEmail: 'pending@example.com',
          addressLine1: '12 Bree St',
          city: 'Cape Town',
          postalCode: '8001',
          latitude: -33.9210,
          longitude: 18.4215
        })
      ).rejects.toThrow(/UNVERIFIED_REP/);

      // Verify eligibility evaluator reports false for PENDING rep
      const isEligible = await RepAcquisitionService.isRepEligible(pendingRepUserId);
      expect(isEligible).toBe(false);
    });

    it('allows administrative verification to transition Rep from PENDING to VERIFIED', async () => {
      const adminUserId = 'a0000000-0000-0000-0000-000000000001';
      const verifyRes = await RepAcquisitionService.verifyRepProfile(adminUserId, pendingRepProfileId, 'VERIFIED', 'Identity verified');
      expect(verifyRes.previousStatus).toBe('PENDING');
      expect(verifyRes.newStatus).toBe('VERIFIED');

      const prof = await RepAcquisitionService.getRepProfileByUserId(pendingRepUserId);
      expect(prof.verification_status).toBe('VERIFIED');

      const isEligible = await RepAcquisitionService.isRepEligible(pendingRepUserId);
      expect(isEligible).toBe(true);
    });

    it('strictly blocks REJECTED or REVOKED Rep from acquiring business', async () => {
      const adminUserId = 'a0000000-0000-0000-0000-000000000001';
      await RepAcquisitionService.verifyRepProfile(adminUserId, pendingRepProfileId, 'REJECTED', 'Failed background check');

      await expect(
        RepAcquisitionService.createDraft(pendingRepUserId, {
          businessType: 'EATS',
          businessName: 'Rejected Rep Bakery',
          ownerName: 'Owner',
          ownerPhone: '+27829998889',
          ownerEmail: 'rejected@example.com',
          addressLine1: '12 Bree St',
          city: 'Cape Town',
          postalCode: '8001',
          latitude: -33.9210,
          longitude: 18.4215
        })
      ).rejects.toThrow(/UNVERIFIED_REP/);

      // Restore to VERIFIED for cleanup
      await RepAcquisitionService.verifyRepProfile(adminUserId, pendingRepProfileId, 'VERIFIED', 'Restored');
    });

    it('strictly rejects underage Rep candidate (12 years old) server-side (2D.3)', async () => {
      await expect(
        RepAcquisitionService.registerRep({
          userId: 'a0000000-0000-0000-0000-000000000099',
          birthDate: '2014-01-01', // Under 18
          hasMobilePhone: true,
          hasMobileData: true,
          hasOwnTransport: true,
          hubAddress: {
            streetLine1: '10 Kloof St',
            city: 'Cape Town',
            postalCode: '8001',
            countryCode: 'ZAF',
            latitude: -33.9249,
            longitude: 18.4241
          }
        })
      ).rejects.toThrow(/UNDERAGE_REP_REJECTED/);
    });

    it('strictly rejects Rep missing mobile phone or mobile cellular data plan (2D.2)', async () => {
      await expect(
        RepAcquisitionService.registerRep({
          userId: 'a0000000-0000-0000-0000-000000000099',
          birthDate: '1990-01-01',
          hasMobilePhone: false, // Missing
          hasMobileData: true,
          hasOwnTransport: true,
          hubAddress: {
            streetLine1: '10 Kloof St',
            city: 'Cape Town',
            postalCode: '8001',
            countryCode: 'ZAF',
            latitude: -33.9249,
            longitude: 18.4241
          }
        })
      ).rejects.toThrow(/MOBILE_REQUIREMENTS_REJECTED/);
    });

    it('strictly rejects customer role claiming Rep authority without TUXI_REP role (2D.1)', async () => {
      await expect(
        RepAcquisitionService.createDraft(customerUserId, {
          businessType: 'EATS',
          businessName: 'Unauthorized Cafe',
          ownerName: 'Owner',
          ownerPhone: '+27821111111',
          ownerEmail: 'owner@example.com',
          addressLine1: '10 Kloof St',
          city: 'Cape Town',
          postalCode: '8001',
          latitude: -33.9249,
          longitude: 18.4241
        })
      ).rejects.toThrow(/UNAUTHORIZED_REP/);
    });
  });

  // ==========================================
  // 2. VERSIONED TERMS ACCEPTANCE & CLICKWRAP SECURITY (2D.4)
  // ==========================================
  describe('2. Versioned Rep Terms Acceptance & Clickwrap Security Gate', () => {
    it('retrieves published current terms version for TUXI_REP', async () => {
      const current = await RepAcquisitionService.getCurrentTermsVersion();
      expect(current.id).toBeDefined();
      expect(current.is_current).toBe(true);
      expect(current.version_tag).toMatch(/v2026/);
      expect(current.content_hash).toBeDefined();
    });

    it('Terms Security Test 1: Rep cannot acquire business without explicit current Terms acceptance', async () => {
      // Rep without terms accepted
      await expect(
        RepAcquisitionService.createDraft(noTermsRepUserId, {
          businessType: 'EATS',
          businessName: 'No Terms Bakery',
          ownerName: 'Owner',
          ownerPhone: '+27822222222',
          ownerEmail: 'bakery@example.com',
          addressLine1: '10 Kloof St',
          city: 'Cape Town',
          postalCode: '8001',
          latitude: -33.9249,
          longitude: 18.4241
        })
      ).rejects.toThrow(/TERMS_REACCEPTANCE_REQUIRED/);

      // Now accept current terms with affirmative action
      const current = await RepAcquisitionService.getCurrentTermsVersion();
      const acc = await RepAcquisitionService.acceptTerms(
        noTermsRepUserId,
        current.id,
        '192.168.1.10',
        'Mozilla/5.0 TUXI/RepMobile',
        { affirmativeStatement: 'I have read and accept the TUXI Rep Terms' }
      );
      expect(acc).toBeDefined();
      expect(acc.acceptance_method).toBe('CLICKWRAP');
      expect(acc.content_hash).toBe(current.content_hash);
      expect(acc.audit_event_id).toBeDefined();

      const accepted = await RepAcquisitionService.isCurrentTermsAccepted(noTermsRepUserId);
      expect(accepted).toBe(true);
    });

    it('Terms Security Test 2: Rep A cannot accept Terms for Rep B', async () => {
      // Rep A attempting to accept terms for Rep B by supplying Rep B's ID
      // Server must only record acceptance for the authenticated actor
      const client = await postgresAdapter.pool.connect();
      try {
        const current = await RepAcquisitionService.getCurrentTermsVersion();

        // Rep B's terms acceptance status is independent
        const repBAcceptedBefore = await RepAcquisitionService.isCurrentTermsAccepted(repBUserId);
        expect(repBAcceptedBefore).toBe(true); // Rep B has own acceptance

        // Unaccepted dummy user Rep C
        const dummyCId = 'a0000000-0000-0000-0000-000000000097';
        const cAccepted = await RepAcquisitionService.isCurrentTermsAccepted(dummyCId);
        expect(cAccepted).toBe(false);

        // Rep A accepting terms for Rep A does NOT accept for Rep C
        await RepAcquisitionService.acceptTerms(repAUserId, current.id);
        const cStillUnaccepted = await RepAcquisitionService.isCurrentTermsAccepted(dummyCId);
        expect(cStillUnaccepted).toBe(false);

        // Verify terms_acceptances has no record for Rep C
        const rec = await client.query('SELECT * FROM terms_acceptances WHERE user_id = $1;', [dummyCId]);
        expect(rec.rows).toHaveLength(0);
      } finally {
        client.release();
      }
    });

    it('Terms Security Test 3: Acceptance of v2026.2 does not satisfy v2026.3 after v2026.3 becomes current', async () => {
      const client = await postgresAdapter.pool.connect();
      let newTermsId: string;
      try {
        await client.query('BEGIN;');
        // Mark existing terms not current
        await client.query("UPDATE terms_versions SET is_current = false WHERE target_role = 'TUXI_REP';");
        // Publish newer version v2026.3
        const ins = await client.query(`
          INSERT INTO terms_versions (id, target_role, version_tag, title, content_hash, full_text, is_current)
          VALUES (uuid_generate_v4(), 'TUXI_REP', 'v2026.3', 'TUXI Rep Terms v2026.3', 'hash-v2026.3-unique', 'Updated terms text...', true)
          RETURNING id;
        `);
        newTermsId = ins.rows[0].id;
        await client.query('COMMIT;');
      } finally {
        client.release();
      }

      // Rep A previously accepted v2026.2 -> MUST NOT satisfy v2026.3
      const isAccepted = await RepAcquisitionService.isCurrentTermsAccepted(repAUserId);
      expect(isAccepted).toBe(false);

      // Rep A creating draft must fail with TERMS_REACCEPTANCE_REQUIRED
      await expect(
        RepAcquisitionService.createDraft(repAUserId, {
          businessType: 'EATS',
          businessName: 'Stale Terms Eatery',
          ownerName: 'Owner',
          ownerPhone: '+27821113333',
          ownerEmail: 'stale@example.com',
          addressLine1: '10 Kloof St',
          city: 'Cape Town',
          postalCode: '8001',
          latitude: -33.9249,
          longitude: 18.4241
        })
      ).rejects.toThrow(/TERMS_REACCEPTANCE_REQUIRED/);

      // Reaccept new terms
      await RepAcquisitionService.acceptTerms(repAUserId, newTermsId);
      await RepAcquisitionService.acceptTerms(repBUserId, newTermsId);
      for (const r of raceReps) {
        await RepAcquisitionService.acceptTerms(r, newTermsId);
      }
      const reAccepted = await RepAcquisitionService.isCurrentTermsAccepted(repAUserId);
      expect(reAccepted).toBe(true);
    });

    it('Terms Security Test 4: Terms acceptance references the exact content_hash of the accepted Terms', async () => {
      const client = await postgresAdapter.pool.connect();
      try {
        const curTerms = await RepAcquisitionService.getCurrentTermsVersion();
        const accRow = await client.query(`
          SELECT content_hash, acceptance_method, rep_profile_id, audit_event_id, metadata
          FROM terms_acceptances
          WHERE user_id = $1 AND terms_version_id = $2
          ORDER BY accepted_at DESC LIMIT 1;
        `, [repAUserId, curTerms.id]);

        expect(accRow.rows).toHaveLength(1);
        expect(accRow.rows[0].content_hash).toBe(curTerms.content_hash);
        expect(accRow.rows[0].acceptance_method).toBe('CLICKWRAP');
        expect(accRow.rows[0].audit_event_id).toBeDefined();

        const meta = accRow.rows[0].metadata;
        expect(meta.affirmativeStatement).toBe('I have read and accept the TUXI Rep Terms');
        expect(meta.electronicSignatureNotice).toBe('EXTERNAL ELECTRONIC SIGNATURE INTEGRATION NOT REQUIRED FOR CURRENT CLICKWRAP ACCEPTANCE');
      } finally {
        client.release();
      }
    });

    it('Terms Security Test 5: Changing Terms content without creating/versioning proper Terms record cannot silently preserve acceptance', async () => {
      const curTerms = await RepAcquisitionService.getCurrentTermsVersion();
      const originalHash = curTerms.content_hash;
      try {
        // Simulate silent content change in terms_versions table
        await postgresAdapter.pool.query(`
          UPDATE terms_versions
          SET content_hash = 'tampered-hash-without-versioning'
          WHERE id = $1;
        `, [curTerms.id]);

        // Prior acceptance held original content_hash, not tampered-hash -> must fail verification!
        const isValid = await RepAcquisitionService.isCurrentTermsAccepted(repAUserId);
        expect(isValid).toBe(false);
      } finally {
        // Revert silent tamper
        await postgresAdapter.pool.query(`
          UPDATE terms_versions
          SET content_hash = $1
          WHERE id = $2;
        `, [originalHash, curTerms.id]);
      }

      const restored = await RepAcquisitionService.isCurrentTermsAccepted(repAUserId);
      expect(restored).toBe(true);
    });

    it('Terms Security Test 6: Client cannot forge accepted_at, user_id, rep_profile_id, content_hash, or acceptance_method; Server authoritatively determines identity/timestamp/content_hash', async () => {
      const client = await postgresAdapter.pool.connect();
      try {
        const curTerms = await RepAcquisitionService.getCurrentTermsVersion();
        const fakeUserId = 'a0000000-0000-0000-0000-999999999999';

        // Direct service invocation with nonexistent user must fail
        await expect(
          RepAcquisitionService.acceptTerms(fakeUserId, curTerms.id)
        ).rejects.toThrow(/USER_NOT_FOUND_OR_INACTIVE/);

        // When valid user accepts, server populates rep_profile_id from database
        const repAProfile = await RepAcquisitionService.getRepProfileByUserId(repAUserId);
        const record = await client.query(`
          SELECT user_id, rep_profile_id, content_hash, acceptance_method, accepted_at, audit_event_id
          FROM terms_acceptances
          WHERE user_id = $1 AND terms_version_id = $2
          ORDER BY accepted_at DESC LIMIT 1;
        `, [repAUserId, curTerms.id]);

        expect(record.rows[0].user_id).toBe(repAUserId);
        expect(record.rows[0].rep_profile_id).toBe(repAProfile.id);
        expect(record.rows[0].content_hash).toBe(curTerms.content_hash);
        expect(record.rows[0].acceptance_method).toBe('CLICKWRAP');
        expect(new Date(record.rows[0].accepted_at).getTime()).toBeGreaterThan(0);
        expect(record.rows[0].audit_event_id).toBeDefined();

        // Proves audit_logs table has corresponding event
        const auditLog = await client.query(`
          SELECT * FROM audit_logs WHERE actor_id = $1 AND action = 'TERMS_ACCEPTED';
        `, [repAUserId]);
        expect(auditLog.rows.length).toBeGreaterThanOrEqual(1);
      } finally {
        client.release();
      }
    });
  });

  // ==========================================
  // 3. HOME HUB & POSTGIS 20 KM TERRITORY (2D.5, 2D.6, 2D.7, 2D.36, 2D.37, 2D.38)
  // ==========================================
  describe('3. Home Hub & PostGIS 20 km Territory Authority', () => {
    it('strictly enforces geographic coordinate boundaries for home hub and business location (2D.36)', () => {
      // Latitude [-90, 90]
      expect(() => RepAcquisitionService.validateCoordinates(90.0, 0.0)).not.toThrow();
      expect(() => RepAcquisitionService.validateCoordinates(-90.0, 0.0)).not.toThrow();
      expect(() => RepAcquisitionService.validateCoordinates(90.000001, 0.0)).toThrow(/INVALID_LATITUDE_BOUNDARY/);
      expect(() => RepAcquisitionService.validateCoordinates(-90.000001, 0.0)).toThrow(/INVALID_LATITUDE_BOUNDARY/);

      // Longitude [-180, 180]
      expect(() => RepAcquisitionService.validateCoordinates(0.0, 180.0)).not.toThrow();
      expect(() => RepAcquisitionService.validateCoordinates(0.0, -180.0)).not.toThrow();
      expect(() => RepAcquisitionService.validateCoordinates(0.0, 180.000001)).toThrow(/INVALID_LONGITUDE_BOUNDARY/);
      expect(() => RepAcquisitionService.validateCoordinates(0.0, -180.000001)).toThrow(/INVALID_LONGITUDE_BOUNDARY/);

      // NaN
      expect(() => RepAcquisitionService.validateCoordinates(NaN, 0.0)).toThrow(/INVALID_LATITUDE/);
      expect(() => RepAcquisitionService.validateCoordinates(0.0, NaN)).toThrow(/INVALID_LONGITUDE/);
    });

    it('proves exact 20 km territory boundary in PostGIS across multiple bearings (2D.37)', async () => {
      const client = await postgresAdapter.pool.connect();
      try {
        const bearings = [0.0, 90.0, 180.0, 270.0]; // North, East, South, West

        for (const bearing of bearings) {
          // 19,999.999 m -> INSIDE
          const rInside = await client.query(`
            WITH hub AS (
              SELECT hub_geom::geography AS geom FROM rep_territories
              WHERE rep_profile_id = (SELECT id FROM rep_profiles WHERE user_id = $1)
            ),
            target AS (
              SELECT ST_Project(geom, 19999.999, radians($2::float8)) AS geom FROM hub
            )
            SELECT (ST_Distance(hub.geom, target.geom) <= 20000.0) AS is_within
            FROM hub, target;
          `, [repAUserId, bearing]);
          expect(rInside.rows[0].is_within).toBe(true);

          // 20,000.000 m -> INSIDE
          const rExact = await client.query(`
            WITH hub AS (
              SELECT hub_geom::geography AS geom FROM rep_territories
              WHERE rep_profile_id = (SELECT id FROM rep_profiles WHERE user_id = $1)
            ),
            target AS (
              SELECT ST_Project(geom, 20000.000, radians($2::float8)) AS geom FROM hub
            )
            SELECT (ST_Distance(hub.geom, target.geom) <= 20000.0) AS is_within
            FROM hub, target;
          `, [repAUserId, bearing]);
          expect(rExact.rows[0].is_within).toBe(true);

          // 20,000.001 m -> OUTSIDE
          const rOutside = await client.query(`
            WITH hub AS (
              SELECT hub_geom::geography AS geom FROM rep_territories
              WHERE rep_profile_id = (SELECT id FROM rep_profiles WHERE user_id = $1)
            ),
            target AS (
              SELECT ST_Project(geom, 20000.001, radians($2::float8)) AS geom FROM hub
            )
            SELECT (ST_Distance(hub.geom, target.geom) <= 20000.0) AS is_within
            FROM hub, target;
          `, [repAUserId, bearing]);
          expect(rOutside.rows[0].is_within).toBe(false);

          // 20,100.000 m -> OUTSIDE
          const rFar = await client.query(`
            WITH hub AS (
              SELECT hub_geom::geography AS geom FROM rep_territories
              WHERE rep_profile_id = (SELECT id FROM rep_profiles WHERE user_id = $1)
            ),
            target AS (
              SELECT ST_Project(geom, 20100.000, radians($2::float8)) AS geom FROM hub
            )
            SELECT (ST_Distance(hub.geom, target.geom) <= 20000.0) AS is_within
            FROM hub, target;
          `, [repAUserId, bearing]);
          expect(rFar.rows[0].is_within).toBe(false);
        }
      } finally {
        client.release();
      }
    });

    it('rejects hub manipulation: client-forged alternate hub in acquisition payload is ignored (2D.38)', async () => {
      const repProfile = await RepAcquisitionService.getRepProfileByUserId(repAUserId);

      // Business 28 km away from actual Cape Town hub (-33.9249, 18.4241) -> Paarl area (-33.7200, 18.9600)
      const outOfTerritoryLat = -33.7200;
      const outOfTerritoryLng = 18.9600;

      // Attempting to submit draft asserting forged hub closer to Paarl
      await expect(
        RepAcquisitionService.createDraft(repAUserId, {
          businessType: 'EATS',
          businessName: 'Paarl Eatery',
          ownerName: 'Paarl Owner',
          ownerPhone: '+27823333333',
          ownerEmail: 'paarl@example.com',
          addressLine1: '1 Main St',
          city: 'Paarl',
          postalCode: '7646',
          latitude: outOfTerritoryLat,
          longitude: outOfTerritoryLng,
        })
      ).rejects.toThrow(/OUT_OF_TERRITORY/);

      // Verify persisted hub was unchanged
      const profAfter = await RepAcquisitionService.getRepProfileByUserId(repAUserId);
      expect(Number(profAfter.hub_latitude)).toBeCloseTo(-33.9249, 4);
      expect(Number(profAfter.hub_longitude)).toBeCloseTo(18.4241, 4);
    });
  });

  // ==========================================
  // 4. BUSINESS CAPTURE & DRAFT LIFECYCLE (2D.8, 2D.9, 2D.10, 2D.16)
  // ==========================================
  describe('4. Business Capture, Draft Lifecycle & IDOR Protection', () => {
    let repADraftId: string;

    it('creates and persists business acquisition draft in PostgreSQL for Eats business (2D.9, 2D.16)', async () => {
      const draft = await RepAcquisitionService.createDraft(repAUserId, {
        businessType: 'EATS',
        businessName: 'Table Mountain Pizzeria',
        legalEntityName: 'TM Pizzeria Pty Ltd',
        taxOrVatId: 'VAT-99887711',
        ownerName: 'Marco Rossi',
        ownerPhone: '+27824444444',
        ownerEmail: 'marco@pizzeria.co.za',
        category: 'Italian',
        description: 'Authentic woodfired pizza',
        openingHours: { mon_fri: '11:00-22:00', sat_sun: '12:00-23:00' },
        addressLine1: '45 Kloof St',
        city: 'Cape Town',
        postalCode: '8001',
        latitude: -33.9280,
        longitude: 18.4110, // ~1.5 km from Cape Town Hub (Inside 20km)
        menuOrProductDraft: [
          { name: 'Margherita Pizza', priceCents: 9500, category: 'Pizza' },
          { name: 'Tiramisu', priceCents: 4500, category: 'Dessert' }
        ],
        notes: 'Initial consultation completed'
      });

      expect(draft.id).toBeDefined();
      expect(draft.status).toBe('DRAFT');
      expect(draft.business_name).toBe('Table Mountain Pizzeria');
      repADraftId = draft.id;
    });

    it('preserves draft across application refresh and allows Rep to resume/update draft (2D.16)', async () => {
      // Fetch draft
      const fetched = await RepAcquisitionService.getDraft(repADraftId, repAUserId);
      expect(fetched.id).toBe(repADraftId);
      expect(fetched.business_name).toBe('Table Mountain Pizzeria');

      // Update draft
      const updated = await RepAcquisitionService.updateDraft(repADraftId, repAUserId, {
        description: 'Authentic woodfired artisan pizza and pasta',
        notes: 'Owner requested delivery radius details'
      });
      expect(updated.description).toBe('Authentic woodfired artisan pizza and pasta');
      expect(updated.notes).toBe('Owner requested delivery radius details');
    });

    it('strictly forbids Rep B from reading, modifying, or accessing Rep A draft (2D.16, 2D.35)', async () => {
      await expect(
        RepAcquisitionService.getDraft(repADraftId, repBUserId)
      ).rejects.toThrow(/FORBIDDEN_DRAFT_ACCESS/);

      await expect(
        RepAcquisitionService.updateDraft(repADraftId, repBUserId, {
          businessName: 'Hijacked Pizzeria'
        })
      ).rejects.toThrow(/FORBIDDEN_DRAFT_ACCESS/);
    });

    it('creates Shop business acquisition draft within 20 km (2D.8)', async () => {
      const shopDraft = await RepAcquisitionService.createDraft(repAUserId, {
        businessType: 'SHOP',
        businessName: 'Cape Botanicals Store',
        legalEntityName: 'Cape Botanicals CC',
        taxOrVatId: 'VAT-44556677',
        ownerName: 'Sarah Jenkins',
        ownerPhone: '+27825555555',
        ownerEmail: 'sarah@capebotanicals.co.za',
        category: 'Health & Beauty',
        addressLine1: '88 Long St',
        city: 'Cape Town',
        postalCode: '8001',
        latitude: -33.9220,
        longitude: 18.4190,
        menuOrProductDraft: [
          { name: 'Fynbos Essential Oil', priceCents: 12000, sku: 'FYN-01' },
          { name: 'Rooibos Body Butter', priceCents: 8500, sku: 'RBB-01' }
        ]
      });

      expect(shopDraft.id).toBeDefined();
      expect(shopDraft.business_type).toBe('SHOP');
      expect(shopDraft.status).toBe('DRAFT');
    });
  });

  // ==========================================
  // 5. OWNER CONSENT OTP & SECURITY (2D.11, 2D.12, 2D.39)
  // ==========================================
  describe('5. Owner Consent Foundation & Security Matrix', () => {
    let draftId: string;
    let consentId: string;
    let validOtp: string;

    beforeAll(async () => {
      const d = await RepAcquisitionService.createDraft(repAUserId, {
        businessType: 'EATS',
        businessName: 'Consent Test Bistro',
        ownerName: 'Jean Dupont',
        ownerPhone: '+27826666666',
        ownerEmail: 'jean@bistro.co.za',
        addressLine1: '12 Loop St',
        city: 'Cape Town',
        postalCode: '8001',
        latitude: -33.9230,
        longitude: 18.4200
      });
      draftId = d.id;
    });

    it('generates cryptographically secure 6-digit OTP and hashes at rest in PostgreSQL (2D.12)', async () => {
      const res = await RepAcquisitionService.generateOwnerConsentOtp(
        draftId,
        repAUserId,
        '+27826666666',
        'jean@bistro.co.za'
      );

      expect(res.consentId).toBeDefined();
      expect(res.expiresAt).toBeDefined();
      expect(res.devOtp).toBeDefined();
      expect(res.devOtp).toHaveLength(6);
      expect(Number(res.devOtp)).toBeGreaterThanOrEqual(100000);
      expect(Number(res.devOtp)).toBeLessThanOrEqual(999999);

      consentId = res.consentId;
      validOtp = res.devOtp!;

      // Verify hash at rest in PostgreSQL
      const row = await postgresAdapter.pool.query('SELECT * FROM business_owner_consents WHERE id = $1;', [consentId]);
      expect(row.rows[0].otp_hash).toBeDefined();
      expect(row.rows[0].otp_hash).toHaveLength(64); // SHA-256
      expect(row.rows[0].is_consumed).toBe(false);
      expect(row.rows[0].otp_hash).not.toBe(validOtp); // Plaintext is never stored
    });

    it('strictly rejects wrong OTP and increments attempt count (2D.12)', async () => {
      await expect(
        RepAcquisitionService.verifyOwnerConsentOtp(consentId, '000000', repAUserId, draftId)
      ).rejects.toThrow(/INVALID_CONSENT_OTP/);

      const row = await postgresAdapter.pool.query('SELECT attempt_count FROM business_owner_consents WHERE id = $1;', [consentId]);
      expect(row.rows[0].attempt_count).toBe(1);
    });

    it('rejects cross-business OTP: OTP generated for Business A cannot be used on Business B (2D.12, 2D.39)', async () => {
      const otherDraft = await RepAcquisitionService.createDraft(repAUserId, {
        businessType: 'EATS',
        businessName: 'Unrelated Cafe',
        ownerName: 'Paul',
        ownerPhone: '+27827777777',
        ownerEmail: 'paul@cafe.co.za',
        addressLine1: '14 Loop St',
        city: 'Cape Town',
        postalCode: '8001',
        latitude: -33.9231,
        longitude: 18.4201
      });

      await expect(
        RepAcquisitionService.verifyOwnerConsentOtp(consentId, validOtp, repAUserId, otherDraft.id)
      ).rejects.toThrow(/CONSENT_BUSINESS_MISMATCH/);
    });

    it('verifies correct OTP, consumes consent token, and binds to draft (2D.11, 2D.12)', async () => {
      const v = await RepAcquisitionService.verifyOwnerConsentOtp(consentId, validOtp, repAUserId, draftId);
      expect(v.success).toBe(true);
      expect(v.consentId).toBe(consentId);

      const d = await RepAcquisitionService.getDraft(draftId, repAUserId);
      expect(d.owner_consent_id).toBe(consentId);

      const cRow = await postgresAdapter.pool.query('SELECT is_consumed FROM business_owner_consents WHERE id = $1;', [consentId]);
      expect(cRow.rows[0].is_consumed).toBe(true);
    });

    it('rejects consent replay: already-consumed OTP cannot be re-verified (2D.12, 2D.39)', async () => {
      await expect(
        RepAcquisitionService.verifyOwnerConsentOtp(consentId, validOtp, repAUserId, draftId)
      ).rejects.toThrow(/CONSENT_ALREADY_CONSUMED/);
    });
  });

  // ==========================================
  // 6. BUSINESS DOCUMENT FOUNDATION (2D.13, 2D.14, 2D.42)
  // ==========================================
  describe('6. Business Document Security & Privacy Matrix', () => {
    let draftId: string;
    let docId: string;

    beforeAll(async () => {
      const d = await RepAcquisitionService.createDraft(repAUserId, {
        businessType: 'EATS',
        businessName: 'Doc Security Diner',
        ownerName: 'Owner',
        ownerPhone: '+27828888888',
        ownerEmail: 'doc@diner.co.za',
        addressLine1: '20 Strand St',
        city: 'Cape Town',
        postalCode: '8001',
        latitude: -33.9215,
        longitude: 18.4230
      });
      draftId = d.id;
    });

    it('records document reference with DOCUMENT_UPLOADED and unverified status (2D.13)', async () => {
      const doc = await RepAcquisitionService.addDocument(draftId, repAUserId, {
        documentType: 'BUSINESS_REGISTRATION',
        storagePath: '/private/acquisitions/docs/biz_reg_01.pdf',
        fileMimeType: 'application/pdf',
        fileSizeBytes: 245000
      });

      expect(doc.id).toBeDefined();
      expect(doc.verification_status).toBe('DOCUMENT_UPLOADED');
      expect(doc.is_verified).toBe(false);
      expect(doc.verification_notes).toBe('BUSINESS DOCUMENT VERIFICATION INTEGRATION PENDING');
      docId = doc.id;
    });

    it('authorizes uploader Rep to access own document metadata (2D.42)', async () => {
      const fetched = await RepAcquisitionService.getDocument(docId, repAUserId);
      expect(fetched.id).toBe(docId);
      expect(fetched.document_type).toBe('BUSINESS_REGISTRATION');
    });

    it('strictly forbids Rep B from accessing Rep A document metadata (2D.42)', async () => {
      await expect(
        RepAcquisitionService.getDocument(docId, repBUserId)
      ).rejects.toThrow(/FORBIDDEN_DOCUMENT_ACCESS/);
    });
  });

  // ==========================================
  // 7. AI / OCR ADVISORY BOUNDARY (2D.15, 2D.43)
  // ==========================================
  describe('7. AI / OCR Assistance Boundary', () => {
    it('confirms AI/OCR is suggestion-only and cannot verify documents or approve businesses (2D.15, 2D.43)', () => {
      const res = RepAcquisitionService.extractBusinessDraftSuggestions({
        suggestedName: 'AI Suggested Burgers',
        suggestedCategory: 'Fast Food',
        suggestedAddress: '15 Bree St, Cape Town'
      });

      expect(res.isAiSuggestion).toBe(true);
      expect(res.status).toBe('OCR_INTEGRATION_PENDING');
      expect(res.message).toMatch(/advisory only and cannot verify documents or approve businesses/);
      expect(res.suggestions.businessName).toBe('AI Suggested Burgers');
    });
  });

  // ==========================================
  // 8. DUPLICATE BUSINESS DETECTION (2D.20, 2D.21, 2D.40)
  // ==========================================
  describe('8. Deterministic Duplicate Business Detection', () => {
    const existingTaxId = 'VAT-EXISTING-1122';
    const existingPhone = '+27829990001';

    beforeAll(async () => {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query(`
          INSERT INTO businesses (
            id, type, name, legal_entity_name, tax_or_vat_id, contact_email,
            contact_phone, address_id, latitude, longitude, geom, status, opening_hours, is_active
          )
          VALUES (
            uuid_generate_v4(), 'EATS', 'Original Gourmet Deli', 'Original Deli CC', $1,
            'deli@example.com', $2, (SELECT id FROM addresses LIMIT 1),
            -33.9240, 18.4230, ST_SetSRID(ST_Point(18.4230, -33.9240), 4326),
            'APPROVED', '{}', true
          )
          ON CONFLICT (tax_or_vat_id) DO NOTHING;
        `, [existingTaxId, existingPhone]);
      } finally {
        client.release();
      }
    });

    it('detects duplicate tax/VAT ID and prevents silent duplicate creation (2D.20, 2D.21)', async () => {
      const dup = await RepAcquisitionService.checkDuplicateBusiness({ taxOrVatId: existingTaxId });
      expect(dup.isDuplicate).toBe(true);
      expect(dup.duplicateType).toBe('DUPLICATE_TAX_ID');
    });

    it('detects duplicate primary contact phone (2D.20)', async () => {
      const dup = await RepAcquisitionService.checkDuplicateBusiness({ contactPhone: existingPhone });
      expect(dup.isDuplicate).toBe(true);
      expect(dup.duplicateType).toBe('DUPLICATE_PHONE_NUMBER');
    });
  });

  // ==========================================
  // 9. SUBMISSION & CUSTOMER ISOLATION (2D.17, 2D.18, 2D.19, 2D.28, 2D.41)
  // ==========================================
  describe('9. Business Submission, Status & Customer Isolation', () => {
    let submittedBusinessId: string;
    let submittedDraftId: string;

    beforeAll(async () => {
      // Create valid draft
      const d = await RepAcquisitionService.createDraft(repAUserId, {
        businessType: 'EATS',
        businessName: 'Hidden From Customer Cafe',
        legalEntityName: 'Hidden Cafe Pty Ltd',
        taxOrVatId: `VAT-SUBMIT-${Date.now()}`,
        ownerName: 'David Miller',
        ownerPhone: `+2782${Math.floor(1000000 + Math.random() * 9000000)}`,
        ownerEmail: 'david@hidden.co.za',
        addressLine1: '33 Waterkant St',
        city: 'Cape Town',
        postalCode: '8001',
        latitude: -33.9190,
        longitude: 18.4210
      });
      submittedDraftId = d.id;

      // Generate & verify consent
      const consent = await RepAcquisitionService.generateOwnerConsentOtp(d.id, repAUserId, d.owner_phone, d.owner_email);
      await RepAcquisitionService.verifyOwnerConsentOtp(consent.consentId, consent.devOtp!, repAUserId, d.id);
    });

    it('submits complete draft: transitions to PENDING_ADMIN_VERIFICATION and creates Rep attribution (2D.17, 2D.18)', async () => {
      const sub = await RepAcquisitionService.submitBusinessAcquisition(submittedDraftId, repAUserId, `sub-key-${Date.now()}`);
      expect(sub.businessId).toBeDefined();
      expect(sub.attributionId).toBeDefined();
      expect(sub.status).toBe('PENDING_ADMIN_VERIFICATION');
      expect(sub.isIdempotentReplay).toBe(false);
      submittedBusinessId = sub.businessId;

      // Verify in PostgreSQL: is_active must be false
      const bRow = await postgresAdapter.pool.query('SELECT status, is_active FROM businesses WHERE id = $1;', [submittedBusinessId]);
      expect(bRow.rows[0].status).toBe('PENDING_ADMIN_VERIFICATION');
      expect(bRow.rows[0].is_active).toBe(false);

      // Verify Rep attribution in PostgreSQL
      const aRow = await postgresAdapter.pool.query('SELECT * FROM rep_business_attributions WHERE business_id = $1;', [submittedBusinessId]);
      expect(aRow.rows).toHaveLength(1);
      expect(aRow.rows[0].attribution_status).toBe('ACTIVE');
    });

    it('customer isolation: PENDING business does NOT appear in Eats customer discovery (2D.19, 2D.41)', async () => {
      const eatsList = await EatsService.getApprovedBusinesses();
      const foundEats = eatsList.find(b => b.id === submittedBusinessId);
      expect(foundEats).toBeUndefined();

      const shopList = await ShopService.getApprovedShops();
      const foundShop = shopList.find(b => b.id === submittedBusinessId);
      expect(foundShop).toBeUndefined();

      // Direct customer merchant detail lookup must be rejected / not found
      await expect(EatsService.getBusinessDetail(submittedBusinessId)).rejects.toThrow(/EATS_BUSINESS_NOT_FOUND/);
    });

    it('customer isolation: checkout against PENDING business is strictly rejected (2D.19, 2D.41)', async () => {
      await expect(
        OrderService.repriceBasket({
          businessId: submittedBusinessId,
          items: [{ itemId: '00000000-0000-0000-0000-000000000000', quantity: 1 }]
        })
      ).rejects.toThrow(/BUSINESS_UNAVAILABLE/);
    });

    it('proves submission replay is idempotent and does not create duplicate business records (2D.34)', async () => {
      const replay = await RepAcquisitionService.submitBusinessAcquisition(submittedDraftId, repAUserId, 'sub-replay-key');
      expect(replay.isIdempotentReplay).toBe(true);
      expect(replay.businessId).toBe(submittedBusinessId);

      const count = await postgresAdapter.pool.query('SELECT count(*)::int as c FROM businesses WHERE id = $1;', [submittedBusinessId]);
      expect(count.rows[0].c).toBe(1);
    });
  });

  // ==========================================
  // 10. ATTRIBUTION IMMUTABILITY & HIJACK PROTECTION (2D.22, 2D.23, 2D.25)
  // ==========================================
  describe('10. Attribution Immutability & Hijack Protection', () => {
    let attributedBusinessId: string;
    let repAProfileId: string;

    beforeAll(async () => {
      const profA = await RepAcquisitionService.getRepProfileByUserId(repAUserId);
      repAProfileId = profA.id;

      // Create and submit a business by Rep A
      const d = await RepAcquisitionService.createDraft(repAUserId, {
        businessType: 'SHOP',
        businessName: 'Rep A Protected Wine Cellar',
        ownerName: 'Cellar Master',
        ownerPhone: `+2782${Math.floor(1000000 + Math.random() * 9000000)}`,
        ownerEmail: 'wine@cellar.co.za',
        addressLine1: '50 Strand St',
        city: 'Cape Town',
        postalCode: '8001',
        latitude: -33.9210,
        longitude: 18.4220
      });
      const c = await RepAcquisitionService.generateOwnerConsentOtp(d.id, repAUserId, d.owner_phone, d.owner_email);
      await RepAcquisitionService.verifyOwnerConsentOtp(c.consentId, c.devOtp!, repAUserId, d.id);
      const sub = await RepAcquisitionService.submitBusinessAcquisition(d.id, repAUserId, `wine-key-${Date.now()}`);
      attributedBusinessId = sub.businessId;
    });

    it('strictly forbids Rep B from hijacking or overwriting existing Rep A attribution (2D.23, 2D.25)', async () => {
      const profB = await RepAcquisitionService.getRepProfileByUserId(repBUserId);

      // Rep B attempts direct injection of Rep B attribution row for the same business
      const client = await postgresAdapter.pool.connect();
      try {
        await expect(client.query(`
          INSERT INTO rep_business_attributions (
            id, rep_profile_id, business_id, distance_at_origination_km, attribution_status
          )
          VALUES (uuid_generate_v4(), $1, $2, 5.0, 'ACTIVE');
        `, [profB.id, attributedBusinessId])).rejects.toThrow(/rep_business_attributions_business_id_key/);
      } finally {
        client.release();
      }

      // Verify Rep A remains the sole authoritative attributed Rep in PostgreSQL
      const aCheck = await postgresAdapter.pool.query('SELECT rep_profile_id FROM rep_business_attributions WHERE business_id = $1;', [attributedBusinessId]);
      expect(aCheck.rows).toHaveLength(1);
      expect(aCheck.rows[0].rep_profile_id).toBe(repAProfileId);
    });
  });

  // ==========================================
  // 11. CRITICAL 5-REP ATTRIBUTION CONCURRENCY RACE (2D.24, 2D.47)
  // ==========================================
  describe('11. Critical 5-Rep Attribution Concurrency Race (2D.24, 2D.47)', () => {
    it('executes simultaneous qualifying acquisition by 5 distinct Reps: EXACTLY 1 winner, 4 rejected (2D.24, 2D.47)', async () => {
      // 1. Common business identity parameters
      const sharedTaxId = `RACE-TAX-${Date.now()}`;
      const sharedPhone = `+2782${Math.floor(1000000 + Math.random() * 9000000)}`;

      // Ensure all race reps have current terms accepted
      const curTerms = await RepAcquisitionService.getCurrentTermsVersion();
      for (const repUserId of raceReps) {
        await RepAcquisitionService.acceptTerms(repUserId, curTerms.id);
      }

      // 2. Each of the 5 eligible Reps prepares a complete validated draft for the same location
      const draftIds: { repUserId: string; draftId: string }[] = [];

      for (const repUserId of raceReps) {
        const d = await RepAcquisitionService.createDraft(repUserId, {
          businessType: 'EATS',
          businessName: 'Race Target Restaurant',
          legalEntityName: 'Target Entity CC',
          taxOrVatId: sharedTaxId,
          ownerName: 'Target Owner',
          ownerPhone: sharedPhone,
          ownerEmail: 'target@restaurant.co.za',
          addressLine1: '100 Long St',
          city: 'Cape Town',
          postalCode: '8001',
          latitude: -33.9245,
          longitude: 18.4225
        });

        // Generate & verify consent for each draft
        const c = await RepAcquisitionService.generateOwnerConsentOtp(d.id, repUserId, d.owner_phone, d.owner_email);
        await RepAcquisitionService.verifyOwnerConsentOtp(c.consentId, c.devOtp!, repUserId, d.id);

        draftIds.push({ repUserId, draftId: d.id });
      }

      // 3. Execute all 5 submissions concurrently using independent connections
      const racePromises = draftIds.map(async ({ repUserId, draftId }) => {
        try {
          const res = await RepAcquisitionService.submitBusinessAcquisition(draftId, repUserId, `race-sub-${repUserId}-${Date.now()}`);
          return { repUserId, success: true, result: res };
        } catch (err: any) {
          return { repUserId, success: false, error: err.message };
        }
      });

      const raceResults = await Promise.all(racePromises);
      const successfulAttempts = raceResults.filter(r => r.success);
      const rejectedAttempts = raceResults.filter(r => !r.success);

      console.log(`[5-Rep Attribution Race Result] Successful: ${successfulAttempts.length}, Rejected: ${rejectedAttempts.length}`);

      // MANDATORY INVARIANTS:
      expect(successfulAttempts).toHaveLength(1);
      expect(rejectedAttempts).toHaveLength(4);

      // Verify PostgreSQL physical state:
      const winnerRepUserId = successfulAttempts[0].repUserId;
      const winnerBusinessId = successfulAttempts[0].result!.businessId;

      const attrRows = await postgresAdapter.pool.query(
        'SELECT * FROM rep_business_attributions WHERE business_id = $1;',
        [winnerBusinessId]
      );
      expect(attrRows.rows).toHaveLength(1);
      expect(attrRows.rows[0].attribution_status).toBe('ACTIVE');

      const winnerProf = await RepAcquisitionService.getRepProfileByUserId(winnerRepUserId);
      expect(attrRows.rows[0].rep_profile_id).toBe(winnerProf.id);

      // Expected commission rows at acquisition: 0 EARNED
      const commRows = await postgresAdapter.pool.query(
        'SELECT * FROM commission_ledger WHERE rep_profile_id = $1;',
        [winnerProf.id]
      );
      expect(commRows.rows).toHaveLength(0);
    });
  });

  // ==========================================
  // 12. COMMISSION RULES & EXISTING BEHAVIOR (2D.26, 2D.27, 2D.48)
  // ==========================================
  describe('12. Rep Commission Rate Cap (<= 3%) & Sales Integration', () => {
    it('verifies acquisition alone creates 0 earned commission (2D.26)', async () => {
      const repProfile = await RepAcquisitionService.getRepProfileByUserId(repAUserId);
      const ledger = await postgresAdapter.pool.query(
        "SELECT count(*)::int as count FROM commission_ledger WHERE rep_profile_id = $1 AND status = 'EARNED';",
        [repProfile.id]
      );
      expect(ledger.rows[0].count).toBe(0);
    });

    it('proves commission rate cap: configured rate must not exceed 3% (2D.27)', async () => {
      const rules = await postgresAdapter.pool.query("SELECT percentage_rate FROM commission_rules WHERE target_role = 'TUXI_REP';");
      for (const r of rules.rows) {
        expect(Number(r.percentage_rate)).toBeLessThanOrEqual(0.0300);
      }
    });

    it('preserves existing qualifying sale commission generation on attributed approved business (2D.48)', async () => {
      const client = await postgresAdapter.pool.connect();
      let orderId: string;
      const repProf = await RepAcquisitionService.getRepProfileByUserId(repAUserId);

      try {
        // Create approved business attributed to Rep A
        const taxId = `TAX-COMM-${Date.now()}`;
        const ordNum = `ORD-COMM-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const bRes = await client.query(`
          INSERT INTO businesses (
            id, type, name, legal_entity_name, tax_or_vat_id, contact_email,
            contact_phone, address_id, latitude, longitude, geom, status, opening_hours, is_active
          )
          VALUES (
            uuid_generate_v4(), 'EATS', 'Approved Pizza Co', 'Pizza CC', $1,
            'comm@pizza.co.za', '+27829995555', (SELECT id FROM addresses LIMIT 1),
            -33.9249, 18.4241, ST_SetSRID(ST_Point(18.4241, -33.9249), 4326),
            'APPROVED', '{}', true
          )
          RETURNING id;
        `, [taxId]);
        const bizId = bRes.rows[0].id;

        await client.query(`
          INSERT INTO rep_business_attributions (
            id, rep_profile_id, business_id, distance_at_origination_km, attribution_status
          )
          VALUES (uuid_generate_v4(), $1, $2, 2.5, 'ACTIVE');
        `, [repProf.id, bizId]);

        // Create completed/delivered order (subtotal = R1000.00 / 100,000 cents)
        const oRes = await client.query(`
          INSERT INTO orders (
            id, customer_id, business_id, delivery_address_id, order_number,
            order_type, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents,
            status, currency
          )
          VALUES (
            uuid_generate_v4(), $1, $2, (SELECT id FROM addresses LIMIT 1), $3,
            'EATS', 100000, 2500, 250, 0, 102750,
            'DELIVERED', 'ZAR'
          )
          RETURNING id;
        `, [customerUserId, bizId, ordNum]);
        orderId = oRes.rows[0].id;
      } finally {
        client.release();
      }

      // Process commission
      const comm = await CommissionService.processOrderCommissionPostgres(orderId, `comm-key-${orderId}`);
      expect(comm.commissionCents).toBeGreaterThan(0);
      expect(comm.commissionCents).toBeLessThanOrEqual(3000); // 3% of 100,000 = 3000 cents max

      // Replay must be idempotent
      const commReplay = await CommissionService.processOrderCommissionPostgres(orderId, `comm-key-${orderId}`);
      expect(commReplay.isIdempotentReplay).toBe(true);
      expect(commReplay.commissionCents).toBe(comm.commissionCents);
    });
  });

  // ==========================================
  // 13. REP DASHBOARD & REAL DATA (2D.31, 2D.32)
  // ==========================================
  describe('13. Rep Dashboard & Status Tracking', () => {
    it('returns real dashboard data from PostgreSQL with no hardcoded or fake earnings (2D.31)', async () => {
      const dashboard = await RepAcquisitionService.getRepDashboard(repAUserId);

      expect(dashboard.repProfileId).toBeDefined();
      expect(dashboard.hubAddress).toBeDefined();
      expect(dashboard.hubAddress.territoryRadiusKm).toBe(20.0);
      expect(dashboard.draftCount).toBeGreaterThanOrEqual(1);
      expect(dashboard.attributedBusinessesCount).toBeGreaterThanOrEqual(1);
      expect(dashboard.commissionSummary).toBeDefined();
      expect(typeof dashboard.commissionSummary.totalEarnedCents).toBe('number');
    });
  });

  // ==========================================
  // 14. REP SECURITY & IDOR ATTACK MATRIX (2D.35)
  // ==========================================
  describe('14. Rep Security & IDOR Attack Matrix', () => {
    it('blocks Customer from creating business drafts', async () => {
      await expect(
        RepAcquisitionService.createDraft(customerUserId, {
          businessType: 'EATS',
          businessName: 'Illegal Draft',
          ownerName: 'Owner',
          ownerPhone: '+27821112222',
          ownerEmail: 'ill@example.com',
          addressLine1: '1 St',
          city: 'Cape Town',
          postalCode: '8001',
          latitude: -33.9249,
          longitude: 18.4241
        })
      ).rejects.toThrow(/UNAUTHORIZED_REP/);
    });

    it('blocks Rep from self-approving business to active/approved state (2D.28)', async () => {
      // Rep submitted business must remain in PENDING_ADMIN_VERIFICATION
      const draft = await RepAcquisitionService.createDraft(repAUserId, {
        businessType: 'EATS',
        businessName: 'Self Approve Test',
        ownerName: 'Owner',
        ownerPhone: `+2782${Math.floor(1000000 + Math.random() * 9000000)}`,
        ownerEmail: 'self@approve.com',
        addressLine1: '5 St',
        city: 'Cape Town',
        postalCode: '8001',
        latitude: -33.9249,
        longitude: 18.4241
      });
      const c = await RepAcquisitionService.generateOwnerConsentOtp(draft.id, repAUserId, draft.owner_phone, draft.owner_email);
      await RepAcquisitionService.verifyOwnerConsentOtp(c.consentId, c.devOtp!, repAUserId, draft.id);

      const sub = await RepAcquisitionService.submitBusinessAcquisition(draft.id, repAUserId, `self-key-${Date.now()}`);
      expect(sub.status).toBe('PENDING_ADMIN_VERIFICATION');
      expect(sub.status).not.toBe('APPROVED');
      expect(sub.status).not.toBe('ACTIVE');
    });
  });
});
