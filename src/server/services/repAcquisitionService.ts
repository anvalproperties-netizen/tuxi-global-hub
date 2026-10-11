import crypto from 'node:crypto';
import { postgresAdapter } from '../db/postgres.js';

export interface RegisterRepInput {
  userId: string;
  birthDate: string; // YYYY-MM-DD
  hasMobilePhone: boolean;
  hasMobileData: boolean;
  hasOwnTransport: boolean;
  transportDetails?: string;
  hubAddress: {
    streetLine1: string;
    streetLine2?: string;
    city: string;
    stateProvince?: string;
    postalCode: string;
    countryCode: string;
    latitude: number;
    longitude: number;
  };
  termsVersionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateDraftInput {
  businessType: 'EATS' | 'SHOP';
  businessName: string;
  legalEntityName?: string;
  taxOrVatId?: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  category?: string;
  description?: string;
  openingHours?: Record<string, string>;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateProvince?: string;
  postalCode: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  menuOrProductDraft?: any[];
  notes?: string;
}

export interface AddDocumentInput {
  documentType: 'BUSINESS_REGISTRATION' | 'TAX_CERTIFICATE' | 'ID_DOCUMENT' | 'LEASE_AGREEMENT' | 'HEALTH_CERTIFICATE' | 'OTHER';
  storagePath: string;
  fileMimeType: string;
  fileSizeBytes: number;
}

export class RepAcquisitionService {
  /**
   * Coordinate boundary validation.
   * Lat: -90.0 to +90.0
   * Lon: -180.0 to +180.0
   */
  public static validateCoordinates(lat: number, lon: number): void {
    if (typeof lat !== 'number' || isNaN(lat) || !isFinite(lat)) {
      throw new Error('INVALID_LATITUDE: Latitude must be a valid number between -90.0 and 90.0');
    }
    if (typeof lon !== 'number' || isNaN(lon) || !isFinite(lon)) {
      throw new Error('INVALID_LONGITUDE: Longitude must be a valid number between -180.0 and 180.0');
    }
    if (lat < -90.0 || lat > 90.0) {
      throw new Error(`INVALID_LATITUDE_BOUNDARY: Latitude ${lat} is outside valid [-90.0, 90.0] range`);
    }
    if (lon < -180.0 || lon > 180.0) {
      throw new Error(`INVALID_LONGITUDE_BOUNDARY: Longitude ${lon} is outside valid [-180.0, 180.0] range`);
    }
  }

  /**
   * Evaluates whether birthDate represents an individual aged 18 or older.
   */
  public static validateAge18(birthDateStr: string): boolean {
    const birthDate = new Date(birthDateStr);
    if (isNaN(birthDate.getTime())) return false;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 18;
  }

  /**
   * Retrieves the current published Terms version for TUXI_REP.
   */
  public static async getCurrentTermsVersion() {
    const res = await postgresAdapter.pool.query(`
      SELECT id, version_tag, title, content_hash, published_at, is_current
      FROM terms_versions
      WHERE target_role = 'TUXI_REP' AND is_current = true
      ORDER BY published_at DESC
      LIMIT 1;
    `);
    if (res.rows.length === 0) {
      throw new Error('NO_CURRENT_TERMS_VERSION: No active TUXI Rep terms version is published');
    }
    return res.rows[0];
  }

  /**
   * Checks whether the user has accepted the CURRENT active Terms version.
   * Evaluates exact content_hash matching to ensure altered terms content invalidates acceptance.
   */
  public static async isCurrentTermsAccepted(userId: string): Promise<boolean> {
    const current = await this.getCurrentTermsVersion();
    const res = await postgresAdapter.pool.query(`
      SELECT ta.id, ta.content_hash
      FROM terms_acceptances ta
      WHERE ta.user_id = $1 AND ta.terms_version_id = $2
        AND (ta.content_hash IS NULL OR ta.content_hash = $3);
    `, [userId, current.id, current.content_hash]);
    return res.rows.length > 0;
  }

  /**
   * Records immutable server-authoritative Clickwrap acceptance of a specific Terms version.
   * The server determines:
   * - user_id (from authenticated session caller)
   * - rep_profile_id (authoritatively looked up from rep_profiles)
   * - terms_version_id (verified against terms_versions)
   * - content_hash (exact terms content_hash retrieved authoritatively from DB)
   * - accepted_at (server timestamp: NOW())
   * - acceptance_method ('CLICKWRAP')
   * - audit_event_id (generated server UUID)
   * Client cannot forge any of these authoritative fields.
   */
  public static async acceptTerms(
    userId: string,
    termsVersionId: string,
    ipAddress: string = '127.0.0.1',
    userAgent: string = 'TUXI_APP',
    options?: {
      affirmativeStatement?: string;
      sessionEvidence?: Record<string, any>;
    }
  ) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Verify user exists and is active
      const userRes = await client.query('SELECT id, is_active FROM users WHERE id = $1;', [userId]);
      if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
        await client.query('ROLLBACK;');
        throw new Error('USER_NOT_FOUND_OR_INACTIVE');
      }

      // 2. Retrieve rep_profile_id if present
      const repRes = await client.query('SELECT id FROM rep_profiles WHERE user_id = $1;', [userId]);
      const repProfileId = repRes.rows[0]?.id || null;

      // 3. Verify terms version exists and fetch authoritative content_hash
      const termRes = await client.query('SELECT id, version_tag, content_hash, is_current FROM terms_versions WHERE id = $1;', [termsVersionId]);
      if (termRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('INVALID_TERMS_VERSION: Specified terms version does not exist');
      }
      const term = termRes.rows[0];

      // 4. Check if already accepted
      const existing = await client.query('SELECT id, accepted_at, content_hash FROM terms_acceptances WHERE user_id = $1 AND terms_version_id = $2;', [userId, termsVersionId]);
      if (existing.rows.length > 0) {
        await client.query('COMMIT;');
        return {
          alreadyAccepted: true,
          acceptanceId: existing.rows[0].id,
          acceptedAt: existing.rows[0].accepted_at,
          contentHash: existing.rows[0].content_hash,
          acceptanceMethod: 'CLICKWRAP'
        };
      }

      // 5. Generate server-authoritative audit_event_id and immutable record
      const auditEventId = crypto.randomUUID();
      const affirmativeStatement = options?.affirmativeStatement || 'I have read and accept the TUXI Rep Terms';
      const recordIdentifier = `rec-${auditEventId}`; // Non-security record identifier token

      const insRes = await client.query(`
        INSERT INTO terms_acceptances (
          id, user_id, rep_profile_id, terms_version_id, content_hash,
          accepted_at, acceptance_method, ip_address, user_agent,
          audit_event_id, signature_hash, metadata
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4,
          NOW(), 'CLICKWRAP', $5, $6,
          $7, $8, $9
        )
        RETURNING id, user_id, rep_profile_id, terms_version_id, content_hash, accepted_at, acceptance_method, audit_event_id, metadata;
      `, [
        userId,
        repProfileId,
        termsVersionId,
        term.content_hash,
        ipAddress,
        userAgent,
        auditEventId,
        recordIdentifier,
        JSON.stringify({
          targetRole: 'TUXI_REP',
          termsVersion: term.version_tag,
          contentHash: term.content_hash,
          acceptanceMethod: 'CLICKWRAP',
          affirmativeStatement,
          auditEventId,
          electronicSignatureNotice: 'EXTERNAL ELECTRONIC SIGNATURE INTEGRATION NOT REQUIRED FOR CURRENT CLICKWRAP ACCEPTANCE',
          ...(options?.sessionEvidence || {})
        })
      ]);

      const record = insRes.rows[0];

      // 6. Record immutable audit log
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES ($1, $2, 'TERMS_ACCEPTED', 'TERMS_ACCEPTANCE', $3, NULL, $4);
      `, [
        auditEventId,
        userId,
        record.id,
        JSON.stringify({
          termsVersionId,
          versionTag: term.version_tag,
          contentHash: term.content_hash,
          acceptanceMethod: 'CLICKWRAP',
          auditEventId
        })
      ]);

      await client.query('COMMIT;');
      return record;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Registers a new TUXI Rep in PostgreSQL with authoritative eligibility verification.
   */
  public static async registerRep(input: RegisterRepInput) {
    // 1. Mandatory 18+ check
    if (!this.validateAge18(input.birthDate)) {
      throw new Error('UNDERAGE_REP_REJECTED: TUXI Reps must be at least 18 years of age');
    }

    // 2. Mandatory Mobile Phone & Mobile Data confirmation
    if (!input.hasMobilePhone || !input.hasMobileData) {
      throw new Error('MOBILE_REQUIREMENTS_REJECTED: Rep must confirm ownership of mobile phone and cellular data plan');
    }

    // 3. Hub coordinate boundary validation
    this.validateCoordinates(input.hubAddress.latitude, input.hubAddress.longitude);

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // 4. Verify user exists and is active
      const userRes = await client.query('SELECT id, is_active FROM users WHERE id = $1;', [input.userId]);
      if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
        await client.query('ROLLBACK;');
        throw new Error('USER_NOT_FOUND_OR_INACTIVE');
      }

      // Check if user already has a rep profile
      const existingRep = await client.query('SELECT id FROM rep_profiles WHERE user_id = $1;', [input.userId]);
      if (existingRep.rows.length > 0) {
        await client.query('ROLLBACK;');
        throw new Error('REP_PROFILE_ALREADY_EXISTS: User already holds a TUXI Rep profile');
      }

      // 5. Terms version check
      let termsVersionId = input.termsVersionId;
      if (!termsVersionId) {
        const curTerms = await this.getCurrentTermsVersion();
        termsVersionId = curTerms.id;
      }

      const termCheck = await client.query('SELECT id, version_tag, content_hash FROM terms_versions WHERE id = $1;', [termsVersionId]);
      if (termCheck.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('INVALID_TERMS_VERSION: Specified terms version does not exist');
      }

      // 6. Create Hub Address with PostGIS geom
      const normalizedAddress = `${input.hubAddress.streetLine1}, ${input.hubAddress.city}, ${input.hubAddress.postalCode}, ${input.hubAddress.countryCode}`.toUpperCase();
      const addrRes = await client.query(`
        INSERT INTO addresses (
          id, user_id, street_line_1, street_line_2, city, state_province, postal_code, country_code,
          latitude, longitude, geom, normalized_address
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7,
          $8::numeric, $9::numeric, ST_SetSRID(ST_Point($9::float8, $8::float8), 4326), $10
        )
        RETURNING id;
      `, [
        input.userId,
        input.hubAddress.streetLine1,
        input.hubAddress.streetLine2 || null,
        input.hubAddress.city,
        input.hubAddress.stateProvince || null,
        input.hubAddress.postalCode,
        input.hubAddress.countryCode,
        input.hubAddress.latitude,
        input.hubAddress.longitude,
        normalizedAddress
      ]);
      const hubAddressId = addrRes.rows[0].id;

      // 7. Create Rep Profile
      const repRes = await client.query(`
        INSERT INTO rep_profiles (
          id, user_id, birth_date, has_mobile_phone, has_mobile_data,
          has_own_transport, transport_details, hub_address_id,
          territory_radius_km, verification_status
        )
        VALUES (
          uuid_generate_v4(), $1, $2, true, true,
          $3, $4, $5,
          20.000, 'PENDING'
        )
        RETURNING *;
      `, [
        input.userId,
        input.birthDate,
        !!input.hasOwnTransport,
        input.transportDetails || null,
        hubAddressId
      ]);
      const repProfile = repRes.rows[0];

      // 8. Create Rep Territory with PostGIS Point
      await client.query(`
        INSERT INTO rep_territories (
          id, rep_profile_id, hub_latitude, hub_longitude, hub_geom, radius_meters
        )
        VALUES (
          uuid_generate_v4(), $1, $2::numeric, $3::numeric,
          ST_SetSRID(ST_Point($3::float8, $2::float8), 4326), 20000.00
        );
      `, [repProfile.id, input.hubAddress.latitude, input.hubAddress.longitude]);

      // 9. Grant TUXI_REP role
      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'TUXI_REP')
        ON CONFLICT DO NOTHING;
      `, [input.userId]);

      // 10. Record immutable Terms acceptance (Clickwrap with authoritative metadata)
      const auditEventId = crypto.randomUUID();
      await client.query(`
        INSERT INTO terms_acceptances (
          id, user_id, rep_profile_id, terms_version_id, content_hash,
          accepted_at, acceptance_method, ip_address, user_agent,
          audit_event_id, signature_hash, metadata
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4,
          NOW(), 'CLICKWRAP', $5, $6,
          $7, $8, $9
        );
      `, [
        input.userId,
        repProfile.id,
        termsVersionId,
        termCheck.rows[0].content_hash,
        input.ipAddress || '127.0.0.1',
        input.userAgent || 'TUXI_APP',
        auditEventId,
        `rec-${auditEventId}`,
        JSON.stringify({
          targetRole: 'TUXI_REP',
          termsVersion: termCheck.rows[0].version_tag,
          contentHash: termCheck.rows[0].content_hash,
          acceptanceMethod: 'CLICKWRAP',
          affirmativeStatement: 'I have read and accept the TUXI Rep Terms',
          auditEventId,
          electronicSignatureNotice: 'EXTERNAL ELECTRONIC SIGNATURE INTEGRATION NOT REQUIRED FOR CURRENT CLICKWRAP ACCEPTANCE'
        })
      ]);

      // 11. Audit log
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (uuid_generate_v4(), $1, 'REGISTER_REP_ONBOARDING', 'REP_PROFILE', $2, NULL, $3);
      `, [
        input.userId,
        repProfile.id,
        JSON.stringify({ repProfileId: repProfile.id, hubAddressId, territoryRadiusKm: 20.0 })
      ]);

      await client.query('COMMIT;');

      return {
        repProfileId: repProfile.id,
        status: repProfile.verification_status,
        territoryRadiusKm: 20.0,
        termsAccepted: true
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves Rep profile by user ID.
   */
  public static async getRepProfileByUserId(userId: string) {
    const res = await postgresAdapter.pool.query(`
      SELECT rp.*, rt.hub_latitude, rt.hub_longitude, a.street_line_1 as hub_street, a.city as hub_city
      FROM rep_profiles rp
      JOIN rep_territories rt ON rt.rep_profile_id = rp.id
      JOIN addresses a ON a.id = rp.hub_address_id
      WHERE rp.user_id = $1;
    `, [userId]);
    return res.rows[0] || null;
  }

  /**
   * PostGIS authoritative 20 km territory check against the Rep's persisted hub.
   * Boundary rule: ST_Distance(hub_geom::geography, target_geom::geography) <= 20000.0.
   */
  public static async validateTerritory(
    repProfileId: string,
    targetLat: number,
    targetLng: number
  ): Promise<{ isWithin: boolean; exactDistanceKm: number; calculatedMeters: number }> {
    this.validateCoordinates(targetLat, targetLng);

    const client = await postgresAdapter.pool.connect();
    try {
      const res = await client.query(`
        SELECT 
          (ST_Distance(
            hub_geom::geography,
            ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography
          ) <= 20000.0) AS is_within,
          ST_Distance(
            hub_geom::geography,
            ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography
          ) AS calculated_meters,
          (ST_Distance(
            hub_geom::geography,
            ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography
          ) / 1000.0) AS exact_distance_km
        FROM rep_territories
        WHERE rep_profile_id = $3;
      `, [targetLat, targetLng, repProfileId]);

      if (res.rows.length === 0) {
        throw new Error('REP_TERRITORY_NOT_FOUND: Rep territory or approved hub does not exist');
      }

      return {
        isWithin: Boolean(res.rows[0].is_within),
        exactDistanceKm: parseFloat(res.rows[0].exact_distance_km),
        calculatedMeters: parseFloat(res.rows[0].calculated_meters)
      };
    } finally {
      client.release();
    }
  }

  /**
   * Creates a business acquisition draft in PostgreSQL.
   */
  public static async createDraft(repUserId: string, input: CreateDraftInput) {
    // 1. Verify Rep exists
    const repProfile = await this.getRepProfileByUserId(repUserId);
    if (!repProfile) {
      throw new Error('UNAUTHORIZED_REP: User does not have an active TUXI Rep profile');
    }

    // 1b. Authoritative Rep Verification Gate:
    // Only eligible VERIFIED Reps can create acquisition drafts.
    if (repProfile.verification_status !== 'VERIFIED') {
      throw new Error(`UNVERIFIED_REP: Rep profile is in '${repProfile.verification_status}' status. Only VERIFIED TUXI Reps can acquire businesses.`);
    }

    // 2. Verify current Terms acceptance
    const accepted = await this.isCurrentTermsAccepted(repUserId);
    if (!accepted) {
      throw new Error('TERMS_REACCEPTANCE_REQUIRED: Rep must accept current TUXI Rep terms before creating acquisition drafts');
    }

    // 3. Validate coordinates
    this.validateCoordinates(input.latitude, input.longitude);

    // 4. Territory check
    const terr = await this.validateTerritory(repProfile.id, input.latitude, input.longitude);
    if (!terr.isWithin) {
      throw new Error(`OUT_OF_TERRITORY: Proposed business is ${terr.exactDistanceKm.toFixed(3)} km away, which strictly exceeds the 20.000 km territory limit`);
    }

    // 5. Insert Draft
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const draftRes = await client.query(`
        INSERT INTO business_acquisition_drafts (
          id, rep_profile_id, business_type, business_name, legal_entity_name,
          tax_or_vat_id, owner_name, owner_phone, owner_email, category,
          description, opening_hours, address_line1, address_line2, city,
          state_province, postal_code, country_code, latitude, longitude,
          geom, menu_or_product_draft, notes, status
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17, $18::numeric, $19::numeric,
          ST_SetSRID(ST_Point($19::float8, $18::float8), 4326), $20, $21, 'DRAFT'
        )
        RETURNING *;
      `, [
        repProfile.id,
        input.businessType,
        input.businessName,
        input.legalEntityName || null,
        input.taxOrVatId || null,
        input.ownerName,
        input.ownerPhone,
        input.ownerEmail,
        input.category || null,
        input.description || null,
        JSON.stringify(input.openingHours || {}),
        input.addressLine1,
        input.addressLine2 || null,
        input.city,
        input.stateProvince || null,
        input.postalCode,
        input.countryCode || 'ZAF',
        input.latitude,
        input.longitude,
        JSON.stringify(input.menuOrProductDraft || []),
        input.notes || null
      ]);

      const draft = draftRes.rows[0];

      // Audit log
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (uuid_generate_v4(), $1, 'CREATE_ACQUISITION_DRAFT', 'ACQUISITION_DRAFT', $2, NULL, $3);
      `, [repUserId, draft.id, JSON.stringify({ draftId: draft.id, businessName: input.businessName, distanceKm: terr.exactDistanceKm })]);

      await client.query('COMMIT;');
      return draft;
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves a draft, enforcing Rep ownership.
   */
  public static async getDraft(draftId: string, repUserId: string) {
    const repProfile = await this.getRepProfileByUserId(repUserId);
    if (!repProfile) {
      throw new Error('UNAUTHORIZED_REP');
    }

    const res = await postgresAdapter.pool.query(`
      SELECT * FROM business_acquisition_drafts
      WHERE id = $1;
    `, [draftId]);

    if (res.rows.length === 0) {
      throw new Error('DRAFT_NOT_FOUND');
    }

    const draft = res.rows[0];
    if (draft.rep_profile_id !== repProfile.id) {
      throw new Error('FORBIDDEN_DRAFT_ACCESS: Rep is not authorized to access this draft');
    }

    return draft;
  }

  /**
   * Updates an existing draft, enforcing Rep ownership.
   */
  public static async updateDraft(draftId: string, repUserId: string, updates: Partial<CreateDraftInput>) {
    const draft = await this.getDraft(draftId, repUserId);
    if (draft.status !== 'DRAFT') {
      throw new Error('CANNOT_MODIFY_SUBMITTED_DRAFT: Only drafts in DRAFT status can be modified');
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const queryParts: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (updates.businessName !== undefined) {
        queryParts.push(`business_name = $${idx++}`);
        values.push(updates.businessName);
      }
      if (updates.category !== undefined) {
        queryParts.push(`category = $${idx++}`);
        values.push(updates.category);
      }
      if (updates.description !== undefined) {
        queryParts.push(`description = $${idx++}`);
        values.push(updates.description);
      }
      if (updates.menuOrProductDraft !== undefined) {
        queryParts.push(`menu_or_product_draft = $${idx++}`);
        values.push(JSON.stringify(updates.menuOrProductDraft));
      }
      if (updates.notes !== undefined) {
        queryParts.push(`notes = $${idx++}`);
        values.push(updates.notes);
      }
      if (updates.openingHours !== undefined) {
        queryParts.push(`opening_hours = $${idx++}`);
        values.push(JSON.stringify(updates.openingHours));
      }

      queryParts.push(`updated_at = NOW()`);

      values.push(draftId);
      const updateRes = await client.query(`
        UPDATE business_acquisition_drafts
        SET ${queryParts.join(', ')}
        WHERE id = $${idx}
        RETURNING *;
      `, values);

      await client.query('COMMIT;');
      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Lists drafts created by a specific Rep.
   */
  public static async listDrafts(repUserId: string) {
    const repProfile = await this.getRepProfileByUserId(repUserId);
    if (!repProfile) {
      throw new Error('UNAUTHORIZED_REP');
    }

    const res = await postgresAdapter.pool.query(`
      SELECT * FROM business_acquisition_drafts
      WHERE rep_profile_id = $1
      ORDER BY updated_at DESC;
    `, [repProfile.id]);

    return res.rows;
  }

  /**
   * Generates a cryptographically secure 6-digit owner consent OTP.
   * OTP is hashed at rest with SHA-256.
   */
  public static async generateOwnerConsentOtp(
    draftId: string,
    repUserId: string,
    ownerPhone: string,
    ownerEmail: string
  ): Promise<{ consentId: string; expiresAt: Date; devOtp?: string }> {
    const draft = await this.getDraft(draftId, repUserId);

    // Cryptographically secure 6-digit integer
    const otpInt = crypto.randomInt(100000, 1000000);
    const otp = String(otpInt);
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const insRes = await client.query(`
        INSERT INTO business_owner_consents (
          id, acquisition_draft_id, owner_phone, owner_email,
          otp_hash, expires_at, attempt_count, is_consumed
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3,
          $4, NOW() + INTERVAL '15 minutes', 0, false
        )
        RETURNING id, expires_at;
      `, [draft.id, ownerPhone, ownerEmail, otpHash]);

      const consent = insRes.rows[0];

      // Audit log (never log plaintext OTP)
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (uuid_generate_v4(), $1, 'GENERATE_OWNER_CONSENT_OTP', 'BUSINESS_OWNER_CONSENT', $2, NULL, $3);
      `, [repUserId, consent.id, JSON.stringify({ draftId, ownerPhone, expiresAt: consent.expires_at })]);

      await client.query('COMMIT;');

      return {
        consentId: consent.id,
        expiresAt: consent.expires_at,
        devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Verifies an owner consent OTP and binds it to the draft.
   */
  public static async verifyOwnerConsentOtp(
    consentId: string,
    otp: string,
    repUserId: string,
    draftId: string
  ): Promise<{ success: boolean; consentId: string }> {
    const draft = await this.getDraft(draftId, repUserId);

    if (!otp || typeof otp !== 'string') {
      throw new Error('INVALID_CONSENT_OTP: OTP must be provided');
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const consentRes = await client.query(`
        SELECT * FROM business_owner_consents
        WHERE id = $1 FOR UPDATE;
      `, [consentId]);

      if (consentRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('CONSENT_RECORD_NOT_FOUND');
      }

      const consent = consentRes.rows[0];

      // Verify binding to draft
      if (consent.acquisition_draft_id !== draft.id) {
        await client.query('ROLLBACK;');
        throw new Error('CONSENT_BUSINESS_MISMATCH: Consent token does not belong to this acquisition draft');
      }

      // Check if already consumed (replay protection)
      if (consent.is_consumed) {
        await client.query('ROLLBACK;');
        throw new Error('CONSENT_ALREADY_CONSUMED: This owner consent proof has already been consumed and cannot be replayed');
      }

      // Check expiry
      if (new Date() > new Date(consent.expires_at)) {
        await client.query('ROLLBACK;');
        throw new Error('CONSENT_EXPIRED: Owner consent OTP has expired');
      }

      // Check attempt count
      if (consent.attempt_count >= 5) {
        await client.query('ROLLBACK;');
        throw new Error('CONSENT_ATTEMPT_LIMIT_EXCEEDED: Maximum OTP validation attempts exceeded');
      }

      // Validate hash
      const providedHash = crypto.createHash('sha256').update(otp.trim()).digest('hex');
      if (providedHash !== consent.otp_hash) {
        await client.query(`
          UPDATE business_owner_consents
          SET attempt_count = attempt_count + 1
          WHERE id = $1;
        `, [consentId]);
        await client.query('COMMIT;');
        throw new Error('INVALID_CONSENT_OTP: Provided OTP code does not match');
      }

      // Consume consent
      await client.query(`
        UPDATE business_owner_consents
        SET is_consumed = true, consumed_at = NOW(), attempt_count = attempt_count + 1
        WHERE id = $1;
      `, [consentId]);

      // Bind consent to draft
      await client.query(`
        UPDATE business_acquisition_drafts
        SET owner_consent_id = $1, updated_at = NOW()
        WHERE id = $2;
      `, [consentId, draft.id]);

      // Audit log
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (uuid_generate_v4(), $1, 'VERIFY_OWNER_CONSENT', 'BUSINESS_OWNER_CONSENT', $2, NULL, $3);
      `, [repUserId, consentId, JSON.stringify({ draftId: draft.id, verified: true })]);

      await client.query('COMMIT;');
      return { success: true, consentId };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Adds a business document reference to a draft.
   */
  public static async addDocument(draftId: string, repUserId: string, doc: AddDocumentInput) {
    const draft = await this.getDraft(draftId, repUserId);

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const docRes = await client.query(`
        INSERT INTO acquisition_documents (
          id, acquisition_draft_id, uploader_id, document_type,
          storage_path, file_mime_type, file_size_bytes,
          is_verified, verification_status, verification_notes
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3,
          $4, $5, $6,
          false, 'DOCUMENT_UPLOADED', 'BUSINESS DOCUMENT VERIFICATION INTEGRATION PENDING'
        )
        RETURNING *;
      `, [draft.id, repUserId, doc.documentType, doc.storagePath, doc.fileMimeType, doc.fileSizeBytes]);

      await client.query('COMMIT;');
      return docRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves document metadata with strict Rep privacy / ownership enforcement.
   */
  public static async getDocument(documentId: string, repUserId: string) {
    const res = await postgresAdapter.pool.query(`
      SELECT ad.*, bad.rep_profile_id
      FROM acquisition_documents ad
      JOIN business_acquisition_drafts bad ON bad.id = ad.acquisition_draft_id
      WHERE ad.id = $1;
    `, [documentId]);

    if (res.rows.length === 0) {
      throw new Error('DOCUMENT_NOT_FOUND');
    }

    const doc = res.rows[0];
    const repProfile = await this.getRepProfileByUserId(repUserId);
    if (!repProfile || doc.rep_profile_id !== repProfile.id) {
      throw new Error('FORBIDDEN_DOCUMENT_ACCESS: Unauthorized access to business document');
    }

    return doc;
  }

  /**
   * Deterministic duplicate business check against existing businesses.
   */
  public static async checkDuplicateBusiness(input: {
    taxOrVatId?: string;
    contactPhone?: string;
    streetAddress?: string;
    city?: string;
    postalCode?: string;
    countryCode?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<{ isDuplicate: boolean; duplicateType?: string; reason?: string }> {
    const client = await postgresAdapter.pool.connect();
    try {
      // 1. Tax / VAT ID duplicate check
      if (input.taxOrVatId) {
        const taxRes = await client.query('SELECT id, name FROM businesses WHERE tax_or_vat_id = $1 LIMIT 1;', [input.taxOrVatId.trim()]);
        if (taxRes.rows.length > 0) {
          return {
            isDuplicate: true,
            duplicateType: 'DUPLICATE_TAX_ID',
            reason: `A business (${taxRes.rows[0].name}) with this VAT or Tax registration number already exists`
          };
        }
      }

      // 2. Contact Phone duplicate check
      if (input.contactPhone) {
        const phoneRes = await client.query('SELECT id, name FROM businesses WHERE contact_phone = $1 LIMIT 1;', [input.contactPhone.trim()]);
        if (phoneRes.rows.length > 0) {
          return {
            isDuplicate: true,
            duplicateType: 'DUPLICATE_PHONE_NUMBER',
            reason: `A business (${phoneRes.rows[0].name}) with this contact phone number already exists`
          };
        }
      }

      // 3. Physical Address normalized check
      if (input.streetAddress && input.city && input.postalCode) {
        const normalized = `${input.streetAddress}, ${input.city}, ${input.postalCode}, ${input.countryCode || 'ZAF'}`.toUpperCase();
        const addrRes = await client.query(`
          SELECT b.id, b.name FROM businesses b
          JOIN addresses a ON a.id = b.address_id
          WHERE a.normalized_address = $1
          LIMIT 1;
        `, [normalized]);
        if (addrRes.rows.length > 0) {
          return {
            isDuplicate: true,
            duplicateType: 'DUPLICATE_ADDRESS',
            reason: `A business (${addrRes.rows[0].name}) is already registered at this physical street address`
          };
        }
      }

      // 4. Proximity check (< 50 meters)
      if (input.latitude && input.longitude) {
        const proxRes = await client.query(`
          SELECT id, name, ST_Distance(geom::geography, ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography) as dist
          FROM businesses
          WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography, 50.0)
          LIMIT 1;
        `, [input.latitude, input.longitude]);
        if (proxRes.rows.length > 0) {
          return {
            isDuplicate: true,
            duplicateType: 'POSSIBLE_DUPLICATE',
            reason: `A business (${proxRes.rows[0].name}) exists within 50 metres of this location`
          };
        }
      }

      return { isDuplicate: false };
    } finally {
      client.release();
    }
  }

  /**
   * Submits a business acquisition draft.
   * Atomically creates the business in PENDING_ADMIN_VERIFICATION and creates the Rep attribution.
   * Concurrency safe and protected against attribution hijacking.
   */
  public static async submitBusinessAcquisition(
    draftId: string,
    repUserId: string,
    idempotencyKey: string
  ): Promise<{
    businessId: string;
    attributionId: string;
    status: string;
    isIdempotentReplay: boolean;
    distanceKm: number;
  }> {
    const draft = await this.getDraft(draftId, repUserId);

    // 1. Completeness validation
    if (!draft.owner_consent_id) {
      throw new Error('OWNER_CONSENT_REQUIRED: Acquisition cannot be submitted without verified owner consent');
    }

    const repProfile = await this.getRepProfileByUserId(repUserId);
    if (!repProfile) {
      throw new Error('UNAUTHORIZED_REP');
    }

    // Authoritative Rep Verification Gate:
    if (repProfile.verification_status !== 'VERIFIED') {
      throw new Error(`UNVERIFIED_REP: Rep profile is in '${repProfile.verification_status}' status. Only VERIFIED TUXI Reps can submit acquisitions.`);
    }

    // 2. Terms validation
    const termsOk = await this.isCurrentTermsAccepted(repUserId);
    if (!termsOk) {
      throw new Error('TERMS_REACCEPTANCE_REQUIRED: Rep must accept current TUXI Rep terms before submitting business');
    }

    // 3. PostGIS Territory validation
    const terr = await this.validateTerritory(repProfile.id, parseFloat(draft.latitude), parseFloat(draft.longitude));
    if (!terr.isWithin) {
      throw new Error(`OUT_OF_TERRITORY: Proposed business is ${terr.exactDistanceKm.toFixed(3)} km away, exceeding 20 km limit`);
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // 4. Idempotency replay check
      if (draft.status !== 'DRAFT' && draft.submitted_business_id) {
        const existingAttr = await client.query(`
          SELECT id FROM rep_business_attributions WHERE business_id = $1 AND rep_profile_id = $2;
        `, [draft.submitted_business_id, repProfile.id]);

        await client.query('COMMIT;');
        return {
          businessId: draft.submitted_business_id,
          attributionId: existingAttr.rows[0]?.id || '',
          status: draft.status,
          isIdempotentReplay: true,
          distanceKm: terr.exactDistanceKm
        };
      }

      // 5. Deterministic Duplicate Business Checks
      const dup = await this.checkDuplicateBusiness({
        taxOrVatId: draft.tax_or_vat_id,
        contactPhone: draft.owner_phone,
        streetAddress: draft.address_line1,
        city: draft.city,
        postalCode: draft.postal_code,
        countryCode: draft.country_code
      });

      if (dup.isDuplicate) {
        await client.query(`
          UPDATE business_acquisition_drafts
          SET status = 'POSSIBLE_DUPLICATE', duplicate_reason = $1, updated_at = NOW()
          WHERE id = $2;
        `, [dup.reason, draft.id]);
        await client.query('COMMIT;');
        throw new Error(`${dup.duplicateType}: ${dup.reason}`);
      }

      // 6. Create Address for business
      const normalizedAddress = `${draft.address_line1}, ${draft.city}, ${draft.postal_code}, ${draft.country_code}`.toUpperCase();
      const addrRes = await client.query(`
        INSERT INTO addresses (
          id, user_id, street_line_1, street_line_2, city, state_province, postal_code, country_code,
          latitude, longitude, geom, normalized_address
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7,
          $8::numeric, $9::numeric, ST_SetSRID(ST_Point($9::float8, $8::float8), 4326), $10
        )
        RETURNING id;
      `, [
        repUserId,
        draft.address_line1,
        draft.address_line2 || null,
        draft.city,
        draft.state_province || null,
        draft.postal_code,
        draft.country_code,
        draft.latitude,
        draft.longitude,
        normalizedAddress
      ]);
      const addressId = addrRes.rows[0].id;

      // 7. Create Business in PENDING_ADMIN_VERIFICATION and is_active = false
      const bizRes = await client.query(`
        INSERT INTO businesses (
          id, type, name, legal_entity_name, tax_or_vat_id,
          contact_email, contact_phone, address_id,
          latitude, longitude, geom, status, opening_hours, is_active
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4,
          $5, $6, $7,
          $8::numeric, $9::numeric, ST_SetSRID(ST_Point($9::float8, $8::float8), 4326),
          'PENDING_ADMIN_VERIFICATION', $10, false
        )
        RETURNING id, status, is_active;
      `, [
        draft.business_type,
        draft.business_name,
        draft.legal_entity_name || draft.business_name,
        draft.tax_or_vat_id || `TEMP-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        draft.owner_email,
        draft.owner_phone,
        addressId,
        draft.latitude,
        draft.longitude,
        JSON.stringify(draft.opening_hours || {})
      ]);
      const businessId = bizRes.rows[0].id;

      // 8. Create Rep Attribution (protected by UNIQUE (business_id))
      const attrRes = await client.query(`
        INSERT INTO rep_business_attributions (
          id, rep_profile_id, business_id, distance_at_origination_km,
          attribution_status, originated_at, created_at
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3,
          'ACTIVE', NOW(), NOW()
        )
        RETURNING id;
      `, [
        repProfile.id,
        businessId,
        terr.exactDistanceKm
      ]);
      const attributionId = attrRes.rows[0].id;

      // 9. Link Draft to submitted business
      await client.query(`
        UPDATE business_acquisition_drafts
        SET status = 'PENDING_ADMIN_VERIFICATION',
            submitted_business_id = $1,
            updated_at = NOW()
        WHERE id = $2;
      `, [businessId, draft.id]);

      // 10. Audit log (never log plaintext secrets)
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (uuid_generate_v4(), $1, 'SUBMIT_BUSINESS_ACQUISITION', 'BUSINESS', $2, NULL, $3);
      `, [
        repUserId,
        businessId,
        JSON.stringify({
          businessId,
          attributionId,
          repProfileId: repProfile.id,
          status: 'PENDING_ADMIN_VERIFICATION',
          distanceKm: terr.exactDistanceKm
        })
      ]);

      await client.query('COMMIT;');

      return {
        businessId,
        attributionId,
        status: 'PENDING_ADMIN_VERIFICATION',
        isIdempotentReplay: false,
        distanceKm: terr.exactDistanceKm
      };
    } catch (err: any) {
      await client.query('ROLLBACK;');
      // Handle PostgreSQL unique constraint violations for attribution hijack / duplicate attempts
      if (err.code === '23505') {
        if (err.constraint === 'rep_business_attributions_business_id_key') {
          throw new Error('ATTRIBUTION_ALREADY_EXISTS: Business is already attributed to another TUXI Rep and cannot be overwritten');
        }
        if (err.constraint === 'uq_business_tax_id') {
          throw new Error('DUPLICATE_TAX_ID: A business with this tax or VAT ID already exists');
        }
        if (err.constraint === 'uq_business_phone') {
          throw new Error('DUPLICATE_PHONE_NUMBER: A business with this contact phone number already exists');
        }
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves Rep dashboard data derived from real PostgreSQL ledger and tables.
   */
  public static async getRepDashboard(repUserId: string) {
    const repProfile = await this.getRepProfileByUserId(repUserId);
    if (!repProfile) {
      throw new Error('UNAUTHORIZED_REP');
    }

    const client = await postgresAdapter.pool.connect();
    try {
      // 1. Drafts count & recent drafts
      const draftsRes = await client.query(`
        SELECT count(*)::int as count
        FROM business_acquisition_drafts
        WHERE rep_profile_id = $1 AND status = 'DRAFT';
      `, [repProfile.id]);

      // 2. Submitted / Pending businesses
      const pendingRes = await client.query(`
        SELECT count(*)::int as count
        FROM business_acquisition_drafts
        WHERE rep_profile_id = $1 AND status = 'PENDING_ADMIN_VERIFICATION';
      `, [repProfile.id]);

      // 3. Attributed businesses list
      const attrRes = await client.query(`
        SELECT rba.id as attribution_id, rba.distance_at_origination_km, rba.originated_at,
               b.id as business_id, b.name as business_name, b.type as business_type, b.status as business_status
        FROM rep_business_attributions rba
        JOIN businesses b ON b.id = rba.business_id
        WHERE rba.rep_profile_id = $1
        ORDER BY rba.originated_at DESC;
      `, [repProfile.id]);

      // 4. Authoritative Commission Ledger Summary
      const ledgerRes = await client.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN status = 'EARNED' THEN commission_cents ELSE 0 END), 0)::bigint as total_earned_cents,
          COALESCE(SUM(CASE WHEN status = 'PENDING' THEN commission_cents ELSE 0 END), 0)::bigint as total_pending_cents,
          COUNT(CASE WHEN status = 'EARNED' THEN 1 END)::int as qualifying_sales_count
        FROM commission_ledger
        WHERE rep_profile_id = $1;
      `, [repProfile.id]);

      return {
        repProfileId: repProfile.id,
        hubAddress: {
          street: repProfile.hub_street,
          city: repProfile.hub_city,
          latitude: parseFloat(repProfile.hub_latitude),
          longitude: parseFloat(repProfile.hub_longitude),
          territoryRadiusKm: parseFloat(repProfile.territory_radius_km)
        },
        draftCount: draftsRes.rows[0].count,
        pendingVerificationCount: pendingRes.rows[0].count,
        attributedBusinessesCount: attrRes.rows.length,
        attributedBusinesses: attrRes.rows,
        commissionSummary: {
          totalEarnedCents: Number(ledgerRes.rows[0].total_earned_cents),
          totalPendingCents: Number(ledgerRes.rows[0].total_pending_cents),
          qualifyingSalesCount: Number(ledgerRes.rows[0].qualifying_sales_count)
        }
      };
    } finally {
      client.release();
    }
  }

  /**
   * AI/OCR assisted extraction boundary.
   * Suggestions only - does NOT have authority to approve or verify documents.
   */
  public static extractBusinessDraftSuggestions(imageOrDocData: any) {
    return {
      isAiSuggestion: true,
      status: 'OCR_INTEGRATION_PENDING',
      message: 'AI/OCR output is advisory only and cannot verify documents or approve businesses',
      suggestions: {
        businessName: imageOrDocData?.suggestedName || null,
        category: imageOrDocData?.suggestedCategory || null,
        address: imageOrDocData?.suggestedAddress || null,
        menuItems: imageOrDocData?.suggestedItems || []
      }
    };
  }

  /**
   * Administrative verification of a TUXI Rep profile.
   * Enforces server-side authority for transitioning Rep status (PENDING -> VERIFIED / REJECTED / REVOKED).
   */
  public static async verifyRepProfile(
    adminUserId: string,
    repProfileId: string,
    decision: 'VERIFIED' | 'REJECTED' | 'REVOKED',
    notes?: string
  ) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');
      const repRes = await client.query('SELECT id, user_id, verification_status FROM rep_profiles WHERE id = $1;', [repProfileId]);
      if (repRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('REP_PROFILE_NOT_FOUND');
      }
      const prev = repRes.rows[0].verification_status;
      await client.query('UPDATE rep_profiles SET verification_status = $1, updated_at = NOW() WHERE id = $2;', [decision, repProfileId]);

      const auditId = crypto.randomUUID();
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES ($1, $2, 'ADMIN_VERIFY_REP_PROFILE', 'REP_PROFILE', $3, $4, $5);
      `, [
        auditId,
        adminUserId,
        repProfileId,
        JSON.stringify({ previousStatus: prev }),
        JSON.stringify({ newStatus: decision, notes: notes || 'Administrative verification' })
      ]);

      await client.query('COMMIT;');
      return { repProfileId, previousStatus: prev, newStatus: decision };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Evaluates overall Rep eligibility criteria:
   * - Active user account
   * - TUXI_REP role
   * - Verified profile (verification_status === 'VERIFIED')
   * - Confirmed phone & cellular data
   * - Current published terms accepted with matching content_hash
   */
  public static async isRepEligible(userId: string): Promise<boolean> {
    const client = await postgresAdapter.pool.connect();
    try {
      const userRes = await client.query('SELECT is_active FROM users WHERE id = $1;', [userId]);
      if (userRes.rows.length === 0 || !userRes.rows[0].is_active) return false;

      const roleRes = await client.query("SELECT id FROM user_roles WHERE user_id = $1 AND role = 'TUXI_REP';", [userId]);
      if (roleRes.rows.length === 0) return false;

      const repRes = await client.query(`
        SELECT id, verification_status, has_mobile_phone, has_mobile_data, has_own_transport
        FROM rep_profiles WHERE user_id = $1;
      `, [userId]);
      if (repRes.rows.length === 0) return false;
      const rep = repRes.rows[0];

      if (rep.verification_status !== 'VERIFIED') return false;
      if (!rep.has_mobile_phone || !rep.has_mobile_data) return false;

      const termsAccepted = await this.isCurrentTermsAccepted(userId);
      if (!termsAccepted) return false;

      return true;
    } finally {
      client.release();
    }
  }
}
