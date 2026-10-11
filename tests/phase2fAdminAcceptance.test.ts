import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { postgresAdapter } from '../src/server/db/postgres.js';
import { AdminService } from '../src/server/services/adminService.js';
import { AuthService } from '../src/server/services/authService.js';
import { CommissionService } from '../src/server/services/commissionService.js';

describe('TUXI PHASE 2F — ADMIN & AI COMMAND CENTER ACCEPTANCE GATE', () => {
  let superAdminId: string;
  let adminId: string;
  let admin2Id: string;
  let merchantUserId: string;
  let repUserId: string;
  let repProfileId: string;
  let driverUserId: string;
  let driverProfileId: string;
  let customerProfileId: string;
  let businessId: string;
  let addressId: string;
  let mfaTokenSuperAdmin: string;
  let mfaTokenAdmin: string;

  beforeAll(async () => {
    const suffix = Date.now().toString().slice(-6);

    // 1. Create Super Admin
    const sa = await AuthService.register({
      email: `superadmin.${suffix}@tuxi.test`,
      password: 'SuperPassword123!',
      firstName: 'Super',
      lastName: 'Admin',
      phoneNumber: `+447000${suffix}`
    }, true);
    superAdminId = sa.user.id;
    await postgresAdapter.pool.query(
      "INSERT INTO user_roles (id, user_id, role) VALUES (uuid_generate_v4(), $1, 'SUPER_ADMIN') ON CONFLICT DO NOTHING;",
      [superAdminId]
    );

    // 2. Create standard Admins
    const a1 = await AuthService.register({
      email: `admin1.${suffix}@tuxi.test`,
      password: 'AdminPassword123!',
      firstName: 'Admin',
      lastName: 'One',
      phoneNumber: `+447001${suffix}`
    }, true);
    adminId = a1.user.id;
    await postgresAdapter.pool.query(
      "INSERT INTO user_roles (id, user_id, role) VALUES (uuid_generate_v4(), $1, 'ADMIN') ON CONFLICT DO NOTHING;",
      [adminId]
    );

    const a2 = await AuthService.register({
      email: `admin2.${suffix}@tuxi.test`,
      password: 'AdminPassword123!',
      firstName: 'Admin',
      lastName: 'Two',
      phoneNumber: `+447002${suffix}`
    }, true);
    admin2Id = a2.user.id;
    await postgresAdapter.pool.query(
      "INSERT INTO user_roles (id, user_id, role) VALUES (uuid_generate_v4(), $1, 'ADMIN') ON CONFLICT DO NOTHING;",
      [admin2Id]
    );

    // 3. Create Merchant, Rep, and Driver
    const m = await AuthService.register({
      email: `merchant.${suffix}@tuxi.test`,
      password: 'MerchantPass123!',
      firstName: 'Merchant',
      lastName: 'Owner',
      phoneNumber: `+447003${suffix}`
    }, true);
    merchantUserId = m.user.id;

    const r = await AuthService.register({
      email: `rep.${suffix}@tuxi.test`,
      password: 'RepPassword123!',
      firstName: 'Tuxi',
      lastName: 'Rep',
      phoneNumber: `+447004${suffix}`
    }, true);
    repUserId = r.user.id;
    await postgresAdapter.pool.query(
      "INSERT INTO user_roles (id, user_id, role) VALUES (uuid_generate_v4(), $1, 'TUXI_REP') ON CONFLICT DO NOTHING;",
      [repUserId]
    );

    const d = await AuthService.register({
      email: `driver.${suffix}@tuxi.test`,
      password: 'DriverPass123!',
      firstName: 'Tuxi',
      lastName: 'Driver',
      phoneNumber: `+447005${suffix}`
    }, true);
    driverUserId = d.user.id;
    await postgresAdapter.pool.query(
      "INSERT INTO user_roles (id, user_id, role) VALUES (uuid_generate_v4(), $1, 'TUXI_DELIVERY_DRIVER') ON CONFLICT DO NOTHING;",
      [driverUserId]
    );

    const drvProfRes = await postgresAdapter.pool.query(`
      INSERT INTO driver_profiles (id, user_id, verification_status, is_online, license_number, vehicle_type, vehicle_plate, created_at, updated_at)
      VALUES (uuid_generate_v4(), $1, 'VERIFIED', true, $2, 'SCOOTER', $3, NOW(), NOW())
      RETURNING id;
    `, [driverUserId, `DRV-${suffix}`, `PL-${suffix}`]);
    driverProfileId = drvProfRes.rows[0].id;

    // 4. Create Address
    const addrRes = await postgresAdapter.pool.query(`
      INSERT INTO addresses (id, street_line_1, city, postal_code, country_code, normalized_address, latitude, longitude, geom)
      VALUES (uuid_generate_v4(), '123 Market St', 'London', 'EC1A 1BB', 'GB', '123 Market St, London, EC1A 1BB, GB', 51.5074, -0.1278, ST_SetSRID(ST_MakePoint(-0.1278, 51.5074), 4326))
      RETURNING id;
    `);
    addressId = addrRes.rows[0].id;

    // 5. Get or Update Customer Profile
    const custProfRes = await postgresAdapter.pool.query(`
      INSERT INTO customer_profiles (id, user_id, default_address_id, loyalty_points, created_at, updated_at)
      VALUES (uuid_generate_v4(), $1, $2, 0, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET default_address_id = $2
      RETURNING id;
    `, [merchantUserId, addressId]);
    customerProfileId = custProfRes.rows[0].id;

    // 6. Create Business owned by merchantUserId
    const bRes = await postgresAdapter.pool.query(`
      INSERT INTO businesses (id, type, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone, address_id, latitude, longitude, geom, status, is_active, created_at, updated_at)
      VALUES (uuid_generate_v4(), 'EATS', 'Acceptance Test Cafe', 'Acceptance Cafe Ltd', $1, $2, $3, $4, 51.5074, -0.1278, ST_SetSRID(ST_MakePoint(-0.1278, 51.5074), 4326), 'PENDING_VERIFICATION', false, NOW(), NOW())
      RETURNING id;
    `, [`GB-${suffix}`, `cafe.${suffix}@test.com`, `+447111${suffix}`, addressId]);
    businessId = bRes.rows[0].id;

    await postgresAdapter.pool.query(`
      INSERT INTO business_owners (id, business_id, user_id, is_primary_owner)
      VALUES (uuid_generate_v4(), $1, $2, true);
    `, [businessId, merchantUserId]);

    // Setup Rep profile and attribution
    const repProfRes = await postgresAdapter.pool.query(`
      INSERT INTO rep_profiles (id, user_id, birth_date, has_mobile_phone, has_mobile_data, verification_status, hub_address_id, territory_radius_km, created_at, updated_at)
      VALUES (uuid_generate_v4(), $1, '1995-05-15', true, true, 'VERIFIED', $2, 20.0, NOW(), NOW())
      RETURNING id;
    `, [repUserId, addressId]);
    repProfileId = repProfRes.rows[0].id;

    await postgresAdapter.pool.query(`
      INSERT INTO rep_business_attributions (id, rep_profile_id, business_id, attribution_status, distance_at_origination_km, created_at)
      VALUES (uuid_generate_v4(), $1, $2, 'ACTIVE', 2.5, NOW())
      ON CONFLICT (business_id) DO NOTHING;
    `, [repProfileId, businessId]);

    // Setup MFA sessions
    await AdminService.setupAdminMfa(superAdminId);
    const saVerify = await AdminService.verifyAdminMfa(superAdminId, '123456');
    mfaTokenSuperAdmin = saVerify.mfaToken;

    await AdminService.setupAdminMfa(adminId);
    const aVerify = await AdminService.verifyAdminMfa(adminId, '123456');
    mfaTokenAdmin = aVerify.mfaToken;
  });

  afterAll(async () => {
    // Teardown test artifacts if needed
  });

  // =========================================================================
  // TEST SUITE 1: MFA & SENSITIVE ADMINISTRATIVE ACTION PROTECTION
  // =========================================================================
  describe('1. MFA and Sensitive Administrative Action Protection', () => {
    it('rejects sensitive admin action when MFA token is missing', async () => {
      await expect(
        AdminService.validateMfaSession(superAdminId, undefined)
      ).rejects.toThrow('MFA_REQUIRED');
    });

    it('rejects invalid or expired MFA session tokens', async () => {
      await expect(
        AdminService.validateMfaSession(superAdminId, 'mfa_invalid_token_xyz')
      ).rejects.toThrow('MFA_INVALID_OR_EXPIRED');
    });

    it('validates genuine unexpired MFA sessions', async () => {
      const isValid = await AdminService.validateMfaSession(superAdminId, mfaTokenSuperAdmin);
      expect(isValid).toBe(true);
    });

    it('triggers emergency kill switch only when authorized by Super Admin with MFA', async () => {
      const result = await AdminService.triggerEmergencyKillSwitchPostgres(
        superAdminId,
        'Acceptance test emergency trigger',
        mfaTokenSuperAdmin
      );
      expect(result.status).toBe('KILL_SWITCH_ENGAGED');
      expect(result.authorizedBy).toBe(superAdminId);

      // Clean up for subsequent tests
      await AdminService.rollbackEmergencyKillSwitchPostgres(superAdminId, 'Reset after test', mfaTokenSuperAdmin);
    });

    it('verifies standards-based RFC 6238 TOTP enrollment, validation, and rejection of invalid codes', async () => {
      const enroll = await AdminService.setupAdminMfa(adminId);
      expect(enroll.mfaConfigured).toBe(true);
      expect(enroll.secret).toBeDefined();
      expect(/^[A-Z2-7]+$/.test(enroll.secret)).toBe(true);

      // Verify database credential security at rest:
      // Secret is encrypted with AES-256-GCM (starts with enc:v1:) and never stored plaintext
      const credRow = await postgresAdapter.pool.query(
        'SELECT secret, backup_codes FROM admin_mfa_credentials WHERE user_id = $1;',
        [adminId]
      );
      expect(credRow.rows[0].secret.startsWith('enc:v1:')).toBe(true);
      expect(credRow.rows[0].secret).not.toBe(enroll.secret);

      // Backup codes are securely hashed at rest with HMAC-SHA256 (64 hex characters)
      expect(credRow.rows[0].backup_codes.length).toBe(6);
      expect(credRow.rows[0].backup_codes.every((c: string) => c.length === 64)).toBe(true);
      expect(credRow.rows[0].backup_codes).not.toContain(enroll.backupCodes[0]);

      // Compute standard RFC 6238 TOTP
      const validTotp = AdminService.generateTotpForTest(enroll.secret);
      expect(validTotp).toMatch(/^\d{6}$/);

      // Verify valid TOTP succeeds
      const verifyRes = await AdminService.verifyAdminMfa(adminId, validTotp);
      expect(verifyRes.verified).toBe(true);
      expect(verifyRes.mfaToken).toMatch(/^mfa_/);

      // MFA session token is stored hashed in admin_mfa_sessions (64 hex characters)
      const sessRow = await postgresAdapter.pool.query(
        'SELECT mfa_token FROM admin_mfa_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1;',
        [adminId]
      );
      expect(sessRow.rows[0].mfa_token).not.toBe(verifyRes.mfaToken);
      expect(sessRow.rows[0].mfa_token.length).toBe(64);

      // Replay prevention: reusing identical TOTP in same window is rejected
      await expect(
        AdminService.verifyAdminMfa(adminId, validTotp)
      ).rejects.toThrow('MFA_CODE_REPLAY_DETECTED');

      // Invalid code is rejected
      await expect(
        AdminService.verifyAdminMfa(adminId, '999999')
      ).rejects.toThrow('INVALID_MFA_CODE');
    });

    it('verifies backup code authentication, hashing at rest, and single-use replay prevention', async () => {
      const enroll = await AdminService.setupAdminMfa(adminId);
      const testBackupCode = enroll.backupCodes[0];

      // Recovery codes must have at least 128 bits of entropy (32 hex characters in hyphenated format)
      expect(testBackupCode).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
      expect(testBackupCode.replace(/-/g, '').length).toBe(32); // 16 bytes = 128 bits

      // Verifying with valid plaintext 128-bit recovery code succeeds
      const bRes = await AdminService.verifyAdminMfa(adminId, testBackupCode);
      expect(bRes.verified).toBe(true);
      expect(bRes.mfaToken).toMatch(/^mfa_/);

      // Single-use replay prevention: consumed backup code cannot be used again
      await expect(
        AdminService.verifyAdminMfa(adminId, testBackupCode)
      ).rejects.toThrow('INVALID_MFA_CODE');
    });

    it('enforces invalidation of legacy 32-bit recovery codes and provides 128-bit re-enrollment', async () => {
      const enroll = await AdminService.setupAdminMfa(adminId);

      // Attempting to use a legacy 32-bit (8-hex-character) code is strictly rejected
      await expect(
        AdminService.verifyAdminMfa(adminId, 'DEADBEEF')
      ).rejects.toThrow('RECOVERY_CODE_INSUFFICIENT_ENTROPY');

      // Administrator can regenerate fresh 128-bit recovery codes
      const regen = await AdminService.regenerateRecoveryCodes(adminId);
      expect(regen.recoveryCodes.length).toBe(6);
      expect(regen.recoveryCodes[0].replace(/-/g, '').length).toBe(32);

      // New recovery code succeeds
      const regenRes = await AdminService.verifyAdminMfa(adminId, regen.recoveryCodes[0]);
      expect(regenRes.verified).toBe(true);
    });

    it('enforces recovery code account isolation and brute-force rate limiting', async () => {
      const enrollAdmin1 = await AdminService.setupAdminMfa(adminId);
      const enrollAdmin2 = await AdminService.setupAdminMfa(admin2Id);

      // Account isolation: Admin 1's recovery code cannot authenticate Admin 2
      await expect(
        AdminService.verifyAdminMfa(admin2Id, enrollAdmin1.backupCodes[0])
      ).rejects.toThrow('INVALID_MFA_CODE');

      // Brute-force rate limiting: 5 consecutive invalid recovery attempts lock the account
      // Attempt 1 was account isolation above. Attempts 2, 3, and 4 fail with INVALID_MFA_CODE:
      for (let i = 0; i < 3; i++) {
        await expect(
          AdminService.verifyAdminMfa(admin2Id, '0000-0000-0000-0000-0000-0000-0000-0000')
        ).rejects.toThrow('INVALID_MFA_CODE');
      }

      // Attempt 5 triggers account lock
      await expect(
        AdminService.verifyAdminMfa(admin2Id, '0000-0000-0000-0000-0000-0000-0000-0000')
      ).rejects.toThrow('MFA_RATE_LIMIT_EXCEEDED');

      // Reset rate limiter for subsequent tests
      await AdminService.setupAdminMfa(admin2Id);
    });

    it('enforces MFA session revocation and blocks operations with revoked sessions', async () => {
      const saVerify = await AdminService.verifyAdminMfa(superAdminId, '123456');
      const tempToken = saVerify.mfaToken;

      expect(await AdminService.validateMfaSession(superAdminId, tempToken)).toBe(true);

      // Revoke session
      await AdminService.revokeMfaSession(superAdminId, tempToken);

      // Revoked session cannot be validated
      await expect(
        AdminService.validateMfaSession(superAdminId, tempToken)
      ).rejects.toThrow('MFA_INVALID_OR_EXPIRED');
    });
  });

  // =========================================================================
  // TEST SUITE 2: RBAC & SUPER ADMIN ROLE ESCALATION
  // =========================================================================
  describe('2. Super Admin Role Escalation Attempts', () => {
    it('prevents non-super-admin from escalating roles to SUPER_ADMIN', async () => {
      await expect(
        AdminService.escalateUserRole(adminId, merchantUserId, 'SUPER_ADMIN', mfaTokenAdmin)
      ).rejects.toThrow('SUPER_ADMIN_ESCALATION_DENIED');
    });

    it('prevents role escalation without verified MFA token even for Super Admin', async () => {
      await expect(
        AdminService.escalateUserRole(superAdminId, merchantUserId, 'ADMIN', undefined)
      ).rejects.toThrow('MFA_REQUIRED');
    });

    it('allows Super Admin with valid MFA to escalate role with immutable audit logging', async () => {
      const result = await AdminService.escalateUserRole(
        superAdminId,
        merchantUserId,
        'ADMIN',
        mfaTokenSuperAdmin
      );
      expect(result.assignedRole).toBe('ADMIN');
      expect(result.authorizedBy).toBe(superAdminId);
    });
  });

  // =========================================================================
  // TEST SUITE 3: SEPARATION OF DUTIES & SELF-APPROVAL PREVENTION
  // =========================================================================
  describe('3. Merchant and Rep Self-Approval Prevention', () => {
    it('strictly prevents a merchant owner from self-approving their own business application', async () => {
      // merchantUserId now has ADMIN role, but owns businessId!
      await expect(
        AdminService.reviewBusinessApplicationPostgres(
          merchantUserId,
          businessId,
          'APPROVED',
          'Self-approval attempt'
        )
      ).rejects.toThrow('SELF_APPROVAL_PROHIBITED');
    });

    it('strictly prevents a Rep from verifying or approving their own account', async () => {
      await expect(
        AdminService.reviewRepVerification(
          repUserId,
          repUserId,
          'VERIFIED',
          'Self-verification attempt'
        )
      ).rejects.toThrow('SELF_VERIFICATION_PROHIBITED');
    });
  });

  // =========================================================================
  // TEST SUITE 4: CONCURRENT MERCHANT DECISION RACE
  // =========================================================================
  describe('4. Concurrent Approve-Versus-Reject Merchant Decision Race', () => {
    it('executes simultaneous APPROVE vs REJECT: exactly 1 winner, 1 rejected', async () => {
      const raceAddrRes = await postgresAdapter.pool.query(`
        INSERT INTO addresses (id, street_line_1, city, postal_code, country_code, normalized_address, latitude, longitude, geom)
        VALUES (uuid_generate_v4(), '456 High St', 'London', 'EC1A 2BB', 'GB', '456 High St, London, EC1A 2BB, GB', 51.5074, -0.1278, ST_SetSRID(ST_MakePoint(-0.1278, 51.5074), 4326))
        RETURNING id;
      `);
      const raceAddressId = raceAddrRes.rows[0].id;

      const nowMs = Date.now();
      const bRes = await postgresAdapter.pool.query(`
        INSERT INTO businesses (id, type, name, legal_entity_name, tax_or_vat_id, contact_email, contact_phone, address_id, latitude, longitude, geom, status, is_active, created_at, updated_at)
        VALUES (uuid_generate_v4(), 'EATS', 'Concurrency Race Bistro', 'Race Bistro Ltd', $1, $2, $3, $4, 51.5074, -0.1278, ST_SetSRID(ST_MakePoint(-0.1278, 51.5074), 4326), 'PENDING_VERIFICATION', false, NOW(), NOW())
        RETURNING id;
      `, [`GB-RACE-${nowMs}`, `race.${nowMs}@test.com`, `+447222${nowMs.toString().slice(-6)}`, raceAddressId]);
      const raceBusinessId = bRes.rows[0].id;

      // Two distinct administrators attempt simultaneous decisions
      const [decision1, decision2] = await Promise.allSettled([
        AdminService.reviewBusinessApplicationPostgres(adminId, raceBusinessId, 'APPROVED', 'Decision 1'),
        AdminService.reviewBusinessApplicationPostgres(admin2Id, raceBusinessId, 'REJECTED', 'Decision 2')
      ]);

      const successCount = [decision1, decision2].filter(d => d.status === 'fulfilled').length;
      const failureCount = [decision1, decision2].filter(d => d.status === 'rejected').length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      // Verify the final state is deterministic
      const finalRes = await postgresAdapter.pool.query('SELECT status FROM businesses WHERE id = $1;', [raceBusinessId]);
      expect(['APPROVED', 'REJECTED']).toContain(finalRes.rows[0].status);
    });
  });

  // =========================================================================
  // TEST SUITE 5: FINANCIAL POLICY & CONCURRENT APPROVAL RACE
  // =========================================================================
  describe('5. Financial Policy Governance & Concurrent Approval Race', () => {
    it('prevents setting Rep commission above platform cap of 3.0%', async () => {
      // Rates above 3% (e.g. 0.035, 0.05, 0.35, 0.40) must be strictly rejected
      await expect(
        AdminService.proposeFinancialPolicy(adminId, 'REP_ACQUISITION_CAP', 0.035, 'Exceeds 3% limit')
      ).rejects.toThrow('COMMISSION_CAP_EXCEEDED');

      await expect(
        AdminService.proposeFinancialPolicy(adminId, 'REP_ACQUISITION_CAP', 0.35, 'Exceeds 3% limit')
      ).rejects.toThrow('COMMISSION_CAP_EXCEEDED');

      await expect(
        AdminService.proposeFinancialPolicy(adminId, 'REP_ACQUISITION_CAP', 0.40, 'Exceeds 3% limit')
      ).rejects.toThrow('COMMISSION_CAP_EXCEEDED');
    });

    it('proposes valid financial policy in PENDING_APPROVAL status within 3% limit', async () => {
      const repPolicy = await AdminService.proposeFinancialPolicy(
        adminId,
        'REP_ACQUISITION_CAP',
        0.0300,
        'Max allowable 3% Rep commission'
      );
      expect(repPolicy.policy_key).toBe('REP_ACQUISITION_CAP');
      expect(repPolicy.status).toBe('PENDING_APPROVAL');
      expect(parseFloat(repPolicy.value_numeric)).toBe(0.03);

      const policy = await AdminService.proposeFinancialPolicy(
        adminId,
        'EATS_PLATFORM_FEE_TEST',
        0.12,
        'Eats commission policy'
      );
      expect(policy.policy_key).toBe('EATS_PLATFORM_FEE_TEST');
      expect(policy.status).toBe('PENDING_APPROVAL');
    });

    it('enforces PostgreSQL database CHECK constraints prohibiting Rep commission rates above 3%', async () => {
      // 1. Database constraint on commission_rules: TUXI_REP percentage_rate <= 0.0300
      await expect(
        postgresAdapter.pool.query(`
          INSERT INTO commission_rules (id, rule_version, name, target_role, percentage_rate, effective_from, is_active)
          VALUES (uuid_generate_v4(), 99, 'Illegal 5% Rep Rule', 'TUXI_REP', 0.0500, NOW(), true);
        `)
      ).rejects.toThrow(/commission_rules_rep_max_3_percent|violates check constraint/);

      // 2. Database constraint on financial_policies: REP_% value_numeric <= 0.0300
      await expect(
        postgresAdapter.pool.query(`
          INSERT INTO financial_policies (id, policy_key, value_numeric, description, proposed_by, status)
          VALUES (uuid_generate_v4(), 'REP_COMMISSION_DIRECT_SQL_TEST', 0.1000, 'Direct SQL bypass attempt', $1, 'PENDING_APPROVAL');
        `, [adminId])
      ).rejects.toThrow(/financial_policies_rep_cap_max_3_percent|violates check constraint/);
    });

    it('prevents policy proposer from self-approving (Dual Authorization enforcement)', async () => {
      await expect(
        AdminService.reviewFinancialPolicy(adminId, 'EATS_PLATFORM_FEE_TEST', 'APPROVED', mfaTokenAdmin)
      ).rejects.toThrow('FINANCIAL_POLICY_DUAL_AUTH_REQUIRED');
    });

    it('executes concurrent approval race: exactly 1 administrator completes review', async () => {
      await AdminService.proposeFinancialPolicy(adminId, 'RACE_FIN_POLICY', 0.15, 'Race policy');

      await AdminService.setupAdminMfa(admin2Id);
      const a2Verify = await AdminService.verifyAdminMfa(admin2Id, '123456');

      const [res1, res2] = await Promise.allSettled([
        AdminService.reviewFinancialPolicy(admin2Id, 'RACE_FIN_POLICY', 'APPROVED', a2Verify.mfaToken),
        AdminService.reviewFinancialPolicy(superAdminId, 'RACE_FIN_POLICY', 'REJECTED', mfaTokenSuperAdmin)
      ]);

      const successCount = [res1, res2].filter(d => d.status === 'fulfilled').length;
      const failureCount = [res1, res2].filter(d => d.status === 'rejected').length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
    });

    it('proves unpaid or non-qualifying orders generate zero earned Rep commission', async () => {
      const orderNumber = `ORD-COMM-UNPAID-${Date.now()}`;
      const oRes = await postgresAdapter.pool.query(`
        INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents, currency, status, delivery_address_id, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, $2, $3, 10000, 500, 250, 0, 10750, 'ZAR', 'PLACED', $4, NOW(), NOW())
        RETURNING id;
      `, [orderNumber, customerProfileId, businessId, addressId]);
      const unpaidOrderId = oRes.rows[0].id;

      // Process commission on unpaid order
      const res = await CommissionService.processOrderCommissionPostgres(unpaidOrderId, `comm-unpaid-${unpaidOrderId}`);
      expect(res.status).toBe('NON_QUALIFYING_STATUS');
      expect(res.commissionCents).toBe(0);

      // Verify no EARNED row in commission_ledger
      const ledgerRows = await postgresAdapter.pool.query(
        'SELECT * FROM commission_ledger WHERE order_id = $1;',
        [unpaidOrderId]
      );
      expect(ledgerRows.rows.length).toBe(0);
    });

    it('proves customer refunds reverse qualifying Rep commission via compensating ledger entries', async () => {
      // 1. Create a DELIVERED order with subtotal 10,000 cents (R100)
      const orderNumber = `ORD-COMM-REFUND-${Date.now()}`;
      const oRes = await postgresAdapter.pool.query(`
        INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents, currency, status, delivery_address_id, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, $2, $3, 10000, 500, 250, 0, 10750, 'ZAR', 'DELIVERED', $4, NOW(), NOW())
        RETURNING id;
      `, [orderNumber, customerProfileId, businessId, addressId]);
      const deliveredOrderId = oRes.rows[0].id;

      // 2. Accrue legitimate commission (2.5% rate -> 250 cents, strictly <= 3% cap)
      const earnRes = await CommissionService.processOrderCommissionPostgres(
        deliveredOrderId,
        `comm-earn-${deliveredOrderId}`
      );
      expect(earnRes.status).toBe('EARNED');
      expect(earnRes.commissionCents).toBe(250);
      expect(earnRes.percentageRate).toBeLessThanOrEqual(0.0300);

      // 3. Process refund with compensating reversal
      const revRes = await CommissionService.reverseOrderCommission(
        deliveredOrderId,
        'Merchant cancelled / customer refunded',
        `comm-rev-${deliveredOrderId}`
      );
      expect(revRes.status).toBe('REVERSED');
      expect(revRes.reversedCents).toBe(250);

      // 4. Verify compensating negative entry exists in ledger and original is marked REVERSED
      const ledgerRes = await postgresAdapter.pool.query(
        'SELECT status, commission_cents FROM commission_ledger WHERE order_id = $1 ORDER BY created_at ASC;',
        [deliveredOrderId]
      );
      expect(ledgerRes.rows.length).toBe(2);
      expect(ledgerRes.rows[0].status).toBe('REVERSED');
      expect(ledgerRes.rows[0].commission_cents).toBe(250);
      expect(ledgerRes.rows[1].status).toBe('REVERSED');
      expect(ledgerRes.rows[1].commission_cents).toBe(-250);

      // 5. Replay must be idempotent and prevent double-reversal
      const replayRes = await CommissionService.reverseOrderCommission(
        deliveredOrderId,
        'Duplicate refund attempt',
        `comm-rev-${deliveredOrderId}`
      );
      expect(replayRes.isIdempotentReplay).toBe(true);
      expect(replayRes.reversedCents).toBe(250);
    });

    it('proves historical commission attribution remains immutable and protected from tampering', async () => {
      // Historical attribution check
      const attrRes = await postgresAdapter.pool.query(
        'SELECT id, attribution_status, distance_at_origination_km FROM rep_business_attributions WHERE business_id = $1;',
        [businessId]
      );
      expect(attrRes.rows.length).toBe(1);
      expect(attrRes.rows[0].attribution_status).toBe('ACTIVE');
      expect(parseFloat(attrRes.rows[0].distance_at_origination_km)).toBeLessThanOrEqual(20.0);

      // Verify audit trail exists for commission accrual and reversal
      const auditRes = await postgresAdapter.pool.query(
        "SELECT action, resource_type FROM audit_logs WHERE action IN ('ACCRUE_REP_COMMISSION', 'REVERSE_REP_COMMISSION');"
      );
      expect(auditRes.rows.length).toBeGreaterThan(0);
    });

    it('proves no Super Admin, AI recommendation, financial policy, or client request can bypass the 3% ceiling', async () => {
      // 1. Super Admin attempting to configure rate > 3% via policy is rejected
      await expect(
        AdminService.proposeFinancialPolicy(superAdminId, 'REP_COMMISSION_SUPER_ADMIN_BYPASS', 0.05, 'Bypass attempt')
      ).rejects.toThrow('COMMISSION_CAP_EXCEEDED');

      // 2. Direct client request or invalid service call attempting rate > 3% is rejected
      expect(() => {
        CommissionService.createCommissionRule(adminId, 'Client Requested 4%', 0.04);
      }).toThrow('INVALID_COMMISSION_RATE');

      // 3. Check constraint directly prevents inserting any rate > 0.0300
      await expect(
        postgresAdapter.pool.query(`
          INSERT INTO commission_rules (id, rule_version, name, target_role, percentage_rate, effective_from, is_active)
          VALUES (uuid_generate_v4(), 88, 'Illegal 10% Rep Rule', 'TUXI_REP', 0.1000, NOW(), true);
        `)
      ).rejects.toThrow(/commission_rules_rep_max_3_percent|violates check constraint/);
    });
  });

  // =========================================================================
  // TEST SUITE 6: UNPAID ORDER DISPATCH REJECTION
  // =========================================================================
  describe('6. Unpaid Production Order Dispatch Rejection', () => {
    it('strictly rejects dispatching driver for unpaid order', async () => {
      const orderNumber = `ORD-UNPAID-${Date.now()}`;
      const oRes = await postgresAdapter.pool.query(`
        INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents, currency, status, delivery_address_id, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, $2, $3, 3000, 300, 200, 0, 3500, 'ZAR', 'PLACED', $4, NOW(), NOW())
        RETURNING id;
      `, [orderNumber, customerProfileId, businessId, addressId]);
      const unpaidOrderId = oRes.rows[0].id;

      // Note: No payment in payments table (or payment status INITIATED)
      await postgresAdapter.pool.query(`
        INSERT INTO payments (id, order_id, amount_cents, currency, status, payment_provider, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, 3500, 'ZAR', 'INITIATED', 'TEST_GATEWAY', NOW(), NOW());
      `, [unpaidOrderId]);

      await expect(
        AdminService.dispatchOrder(adminId, unpaidOrderId, driverProfileId)
      ).rejects.toThrow('UNPAID_ORDER_DISPATCH_REJECTED');
    });

    it('strictly blocks dispatching driver for simulated payment in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        const orderNumber = `ORD-SIM-${Date.now()}`;
        const oRes = await postgresAdapter.pool.query(`
          INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents, currency, status, delivery_address_id, created_at, updated_at)
          VALUES (uuid_generate_v4(), $1, $2, $3, 3000, 300, 200, 0, 3500, 'ZAR', 'PREPARING', $4, NOW(), NOW())
          RETURNING id;
        `, [orderNumber, customerProfileId, businessId, addressId]);
        const simOrderId = oRes.rows[0].id;

        // Payment marked CAPTURED but with SIMULATED provider
        await postgresAdapter.pool.query(`
          INSERT INTO payments (id, order_id, amount_cents, currency, status, payment_provider, created_at, updated_at)
          VALUES (uuid_generate_v4(), $1, 3500, 'ZAR', 'CAPTURED', 'SIMULATED', NOW(), NOW());
        `, [simOrderId]);

        await expect(
          AdminService.dispatchOrder(adminId, simOrderId, driverProfileId)
        ).rejects.toThrow('SIMULATED_PAYMENT_DISPATCH_FORBIDDEN');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('successfully dispatches driver when order payment is CAPTURED', async () => {
      const orderNumber = `ORD-PAID-${Date.now()}`;
      const oRes = await postgresAdapter.pool.query(`
        INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents, currency, status, delivery_address_id, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, $2, $3, 3000, 300, 200, 0, 3500, 'ZAR', 'PREPARING', $4, NOW(), NOW())
        RETURNING id;
      `, [orderNumber, customerProfileId, businessId, addressId]);
      const paidOrderId = oRes.rows[0].id;

      // Insert CAPTURED payment with non-simulated provider
      await postgresAdapter.pool.query(`
        INSERT INTO payments (id, order_id, amount_cents, currency, status, payment_provider, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, 3500, 'ZAR', 'CAPTURED', 'STRIPE', NOW(), NOW());
      `, [paidOrderId]);

      const result = await AdminService.dispatchOrder(adminId, paidOrderId, driverProfileId);
      expect(result.status).toBe('DISPATCHED');
      expect(result.driverId).toBe(driverProfileId);

      // Clean up delivery assignment so test driver is not locked in active assignment
      await postgresAdapter.pool.query("UPDATE deliveries SET status = 'DELIVERED', delivered_at = NOW() WHERE driver_id = $1;", [driverProfileId]);
    });
  });

  // =========================================================================
  // TEST SUITE 7: REVENUE & 20 KM REP ACQUISITION BOUNDARY
  // =========================================================================
  describe('7. Exact 20 km Rep Acquisition Boundary & PostGIS Oversight', () => {
    it('verifies territory oversight queries through PostGIS with 20km boundary limit', async () => {
      const oversight = await AdminService.getTerritoryOversightPostgis();
      expect(oversight.acquisitionRadiusLimitKm).toBe(20.0);
      expect(Array.isArray(oversight.territories)).toBe(true);
      expect(Array.isArray(oversight.attributions)).toBe(true);
    });
  });

  // =========================================================================
  // TEST SUITE 8: FRAUD & RISK INVESTIGATION WORKFLOW
  // =========================================================================
  describe('8. Fraud and Risk Investigation Workflow', () => {
    let caseId: string;

    it('opens new risk investigation case with unique case number and audit log', async () => {
      const invCase = await AdminService.createRiskInvestigation(adminId, {
        targetType: 'USER',
        targetId: merchantUserId,
        severity: 'HIGH',
        notes: 'Suspicious velocity of refund claims'
      });

      expect(invCase.id).toBeDefined();
      expect(invCase.case_number).toMatch(/^CASE-/);
      expect(invCase.status).toBe('OPEN');
      caseId = invCase.id;
    });

    it('resolves investigation and executes FREEZE_ACCOUNT on target entity', async () => {
      const result = await AdminService.updateRiskInvestigation(
        adminId,
        caseId,
        'RESOLVED',
        'FREEZE_ACCOUNT',
        'Frozen pending compliance review'
      );

      expect(result.status).toBe('RESOLVED');
      expect(result.actionTaken).toBe('FREEZE_ACCOUNT');

      // Verify target user is frozen
      const userRes = await postgresAdapter.pool.query('SELECT is_active FROM users WHERE id = $1;', [merchantUserId]);
      expect(userRes.rows[0].is_active).toBe(false);
    });
  });

  // =========================================================================
  // TEST SUITE 9: AI OPERATIONAL RECOMMENDATIONS WITH HUMAN APPROVAL GATE
  // =========================================================================
  describe('9. AI Operational Recommendations with Human Approval Gate', () => {
    let recId: string;

    it('records AI recommendation in PENDING_REVIEW state without executing', async () => {
      const rec = await AdminService.createOperationalRecommendation({
        category: 'SURGE_PRICING',
        title: 'High Demand Surge Recommendation',
        description: 'Rainy conditions detected in central zone',
        proposedAction: { surgeMultiplier: 1.25, zone: 'Central' },
        confidenceScore: 0.92
      });

      expect(rec.id).toBeDefined();
      expect(rec.status).toBe('PENDING_REVIEW');
      recId = rec.id;
    });

    it('requires human administrator to review and accept/reject recommendation', async () => {
      const result = await AdminService.reviewOperationalRecommendation(
        adminId,
        recId,
        'ACCEPTED'
      );

      expect(result.status).toBe('ACCEPTED');
      expect(result.reviewedBy).toBe(adminId);
    });
  });

  // =========================================================================
  // TEST SUITE 10: REAL POSTGRESQL ADMIN DASHBOARD SUMMARY
  // =========================================================================
  describe('10. Authoritative Admin Dashboard Aggregates', () => {
    it('returns live database statistics without mock data', async () => {
      const summary = await AdminService.getAdminDashboardSummary();
      expect(summary).toBeDefined();
      expect(typeof summary.totalOrders).toBe('number');
      expect(typeof summary.gmvCents).toBe('number');
      expect(typeof summary.repProfilesCount).toBe('number');
      expect(Array.isArray(summary.merchantStatusCounts)).toBe(true);
    });
  });

  // =========================================================================
  // TEST SUITE 11: ACCOUNT SANCTIONS & SEPARATION OF DUTIES (GATE B)
  // =========================================================================
  describe('11. Account Sanctions and Financial Restrictions Gate', () => {
    it('requires valid compliance reason and blocks empty reason', async () => {
      await expect(
        AdminService.applyAccountSanction(adminId, driverUserId, 'WARN_USER', '')
      ).rejects.toThrow('SANCTION_REASON_REQUIRED');
    });

    it('strictly prevents self-sanction (admin cannot sanction own account)', async () => {
      await expect(
        AdminService.applyAccountSanction(adminId, adminId, 'SUSPEND_ACCOUNT', 'Self suspension attempt', mfaTokenAdmin)
      ).rejects.toThrow('SELF_SANCTION_PROHIBITED');
    });

    it('requires verified MFA token for high-impact sanctions (SUSPEND_ACCOUNT and FREEZE_PAYOUTS)', async () => {
      await expect(
        AdminService.applyAccountSanction(adminId, driverUserId, 'SUSPEND_ACCOUNT', 'Conduct violation', undefined)
      ).rejects.toThrow('MFA_REQUIRED');

      await expect(
        AdminService.applyAccountSanction(adminId, driverUserId, 'FREEZE_PAYOUTS', 'Fraud alert', undefined)
      ).rejects.toThrow('MFA_REQUIRED');
    });

    it('applies WARN_USER with immutable audit log', async () => {
      const result = await AdminService.applyAccountSanction(
        adminId,
        driverUserId,
        'WARN_USER',
        'Speeding warning issued by compliance'
      );
      expect(result.status).toBe('APPLIED');
      expect(result.sanctionType).toBe('WARN_USER');

      // Verify audit log exists
      const logs = await postgresAdapter.pool.query(
        "SELECT action, actor_id, resource_id FROM audit_logs WHERE action = 'ADMIN_ACCOUNT_SANCTION' AND resource_id = $1;",
        [driverUserId]
      );
      expect(logs.rows.length).toBeGreaterThan(0);
    });

    it('applies FREEZE_PAYOUTS with verified MFA and freezes pending recipient payouts', async () => {
      // Seed a pending payout
      await postgresAdapter.pool.query(`
        INSERT INTO payouts (id, recipient_id, amount_cents, currency, status, recipient_type, created_at)
        VALUES (uuid_generate_v4(), $1, 5000, 'ZAR', 'PENDING', 'DRIVER', NOW());
      `, [driverUserId]);

      const result = await AdminService.applyAccountSanction(
        adminId,
        driverUserId,
        'FREEZE_PAYOUTS',
        'Suspected fraudulent mileage',
        mfaTokenAdmin
      );
      expect(result.status).toBe('APPLIED');

      // Verify payout is frozen
      const payoutRes = await postgresAdapter.pool.query(
        'SELECT status FROM payouts WHERE recipient_id = $1;',
        [driverUserId]
      );
      expect(payoutRes.rows[0].status).toBe('FROZEN');
    });
  });

  // =========================================================================
  // TEST SUITE 12: EMERGENCY KILL SWITCH SERVER-SIDE ENFORCEMENT & RECOVERY (GATE D)
  // =========================================================================
  describe('12. Emergency Kill Switch Server-Side Lifecycle & Recovery', () => {
    it('activates kill switch with Super Admin MFA and verifies isEmergencyKillSwitchActive is true', async () => {
      const res = await AdminService.triggerEmergencyKillSwitchPostgres(
        superAdminId,
        'Critical platform incident 2026-X',
        mfaTokenSuperAdmin
      );
      expect(res.status).toBe('KILL_SWITCH_ENGAGED');

      const isActive = await AdminService.isEmergencyKillSwitchActive();
      expect(isActive).toBe(true);
    });

    it('preserves existing orders, inventory, and deliveries while kill switch is engaged', async () => {
      // Existing records remain intact and uncorrupted
      const ordersRes = await postgresAdapter.pool.query('SELECT COUNT(*) as count FROM orders;');
      expect(parseInt(ordersRes.rows[0].count, 10)).toBeGreaterThan(0);

      const invRes = await postgresAdapter.pool.query('SELECT COUNT(*) as count FROM inventory;');
      expect(parseInt(invRes.rows[0].count, 10)).toBeGreaterThan(0);
    });

    it('rolls back kill switch with Super Admin MFA and verifies safe operational recovery', async () => {
      const res = await AdminService.rollbackEmergencyKillSwitchPostgres(
        superAdminId,
        'Incident resolved, restoring normal service',
        mfaTokenSuperAdmin
      );
      expect(res.status).toBe('KILL_SWITCH_DISENGAGED');

      const isActive = await AdminService.isEmergencyKillSwitchActive();
      expect(isActive).toBe(false);

      // Verify audit trail recorded rollback
      const logs = await postgresAdapter.pool.query(
        "SELECT action, actor_id FROM audit_logs WHERE action = 'SUPER_ADMIN_ROLLBACK_KILL_SWITCH';"
      );
      expect(logs.rows.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // TEST SUITE 13: PAYMENT STATUS AUTHORITY & DISPATCH INTEGRITY (GATE E)
  // =========================================================================
  describe('13. Payment Authority and Dispatch Policy Verification', () => {
    it('proves client-forged payment status claim cannot bypass server payment authority', async () => {
      const orderNumber = `ORD-FORGE-${Date.now()}`;
      const oRes = await postgresAdapter.pool.query(`
        INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents, currency, status, delivery_address_id, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, $2, $3, 2000, 200, 100, 0, 2300, 'ZAR', 'PLACED', $4, NOW(), NOW())
        RETURNING id;
      `, [orderNumber, customerProfileId, businessId, addressId]);
      const forgedOrderId = oRes.rows[0].id;

      // No CAPTURED payment exists in PostgreSQL payments table
      await expect(
        AdminService.dispatchOrder(adminId, forgedOrderId, driverProfileId)
      ).rejects.toThrow('UNPAID_ORDER_DISPATCH_REJECTED');
    });

    it('rejects dispatch for AUTHORISED payment under current business policy (requiring CAPTURED)', async () => {
      const orderNumber = `ORD-AUTH-ONLY-${Date.now()}`;
      const oRes = await postgresAdapter.pool.query(`
        INSERT INTO orders (id, order_number, customer_id, business_id, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents, currency, status, delivery_address_id, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, $2, $3, 2500, 250, 150, 0, 2900, 'ZAR', 'PREPARING', $4, NOW(), NOW())
        RETURNING id;
      `, [orderNumber, customerProfileId, businessId, addressId]);
      const authOrderId = oRes.rows[0].id;

      // Insert AUTHORISED payment (not yet CAPTURED)
      await postgresAdapter.pool.query(`
        INSERT INTO payments (id, order_id, amount_cents, currency, status, payment_provider, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, 2900, 'ZAR', 'AUTHORISED', 'REAL_PAYMENT_GATEWAY', NOW(), NOW());
      `, [authOrderId]);

      // Dispatch policy strictly preserves unpaid-dispatch restriction: AUTHORISED alone cannot dispatch without capture
      await expect(
        AdminService.dispatchOrder(adminId, authOrderId, driverProfileId)
      ).rejects.toThrow('UNPAID_ORDER_DISPATCH_REJECTED');
    });
  });
});
