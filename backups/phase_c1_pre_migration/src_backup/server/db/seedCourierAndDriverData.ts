import bcrypt from 'bcryptjs';
import { postgresAdapter } from './postgres.js';

export async function seedPhase2CCourierAndDriverData() {
  const client = await postgresAdapter.pool.connect();
  try {
    console.log('[Seed 2C] Seeding Phase 2C synthetic Courier and Driver data...');
    await client.query('BEGIN;');

    // Clean up previous test delivery artifacts to ensure idempotent test runs
    await client.query(`
      DELETE FROM driver_earnings WHERE driver_id IN (
        'd0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000003',
        'd0000000-0000-0000-0000-000000000004',
        'd0000000-0000-0000-0000-000000000005',
        'd0000000-0000-0000-0000-000000000011',
        'd0000000-0000-0000-0000-000000000012',
        'd0000000-0000-0000-0000-000000000013',
        'd0000000-0000-0000-0000-000000000014',
        'd0000000-0000-0000-0000-000000000015'
      );
      DELETE FROM delivery_events WHERE actor_id IN (
        'd0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000003',
        'd0000000-0000-0000-0000-000000000004',
        'd0000000-0000-0000-0000-000000000005',
        'd0000000-0000-0000-0000-000000000011',
        'd0000000-0000-0000-0000-000000000012',
        'd0000000-0000-0000-0000-000000000013',
        'd0000000-0000-0000-0000-000000000014',
        'd0000000-0000-0000-0000-000000000015'
      ) OR delivery_id IN (
        SELECT id FROM deliveries WHERE customer_id IN ('a1111111-2222-3333-4444-555555555551', 'a1111111-2222-3333-4444-555555555552')
      );
      DELETE FROM delivery_assignments WHERE driver_id IN (
        'd0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000003',
        'd0000000-0000-0000-0000-000000000004',
        'd0000000-0000-0000-0000-000000000005',
        'd0000000-0000-0000-0000-000000000011',
        'd0000000-0000-0000-0000-000000000012',
        'd0000000-0000-0000-0000-000000000013',
        'd0000000-0000-0000-0000-000000000014',
        'd0000000-0000-0000-0000-000000000015'
      ) OR delivery_id IN (
        SELECT id FROM deliveries WHERE customer_id IN ('a1111111-2222-3333-4444-555555555551', 'a1111111-2222-3333-4444-555555555552')
      );
      DELETE FROM deliveries WHERE customer_id IN ('a1111111-2222-3333-4444-555555555551', 'a1111111-2222-3333-4444-555555555552');
    `);

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('DriverPassword123!', salt);

    // 1. Synthetic Customers
    const customerAId = 'a1111111-2222-3333-4444-555555555551';
    const customerBId = 'a1111111-2222-3333-4444-555555555552';

    await client.query(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
      VALUES 
        ($1, 'courier_customer_a@example.com', $2, 'Alice', 'CourierCustomer', '+447700900301', true, true),
        ($3, 'courier_customer_b@example.com', $2, 'Bob', 'CourierCustomer', '+447700900302', true, true)
      ON CONFLICT (id) DO UPDATE SET is_active = true;
    `, [customerAId, hash, customerBId]);

    await client.query(`
      INSERT INTO user_roles (id, user_id, role)
      VALUES 
        (uuid_generate_v4(), $1, 'CUSTOMER'),
        (uuid_generate_v4(), $2, 'CUSTOMER')
      ON CONFLICT DO NOTHING;
    `, [customerAId, customerBId]);

    await client.query(`
      INSERT INTO customer_profiles (id, user_id)
      VALUES 
        ($1, $1),
        ($2, $2)
      ON CONFLICT (user_id) DO NOTHING;
    `, [customerAId, customerBId]);

    // 2. Synthetic Drivers:
    // a) Eligible Online Driver 1 & 2
    // b) Offline Driver
    // c) Suspended Driver
    // d) Unverified Driver
    // e) 5 Race Drivers (for the mandatory 5-driver concurrency race test)
    const drivers = [
      { id: 'd0000000-0000-0000-0000-000000000001', email: 'driver_eligible_1@example.com', name: 'Dan', plate: 'TUXI-EL1', license: 'LIC-EL-01', status: 'VERIFIED', isOnline: true, isSuspended: false },
      { id: 'd0000000-0000-0000-0000-000000000002', email: 'driver_eligible_2@example.com', name: 'Dave', plate: 'TUXI-EL2', license: 'LIC-EL-02', status: 'VERIFIED', isOnline: true, isSuspended: false },
      { id: 'd0000000-0000-0000-0000-000000000003', email: 'driver_offline@example.com', name: 'Diana', plate: 'TUXI-OFF', license: 'LIC-OFF-01', status: 'VERIFIED', isOnline: false, isSuspended: false },
      { id: 'd0000000-0000-0000-0000-000000000004', email: 'driver_suspended@example.com', name: 'Derek', plate: 'TUXI-SUS', license: 'LIC-SUS-01', status: 'VERIFIED', isOnline: false, isSuspended: true },
      { id: 'd0000000-0000-0000-0000-000000000005', email: 'driver_unverified@example.com', name: 'Don', plate: 'TUXI-UNV', license: 'LIC-UNV-01', status: 'PENDING', isOnline: false, isSuspended: false },
      // 5 Concurrency Race Drivers
      { id: 'd0000000-0000-0000-0000-000000000011', email: 'driver_race_1@example.com', name: 'Racer One', plate: 'TUXI-RC1', license: 'LIC-RC-01', status: 'VERIFIED', isOnline: true, isSuspended: false },
      { id: 'd0000000-0000-0000-0000-000000000012', email: 'driver_race_2@example.com', name: 'Racer Two', plate: 'TUXI-RC2', license: 'LIC-RC-02', status: 'VERIFIED', isOnline: true, isSuspended: false },
      { id: 'd0000000-0000-0000-0000-000000000013', email: 'driver_race_3@example.com', name: 'Racer Three', plate: 'TUXI-RC3', license: 'LIC-RC-03', status: 'VERIFIED', isOnline: true, isSuspended: false },
      { id: 'd0000000-0000-0000-0000-000000000014', email: 'driver_race_4@example.com', name: 'Racer Four', plate: 'TUXI-RC4', license: 'LIC-RC-04', status: 'VERIFIED', isOnline: true, isSuspended: false },
      { id: 'd0000000-0000-0000-0000-000000000015', email: 'driver_race_5@example.com', name: 'Racer Five', plate: 'TUXI-RC5', license: 'LIC-RC-05', status: 'VERIFIED', isOnline: true, isSuspended: false },
    ];

    for (const d of drivers) {
      // Create user
      await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, is_active, is_email_verified)
        VALUES ($1, $2, $3, $4, 'Driver', '+447700900400', true, true)
        ON CONFLICT (id) DO UPDATE SET is_active = true, email = $2;
      `, [d.id, d.email, hash, d.name]);

      // Assign driver role
      await client.query(`
        INSERT INTO user_roles (id, user_id, role)
        VALUES (uuid_generate_v4(), $1, 'TUXI_DELIVERY_DRIVER')
        ON CONFLICT DO NOTHING;
      `, [d.id]);

      // Insert or update driver profile
      await client.query(`
        INSERT INTO driver_profiles (
          id, user_id, license_number, vehicle_type, vehicle_plate,
          verification_status, onboarding_status, is_online, is_suspended,
          current_latitude, current_longitude, current_geom, last_ping_at
        )
        VALUES (
          $1, $1, $2, 'MOTORBIKE', $3,
          $4, 'ACTIVE', $5, $6,
          -26.2041, 28.0473, ST_SetSRID(ST_Point(28.0473, -26.2041), 4326), NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          verification_status = $4,
          is_online = $5,
          is_suspended = $6,
          license_number = $2,
          vehicle_plate = $3,
          current_latitude = -26.2041,
          current_longitude = 28.0473,
          current_geom = ST_SetSRID(ST_Point(28.0473, -26.2041), 4326),
          last_ping_at = NOW();
      `, [d.id, d.license, d.plate, d.status, d.isOnline, d.isSuspended]);
    }

    await client.query('COMMIT;');
    console.log('[Seed 2C] Phase 2C synthetic data seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('[Seed 2C Error]', err);
    throw err;
  } finally {
    client.release();
  }
}
