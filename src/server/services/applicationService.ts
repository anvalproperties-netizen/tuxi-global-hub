import crypto from 'node:crypto';
import { dbInstance } from '../db/database.js';
import { postgresAdapter } from '../db/postgres.js';
import { RepService } from './repService.js';
import { APPROVED_DELIVERY_VEHICLE_TYPES, PROHIBITED_DELIVERY_VEHICLE_TYPES } from './driverService.js';

export type ApplicationStatus = 'DRAFT' | 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';
export type VerificationDocumentStatus = 'UNVERIFIED' | 'SUBMITTED' | 'PENDING_REVIEW' | 'VERIFIED' | 'FAILED' | 'REJECTED';

export interface SubmitRepApplicationInput {
  fullLegalName?: string;
  idDocumentNumber?: string;
  birthDate: string; // YYYY-MM-DD
  contactPhone: string;
  hasMobilePhone?: boolean;
  hasMobileData?: boolean;
  hasOwnTransport?: boolean;
  transportDetails: string;
  residentialAddress: {
    line1: string;
    city: string;
    postalCode: string;
    country?: string;
  };
  hubAddress: {
    line1: string;
    city: string;
    postalCode: string;
    latitude: number;
    longitude: number;
  };
  bankingDetails?: {
    bankName: string;
    accountNumberMasked: string;
    branchCode: string;
    accountHolder: string;
  };
  proofOfResidenceDocId?: string;
  idDocumentDocId?: string;
  termsVersionId?: string;
}

export interface SubmitDriverApplicationInput {
  fullLegalName?: string;
  transportType: string; // 'MOTORCYCLE' | 'CAR' | 'BAKKIE' | 'LIGHT_TRUCK'
  licenseNumber: string;
  vehiclePlate: string;
  vehicleMakeModel: string;
  contactPhone: string;
  idDocumentNumber: string;
  residentialAddress?: {
    line1: string;
    city: string;
    postalCode: string;
  };
  bankingDetails?: {
    bankName: string;
    accountNumberMasked: string;
    branchCode: string;
    accountHolder: string;
  };
  idDocumentDocId?: string;
  proofOfResidenceDocId?: string;
  driverSelfieDocId?: string;
  driverTransportSelfieDocId?: string;
  driversLicenseDocId?: string;
  vehicleRoadworthyDocId?: string;
  payloadCertDocId?: string;
  safetyGearConfirmed?: boolean;
  backgroundCheckConsent?: boolean;
  safetyCharterConsent?: boolean;
  roadworthyInsuranceConfirmed?: boolean;
}

export interface ReviewApplicationInput {
  applicationId: string;
  roleType: 'REP' | 'DRIVER';
  decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  reason?: string;
  reviewNotes?: string;
  verifiedDocuments?: Record<string, VerificationDocumentStatus>;
}

export class ApplicationService {

  /**
   * Submits a secure Rep application linked to the authenticated user's ID.
   * Enforces:
   * - Age >= 18 check
   * - Strict 10 km territory definition
   * - Duplicate prevention
   * - Zero auto-elevation to TUXI_REP role
   */
  public static async submitRepApplication(userId: string, input: SubmitRepApplicationInput) {
    if (!userId) throw new Error('UNAUTHENTICATED: Valid user identity required');

    // 1. Age verification
    const isAge18 = RepService.validateAge18(input.birthDate);
    if (!isAge18) {
      throw new Error('AGE_REQUIREMENT_NOT_MET: TUXI Rep applicants must be at least 18 years of age');
    }

    // 2. Validate coordinates
    if (isNaN(input.hubAddress.latitude) || isNaN(input.hubAddress.longitude)) {
      throw new Error('INVALID_HUB_COORDINATES: Valid latitude and longitude are required for home hub');
    }

    if (input.hubAddress.latitude < -90 || input.hubAddress.latitude > 90 ||
        input.hubAddress.longitude < -180 || input.hubAddress.longitude > 180) {
      throw new Error('COORDINATES_OUT_OF_BOUNDS: Latitude or longitude outside valid geographic range');
    }

    const territoryRadiusKm = 10.0;
    const appId = crypto.randomUUID();

    // Check PostgreSQL first if configured
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        // Check for existing application
        const existing = await client.query(
          'SELECT id, status, submitted_at FROM rep_applications WHERE user_id = $1;',
          [userId]
        );

        if (existing.rows.length > 0) {
          const prev = existing.rows[0];
          if (prev.status === 'PENDING_REVIEW') {
            await client.query('COMMIT;');
            return {
              applicationId: prev.id,
              status: prev.status,
              submittedAt: prev.submitted_at,
              isIdempotentReplay: true,
              message: 'Existing application is currently in administrative review'
            };
          }
          if (prev.status === 'APPROVED') {
            await client.query('COMMIT;');
            throw new Error('APPLICATION_ALREADY_APPROVED: User is already an approved TUXI Rep');
          }
        }

        const insertRes = await client.query(`
          INSERT INTO rep_applications (
            id, user_id, status, birth_date, contact_phone,
            has_mobile_phone, has_mobile_data, has_own_transport, transport_details,
            residential_address_line1, residential_city, residential_postal_code, residential_country,
            proof_of_residence_status, hub_street_line1, hub_city, hub_postal_code,
            hub_latitude, hub_longitude, territory_radius_km,
            terms_version_id, terms_accepted_at, banking_status,
            submitted_at, created_at, updated_at
          )
          VALUES (
            $1, $2, 'PENDING_REVIEW', $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11, $12,
            'UNVERIFIED', $13, $14, $15,
            $16, $17, $18,
            $19, NOW(), 'UNVERIFIED',
            NOW(), NOW(), NOW()
          )
          ON CONFLICT (user_id) DO UPDATE SET
            status = 'PENDING_REVIEW',
            birth_date = EXCLUDED.birth_date,
            contact_phone = EXCLUDED.contact_phone,
            transport_details = EXCLUDED.transport_details,
            residential_address_line1 = EXCLUDED.residential_address_line1,
            residential_city = EXCLUDED.residential_city,
            residential_postal_code = EXCLUDED.residential_postal_code,
            hub_street_line1 = EXCLUDED.hub_street_line1,
            hub_city = EXCLUDED.hub_city,
            hub_postal_code = EXCLUDED.hub_postal_code,
            hub_latitude = EXCLUDED.hub_latitude,
            hub_longitude = EXCLUDED.hub_longitude,
            rejection_reason = NULL,
            submitted_at = NOW(),
            updated_at = NOW()
          RETURNING id, user_id, status, submitted_at, territory_radius_km;
        `, [
          appId, userId, input.birthDate, input.contactPhone,
          input.hasMobilePhone !== false, input.hasMobileData !== false, input.hasOwnTransport !== false, input.transportDetails,
          input.residentialAddress.line1, input.residentialAddress.city, input.residentialAddress.postalCode, input.residentialAddress.country || 'ZA',
          input.hubAddress.line1, input.hubAddress.city, input.hubAddress.postalCode,
          input.hubAddress.latitude, input.hubAddress.longitude, territoryRadiusKm,
          input.termsVersionId || 'v2.1-rep-terms-2026'
        ]);

        await client.query(`
          INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
          VALUES (uuid_generate_v4(), $1, 'APPLICANT_REP_SUBMISSION', 'REP_APPLICATION', $2, NULL, $3);
        `, [userId, insertRes.rows[0].id, JSON.stringify({ status: 'PENDING_REVIEW', territoryRadiusKm })]);

        await client.query('COMMIT;');
        return {
          applicationId: insertRes.rows[0].id,
          status: 'PENDING_REVIEW',
          submittedAt: insertRes.rows[0].submitted_at,
          territoryRadiusKm,
          isIdempotentReplay: false
        };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    // SQLite Development Fallback
    const existing = dbInstance.db.prepare('SELECT id, status, submitted_at FROM rep_applications WHERE user_id = ?').get(userId) as any;
    if (existing) {
      if (existing.status === 'PENDING_REVIEW') {
        return {
          applicationId: existing.id,
          status: existing.status,
          submittedAt: existing.submitted_at,
          isIdempotentReplay: true,
          message: 'Existing application is currently in administrative review'
        };
      }
      if (existing.status === 'APPROVED') {
        throw new Error('APPLICATION_ALREADY_APPROVED: User is already an approved TUXI Rep');
      }
    }

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      dbInstance.db.prepare(`
        INSERT INTO rep_applications (
          id, user_id, status, birth_date, contact_phone,
          has_mobile_phone, has_mobile_data, has_own_transport, transport_details,
          residential_address_line1, residential_city, residential_postal_code, residential_country,
          proof_of_residence_status, hub_street_line1, hub_city, hub_postal_code,
          hub_latitude, hub_longitude, territory_radius_km,
          terms_version_id, terms_accepted_at, banking_status,
          full_legal_name, id_document_number, banking_bank_name,
          banking_account_number_masked, banking_branch_code, banking_account_holder,
          banking_verification_status, proof_of_residence_doc_id, id_document_doc_id,
          submitted_at, created_at, updated_at
        )
        VALUES (?, ?, 'PENDING_REVIEW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNVERIFIED', ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'UNVERIFIED', ?, ?, ?, ?, ?, ?, 'PENDING_VERIFICATION', ?, ?, datetime('now'), datetime('now'), datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          status = 'PENDING_REVIEW',
          birth_date = excluded.birth_date,
          contact_phone = excluded.contact_phone,
          transport_details = excluded.transport_details,
          residential_address_line1 = excluded.residential_address_line1,
          residential_city = excluded.residential_city,
          residential_postal_code = excluded.residential_postal_code,
          hub_street_line1 = excluded.hub_street_line1,
          hub_city = excluded.hub_city,
          hub_postal_code = excluded.hub_postal_code,
          hub_latitude = excluded.hub_latitude,
          hub_longitude = excluded.hub_longitude,
          full_legal_name = excluded.full_legal_name,
          id_document_number = excluded.id_document_number,
          banking_bank_name = excluded.banking_bank_name,
          banking_account_number_masked = excluded.banking_account_number_masked,
          banking_branch_code = excluded.banking_branch_code,
          banking_account_holder = excluded.banking_account_holder,
          banking_verification_status = 'PENDING_VERIFICATION',
          proof_of_residence_doc_id = excluded.proof_of_residence_doc_id,
          id_document_doc_id = excluded.id_document_doc_id,
          rejection_reason = NULL,
          submitted_at = datetime('now'),
          updated_at = datetime('now');
      `).run(
        appId, userId, input.birthDate, input.contactPhone,
        input.hasMobilePhone !== false ? 1 : 0, input.hasMobileData !== false ? 1 : 0, input.hasOwnTransport !== false ? 1 : 0, input.transportDetails,
        input.residentialAddress.line1, input.residentialAddress.city, input.residentialAddress.postalCode, input.residentialAddress.country || 'ZA',
        input.hubAddress.line1, input.hubAddress.city, input.hubAddress.postalCode,
        input.hubAddress.latitude, input.hubAddress.longitude, territoryRadiusKm,
        input.termsVersionId || 'v2026.1',
        input.fullLegalName || null,
        input.idDocumentNumber || null,
        input.bankingDetails?.bankName || null,
        input.bankingDetails?.accountNumberMasked || null,
        input.bankingDetails?.branchCode || null,
        input.bankingDetails?.accountHolder || null,
        input.proofOfResidenceDocId || null,
        input.idDocumentDocId || null
      );

      dbInstance.db.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (?, ?, 'APPLICANT_REP_SUBMISSION', 'REP_APPLICATION', ?, NULL, ?)
      `).run(dbInstance.generateUuid(), userId, appId, JSON.stringify({ status: 'PENDING_REVIEW', territoryRadiusKm }));

      dbInstance.db.exec('COMMIT;');
      return {
        applicationId: appId,
        status: 'PENDING_REVIEW',
        submittedAt: new Date().toISOString(),
        territoryRadiusKm,
        isIdempotentReplay: false
      };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Submits a secure Driver application linked to the authenticated user's ID.
   * Enforces:
   * - Strict rejection of Bicycles and E-Bikes
   * - Approved transport categories only (Motorcycle, Car, Bakkie, Light Truck)
   * - Mandatory license, plate, make/model
   * - Duplicate prevention
   * - Zero auto-elevation to TUXI_DELIVERY_DRIVER role
   */
  public static async submitDriverApplication(userId: string, input: SubmitDriverApplicationInput) {
    if (!userId) throw new Error('UNAUTHENTICATED: Valid user identity required');

    const rawTransport = (input.transportType || '').trim().toUpperCase();

    // 1. STRICT BICYCLE & E-BIKE REJECTION
    if (PROHIBITED_DELIVERY_VEHICLE_TYPES.some(p => rawTransport === p || (rawTransport.includes('BICYCLE') || (rawTransport.includes('BIKE') && !rawTransport.includes('MOTORBIKE'))))) {
      throw new Error('BICYCLE_TRANSPORT_PROHIBITED: Bicycles and electric bicycles are strictly prohibited for commercial delivery transport. Approved categories are Motorcycle / Scooter, Car, Bakkie / Van, and Suitable Light Truck.');
    }

    if (!APPROVED_DELIVERY_VEHICLE_TYPES.some(a => rawTransport === a || rawTransport.includes(a))) {
      throw new Error(`INVALID_VEHICLE_TYPE: '${input.transportType}' is not an approved delivery transport category.`);
    }

    if (!input.licenseNumber?.trim()) {
      throw new Error('MISSING_DRIVER_LICENSE: Valid driving license number is mandatory');
    }

    if (!input.vehiclePlate?.trim()) {
      throw new Error('MISSING_VEHICLE_PLATE: Valid vehicle license plate is mandatory');
    }

    if (!input.idDocumentNumber?.trim()) {
      throw new Error('MISSING_IDENTITY_DOCUMENT: Valid National ID or Passport document number is mandatory');
    }

    const appId = crypto.randomUUID();

    // Check PostgreSQL
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        const existing = await client.query(
          'SELECT id, status, submitted_at FROM driver_applications WHERE user_id = $1;',
          [userId]
        );

        if (existing.rows.length > 0) {
          const prev = existing.rows[0];
          if (prev.status === 'PENDING_REVIEW') {
            await client.query('COMMIT;');
            return {
              applicationId: prev.id,
              status: prev.status,
              submittedAt: prev.submitted_at,
              isIdempotentReplay: true,
              message: 'Existing application is currently in administrative review'
            };
          }
          if (prev.status === 'APPROVED') {
            await client.query('COMMIT;');
            throw new Error('APPLICATION_ALREADY_APPROVED: User is already an approved TUXI Delivery Driver');
          }
        }

        const insertRes = await client.query(`
          INSERT INTO driver_applications (
            id, user_id, status, transport_type, license_number, vehicle_plate,
            vehicle_make_model, contact_phone, id_document_number,
            residential_address_line1, residential_city, residential_postal_code,
            safety_gear_confirmed, background_check_consent, safety_charter_consent,
            roadworthy_insurance_confirmed, proof_of_residence_status, facial_liveness_status,
            transport_selfie_status, vehicle_documents_status, banking_status,
            submitted_at, created_at, updated_at
          )
          VALUES (
            $1, $2, 'PENDING_REVIEW', $3, $4, $5,
            $6, $7, $8,
            $9, $10, $11,
            $12, $13, $14,
            $15, 'UNVERIFIED', 'UNVERIFIED',
            'UNVERIFIED', 'PENDING_REVIEW', 'UNVERIFIED',
            NOW(), NOW(), NOW()
          )
          ON CONFLICT (user_id) DO UPDATE SET
            status = 'PENDING_REVIEW',
            transport_type = EXCLUDED.transport_type,
            license_number = EXCLUDED.license_number,
            vehicle_plate = EXCLUDED.vehicle_plate,
            vehicle_make_model = EXCLUDED.vehicle_make_model,
            contact_phone = EXCLUDED.contact_phone,
            id_document_number = EXCLUDED.id_document_number,
            rejection_reason = NULL,
            submitted_at = NOW(),
            updated_at = NOW()
          RETURNING id, user_id, status, transport_type, vehicle_plate, submitted_at;
        `, [
          appId, userId, rawTransport, input.licenseNumber.trim(), input.vehiclePlate.trim().toUpperCase(),
          input.vehicleMakeModel.trim(), input.contactPhone.trim(), input.idDocumentNumber.trim(),
          input.residentialAddress?.line1 || null, input.residentialAddress?.city || null, input.residentialAddress?.postalCode || null,
          input.safetyGearConfirmed !== false, input.backgroundCheckConsent !== false, input.safetyCharterConsent !== false,
          input.roadworthyInsuranceConfirmed !== false
        ]);

        await client.query(`
          INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
          VALUES (uuid_generate_v4(), $1, 'APPLICANT_DRIVER_SUBMISSION', 'DRIVER_APPLICATION', $2, NULL, $3);
        `, [userId, insertRes.rows[0].id, JSON.stringify({ status: 'PENDING_REVIEW', transportType: rawTransport })]);

        await client.query('COMMIT;');
        return {
          applicationId: insertRes.rows[0].id,
          status: 'PENDING_REVIEW',
          transportType: rawTransport,
          vehiclePlate: insertRes.rows[0].vehicle_plate,
          submittedAt: insertRes.rows[0].submitted_at,
          isIdempotentReplay: false
        };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    // SQLite Development Fallback
    const existing = dbInstance.db.prepare('SELECT id, status, submitted_at FROM driver_applications WHERE user_id = ?').get(userId) as any;
    if (existing) {
      if (existing.status === 'PENDING_REVIEW') {
        return {
          applicationId: existing.id,
          status: existing.status,
          submittedAt: existing.submitted_at,
          isIdempotentReplay: true,
          message: 'Existing application is currently in administrative review'
        };
      }
      if (existing.status === 'APPROVED') {
        throw new Error('APPLICATION_ALREADY_APPROVED: User is already an approved TUXI Delivery Driver');
      }
    }

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      dbInstance.db.prepare(`
        INSERT INTO driver_applications (
          id, user_id, status, transport_type, license_number, vehicle_plate,
          vehicle_make_model, contact_phone, id_document_number,
          residential_address_line1, residential_city, residential_postal_code,
          safety_gear_confirmed, background_check_consent, safety_charter_consent,
          roadworthy_insurance_confirmed, proof_of_residence_status, facial_liveness_status,
          transport_selfie_status, vehicle_documents_status, banking_status,
          full_legal_name, banking_bank_name, banking_account_number_masked,
          banking_branch_code, banking_account_holder, banking_verification_status,
          id_document_doc_id, proof_of_residence_doc_id, driver_selfie_doc_id,
          driver_transport_selfie_doc_id, drivers_license_doc_id, vehicle_roadworthy_doc_id,
          payload_cert_doc_id,
          submitted_at, created_at, updated_at
        )
        VALUES (
          ?, ?, 'PENDING_REVIEW', ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, 'UNVERIFIED', 'UNVERIFIED',
          'UNVERIFIED', 'PENDING_REVIEW', 'UNVERIFIED',
          ?, ?, ?,
          ?, ?, 'PENDING_VERIFICATION',
          ?, ?, ?,
          ?, ?, ?,
          ?,
          datetime('now'), datetime('now'), datetime('now')
        )
        ON CONFLICT(user_id) DO UPDATE SET
          status = 'PENDING_REVIEW',
          transport_type = excluded.transport_type,
          license_number = excluded.license_number,
          vehicle_plate = excluded.vehicle_plate,
          vehicle_make_model = excluded.vehicle_make_model,
          contact_phone = excluded.contact_phone,
          id_document_number = excluded.id_document_number,
          residential_address_line1 = excluded.residential_address_line1,
          residential_city = excluded.residential_city,
          residential_postal_code = excluded.residential_postal_code,
          full_legal_name = excluded.full_legal_name,
          banking_bank_name = excluded.banking_bank_name,
          banking_account_number_masked = excluded.banking_account_number_masked,
          banking_branch_code = excluded.banking_branch_code,
          banking_account_holder = excluded.banking_account_holder,
          banking_verification_status = 'PENDING_VERIFICATION',
          id_document_doc_id = excluded.id_document_doc_id,
          proof_of_residence_doc_id = excluded.proof_of_residence_doc_id,
          driver_selfie_doc_id = excluded.driver_selfie_doc_id,
          driver_transport_selfie_doc_id = excluded.driver_transport_selfie_doc_id,
          drivers_license_doc_id = excluded.drivers_license_doc_id,
          vehicle_roadworthy_doc_id = excluded.vehicle_roadworthy_doc_id,
          payload_cert_doc_id = excluded.payload_cert_doc_id,
          rejection_reason = NULL,
          submitted_at = datetime('now'),
          updated_at = datetime('now');
      `).run(
        appId, userId, rawTransport, input.licenseNumber.trim(), input.vehiclePlate.trim().toUpperCase(),
        input.vehicleMakeModel.trim(), input.contactPhone.trim(), input.idDocumentNumber.trim(),
        input.residentialAddress?.line1 || null, input.residentialAddress?.city || null, input.residentialAddress?.postalCode || null,
        input.safetyGearConfirmed !== false ? 1 : 0, input.backgroundCheckConsent !== false ? 1 : 0, input.safetyCharterConsent !== false ? 1 : 0,
        input.roadworthyInsuranceConfirmed !== false ? 1 : 0,
        input.fullLegalName || null,
        input.bankingDetails?.bankName || null,
        input.bankingDetails?.accountNumberMasked || null,
        input.bankingDetails?.branchCode || null,
        input.bankingDetails?.accountHolder || null,
        input.idDocumentDocId || null,
        input.proofOfResidenceDocId || null,
        input.driverSelfieDocId || null,
        input.driverTransportSelfieDocId || null,
        input.driversLicenseDocId || null,
        input.vehicleRoadworthyDocId || null,
        input.payloadCertDocId || null
      );

      dbInstance.db.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (?, ?, 'APPLICANT_DRIVER_SUBMISSION', 'DRIVER_APPLICATION', ?, NULL, ?)
      `).run(dbInstance.generateUuid(), userId, appId, JSON.stringify({ status: 'PENDING_REVIEW', transportType: rawTransport }));

      dbInstance.db.exec('COMMIT;');
      return {
        applicationId: appId,
        status: 'PENDING_REVIEW',
        transportType: rawTransport,
        vehiclePlate: input.vehiclePlate.trim().toUpperCase(),
        submittedAt: new Date().toISOString(),
        isIdempotentReplay: false
      };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Retrieves application status for the currently authenticated user.
   * Cross-device synchronization: Returns authoritative status from DB.
   * Privacy-safe: Only returns the caller's own records.
   */
  public static async getApplicantStatus(userId: string) {
    if (!userId) throw new Error('UNAUTHENTICATED');

    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const repRes = await postgresAdapter.pool.query(
        'SELECT id, status, hub_street_line1, hub_city, transport_details, territory_radius_km, rejection_reason, review_notes, submitted_at, updated_at FROM rep_applications WHERE user_id = $1;',
        [userId]
      );
      const drvRes = await postgresAdapter.pool.query(
        'SELECT id, status, transport_type, vehicle_plate, vehicle_make_model, license_number, rejection_reason, review_notes, submitted_at, updated_at FROM driver_applications WHERE user_id = $1;',
        [userId]
      );

      return {
        repApplication: repRes.rows[0] || null,
        driverApplication: drvRes.rows[0] || null
      };
    }

    // SQLite Fallback
    const repApp = dbInstance.db.prepare(`
      SELECT id, user_id, status, full_legal_name, id_document_number, birth_date, contact_phone,
             hub_street_line1, hub_city, hub_postal_code, transport_details, territory_radius_km,
             banking_bank_name, banking_account_number_masked, banking_branch_code, banking_account_holder,
             banking_verification_status, proof_of_residence_doc_id, id_document_doc_id,
             proof_of_residence_status, rejection_reason, review_notes, submitted_at, updated_at
      FROM rep_applications WHERE user_id = ?;
    `).get(userId) as any;

    const drvApp = dbInstance.db.prepare(`
      SELECT id, user_id, status, full_legal_name, transport_type, vehicle_plate, vehicle_make_model,
             license_number, contact_phone, id_document_number, residential_address_line1, residential_city,
             banking_bank_name, banking_account_number_masked, banking_branch_code, banking_account_holder,
             banking_verification_status, id_document_doc_id, proof_of_residence_doc_id,
             driver_selfie_doc_id, driver_transport_selfie_doc_id, drivers_license_doc_id,
             vehicle_roadworthy_doc_id, payload_cert_doc_id, facial_liveness_status,
             transport_selfie_status, proof_of_residence_status, vehicle_documents_status,
             rejection_reason, review_notes, submitted_at, updated_at
      FROM driver_applications WHERE user_id = ?;
    `).get(userId) as any;

    return {
      repApplication: repApp || null,
      driverApplication: drvApp || null
    };
  }

  /**
   * Retrieves pending and reviewed applications for authorized administrators.
   */
  public static async listApplications(adminUserId: string, filter?: { status?: string; roleType?: 'REP' | 'DRIVER' }) {
    if (!adminUserId) throw new Error('UNAUTHORIZED');

    const statusFilter = filter?.status || 'PENDING_REVIEW';

    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const repList = filter?.roleType === 'DRIVER' ? [] : (await postgresAdapter.pool.query(`
        SELECT ra.*, u.email as applicant_email, u.first_name, u.last_name
        FROM rep_applications ra
        JOIN users u ON u.id = ra.user_id
        WHERE ($1 = 'ALL' OR ra.status = $1)
        ORDER BY ra.submitted_at DESC;
      `, [statusFilter])).rows;

      const drvList = filter?.roleType === 'REP' ? [] : (await postgresAdapter.pool.query(`
        SELECT da.*, u.email as applicant_email, u.first_name, u.last_name
        FROM driver_applications da
        JOIN users u ON u.id = da.user_id
        WHERE ($1 = 'ALL' OR da.status = $1)
        ORDER BY da.submitted_at DESC;
      `, [statusFilter])).rows;

      return {
        repApplications: repList,
        driverApplications: drvList
      };
    }

    // SQLite
    const repList = filter?.roleType === 'DRIVER' ? [] : dbInstance.db.prepare(`
      SELECT ra.*, u.email as applicant_email, u.first_name, u.last_name
      FROM rep_applications ra
      JOIN users u ON u.id = ra.user_id
      WHERE (? = 'ALL' OR ra.status = ?)
      ORDER BY ra.submitted_at DESC;
    `).all(statusFilter, statusFilter) as any[];

    const drvList = filter?.roleType === 'REP' ? [] : dbInstance.db.prepare(`
      SELECT da.*, u.email as applicant_email, u.first_name, u.last_name
      FROM driver_applications da
      JOIN users u ON u.id = da.user_id
      WHERE (? = 'ALL' OR da.status = ?)
      ORDER BY da.submitted_at DESC;
    `).all(statusFilter, statusFilter) as any[];

    return {
      repApplications: repList,
      driverApplications: drvList
    };
  }

  /**
   * Performs an authoritative Administrative Review on an application.
   * MANDATORY GATES:
   * - Final approval is STRICTLY PROHIBITED if mandatory verification evidence is incomplete or missing.
   * - Approving atomically grants the authorized role to user_roles.
   * - Requesting corrections transitions status to CHANGES_REQUESTED with reasons.
   * - Fully audited in audit_logs.
   */
  public static async reviewApplication(adminUserId: string, input: ReviewApplicationInput) {
    if (!adminUserId) throw new Error('UNAUTHORIZED');

    const table = input.roleType === 'REP' ? 'rep_applications' : 'driver_applications';
    const roleToGrant = input.roleType === 'REP' ? 'TUXI_REP' : 'TUXI_DELIVERY_DRIVER';

    // Gate: Comprehensive verification completeness check on APPROVAL
    if (input.decision === 'APPROVED') {
      const docs = input.verifiedDocuments || {};
      if (input.roleType === 'REP') {
        const idVerified = docs.id_document === 'VERIFIED';
        const residenceVerified = docs.proof_of_residence === 'VERIFIED';
        const hubVerified = docs.hub_verification === 'VERIFIED';
        const eligibilityVerified = docs.eligibility_checks === 'VERIFIED';
        const termsVerified = docs.terms_accepted === 'VERIFIED';

        if (!idVerified || !residenceVerified || !hubVerified || !eligibilityVerified || !termsVerified) {
          throw new Error('INCOMPLETE_VERIFICATION_EVIDENCE: Cannot approve Rep application. All applicable verification evidence is mandatory: Verified Government ID (Age 18+), Proof of Residence, Verified Home Hub (10 km Territory), Required Eligibility Checks, and Terms Acceptance.');
        }
      } else {
        const idVerified = docs.id_document === 'VERIFIED';
        const residenceVerified = docs.proof_of_residence === 'VERIFIED';
        const livenessVerified = docs.driver_selfie_liveness === 'VERIFIED';
        const transportSelfieVerified = docs.driver_transport_selfie === 'VERIFIED';
        const licenseVerified = docs.drivers_license === 'VERIFIED';
        const roadworthyVerified = docs.vehicle_roadworthy === 'VERIFIED';
        const payloadVerified = docs.payload_certification === 'VERIFIED';

        if (!idVerified || !residenceVerified || !livenessVerified || !transportSelfieVerified || !licenseVerified || !roadworthyVerified || !payloadVerified) {
          throw new Error('INCOMPLETE_VERIFICATION_EVIDENCE: Cannot approve Driver application. All applicable verification evidence is mandatory: Verified Government ID, Proof of Residence, Facial Selfie & Genuine Liveness, Driver-with-Transport Photo, Valid Driving License, Vehicle Roadworthiness & Insurance, and Applicable Payload Certification.');
        }
      }
    }

    if (input.decision === 'CHANGES_REQUESTED' && !input.reason?.trim()) {
      throw new Error('REASON_REQUIRED: Specific correction instructions must be provided when requesting changes.');
    }

    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        const appRes = await client.query(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE;`, [input.applicationId]);
        if (appRes.rows.length === 0) {
          await client.query('ROLLBACK;');
          throw new Error('APPLICATION_NOT_FOUND');
        }

        const app = appRes.rows[0];
        const applicantUserId = app.user_id;

        // Update application status
        await client.query(`
          UPDATE ${table}
          SET status = $1,
              rejection_reason = $2,
              review_notes = $3,
              reviewed_by = $4,
              reviewed_at = NOW(),
              updated_at = NOW()
          WHERE id = $5;
        `, [input.decision, input.reason || null, input.reviewNotes || null, adminUserId, input.applicationId]);

        // If approved, elevate role in user_roles and create verified profile
        if (input.decision === 'APPROVED') {
          await client.query(`
            INSERT INTO user_roles (id, user_id, role)
            VALUES (uuid_generate_v4(), $1, $2)
            ON CONFLICT DO NOTHING;
          `, [applicantUserId, roleToGrant]);

          if (input.roleType === 'DRIVER') {
            // Upsert into driver_profiles
            await client.query(`
              INSERT INTO driver_profiles (
                id, user_id, license_number, vehicle_type, vehicle_plate, verification_status, is_online
              )
              VALUES (
                uuid_generate_v4(), $1, $2, $3, $4, 'VERIFIED', false
              )
              ON CONFLICT (user_id) DO UPDATE SET
                verification_status = 'VERIFIED',
                license_number = EXCLUDED.license_number,
                vehicle_type = EXCLUDED.vehicle_type,
                vehicle_plate = EXCLUDED.vehicle_plate;
            `, [applicantUserId, app.license_number, app.transport_type, app.vehicle_plate]);
          }
        }

        await client.query(`
          INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
          VALUES (uuid_generate_v4(), $1, 'ADMIN_APPLICATION_REVIEW', $2, $3, $4, $5);
        `, [
          adminUserId,
          table.toUpperCase(),
          input.applicationId,
          JSON.stringify({ status: app.status }),
          JSON.stringify({ decision: input.decision, reason: input.reason, reviewedBy: adminUserId })
        ]);

        await client.query('COMMIT;');
        return {
          applicationId: input.applicationId,
          status: input.decision,
          roleGranted: input.decision === 'APPROVED' ? roleToGrant : null
        };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    // SQLite Fallback
    const app = dbInstance.db.prepare(`SELECT * FROM ${table} WHERE id = ?;`).get(input.applicationId) as any;
    if (!app) throw new Error('APPLICATION_NOT_FOUND');

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      dbInstance.db.prepare(`
        UPDATE ${table}
        SET status = ?,
            rejection_reason = ?,
            review_notes = ?,
            reviewed_by = ?,
            reviewed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?;
      `).run(input.decision, input.reason || null, input.reviewNotes || null, adminUserId, input.applicationId);

      if (input.decision === 'APPROVED') {
        const existingRole = dbInstance.db.prepare('SELECT id FROM user_roles WHERE user_id = ? AND role = ?').get(app.user_id, roleToGrant);
        if (!existingRole) {
          dbInstance.db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?);')
            .run(dbInstance.generateUuid(), app.user_id, roleToGrant);
        }

        if (input.roleType === 'DRIVER') {
          const existingDrv = dbInstance.db.prepare('SELECT id FROM driver_profiles WHERE user_id = ?').get(app.user_id) as any;
          if (existingDrv) {
            dbInstance.db.prepare(`
              UPDATE driver_profiles
              SET verification_status = 'VERIFIED', license_number = ?, vehicle_type = ?, vehicle_plate = ?
              WHERE user_id = ?;
            `).run(app.license_number, app.transport_type, app.vehicle_plate, app.user_id);
          } else {
            dbInstance.db.prepare(`
              INSERT INTO driver_profiles (id, user_id, license_number, vehicle_type, vehicle_plate, verification_status, is_online)
              VALUES (?, ?, ?, ?, ?, 'VERIFIED', 0);
            `).run(dbInstance.generateUuid(), app.user_id, app.license_number, app.transport_type, app.vehicle_plate);
          }
        }
      }

      dbInstance.db.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (?, ?, 'ADMIN_APPLICATION_REVIEW', ?, ?, ?, ?);
      `).run(
        dbInstance.generateUuid(),
        adminUserId,
        table.toUpperCase(),
        input.applicationId,
        JSON.stringify({ status: app.status }),
        JSON.stringify({ decision: input.decision, reason: input.reason, reviewedBy: adminUserId })
      );

      dbInstance.db.exec('COMMIT;');
      return {
        applicationId: input.applicationId,
        status: input.decision,
        roleGranted: input.decision === 'APPROVED' ? roleToGrant : null
      };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }
}
