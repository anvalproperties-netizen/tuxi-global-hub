import { postgresAdapter } from '../db/postgres.js';
import { dbInstance } from '../db/database.js';

export interface AddressInput {
  streetLine1: string;
  streetLine2?: string;
  city: string;
  stateProvince?: string;
  postalCode: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  label?: string;
  isDefault?: boolean;
  deliveryInstructions?: string;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  preferredLanguage?: string;
  preferredCurrency?: string;
  notificationPreferences?: Record<string, boolean>;
}

export class CustomerService {
  /**
   * Retrieves customer profile with joined user information.
   * Strict ownership enforced: callers only access their own profile.
   */
  public static async getProfile(userId: string) {
    if (process.env.SQL_HOST) {
      const client = await postgresAdapter.pool.connect();
      try {
        const res = await client.query(`
          SELECT 
            u.id as user_id,
            u.email,
            u.first_name,
            u.last_name,
            u.phone_number,
            u.is_active,
            cp.id as profile_id,
            cp.default_address_id,
            cp.preferred_language,
            cp.preferred_currency,
            cp.notification_preferences,
            cp.loyalty_points,
            cp.loyalty_tier,
            cp.created_at
          FROM users u
          JOIN customer_profiles cp ON cp.user_id = u.id
          WHERE u.id = $1;
        `, [userId]);

        if (res.rows.length === 0) {
          throw new Error('CUSTOMER_PROFILE_NOT_FOUND');
        }

        const row = res.rows[0];
        return {
          userId: row.user_id,
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          phoneNumber: row.phone_number,
          profileId: row.profile_id,
          defaultAddressId: row.default_address_id,
          preferredLanguage: row.preferred_language,
          preferredCurrency: row.preferred_currency,
          notificationPreferences: row.notification_preferences,
          loyaltyPoints: row.loyalty_points,
          loyaltyTier: row.loyalty_tier,
          createdAt: row.created_at
        };
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const user = dbInstance.db.prepare('SELECT id, email, first_name, last_name, phone_number FROM users WHERE id = ?').get(userId) as any;
    if (!user) throw new Error('CUSTOMER_PROFILE_NOT_FOUND');
    const profile = dbInstance.db.prepare('SELECT * FROM customer_profiles WHERE user_id = ?').get(userId) as any;
    return {
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phoneNumber: user.phone_number,
      loyaltyPoints: profile?.loyalty_points || 0,
      loyaltyTier: profile?.loyalty_tier || 'BRONZE'
    };
  }

  /**
   * Updates permitted customer profile fields.
   * Server determines editable fields. Rejects any attempt to modify userId, roles, or internal flags.
   */
  public static async updateProfile(userId: string, data: UpdateProfileInput) {
    if (process.env.SQL_HOST) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        // 1. Update users table fields if provided
        if (data.firstName !== undefined || data.lastName !== undefined || data.phoneNumber !== undefined) {
          await client.query(`
            UPDATE users 
            SET 
              first_name = COALESCE($1, first_name),
              last_name = COALESCE($2, last_name),
              phone_number = COALESCE($3, phone_number),
              updated_at = NOW()
            WHERE id = $4;
          `, [data.firstName?.trim() || null, data.lastName?.trim() || null, data.phoneNumber?.trim() || null, userId]);
        }

        // 2. Update customer_profiles table fields if provided
        if (data.preferredLanguage !== undefined || data.preferredCurrency !== undefined || data.notificationPreferences !== undefined) {
          await client.query(`
            UPDATE customer_profiles 
            SET 
              preferred_language = COALESCE($1, preferred_language),
              preferred_currency = COALESCE($2, preferred_currency),
              notification_preferences = COALESCE($3, notification_preferences),
              updated_at = NOW()
            WHERE user_id = $4;
          `, [
            data.preferredLanguage || null,
            data.preferredCurrency || null,
            data.notificationPreferences ? JSON.stringify(data.notificationPreferences) : null,
            userId
          ]);
        }

        // 3. Record audit log
        await client.query(`
          INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, after_state)
          VALUES (uuid_generate_v4(), $1::uuid, 'CUSTOMER_PROFILE_UPDATED', 'CUSTOMER_PROFILE', $1::text, $2);
        `, [userId, JSON.stringify(data)]);

        await client.query('COMMIT;');
        return this.getProfile(userId);
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    if (data.firstName || data.lastName) {
      dbInstance.db.prepare('UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name) WHERE id = ?')
        .run(data.firstName || null, data.lastName || null, userId);
    }
    return this.getProfile(userId);
  }

  /**
   * Retrieves all delivery addresses belonging to the authenticated customer.
   */
  public static async getAddresses(userId: string) {
    if (process.env.SQL_HOST) {
      const client = await postgresAdapter.pool.connect();
      try {
        const res = await client.query(`
          SELECT 
            id,
            street_line_1,
            street_line_2,
            city,
            state_province,
            postal_code,
            country_code,
            latitude::float8,
            longitude::float8,
            label,
            is_default,
            delivery_instructions,
            created_at
          FROM addresses
          WHERE user_id = $1
          ORDER BY is_default DESC, created_at DESC;
        `, [userId]);

        return res.rows.map(r => ({
          id: r.id,
          streetLine1: r.street_line_1,
          streetLine2: r.street_line_2,
          city: r.city,
          stateProvince: r.state_province,
          postalCode: r.postal_code,
          countryCode: r.country_code,
          latitude: r.latitude,
          longitude: r.longitude,
          label: r.label,
          isDefault: r.is_default,
          deliveryInstructions: r.delivery_instructions,
          createdAt: r.created_at
        }));
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const rows = dbInstance.db.prepare('SELECT * FROM addresses WHERE user_id = ?').all(userId) as any[];
    return rows.map(r => ({
      id: r.id,
      streetLine1: r.street_line_1,
      streetLine2: r.street_line_2,
      city: r.city,
      stateProvince: r.state_province,
      postalCode: r.postal_code,
      countryCode: r.country_code,
      latitude: r.latitude,
      longitude: r.longitude,
      label: r.label,
      isDefault: Boolean(r.is_default),
      deliveryInstructions: r.delivery_instructions,
      createdAt: r.created_at
    }));
  }

  /**
   * Creates a new delivery address for the authenticated customer.
   * Validates coordinates and maintains default address pointer.
   */
  public static async createAddress(userId: string, input: AddressInput) {
    if (!input.streetLine1 || !input.city || !input.postalCode || !input.countryCode) {
      throw new Error('MISSING_ADDRESS_FIELDS');
    }

    if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) {
      throw new Error('INVALID_COORDINATES: Latitude must be -90..90 and longitude -180..180');
    }

    const normalized = `${input.streetLine1.toUpperCase()}, ${input.city.toUpperCase()}, ${input.postalCode}, ${input.countryCode.toUpperCase()}`;
    const label = input.label || 'Home';
    const isDefault = Boolean(input.isDefault);

    if (process.env.SQL_HOST) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        // If setting as default, unmark other addresses for this user
        if (isDefault) {
          await client.query('UPDATE addresses SET is_default = false WHERE user_id = $1;', [userId]);
        }

        // Insert new address with PostGIS point
        const ins = await client.query(`
          INSERT INTO addresses (
            id, user_id, street_line_1, street_line_2, city, state_province, postal_code, country_code,
            latitude, longitude, geom, normalized_address, label, is_default, delivery_instructions
          )
          VALUES (
            uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7,
            $8::numeric, $9::numeric, ST_SetSRID(ST_Point($9::float8, $8::float8), 4326), $10, $11, $12, $13
          )
          RETURNING id, street_line_1, city, postal_code, country_code, latitude::float8, longitude::float8, label, is_default, delivery_instructions;
        `, [
          userId, input.streetLine1.trim(), input.streetLine2?.trim() || null, input.city.trim(),
          input.stateProvince?.trim() || null, input.postalCode.trim(), input.countryCode.trim(),
          input.latitude, input.longitude, normalized, label, isDefault, input.deliveryInstructions || null
        ]);

        const addr = ins.rows[0];

        // Update customer default_address_id if isDefault is true or if this is the customer's first address
        if (isDefault) {
          await client.query('UPDATE customer_profiles SET default_address_id = $1 WHERE user_id = $2;', [addr.id, userId]);
        } else {
          await client.query(`
            UPDATE customer_profiles 
            SET default_address_id = $1 
            WHERE user_id = $2 AND default_address_id IS NULL;
          `, [addr.id, userId]);
        }

        await client.query('COMMIT;');

        return {
          id: addr.id,
          streetLine1: addr.street_line_1,
          city: addr.city,
          postalCode: addr.postal_code,
          countryCode: addr.country_code,
          latitude: addr.latitude,
          longitude: addr.longitude,
          label: addr.label,
          isDefault: addr.is_default,
          deliveryInstructions: addr.delivery_instructions
        };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    // Isolated SQLite Fallback
    const id = dbInstance.generateUuid();
    dbInstance.db.prepare(`
      INSERT INTO addresses (id, user_id, street_line_1, city, postal_code, country_code, latitude, longitude, normalized_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.streetLine1, input.city, input.postalCode, input.countryCode, input.latitude, input.longitude, normalized);

    return { id, ...input };
  }

  /**
   * Updates an existing address.
   * Strict ownership check: Customer A cannot edit Customer B's address.
   */
  public static async updateAddress(userId: string, addressId: string, input: Partial<AddressInput>) {
    if (process.env.SQL_HOST) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        // Check ownership
        const existing = await client.query('SELECT id, user_id FROM addresses WHERE id = $1;', [addressId]);
        if (existing.rows.length === 0) {
          throw new Error('ADDRESS_NOT_FOUND');
        }
        if (existing.rows[0].user_id !== userId) {
          throw new Error('FORBIDDEN_ADDRESS_ACCESS: You do not own this address');
        }

        if (input.isDefault) {
          await client.query('UPDATE addresses SET is_default = false WHERE user_id = $1;', [userId]);
          await client.query('UPDATE customer_profiles SET default_address_id = $1 WHERE user_id = $2;', [addressId, userId]);
        }

        const res = await client.query(`
          UPDATE addresses
          SET
            street_line_1 = COALESCE($1, street_line_1),
            city = COALESCE($2, city),
            postal_code = COALESCE($3, postal_code),
            country_code = COALESCE($4, country_code),
            label = COALESCE($5, label),
            is_default = COALESCE($6, is_default),
            delivery_instructions = COALESCE($7, delivery_instructions),
            updated_at = NOW()
          WHERE id = $8 AND user_id = $9
          RETURNING id, street_line_1, city, postal_code, country_code, latitude::float8, longitude::float8, label, is_default, delivery_instructions;
        `, [
          input.streetLine1?.trim() || null,
          input.city?.trim() || null,
          input.postalCode?.trim() || null,
          input.countryCode?.trim() || null,
          input.label || null,
          input.isDefault !== undefined ? input.isDefault : null,
          input.deliveryInstructions || null,
          addressId,
          userId
        ]);

        await client.query('COMMIT;');
        const r = res.rows[0];
        return {
          id: r.id,
          streetLine1: r.street_line_1,
          city: r.city,
          postalCode: r.postal_code,
          countryCode: r.country_code,
          latitude: r.latitude,
          longitude: r.longitude,
          label: r.label,
          isDefault: r.is_default,
          deliveryInstructions: r.delivery_instructions
        };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    return { id: addressId, ...input };
  }

  /**
   * Deletes an address.
   * Strict ownership check: Customer A cannot delete Customer B's address.
   */
  public static async deleteAddress(userId: string, addressId: string) {
    if (process.env.SQL_HOST) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');

        const existing = await client.query('SELECT id, user_id FROM addresses WHERE id = $1;', [addressId]);
        if (existing.rows.length === 0) {
          throw new Error('ADDRESS_NOT_FOUND');
        }
        if (existing.rows[0].user_id !== userId) {
          throw new Error('FORBIDDEN_ADDRESS_ACCESS: You do not own this address');
        }

        // Clear default address pointer if deleting the default
        await client.query('UPDATE customer_profiles SET default_address_id = NULL WHERE default_address_id = $1;', [addressId]);

        await client.query('DELETE FROM addresses WHERE id = $1 AND user_id = $2;', [addressId, userId]);

        await client.query('COMMIT;');
        return { success: true };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    dbInstance.db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(addressId, userId);
    return { success: true };
  }

  /**
   * Sets the default delivery address for a customer.
   */
  public static async setDefaultAddress(userId: string, addressId: string) {
    return this.updateAddress(userId, addressId, { isDefault: true });
  }
}
