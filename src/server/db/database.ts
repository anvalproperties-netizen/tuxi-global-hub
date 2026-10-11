import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.resolve(DB_DIR, 'tuxi_persistent.db');

export class TuxiDatabase {
  private static instance: TuxiDatabase;
  public db: DatabaseSync;

  private constructor() {
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SQLITE_TEST_FALLBACK) {
      throw new Error(
        'FATAL_PRODUCTION_SAFETY_VIOLATION: SQLite cannot be initialized in PRODUCTION. PostgreSQL / PostGIS is the authoritative production database.'
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
        territory_radius_km REAL NOT NULL DEFAULT 20.0,
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
        radius_meters REAL NOT NULL DEFAULT 20000.0,
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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
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

      CREATE TABLE IF NOT EXISTS commission_rules (
        id TEXT PRIMARY KEY,
        rule_version INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        target_role TEXT NOT NULL DEFAULT 'TUXI_REP',
        percentage_rate REAL NOT NULL CHECK (percentage_rate >= 0.0 AND percentage_rate <= 0.03), -- Up to 3%
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
    `);

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
        'Official TUXI Rep Terms: Reps must be 18 years or older, maintain own mobile phone and cellular data, and operate within approved 20km territory hub. Commissions up to 3% on qualifying sales.'
      );
    }

    // Seed default commission rule for TUXI Rep (2.5% default, up to 3% max)
    const existingRule = this.db.prepare("SELECT id FROM commission_rules WHERE is_active = 1").get();
    if (!existingRule) {
      const ruleId = this.generateUuid();
      this.db.prepare(`
        INSERT INTO commission_rules (id, rule_version, name, target_role, percentage_rate, effective_from, is_active)
        VALUES (?, 1, 'Standard TUXI Rep Qualifying Sales Rule', 'TUXI_REP', 0.025, datetime('now'), 1)
      `).run(ruleId);
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
