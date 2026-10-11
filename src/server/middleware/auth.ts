import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { dbInstance } from '../db/database.js';
import { postgresAdapter } from '../db/postgres.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'tuxi-enterprise-secret-key-2026-audit-hardened';

export type UserRoleType = 
  | 'CUSTOMER'
  | 'TUXI_DELIVERY_DRIVER'
  | 'TUXI_REP'
  | 'TUXI_EATS_OWNER'
  | 'TUXI_SHOP_OWNER'
  | 'ADMIN'
  | 'SUPER_ADMIN';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  roles: UserRoleType[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    
    // Authoritative check in PostgreSQL if active
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const userRes = await postgresAdapter.pool.query(
        'SELECT id, email, is_active FROM users WHERE id = $1;',
        [decoded.userId]
      );
      if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
        return res.status(401).json({ error: 'USER_INACTIVE_OR_REVOKED', message: 'User account is inactive or revoked' });
      }

      const rolesRes = await postgresAdapter.pool.query(
        'SELECT role FROM user_roles WHERE user_id = $1;',
        [decoded.userId]
      );
      const roles = rolesRes.rows.map(r => r.role as UserRoleType);

      req.user = {
        userId: userRes.rows[0].id,
        email: userRes.rows[0].email,
        roles
      };

      return next();
    }

    // Isolated SQLite Fallback
    const user = dbInstance.db.prepare('SELECT id, email, is_active FROM users WHERE id = ?').get(decoded.userId) as any;
    if (!user || user.is_active !== 1) {
      return res.status(401).json({ error: 'USER_INACTIVE_OR_REVOKED', message: 'User account is inactive or revoked' });
    }

    // Load server-side assigned roles
    const rolesRows = dbInstance.db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(decoded.userId) as { role: string }[];
    const roles = rolesRows.map(r => r.role as UserRoleType);

    req.user = {
      userId: user.id,
      email: user.email,
      roles
    };

    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token verification failed' });
  }
}

export function requireRole(...allowedRoles: UserRoleType[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required' });
    }

    const hasRole = req.user.roles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      // Audit security breach attempt
      if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
        try {
          await postgresAdapter.pool.query(`
            INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, ip_address, user_agent, before_state, after_state)
            VALUES (uuid_generate_v4(), $1, 'SECURITY_AUTHORIZATION_BREACH_ATTEMPT', 'ENDPOINT_ROLE_CHECK', $2, $3, $4, $5, $6);
          `, [
            req.user.userId,
            req.originalUrl,
            req.ip || 'unknown',
            req.get('user-agent') || 'unknown',
            JSON.stringify({ userRoles: req.user.roles }),
            JSON.stringify({ requiredRoles: allowedRoles })
          ]);
        } catch (_) {}
      } else {
        dbInstance.db.prepare(`
          INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, ip_address, user_agent, before_state, after_state)
          VALUES (?, ?, 'SECURITY_AUTHORIZATION_BREACH_ATTEMPT', 'ENDPOINT_ROLE_CHECK', ?, ?, ?, ?, ?)
        `).run(
          dbInstance.generateUuid(),
          req.user.userId,
          req.originalUrl,
          req.ip || 'unknown',
          req.get('user-agent') || 'unknown',
          JSON.stringify({ userRoles: req.user.roles }),
          JSON.stringify({ requiredRoles: allowedRoles })
        );
      }

      return res.status(403).json({ 
        error: 'FORBIDDEN', 
        message: `Access denied. Endpoint requires one of roles: [${allowedRoles.join(', ')}]` 
      });
    }

    next();
  };
}
