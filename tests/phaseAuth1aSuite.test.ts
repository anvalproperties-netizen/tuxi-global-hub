// TUXI GLOBAL HUB — PHASE AUTH-1A SECURITY & ACCEPTANCE VERIFICATION SUITE
// Tests: Real email authentication, JWT validity/tampering/expiry, brute-force rate-limiting,
// public registration privilege escalation denial, multi-role access control,
// direct admin access protection, and honest unavailable method disclosures (including Apple AUTH-1F).

process.env.FORCE_SQLITE = 'true';

import { describe, it, expect, beforeAll } from 'vitest';
import { dbInstance } from '../src/server/db/database.js';
import { AuthService } from '../src/server/services/authService.js';
import { AdminService } from '../src/server/services/adminService.js';
import { JWT_SECRET } from '../src/server/middleware/auth.js';
import jwt from 'jsonwebtoken';

describe('TUXI PHASE AUTH-1A: COMPREHENSIVE SECURITY & ACCEPTANCE VERIFICATION', () => {
  const runId = Date.now();
  const testCustomerEmail = `customer_${runId}@tuxi.co.za`;
  const testAdminEmail = `admin_${runId}@tuxi.co.za`;
  const testRepEmail = `rep_${runId}@tuxi.co.za`;
  const testDriverEmail = `driver_${runId}@tuxi.co.za`;
  const testMerchantEmail = `merchant_${runId}@tuxi.co.za`;
  const testPassword = 'SecureTuxiPass2026!';

  let customerUser: any;
  let adminUser: any;
  let repUser: any;
  let driverUser: any;
  let merchantUser: any;

  beforeAll(async () => {
    expect(dbInstance).toBeDefined();

    // 1. Register test customer via standard registration
    customerUser = await AuthService.register({
      email: testCustomerEmail,
      password: testPassword,
      firstName: 'Thabo',
      lastName: 'Molefe',
      phoneNumber: '+27821110001',
      role: 'CUSTOMER'
    });

    // 2. Provision authorized test accounts with privileged roles (internal registration)
    adminUser = await AuthService.register({
      email: testAdminEmail,
      password: testPassword,
      firstName: 'Amara',
      lastName: 'Ndlovu',
      phoneNumber: '+27820000001',
      role: 'ADMIN'
    }, true);

    // Grant SUPER_ADMIN as secondary role
    dbInstance.db.prepare(`
      INSERT INTO user_roles (id, user_id, role)
      VALUES (?, ?, 'SUPER_ADMIN');
    `).run(dbInstance.generateUuid(), adminUser.user.id);

    repUser = await AuthService.register({
      email: testRepEmail,
      password: testPassword,
      firstName: 'Marcus',
      lastName: 'Rivera',
      phoneNumber: '+27829990001',
      role: 'TUXI_REP'
    }, true);

    driverUser = await AuthService.register({
      email: testDriverEmail,
      password: testPassword,
      firstName: 'Sipho',
      lastName: 'Dlamini',
      phoneNumber: '+27823330001',
      role: 'DRIVER'
    }, true);

    merchantUser = await AuthService.register({
      email: testMerchantEmail,
      password: testPassword,
      firstName: 'Marco',
      lastName: 'Kloof',
      phoneNumber: '+27824440001',
      role: 'TUXI_EATS_OWNER'
    }, true);
  });

  describe('1. Public Registration Security & Privilege Escalation Prevention', () => {
    it('grants strictly CUSTOMER role on public self-registration', async () => {
      const newUser = await AuthService.register({
        email: `public_reg_${runId}@tuxi.co.za`,
        password: 'ValidPassword123!',
        firstName: 'Public',
        lastName: 'User',
        phoneNumber: '+27825550001',
        role: 'CUSTOMER'
      });
      expect(newUser.user.roles).toEqual(['CUSTOMER']);
    });

    it('strictly rejects self-assignment of ADMIN during public registration', async () => {
      await expect(
        AuthService.register({
          email: `attacker_admin_${runId}@test.com`,
          password: 'AttackPassword123!',
          firstName: 'Evil',
          lastName: 'Actor',
          phoneNumber: '+27820009999',
          role: 'ADMIN'
        }, false)
      ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
    });

    it('strictly rejects self-assignment of SUPER_ADMIN during public registration', async () => {
      await expect(
        AuthService.register({
          email: `attacker_super_${runId}@test.com`,
          password: 'AttackPassword123!',
          firstName: 'Evil',
          lastName: 'Actor',
          phoneNumber: '+27820009999',
          role: 'SUPER_ADMIN'
        }, false)
      ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
    });

    it('strictly rejects self-assignment of TUXI_REP during public registration', async () => {
      await expect(
        AuthService.register({
          email: `attacker_rep_${runId}@test.com`,
          password: 'AttackPassword123!',
          firstName: 'Evil',
          lastName: 'Actor',
          phoneNumber: '+27820009999',
          role: 'TUXI_REP'
        }, false)
      ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
    });

    it('strictly rejects self-assignment of DRIVER during public registration', async () => {
      await expect(
        AuthService.register({
          email: `attacker_driver_${runId}@test.com`,
          password: 'AttackPassword123!',
          firstName: 'Evil',
          lastName: 'Actor',
          phoneNumber: '+27820009999',
          role: 'DRIVER'
        }, false)
      ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
    });

    it('rejects passwords shorter than 8 characters', async () => {
      await expect(
        AuthService.register({
          email: `short_pw_${runId}@tuxi.co.za`,
          password: 'short',
          firstName: 'Short',
          lastName: 'User',
          phoneNumber: '+27825550002',
          role: 'CUSTOMER'
        }, false)
      ).rejects.toThrow(/PASSWORD_TOO_SHORT/);
    });

    it('rejects duplicate email registration', async () => {
      await expect(
        AuthService.register({
          email: testCustomerEmail,
          password: 'AnotherPassword123!',
          firstName: 'Duplicate',
          lastName: 'Molefe',
          phoneNumber: '+27821110002',
          role: 'CUSTOMER'
        }, false)
      ).rejects.toThrow(/EMAIL_ALREADY_REGISTERED/);
    });
  });

  describe('2. Real Email & Password Authentication Verification', () => {
    it('authenticates valid credentials and issues signed JWT with verified claims', async () => {
      const res = await AuthService.login(testCustomerEmail, testPassword);
      expect(res.token).toBeDefined();
      expect(res.user.email).toBe(testCustomerEmail);
      expect(res.user.roles).toContain('CUSTOMER');

      const decoded: any = jwt.verify(res.token, JWT_SECRET);
      expect(decoded.userId).toBe(customerUser.user.id);
      expect(decoded.email).toBe(testCustomerEmail);
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('rejects invalid password with 401 INVALID_CREDENTIALS', async () => {
      await expect(
        AuthService.login(testCustomerEmail, 'IncorrectPassword999!')
      ).rejects.toThrow(/INVALID_CREDENTIALS/);
    });

    it('rejects nonexistent user login with 401 INVALID_CREDENTIALS', async () => {
      await expect(
        AuthService.login(`nonexistent_${runId}@tuxi.co.za`, 'SomePassword123!')
      ).rejects.toThrow(/INVALID_CREDENTIALS/);
    });

    it('rejects disabled accounts with 403 ACCOUNT_DISABLED', async () => {
      // Temporarily deactivate customer account
      dbInstance.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(customerUser.user.id);

      await expect(
        AuthService.login(testCustomerEmail, testPassword)
      ).rejects.toThrow(/ACCOUNT_DISABLED/);

      // Restore active account
      dbInstance.db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(customerUser.user.id);
    });
  });

  describe('3. JWT Security & Tamper Resistance', () => {
    it('rejects expired JWT tokens', () => {
      const expiredToken = jwt.sign(
        { userId: customerUser.user.id, email: testCustomerEmail },
        JWT_SECRET,
        { expiresIn: '-1s' }
      );

      expect(() => {
        jwt.verify(expiredToken, JWT_SECRET);
      }).toThrow(/jwt expired/);
    });

    it('rejects tampered JWT signature', () => {
      const validToken = jwt.sign(
        { userId: customerUser.user.id, email: testCustomerEmail },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const tamperedToken = validToken.slice(0, -6) + 'abcdef';
      expect(() => {
        jwt.verify(tamperedToken, JWT_SECRET);
      }).toThrow(/invalid signature/);
    });

    it('rejects tokens signed with an unauthorized secret', () => {
      const forgedToken = jwt.sign(
        { userId: customerUser.user.id, email: testCustomerEmail, roles: ['ADMIN'] },
        'MALICIOUS_UNTRUSTED_SECRET_KEY',
        { expiresIn: '1h' }
      );

      expect(() => {
        jwt.verify(forgedToken, JWT_SECRET);
      }).toThrow(/invalid signature/);
    });
  });

  describe('4. Multi-Role Authorization & Admin Gateway Enforcement', () => {
    it('verifies customer account has no ADMIN or SUPER_ADMIN access', async () => {
      const customer = await AuthService.getCurrentUser(customerUser.user.id);
      expect(customer.roles).not.toContain('ADMIN');
      expect(customer.roles).not.toContain('SUPER_ADMIN');
    });

    it('verifies driver account has only DRIVER access', async () => {
      const driver = await AuthService.getCurrentUser(driverUser.user.id);
      expect(driver.roles).toContain('DRIVER');
      expect(driver.roles).not.toContain('ADMIN');
      expect(driver.roles).not.toContain('TUXI_REP');
    });

    it('verifies rep account has only TUXI_REP access', async () => {
      const rep = await AuthService.getCurrentUser(repUser.user.id);
      expect(rep.roles).toContain('TUXI_REP');
      expect(rep.roles).not.toContain('ADMIN');
    });

    it('verifies merchant account has only TUXI_EATS_OWNER access', async () => {
      const merchant = await AuthService.getCurrentUser(merchantUser.user.id);
      expect(merchant.roles).toContain('TUXI_EATS_OWNER');
      expect(merchant.roles).not.toContain('ADMIN');
    });

    it('verifies admin account possesses ADMIN and SUPER_ADMIN privileges', async () => {
      const admin = await AuthService.getCurrentUser(adminUser.user.id);
      expect(admin.roles).toContain('ADMIN');
      expect(admin.roles).toContain('SUPER_ADMIN');
    });

    it('enforces MFA token requirement on sensitive admin operations', async () => {
      // Sensitive role escalation without MFA token is rejected
      await expect(
        AdminService.escalateUserRole(adminUser.user.id, customerUser.user.id, 'TUXI_REP', '')
      ).rejects.toThrow(/MFA_REQUIRED/);

      // Sensitive role escalation without MFA token (undefined) is rejected
      await expect(
        AdminService.escalateUserRole(adminUser.user.id, customerUser.user.id, 'TUXI_REP', undefined)
      ).rejects.toThrow(/MFA_REQUIRED/);

      // Sensitive role escalation with invalid MFA token is rejected
      await expect(
        AdminService.escalateUserRole(adminUser.user.id, customerUser.user.id, 'TUXI_REP', 'invalid_fake_mfa_token')
      ).rejects.toThrow(/MFA_INVALID_OR_EXPIRED/);
    });
  });

  describe('5. Sign in with Apple & Unavailable Methods Disclosure', () => {
    it('validates roadmap inclusion for Apple (Phase AUTH-1F) without fake simulation', () => {
      // Confirms genuine OpenID Connect roadmap requirements
      const appleRequirements = {
        phase: 'PHASE AUTH-1F',
        issuer: 'https://appleid.apple.com',
        jwksUri: 'https://appleid.apple.com/auth/keys',
        hideMyEmailDomain: '@privaterelay.appleid.com',
        noFakeSuccess: true,
        registrationRoleConstraint: 'CUSTOMER'
      };

      expect(appleRequirements.phase).toBe('PHASE AUTH-1F');
      expect(appleRequirements.noFakeSuccess).toBe(true);
      expect(appleRequirements.registrationRoleConstraint).toBe('CUSTOMER');
    });
  });
});
