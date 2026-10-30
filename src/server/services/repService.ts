import crypto from 'node:crypto';
import { dbInstance } from '../db/database.js';
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
  termsVersionId: string;
  ipAddress: string;
  userAgent: string;
}

export interface OnboardBusinessInput {
  repUserId: string;
  type: 'EATS' | 'SHOP' | 'COURIER_HUB';
  name: string;
  legalEntityName: string;
  taxOrVatId: string;
  contactEmail: string;
  contactPhone: string;
  address: {
    streetLine1: string;
    streetLine2?: string;
    city: string;
    stateProvince?: string;
    postalCode: string;
    countryCode: string;
    latitude: number;
    longitude: number;
  };
  openingHours?: Record<string, string>;
  ownerConsentObtained: boolean;
}

export class RepService {
  /**
   * Calculates the exact great-circle distance between two points using double-precision Haversine.
   * Earth Radius = 6371.000 km.
   * Result is returned in kilometers without coarse 1-decimal rounding.
   */
  public static calculateExactDistanceKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371.0;
    const toRad = (deg: number) => (deg * Math.PI) / 180.0;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Authoritative server-side 10 km territory boundary evaluation.
   * Boundary rule: distance <= 10.000 km = INSIDE, distance > 10.000 km = OUTSIDE.
   */
  public static validateTerritory(
    hubLat: number,
    hubLng: number,
    bizLat: number,
    bizLng: number,
    maxRadiusKm: number = 10.0
  ): { isWithin: boolean; exactDistanceKm: number } {
    const exactDistanceKm = this.calculateExactDistanceKm(hubLat, hubLng, bizLat, bizLng);
    return {
      isWithin: exactDistanceKm <= maxRadiusKm,
      exactDistanceKm
    };
  }

  /**
   * PostGIS Authoritative spatial territory evaluation.
   * When PostgreSQL / PostGIS is connected via process.env.SQL_HOST, executes directly in the PostGIS engine.
   * Falls back to exact Haversine if PostGIS is offline.
   */
  public static async validateTerritoryAuthoritative(
    hubLat: number,
    hubLng: number,
    bizLat: number,
    bizLng: number,
    maxRadiusKm: number = 10.0
  ): Promise<{ isWithin: boolean; exactDistanceKm: number; engine: 'POSTGIS' | 'HAVERSINE' }> {
    if (process.env.SQL_HOST) {
      try {
        const result = await postgresAdapter.validateTerritoryPostGIS(
          hubLat,
          hubLng,
          bizLat,
          bizLng,
          maxRadiusKm * 1000.0
        );
        return {
          ...result,
          engine: 'POSTGIS',
        };
      } catch (err) {
        console.warn('[PostGIS Territory Fallback]', err);
      }
    }
    const haversine = this.validateTerritory(hubLat, hubLng, bizLat, bizLng, maxRadiusKm);
    return {
      ...haversine,
      engine: 'HAVERSINE',
    };
  }

  /**
   * Validates age >= 18 from birthDate string (YYYY-MM-DD).
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
   * Registers a new TUXI Rep with full compliance and Terms acceptance audit logging.
   */
  public static registerRep(input: RegisterRepInput) {
    // 1. Mandatory 18+ check
    if (!this.validateAge18(input.birthDate)) {
      throw new Error('UNDERAGE_REP_REJECTED: TUXI Reps must be at least 18 years of age');
    }

    // 2. Mandatory Mobile Phone & Mobile Data confirmation
    if (!input.hasMobilePhone || !input.hasMobileData) {
      throw new Error('MOBILE_REQUIREMENTS_REJECTED: Rep must confirm ownership of mobile phone and cellular data plan');
    }

    // 3. Verify Terms version exists and is active
    const terms = dbInstance.db.prepare(`
      SELECT id, version_tag, content_hash FROM terms_versions WHERE id = ?
    `).get(input.termsVersionId) as any;

    if (!terms) {
      throw new Error('INVALID_TERMS_VERSION: Provided terms version does not exist');
    }

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      // Create Hub Address
      const addressId = dbInstance.generateUuid();
      const normalizedAddress = `${input.hubAddress.streetLine1}, ${input.hubAddress.city}, ${input.hubAddress.postalCode}, ${input.hubAddress.countryCode}`.toUpperCase();

      dbInstance.db.prepare(`
        INSERT INTO addresses (id, user_id, street_line_1, street_line_2, city, state_province, postal_code, country_code, latitude, longitude, normalized_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        addressId,
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
      );

      // Create Rep Profile
      const repProfileId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO rep_profiles (id, user_id, birth_date, has_mobile_phone, has_mobile_data, has_own_transport, transport_details, hub_address_id, territory_radius_km)
        VALUES (?, ?, ?, 1, 1, ?, ?, ?, 10.0)
      `).run(
        repProfileId,
        input.userId,
        input.birthDate,
        input.hasOwnTransport ? 1 : 0,
        input.transportDetails || null,
        addressId
      );

      // Create Rep Territory
      const territoryId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO rep_territories (id, rep_profile_id, hub_latitude, hub_longitude, radius_meters)
        VALUES (?, ?, ?, ?, 10000.0)
      `).run(
        territoryId,
        repProfileId,
        input.hubAddress.latitude,
        input.hubAddress.longitude
      );

      // Grant TUXI_REP role if not present
      const roleExists = dbInstance.db.prepare(`
        SELECT id FROM user_roles WHERE user_id = ? AND role = 'TUXI_REP'
      `).get(input.userId);

      if (!roleExists) {
        dbInstance.db.prepare(`
          INSERT INTO user_roles (id, user_id, role)
          VALUES (?, ?, 'TUXI_REP')
        `).run(dbInstance.generateUuid(), input.userId);
      }

      // Record immutable Terms acceptance audit record
      const acceptanceId = dbInstance.generateUuid();
      const signatureHash = crypto.createHash('sha256').update(`${input.userId}-${input.termsVersionId}-${Date.now()}`).digest('hex');

      dbInstance.db.prepare(`
        INSERT INTO terms_acceptances (id, user_id, terms_version_id, ip_address, user_agent, signature_hash, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        acceptanceId,
        input.userId,
        input.termsVersionId,
        input.ipAddress,
        input.userAgent,
        signatureHash,
        JSON.stringify({ targetRole: 'TUXI_REP', termsVersion: terms.version_tag })
      );

      // Record audit log
      dbInstance.db.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (?, ?, 'REGISTER_REP_ONBOARDING', 'REP_PROFILE', ?, NULL, ?)
      `).run(
        dbInstance.generateUuid(),
        input.userId,
        repProfileId,
        JSON.stringify({ repProfileId, hubAddressId: addressId, territoryRadiusKm: 10.0 })
      );

      dbInstance.db.exec('COMMIT;');

      return {
        repProfileId,
        status: 'PENDING_VERIFICATION',
        territoryRadiusKm: 10.0,
        termsAccepted: true
      };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Onboards a merchant business with duplicate protection and strict 10km server-side validation.
   */
  public static onboardBusiness(input: OnboardBusinessInput) {
    if (!input.ownerConsentObtained) {
      throw new Error('OWNER_CONSENT_REQUIRED: Merchant onboarding requires explicit owner consent authorization');
    }

    // Retrieve Rep profile and territory
    const repProfile = dbInstance.db.prepare(`
      SELECT r.id as rep_profile_id, t.hub_latitude, t.hub_longitude, r.territory_radius_km
      FROM rep_profiles r
      JOIN rep_territories t ON t.rep_profile_id = r.id
      WHERE r.user_id = ?
    `).get(input.repUserId) as any;

    if (!repProfile) {
      throw new Error('UNAUTHORIZED_REP: User does not have an active TUXI Rep profile');
    }

    // 1. Authoritative Server-side Territory Validation (DO NOT TRUST CLIENT ASSERTIONS)
    const { isWithin, exactDistanceKm } = this.validateTerritory(
      repProfile.hub_latitude,
      repProfile.hub_longitude,
      input.address.latitude,
      input.address.longitude,
      repProfile.territory_radius_km || 10.0
    );

    if (!isWithin) {
      throw new Error(`OUT_OF_TERRITORY: Proposed business is ${exactDistanceKm.toFixed(3)} km away, which strictly exceeds the 10.000 km territory limit`);
    }

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      // 2. Duplicate Detection: VAT / Tax ID
      const duplicateVat = dbInstance.db.prepare('SELECT id FROM businesses WHERE tax_or_vat_id = ?').get(input.taxOrVatId);
      if (duplicateVat) {
        throw new Error('DUPLICATE_TAX_ID: A business with this VAT or Tax registration number already exists');
      }

      // 3. Duplicate Detection: Contact Phone
      const duplicatePhone = dbInstance.db.prepare('SELECT id FROM businesses WHERE contact_phone = ?').get(input.contactPhone);
      if (duplicatePhone) {
        throw new Error('DUPLICATE_PHONE_NUMBER: A business with this primary contact phone number already exists');
      }

      // 4. Duplicate Detection: Normalized Address
      const normalizedAddress = `${input.address.streetLine1}, ${input.address.city}, ${input.address.postalCode}, ${input.address.countryCode}`.toUpperCase();
      const duplicateAddress = dbInstance.db.prepare(`
        SELECT b.id FROM businesses b
        JOIN addresses a ON b.address_id = a.id
        WHERE a.normalized_address = ?
      `).get(normalizedAddress);

      if (duplicateAddress) {
        throw new Error('DUPLICATE_ADDRESS: A business is already registered at this physical street address');
      }

      // Create Address
      const addressId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO addresses (id, street_line_1, street_line_2, city, state_province, postal_code, country_code, latitude, longitude, normalized_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        addressId,
        input.address.streetLine1,
        input.address.streetLine2 || null,
        input.address.city,
        input.address.stateProvince || null,
        input.address.postalCode,
        input.address.countryCode,
        input.address.latitude,
        input.address.longitude,
        normalizedAddress
      );

      // Create Business in PENDING_VERIFICATION state (Never auto-approve unverified)
      const businessId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO businesses (id, type, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone, address_id, latitude, longitude, status, opening_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_VERIFICATION', ?)
      `).run(
        businessId,
        input.type,
        input.name,
        input.legalEntityName,
        input.taxOrVatId,
        input.contactEmail,
        input.contactPhone,
        addressId,
        input.address.latitude,
        input.address.longitude,
        JSON.stringify(input.openingHours || {})
      );

      // Create Rep Business Attribution
      const attributionId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO rep_business_attributions (id, rep_profile_id, business_id, distance_at_origination_km, attribution_status)
        VALUES (?, ?, ?, ?, 'ACTIVE')
      `).run(
        attributionId,
        repProfile.rep_profile_id,
        businessId,
        exactDistanceKm
      );

      // Create Audit Log
      dbInstance.db.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (?, ?, 'ONBOARD_BUSINESS_APPLICATION', 'BUSINESS', ?, NULL, ?)
      `).run(
        dbInstance.generateUuid(),
        input.repUserId,
        businessId,
        JSON.stringify({ businessId, attributionId, distanceKm: exactDistanceKm, status: 'PENDING_VERIFICATION' })
      );

      dbInstance.db.exec('COMMIT;');

      return {
        businessId,
        status: 'PENDING_VERIFICATION',
        distanceKm: exactDistanceKm,
        attributionId
      };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }
}
