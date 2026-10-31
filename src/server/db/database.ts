import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.resolve(DB_DIR, 'tuxi_persistent.db');

export class TuxiDatabase {
  private static instance: TuxiDatabase;
  public db: DatabaseSync;

  private constructor() {
    if (process.env.NODE_ENV === 'production' && process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      throw new Error(
        'FATAL_PRODUCTION_SAFETY_VIOLATION: SQLite cannot be initialized in PRODUCTION when PostgreSQL is configured.'
      );
    }
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initTables();
  }

  public static getInstance(): TuxiDatabase {
    if (!TuxiDatabase.instance) {
      TuxiDatabase.instance = new TuxiDatabase();
    }
    return TuxiDatabase.instance;
  }

  public generateUuid(): string {
    return crypto.randomUUID();
  }

  public getDatabase(): DatabaseSync {
    return this.db;
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_email_verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        granted_at TEXT NOT NULL DEFAULT (datetime('now')),
        granted_by TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, role)
      );

      CREATE TABLE IF NOT EXISTS addresses (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        street_line_1 TEXT NOT NULL,
        street_line_2 TEXT,
        city TEXT NOT NULL,
        state_province TEXT,
        postal_code TEXT NOT NULL,
        country_code TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        normalized_address TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS terms_versions (
        id TEXT PRIMARY KEY,
        target_role TEXT NOT NULL,
        version_tag TEXT NOT NULL,
        title TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        full_text TEXT NOT NULL,
        published_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_current INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS terms_acceptances (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        rep_profile_id TEXT,
        terms_version_id TEXT NOT NULL,
        content_hash TEXT,
        accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
        acceptance_method TEXT NOT NULL DEFAULT 'CLICKWRAP',
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        signature_hash TEXT,
        audit_event_id TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (terms_version_id) REFERENCES terms_versions(id)
      );

      CREATE TABLE IF NOT EXISTS customer_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        default_address_id TEXT,
        loyalty_points INTEGER NOT NULL DEFAULT 0,
        loyalty_tier TEXT NOT NULL DEFAULT 'BRONZE',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS rep_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        birth_date TEXT NOT NULL,
        has_mobile_phone INTEGER NOT NULL DEFAULT 0,
        has_mobile_data INTEGER NOT NULL DEFAULT 0,
        has_own_transport INTEGER NOT NULL DEFAULT 0,
        transport_details TEXT,
        verification_status TEXT NOT NULL DEFAULT 'PENDING',
        hub_address_id TEXT NOT NULL,
        territory_radius_km REAL NOT NULL DEFAULT 10.0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (hub_address_id) REFERENCES addresses(id)
      );

      CREATE TABLE IF NOT EXISTS rep_territories (
        id TEXT PRIMARY KEY,
        rep_profile_id TEXT UNIQUE NOT NULL,
        hub_latitude REAL NOT NULL,
        hub_longitude REAL NOT NULL,
        radius_meters REAL NOT NULL DEFAULT 10000.0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (rep_profile_id) REFERENCES rep_profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS businesses (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'EATS' | 'SHOP' | 'COURIER_HUB'
        name TEXT NOT NULL,
        legal_entity_name TEXT NOT NULL,
        tax_or_vat_id TEXT UNIQUE NOT NULL,
        contact_email TEXT NOT NULL,
        contact_phone TEXT UNIQUE NOT NULL,
        address_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
        operational_status TEXT NOT NULL DEFAULT 'OPEN',
        operational_notes TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        prep_time_minutes INTEGER NOT NULL DEFAULT 20,
        opening_hours TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (address_id) REFERENCES addresses(id)
      );

      CREATE TABLE IF NOT EXISTS inventory_adjustments (
        id TEXT PRIMARY KEY,
        inventory_id TEXT NOT NULL,
        business_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        adjustment_type TEXT NOT NULL,
        quantity_delta INTEGER NOT NULL,
        previous_quantity INTEGER NOT NULL,
        new_quantity INTEGER NOT NULL,
        reason TEXT,
        idempotency_key TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS promotions (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        code TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        discount_type TEXT NOT NULL,
        discount_value INTEGER NOT NULL,
        min_order_subtotal_cents INTEGER NOT NULL DEFAULT 0,
        max_discount_cents INTEGER,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        UNIQUE(business_id, code)
      );

      CREATE TABLE IF NOT EXISTS business_staff (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        staff_role TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(business_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS business_owners (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        is_primary_owner INTEGER NOT NULL DEFAULT 1,
        added_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(business_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS rep_business_attributions (
        id TEXT PRIMARY KEY,
        rep_profile_id TEXT NOT NULL,
        business_id TEXT UNIQUE NOT NULL,
        originated_at TEXT NOT NULL DEFAULT (datetime('now')),
        attribution_status TEXT NOT NULL DEFAULT 'ACTIVE',
        approved_at TEXT,
        approved_by TEXT,
        distance_at_origination_km REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (rep_profile_id) REFERENCES rep_profiles(id),
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      );

      CREATE TABLE IF NOT EXISTS menu_categories (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS menu_items (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'ZAR',
        is_available INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'ZAR',
        category TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        UNIQUE(business_id, sku)
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        product_id TEXT UNIQUE NOT NULL,
        quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
        reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS driver_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        license_number TEXT UNIQUE NOT NULL,
        vehicle_type TEXT NOT NULL,
        vehicle_plate TEXT UNIQUE NOT NULL,
        verification_status TEXT NOT NULL DEFAULT 'PENDING',
        is_online INTEGER NOT NULL DEFAULT 0,
        current_latitude REAL,
        current_longitude REAL,
        last_ping_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS rep_applications (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
        birth_date TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        has_mobile_phone INTEGER NOT NULL DEFAULT 1,
        has_mobile_data INTEGER NOT NULL DEFAULT 1,
        has_own_transport INTEGER NOT NULL DEFAULT 1,
        transport_details TEXT NOT NULL,
        residential_address_line1 TEXT NOT NULL,
        residential_city TEXT NOT NULL,
        residential_postal_code TEXT NOT NULL,
        residential_country TEXT NOT NULL DEFAULT 'ZA',
        proof_of_residence_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
        hub_street_line1 TEXT NOT NULL,
        hub_city TEXT NOT NULL,
        hub_postal_code TEXT NOT NULL,
        hub_latitude REAL NOT NULL,
        hub_longitude REAL NOT NULL,
        territory_radius_km REAL NOT NULL DEFAULT 10.0,
        terms_version_id TEXT NOT NULL DEFAULT 'v2.1-rep-terms-2026',
        terms_accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
        full_legal_name TEXT,
        id_document_number TEXT,
        banking_bank_name TEXT,
        banking_account_number_masked TEXT,
        banking_branch_code TEXT,
        banking_account_holder TEXT,
        banking_verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
        proof_of_residence_doc_id TEXT,
        id_document_doc_id TEXT,
        banking_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
        required_documents_status TEXT NOT NULL DEFAULT '{"id_document": "SUBMITTED", "proof_of_residence": "UNVERIFIED", "banking_verification": "UNVERIFIED"}',
        rejection_reason TEXT,
        review_notes TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS driver_applications (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
        transport_type TEXT NOT NULL CHECK (transport_type IN ('MOTORCYCLE', 'CAR', 'BAKKIE', 'LIGHT_TRUCK')),
        license_number TEXT NOT NULL,
        vehicle_plate TEXT NOT NULL,
        vehicle_make_model TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        id_document_number TEXT NOT NULL,
        full_legal_name TEXT,
        residential_address_line1 TEXT,
        residential_city TEXT,
        residential_postal_code TEXT,
        banking_bank_name TEXT,
        banking_account_number_masked TEXT,
        banking_branch_code TEXT,
        banking_account_holder TEXT,
        banking_verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
        id_document_doc_id TEXT,
        proof_of_residence_doc_id TEXT,
        driver_selfie_doc_id TEXT,
        driver_transport_selfie_doc_id TEXT,
        drivers_license_doc_id TEXT,
        vehicle_roadworthy_doc_id TEXT,
        payload_cert_doc_id TEXT,
        proof_of_residence_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
        safety_gear_confirmed INTEGER NOT NULL DEFAULT 1,
        background_check_consent INTEGER NOT NULL DEFAULT 1,
        safety_charter_consent INTEGER NOT NULL DEFAULT 1,
        roadworthy_insurance_confirmed INTEGER NOT NULL DEFAULT 1,
        facial_liveness_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
        transport_selfie_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
        vehicle_documents_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
        banking_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
        required_documents_status TEXT NOT NULL DEFAULT '{"id_document": "SUBMITTED", "drivers_license": "SUBMITTED", "proof_of_residence": "UNVERIFIED", "vehicle_roadworthy": "PENDING_REVIEW", "banking_verification": "UNVERIFIED"}',
        rejection_reason TEXT,
        review_notes TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        business_id TEXT NOT NULL,
        subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
        delivery_fee_cents INTEGER NOT NULL CHECK (delivery_fee_cents >= 0),
        service_fee_cents INTEGER NOT NULL CHECK (service_fee_cents >= 0),
        tip_cents INTEGER NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
        total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'ZAR',
        status TEXT NOT NULL DEFAULT 'PLACED',
        delivery_address_id TEXT NOT NULL,
        special_instructions TEXT,
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customer_profiles(id),
        FOREIGN KEY (business_id) REFERENCES businesses(id),
        FOREIGN KEY (delivery_address_id) REFERENCES addresses(id)
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        item_type TEXT NOT NULL, -- 'MENU_ITEM' | 'PRODUCT'
        item_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
        selected_modifiers TEXT DEFAULT '[]',
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        order_id TEXT UNIQUE NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'ZAR',
        status TEXT NOT NULL DEFAULT 'INITIATED',
        payment_provider TEXT NOT NULL DEFAULT 'PAYMENT_INTEGRATION_PENDING',
        provider_transaction_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );

      CREATE TABLE IF NOT EXISTS payment_transactions (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'ZAR',
        idempotency_key TEXT UNIQUE NOT NULL,
        raw_response TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS commission_rules (
        id TEXT PRIMARY KEY,
        rule_version INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        target_role TEXT NOT NULL DEFAULT 'TUXI_REP',
        percentage_rate REAL NOT NULL CHECK (target_role != 'TUXI_REP' OR percentage_rate = 0.01), -- Exact 1.0% Rep Commission Invariant
        effective_from TEXT NOT NULL,
        effective_to TEXT,
        business_type TEXT,
        country_code TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS commission_ledger (
        id TEXT PRIMARY KEY,
        rep_profile_id TEXT NOT NULL,
        business_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        qualifying_amount_cents INTEGER NOT NULL CHECK (qualifying_amount_cents >= 0),
        applied_rule_id TEXT NOT NULL,
        applied_percentage REAL NOT NULL,
        commission_cents INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        idempotency_key TEXT UNIQUE NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (rep_profile_id) REFERENCES rep_profiles(id),
        FOREIGN KEY (business_id) REFERENCES businesses(id),
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (applied_rule_id) REFERENCES commission_rules(id)
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        before_state TEXT,
        after_state TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        uploader_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        file_mime_type TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        original_filename TEXT,
        sha256_hash TEXT,
        encryption_iv TEXT,
        encryption_tag TEXT,
        is_verified INTEGER NOT NULL DEFAULT 0,
        verification_notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (uploader_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        user_id TEXT,
        status_code INTEGER NOT NULL,
        response_body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Phase AUTH-1B.1 Security & Session Management Tables
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        revocation_reason TEXT,
        CHECK (length(token_hash) = 64),
        CHECK (datetime(created_at) IS NOT NULL),
        CHECK (datetime(last_active_at) IS NOT NULL AND datetime(last_active_at) >= datetime(created_at)),
        CHECK (datetime(expires_at) IS NOT NULL AND datetime(expires_at) > datetime(created_at)),
        CHECK (revoked_at IS NULL OR (datetime(revoked_at) IS NOT NULL AND datetime(revoked_at) >= datetime(created_at))),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id) WHERE revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        used_at TEXT,
        ip_address TEXT,
        user_agent TEXT,
        CHECK (length(token_hash) = 64),
        CHECK (datetime(created_at) IS NOT NULL),
        CHECK (datetime(expires_at) IS NOT NULL AND datetime(expires_at) > datetime(created_at)),
        CHECK (used_at IS NULL OR (datetime(used_at) IS NOT NULL AND datetime(used_at) >= datetime(created_at))),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_password_reset_user_active ON password_reset_tokens(user_id) WHERE used_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_password_reset_expires_at ON password_reset_tokens(expires_at);

      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        target_email TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        used_at TEXT,
        ip_address TEXT,
        user_agent TEXT,
        CHECK (length(token_hash) = 64),
        CHECK (length(target_email) >= 5 AND target_email LIKE '%@%.%'),
        CHECK (datetime(created_at) IS NOT NULL),
        CHECK (datetime(expires_at) IS NOT NULL AND datetime(expires_at) > datetime(created_at)),
        CHECK (used_at IS NULL OR (datetime(used_at) IS NOT NULL AND datetime(used_at) >= datetime(created_at))),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_email_verification_user_active ON email_verification_tokens(user_id) WHERE used_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_email_verification_expires_at ON email_verification_tokens(expires_at);

      CREATE TABLE IF NOT EXISTS rate_limits (
        rate_key TEXT NOT NULL,
        action TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
        first_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
        window_expires_at TEXT NOT NULL,
        locked_until TEXT,
        PRIMARY KEY (action, rate_key),
        CHECK (datetime(first_attempt_at) IS NOT NULL),
        CHECK (datetime(last_attempt_at) IS NOT NULL AND datetime(last_attempt_at) >= datetime(first_attempt_at)),
        CHECK (datetime(window_expires_at) IS NOT NULL AND datetime(window_expires_at) >= datetime(first_attempt_at)),
        CHECK (locked_until IS NULL OR (datetime(locked_until) IS NOT NULL AND datetime(locked_until) >= datetime(first_attempt_at)))
      );

      CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup ON rate_limits(window_expires_at, locked_until);

      -- Stage 1: Physical SKU Attributes & Append-Only Order Payload Assessments
      CREATE TABLE IF NOT EXISTS order_payload_assessments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        assessment_status TEXT NOT NULL,
        known_weight_grams INTEGER NOT NULL DEFAULT 0,
        unknown_item_count INTEGER NOT NULL DEFAULT 0,
        total_actual_weight_grams INTEGER,
        max_length_cm REAL,
        max_width_cm REAL,
        max_height_cm REAL,
        total_volume_cm3 REAL,
        parcel_count INTEGER NOT NULL DEFAULT 1,
        has_bulk_item INTEGER NOT NULL DEFAULT 0,
        has_wholesale_item INTEGER NOT NULL DEFAULT 0,
        has_unspecified_attributes INTEGER NOT NULL DEFAULT 0,
        eligible_vehicle_classes TEXT NOT NULL DEFAULT '[]',
        required_vehicle_class TEXT NOT NULL,
        line_snapshots TEXT NOT NULL,
        assessed_by_actor_id TEXT,
        assessed_by_role TEXT NOT NULL DEFAULT 'SYSTEM',
        amendment_reason TEXT,
        evidence_notes TEXT,
        previous_assessment_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
        UNIQUE(order_id, version)
      );

      CREATE INDEX IF NOT EXISTS idx_order_payload_assessments_order_version 
        ON order_payload_assessments(order_id, version DESC);
    `);

    // Defensive PRAGMA migration for products physical columns
    const prodCols = new Set((this.db.prepare("PRAGMA table_info(products);").all() as any[]).map(c => c.name));
    if (!prodCols.has('weight_grams')) this.db.exec("ALTER TABLE products ADD COLUMN weight_grams INTEGER;");
    if (!prodCols.has('length_cm')) this.db.exec("ALTER TABLE products ADD COLUMN length_cm REAL;");
    if (!prodCols.has('width_cm')) this.db.exec("ALTER TABLE products ADD COLUMN width_cm REAL;");
    if (!prodCols.has('height_cm')) this.db.exec("ALTER TABLE products ADD COLUMN height_cm REAL;");
    if (!prodCols.has('is_bulk')) this.db.exec("ALTER TABLE products ADD COLUMN is_bulk INTEGER NOT NULL DEFAULT 0;");
    if (!prodCols.has('is_wholesale')) this.db.exec("ALTER TABLE products ADD COLUMN is_wholesale INTEGER NOT NULL DEFAULT 0;");

    // Defensive PRAGMA migration for driver_profiles capacity columns
    const driverCols = new Set((this.db.prepare("PRAGMA table_info(driver_profiles);").all() as any[]).map(c => c.name));
    if (!driverCols.has('verified_payload_kg')) this.db.exec("ALTER TABLE driver_profiles ADD COLUMN verified_payload_kg INTEGER;");
    if (!driverCols.has('cargo_length_cm')) this.db.exec("ALTER TABLE driver_profiles ADD COLUMN cargo_length_cm REAL;");
    if (!driverCols.has('cargo_width_cm')) this.db.exec("ALTER TABLE driver_profiles ADD COLUMN cargo_width_cm REAL;");
    if (!driverCols.has('cargo_height_cm')) this.db.exec("ALTER TABLE driver_profiles ADD COLUMN cargo_height_cm REAL;");
    if (!driverCols.has('capacity_verified_at')) this.db.exec("ALTER TABLE driver_profiles ADD COLUMN capacity_verified_at TEXT;");
    if (!driverCols.has('capacity_verified_by')) this.db.exec("ALTER TABLE driver_profiles ADD COLUMN capacity_verified_by TEXT;");
    if (!driverCols.has('capacity_certificate_id')) this.db.exec("ALTER TABLE driver_profiles ADD COLUMN capacity_certificate_id TEXT;");
    if (!driverCols.has('capacity_evidence_doc_url')) this.db.exec("ALTER TABLE driver_profiles ADD COLUMN capacity_evidence_doc_url TEXT;");
    if (!driverCols.has('capacity_expires_at')) this.db.exec("ALTER TABLE driver_profiles ADD COLUMN capacity_expires_at TEXT;");
    // Defensive PRAGMA migration for documents table (Phase C2 Secure Document Vault)
    const docCols = new Set((this.db.prepare("PRAGMA table_info(documents);").all() as any[]).map(c => c.name));
    if (!docCols.has('original_filename')) this.db.exec("ALTER TABLE documents ADD COLUMN original_filename TEXT;");
    if (!docCols.has('sha256_hash')) this.db.exec("ALTER TABLE documents ADD COLUMN sha256_hash TEXT;");
    if (!docCols.has('encryption_iv')) this.db.exec("ALTER TABLE documents ADD COLUMN encryption_iv TEXT;");
    if (!docCols.has('encryption_tag')) this.db.exec("ALTER TABLE documents ADD COLUMN encryption_tag TEXT;");

    // Defensive PRAGMA migration for rep_applications table (Phase C2 Onboarding & Banking)
    const repAppCols = new Set((this.db.prepare("PRAGMA table_info(rep_applications);").all() as any[]).map(c => c.name));
    if (!repAppCols.has('full_legal_name')) this.db.exec("ALTER TABLE rep_applications ADD COLUMN full_legal_name TEXT;");
    if (!repAppCols.has('id_document_number')) this.db.exec("ALTER TABLE rep_applications ADD COLUMN id_document_number TEXT;");
    if (!repAppCols.has('banking_bank_name')) this.db.exec("ALTER TABLE rep_applications ADD COLUMN banking_bank_name TEXT;");
    if (!repAppCols.has('banking_account_number_masked')) this.db.exec("ALTER TABLE rep_applications ADD COLUMN banking_account_number_masked TEXT;");
    if (!repAppCols.has('banking_branch_code')) this.db.exec("ALTER TABLE rep_applications ADD COLUMN banking_branch_code TEXT;");
    if (!repAppCols.has('banking_account_holder')) this.db.exec("ALTER TABLE rep_applications ADD COLUMN banking_account_holder TEXT;");
    if (!repAppCols.has('banking_verification_status')) this.db.exec("ALTER TABLE rep_applications ADD COLUMN banking_verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION';");
    if (!repAppCols.has('proof_of_residence_doc_id')) this.db.exec("ALTER TABLE rep_applications ADD COLUMN proof_of_residence_doc_id TEXT;");
    if (!repAppCols.has('id_document_doc_id')) this.db.exec("ALTER TABLE rep_applications ADD COLUMN id_document_doc_id TEXT;");

    // Defensive PRAGMA migration for driver_applications table (Phase C2 Onboarding & Banking)
    const driverAppCols = new Set((this.db.prepare("PRAGMA table_info(driver_applications);").all() as any[]).map(c => c.name));
    if (!driverAppCols.has('full_legal_name')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN full_legal_name TEXT;");
    if (!driverAppCols.has('residential_address_line1')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN residential_address_line1 TEXT;");
    if (!driverAppCols.has('residential_city')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN residential_city TEXT;");
    if (!driverAppCols.has('residential_postal_code')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN residential_postal_code TEXT;");
    if (!driverAppCols.has('banking_bank_name')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN banking_bank_name TEXT;");
    if (!driverAppCols.has('banking_account_number_masked')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN banking_account_number_masked TEXT;");
    if (!driverAppCols.has('banking_branch_code')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN banking_branch_code TEXT;");
    if (!driverAppCols.has('banking_account_holder')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN banking_account_holder TEXT;");
    if (!driverAppCols.has('banking_verification_status')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN banking_verification_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION';");
    if (!driverAppCols.has('id_document_doc_id')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN id_document_doc_id TEXT;");
    if (!driverAppCols.has('proof_of_residence_doc_id')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN proof_of_residence_doc_id TEXT;");
    if (!driverAppCols.has('driver_selfie_doc_id')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN driver_selfie_doc_id TEXT;");
    if (!driverAppCols.has('driver_transport_selfie_doc_id')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN driver_transport_selfie_doc_id TEXT;");
    if (!driverAppCols.has('drivers_license_doc_id')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN drivers_license_doc_id TEXT;");
    if (!driverAppCols.has('vehicle_roadworthy_doc_id')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN vehicle_roadworthy_doc_id TEXT;");
    if (!driverAppCols.has('payload_cert_doc_id')) this.db.exec("ALTER TABLE driver_applications ADD COLUMN payload_cert_doc_id TEXT;");

    // Seed default current terms version for TUXI Rep if not exists
    const existingTerms = this.db.prepare("SELECT id FROM terms_versions WHERE target_role = 'TUXI_REP' AND is_current = 1").get();
    if (!existingTerms) {
      const termsId = this.generateUuid();
      this.db.prepare(`
        INSERT INTO terms_versions (id, target_role, version_tag, title, content_hash, full_text, is_current)
        VALUES (?, 'TUXI_REP', 'v2026.1', 'TUXI Rep Terms & Conditions of Field Commercial Representation', ?, ?, 1)
      `).run(
        termsId,
        'sha256-a9f8b1c4e2d3f7a8b9c0d1e2f3a4b5c6',
        'Official TUXI Rep Terms: Reps must be 18 years or older, maintain own mobile phone and cellular data, and operate within approved 10km territory hub. Commissions of exactly 1.0% on qualifying Rep-attributed product sales.'
      );
    }

    // Ensure active TUXI Rep commission rule is exactly 1.0% (0.0100)
    const existingRule = this.db.prepare("SELECT id FROM commission_rules WHERE target_role = 'TUXI_REP' AND is_active = 1").get() as any;
    if (!existingRule) {
      const ruleId = this.generateUuid();
      this.db.prepare(`
        INSERT INTO commission_rules (id, rule_version, name, target_role, percentage_rate, effective_from, is_active)
        VALUES (?, 1, 'Standard TUXI Rep Qualifying Sales Rule (1.0% Exact)', 'TUXI_REP', 0.01, datetime('now'), 1)
      `).run(ruleId);
    } else {
      this.db.prepare(`
        UPDATE commission_rules 
        SET percentage_rate = 0.01, name = 'Standard TUXI Rep Qualifying Sales Rule (1.0% Exact)'
        WHERE target_role = 'TUXI_REP' AND is_active = 1
      `).run();
    }

  }
}

let _dbInstance: TuxiDatabase | null = null;

export const dbInstance: TuxiDatabase = new Proxy({} as TuxiDatabase, {
  get(target, prop, receiver) {
    if (!_dbInstance) {
      _dbInstance = TuxiDatabase.getInstance();
    }
    return Reflect.get(_dbInstance, prop, receiver);
  }
});
