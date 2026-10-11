import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbInstance } from '../db/database.js';
import { postgresAdapter } from '../db/postgres.js';
import { JWT_SECRET, UserRoleType } from '../middleware/auth.js';

export interface RegisterUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role?: string; // Client requested role (MUST BE IGNORED FOR PUBLIC REGISTRATION)
}

export class AuthService {
  /**
   * Registers a new customer.
   * STRICT SECURITY INSTRUCTION (2A.1): Public registration creates CUSTOMER role ONLY.
   * Browser/client requests for ADMIN, SUPER_ADMIN, TUXI_REP, DRIVER, etc. are strictly forbidden and rejected.
   */
  public static async register(input: RegisterUserInput, allowPrivilegedRoles = false) {
    if (!input.email || !input.password || !input.firstName || !input.lastName || !input.phoneNumber) {
      throw new Error('MISSING_REQUIRED_FIELDS');
    }

    if (input.password.length < 8) {
      throw new Error('PASSWORD_TOO_SHORT: Password must be at least 8 characters long');
    }

    if (!allowPrivilegedRoles && input.role && input.role !== 'CUSTOMER') {
      throw new Error(`FORBIDDEN_ROLE_ASSIGNMENT: Users cannot self-assign privileged role "${input.role}"`);
    }

    const assignedRole = (allowPrivilegedRoles && input.role) ? (input.role as UserRoleType) : ('CUSTOMER' as UserRoleType);

    const email = input.email.toLowerCase().trim();

    // Check if running on PostgreSQL / PostGIS
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        // 1. Duplicate email check
        const existing = await client.query('SELECT id FROM users WHERE email = $1;', [email]);
        if (existing.rows.length > 0) {
          throw new Error('EMAIL_ALREADY_REGISTERED');
        }

        // 2. Hash password with bcrypt
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(input.password, salt);

        // 3. Insert user (immutable server-side UUIDv4)
        const userRes = await client.query(`
          INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
          VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, true, false)
          RETURNING id, email, first_name, last_name, phone_number;
        `, [email, passwordHash, input.firstName.trim(), input.lastName.trim(), input.phoneNumber.trim()]);
        const user = userRes.rows[0];

        // 4. Role assignment (strictly CUSTOMER for public self-registration)
        await client.query(`
          INSERT INTO user_roles (id, user_id, role)
          VALUES (uuid_generate_v4(), $1, $2);
        `, [user.id, assignedRole]);

        // 5. Initialize customer profile if customer
        if (assignedRole === 'CUSTOMER') {
          await client.query(`
            INSERT INTO customer_profiles (id, user_id, preferred_language, preferred_currency, loyalty_points, loyalty_tier)
            VALUES (uuid_generate_v4(), $1, 'en', 'ZAR', 0, 'BRONZE');
          `, [user.id]);
        }

        // 6. Audit log
        await client.query(`
          INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
          VALUES (uuid_generate_v4(), $1::uuid, 'USER_REGISTERED', 'USER', $1::text, $2);
        `, [user.id, JSON.stringify({ email: user.email, role: assignedRole })]);

        await client.query('COMMIT;');

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        return {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            phoneNumber: user.phone_number,
            roles: [assignedRole]
          },
          token
        };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback (Only in non-production/unit test)
    const existing = dbInstance.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new Error('EMAIL_ALREADY_REGISTERED');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(input.password, salt);
    const userId = dbInstance.generateUuid();

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      dbInstance.db.prepare(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, email, passwordHash, input.firstName.trim(), input.lastName.trim(), input.phoneNumber.trim());

      dbInstance.db.prepare(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (?, ?, ?)
      `).run(dbInstance.generateUuid(), userId, assignedRole);

      if (assignedRole === 'CUSTOMER') {
        dbInstance.db.prepare(`
          INSERT INTO customer_profiles (id, user_id)
          VALUES (?, ?)
        `).run(dbInstance.generateUuid(), userId);
      }

      dbInstance.db.exec('COMMIT;');

      const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
      return {
        user: {
          id: userId,
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          phoneNumber: input.phoneNumber,
          roles: [assignedRole]
        },
        token
      };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Authenticates user against PostgreSQL credentials.
   * Verifies account is active, compares bcrypt hash, and issues signed JWT.
   */
  public static async login(emailInput: string, password: string) {
    if (!emailInput || !password) {
      throw new Error('MISSING_CREDENTIALS');
    }

    const email = emailInput.toLowerCase().trim();

    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        const u = await client.query(`
          SELECT id, email, password_hash, first_name, last_name, phone_number, is_active
          FROM users WHERE email = $1;
        `, [email]);

        if (u.rows.length === 0) {
          throw new Error('INVALID_CREDENTIALS');
        }

        const user = u.rows[0];

        if (!user.is_active) {
          throw new Error('ACCOUNT_DISABLED: This account has been deactivated or suspended');
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
          throw new Error('INVALID_CREDENTIALS');
        }

        const rolesRes = await client.query('SELECT role FROM user_roles WHERE user_id = $1;', [user.id]);
        const roles = rolesRes.rows.map(r => r.role as UserRoleType);

        // Fetch customer profile if exists
        const profRes = await client.query('SELECT * FROM customer_profiles WHERE user_id = $1;', [user.id]);
        const profile = profRes.rows[0] || null;

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        return {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            phoneNumber: user.phone_number,
            roles,
            profile: profile ? {
              id: profile.id,
              preferredLanguage: profile.preferred_language,
              preferredCurrency: profile.preferred_currency,
              loyaltyPoints: profile.loyalty_points,
              loyaltyTier: profile.loyalty_tier
            } : null
          },
          token
        };
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const user = dbInstance.db.prepare(`
      SELECT id, email, password_hash, first_name, last_name, is_active
      FROM users WHERE email = ?
    `).get(email) as any;

    if (!user) throw new Error('INVALID_CREDENTIALS');
    if (user.is_active !== 1) throw new Error('ACCOUNT_DISABLED: This account has been deactivated or suspended');

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) throw new Error('INVALID_CREDENTIALS');

    const rolesRows = dbInstance.db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(user.id) as { role: string }[];
    const roles = rolesRows.map(r => r.role as UserRoleType);

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roles
      },
      token
    };
  }

  /**
   * Retrieves the currently authenticated user by ID.
   */
  public static async getCurrentUser(userId: string) {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        const u = await client.query(`
          SELECT id, email, first_name, last_name, phone_number, is_active
          FROM users WHERE id = $1;
        `, [userId]);

        if (u.rows.length === 0) {
          throw new Error('USER_NOT_FOUND');
        }

        const user = u.rows[0];
        if (!user.is_active) {
          throw new Error('ACCOUNT_DISABLED');
        }

        const rolesRes = await client.query('SELECT role FROM user_roles WHERE user_id = $1;', [user.id]);
        const roles = rolesRes.rows.map(r => r.role as UserRoleType);

        const profRes = await client.query('SELECT * FROM customer_profiles WHERE user_id = $1;', [user.id]);
        const profile = profRes.rows[0] || null;

        return {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: user.phone_number,
          roles,
          profile: profile ? {
            id: profile.id,
            preferredLanguage: profile.preferred_language,
            preferredCurrency: profile.preferred_currency,
            loyaltyPoints: profile.loyalty_points,
            loyaltyTier: profile.loyalty_tier
          } : null
        };
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const user = dbInstance.db.prepare('SELECT id, email, first_name, last_name, phone_number, is_active FROM users WHERE id = ?').get(userId) as any;
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.is_active !== 1) throw new Error('ACCOUNT_DISABLED');

    const rolesRows = dbInstance.db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(user.id) as { role: string }[];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phoneNumber: user.phone_number,
      roles: rolesRows.map(r => r.role as UserRoleType)
    };
  }
}
