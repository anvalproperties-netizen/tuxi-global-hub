import { postgresAdapter } from '../db/postgres.js';

export interface OnboardDriverInput {
  userId: string;
  licenseNumber: string;
  vehicleType: string; // 'MOTORCYCLE' | 'CAR' | 'BAKKIE' | 'LIGHT_TRUCK'
  vehiclePlate: string;
  isOnline?: boolean;
}

export const APPROVED_DELIVERY_VEHICLE_TYPES = [
  'MOTORCYCLE',
  'SCOOTER',
  'MOTORBIKE',
  'CAR',
  'SEDAN',
  'HATCHBACK',
  'BAKKIE',
  'VAN',
  'LIGHT_TRUCK',
  'TRUCK'
] as const;

export const PROHIBITED_DELIVERY_VEHICLE_TYPES = [
  'BICYCLE',
  'BIKE',
  'E_BIKE',
  'E-BIKE',
  'ELECTRIC_BICYCLE',
  'ELECTRIC_BIKE',
  'PEDAL_BICYCLE'
] as const;

export interface UpdateAvailabilityInput {
  driverId: string;
  isOnline: boolean;
}

export interface RecordLocationInput {
  driverId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export class DriverService {
  /**
   * Onboards a driver profile in PostgreSQL.
   * Derives authority from server-side roles: requires TUXI_DELIVERY_DRIVER role on the user.
   * STRICT ENFORCEMENT: Bicycles and electric bikes are strictly prohibited.
   */
  public static async onboardDriver(input: OnboardDriverInput) {
    const rawType = (input.vehicleType || '').trim().toUpperCase();

    // 0. Strict backend transport restriction: Reject Bicycles and E-Bikes
    if (
      PROHIBITED_DELIVERY_VEHICLE_TYPES.some(p => rawType === p || (rawType.includes('BICYCLE') || (rawType.includes('BIKE') && !rawType.includes('MOTORBIKE'))))
    ) {
      throw new Error('BICYCLE_TRANSPORT_PROHIBITED: Bicycles and electric bicycles are strictly prohibited for commercial delivery transport. Approved categories are Motorcycle / Scooter, Car, Bakkie / Van, and Suitable Light Truck.');
    }

    if (!APPROVED_DELIVERY_VEHICLE_TYPES.some(a => rawType === a || rawType.includes(a))) {
      throw new Error(`INVALID_VEHICLE_TYPE: '${input.vehicleType}' is not an approved delivery transport category. Approved categories: Motorcycle / Scooter, Car, Bakkie / Van, and Suitable Light Truck.`);
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Verify user exists and has TUXI_DELIVERY_DRIVER role
      const userRes = await client.query('SELECT id, is_active FROM users WHERE id = $1;', [input.userId]);
      if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
        await client.query('ROLLBACK;');
        throw new Error('USER_NOT_FOUND_OR_INACTIVE');
      }

      const roleRes = await client.query(
        "SELECT id FROM user_roles WHERE user_id = $1 AND role = 'TUXI_DELIVERY_DRIVER';",
        [input.userId]
      );
      if (roleRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('FORBIDDEN_NOT_A_DRIVER: User does not hold TUXI_DELIVERY_DRIVER role');
      }

      // 2. Check for duplicate driver profile or duplicate license/plate
      const existing = await client.query(
        'SELECT id FROM driver_profiles WHERE user_id = $1 OR license_number = $2 OR vehicle_plate = $3;',
        [input.userId, input.licenseNumber, input.vehiclePlate]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK;');
        throw new Error('DRIVER_PROFILE_OR_CREDENTIALS_ALREADY_REGISTERED');
      }

      // 3. Insert driver profile (defaults to PENDING verification)
      const insertRes = await client.query(`
        INSERT INTO driver_profiles (
          id, user_id, license_number, vehicle_type, vehicle_plate,
          verification_status, onboarding_status, is_online, is_suspended
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4,
          'PENDING', 'PENDING_VERIFICATION', false, false
        )
        RETURNING id, user_id, license_number, vehicle_type, vehicle_plate, verification_status, onboarding_status, is_online, is_suspended;
      `, [input.userId, input.licenseNumber, input.vehicleType, input.vehiclePlate]);

      await client.query('COMMIT;');
      return insertRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves driver profile for a given user ID.
   */
  public static async getDriverProfileByUserId(userId: string) {
    const res = await postgresAdapter.pool.query(`
      SELECT dp.*, u.email, u.first_name, u.last_name, u.phone_number
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.user_id = $1;
    `, [userId]);

    if (res.rows.length === 0) {
      return null;
    }
    return res.rows[0];
  }

  /**
   * Retrieves driver profile by driver profile ID.
   */
  public static async getDriverProfileById(driverId: string) {
    const res = await postgresAdapter.pool.query(`
      SELECT dp.*, u.email, u.first_name, u.last_name, u.phone_number
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.id = $1;
    `, [driverId]);

    if (res.rows.length === 0) {
      return null;
    }
    return res.rows[0];
  }

  /**
   * Server-authoritative driver availability toggle (2C.4).
   * A driver cannot go ONLINE if suspended or unverified.
   */
  public static async updateAvailability(input: UpdateAvailabilityInput) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const driverRes = await client.query(`
        SELECT id, verification_status, is_suspended, onboarding_status
        FROM driver_profiles
        WHERE id = $1 FOR UPDATE;
      `, [input.driverId]);

      if (driverRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('DRIVER_NOT_FOUND');
      }

      const driver = driverRes.rows[0];

      // Eligibility check when going ONLINE
      if (input.isOnline) {
        if (driver.is_suspended) {
          await client.query('ROLLBACK;');
          throw new Error('SUSPENDED_DRIVER_CANNOT_GO_ONLINE: Suspended drivers cannot become online');
        }
        if (driver.verification_status !== 'VERIFIED') {
          await client.query('ROLLBACK;');
          throw new Error('UNVERIFIED_DRIVER_CANNOT_GO_ONLINE: Driver identity and vehicle documents must be verified');
        }
      }

      await client.query(`
        UPDATE driver_profiles
        SET is_online = $1, updated_at = NOW()
        WHERE id = $2;
      `, [input.isOnline, input.driverId]);

      // Audit log the status transition
      await client.query(`
        INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, before_state, after_state)
        VALUES (
          uuid_generate_v4(), $1, 'DRIVER_AVAILABILITY_CHANGE', 'DRIVER_PROFILE', $2,
          $3, $4
        );
      `, [
        driver.id,
        driver.id,
        JSON.stringify({ isOnline: !input.isOnline }),
        JSON.stringify({ isOnline: input.isOnline })
      ]);

      await client.query('COMMIT;');
      return { driverId: input.driverId, isOnline: input.isOnline };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Validates and records driver location updates (2C.5, 2C.37).
   * Enforces strict coordinate boundary limits:
   * Latitude: -90.0 to +90.0
   * Longitude: -180.0 to +180.0
   * Rejects NaN, null, undefined, out of bounds.
   */
  public static async recordLocation(input: RecordLocationInput) {
    // 1. Strict coordinate validation
    if (typeof input.latitude !== 'number' || isNaN(input.latitude) || !isFinite(input.latitude)) {
      throw new Error('INVALID_LATITUDE: Latitude must be a valid number between -90.0 and 90.0');
    }
    if (typeof input.longitude !== 'number' || isNaN(input.longitude) || !isFinite(input.longitude)) {
      throw new Error('INVALID_LONGITUDE: Longitude must be a valid number between -180.0 and 180.0');
    }

    if (input.latitude < -90.0 || input.latitude > 90.0) {
      throw new Error(`INVALID_LATITUDE_BOUNDARY: Latitude ${input.latitude} is outside valid [-90.0, 90.0] range`);
    }
    if (input.longitude < -180.0 || input.longitude > 180.0) {
      throw new Error(`INVALID_LONGITUDE_BOUNDARY: Longitude ${input.longitude} is outside valid [-180.0, 180.0] range`);
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // 2. Verify driver exists and is active
      const driverRes = await client.query('SELECT id, is_suspended FROM driver_profiles WHERE id = $1;', [input.driverId]);
      if (driverRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('DRIVER_NOT_FOUND');
      }

      // 3. Update current location on driver_profiles
      await client.query(`
        UPDATE driver_profiles
        SET current_latitude = $1::numeric,
            current_longitude = $2::numeric,
            current_geom = ST_SetSRID(ST_Point($2::numeric, $1::numeric), 4326),
            last_ping_at = NOW(),
            updated_at = NOW()
        WHERE id = $3;
      `, [input.latitude, input.longitude, input.driverId]);

      // 4. Record historical location entry
      const locRes = await client.query(`
        INSERT INTO driver_locations (
          id, driver_id, latitude, longitude, geom, accuracy_meters, recorded_at
        )
        VALUES (
          uuid_generate_v4(), $1, $2::numeric, $3::numeric, ST_SetSRID(ST_Point($3::numeric, $2::numeric), 4326), $4, NOW()
        )
        RETURNING id, recorded_at;
      `, [input.driverId, input.latitude, input.longitude, input.accuracyMeters || 10.0]);

      await client.query('COMMIT;');
      return {
        locationId: locRes.rows[0].id,
        driverId: input.driverId,
        latitude: input.latitude,
        longitude: input.longitude,
        recordedAt: locRes.rows[0].recorded_at
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Helper to verify if a driver is currently eligible to accept deliveries (2C.3).
   */
  public static async isDriverEligible(driverId: string): Promise<boolean> {
    const res = await postgresAdapter.pool.query(`
      SELECT dp.id, dp.verification_status, dp.is_suspended, dp.is_online, dp.vehicle_type, u.is_active
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.id = $1;
    `, [driverId]);

    if (res.rows.length === 0) return false;
    const d = res.rows[0];

    // Historical records preservation: Existing bicycle records remain in DB, but cannot accept active deliveries
    const rawType = (d.vehicle_type || '').toUpperCase();
    if (
      rawType.includes('BICYCLE') || 
      (rawType.includes('BIKE') && !rawType.includes('MOTORBIKE'))
    ) {
      return false;
    }

    return d.is_active && !d.is_suspended && d.verification_status === 'VERIFIED' && d.is_online;
  }
}
