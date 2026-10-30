import crypto from 'node:crypto';
import { postgresAdapter } from '../db/postgres.js';

export interface CourierQuoteInput {
  customerId: string;
  pickup: {
    streetLine1?: string;
    city?: string;
    postalCode?: string;
    countryCode?: string;
    latitude: number;
    longitude: number;
  };
  dropoff: {
    streetLine1?: string;
    city?: string;
    postalCode?: string;
    countryCode?: string;
    latitude: number;
    longitude: number;
  };
  packageCategory?: string;
  packageDescription?: string;
}

export interface CreateCourierRequestInput {
  customerId: string;
  quoteId: string;
  packageDescription: string;
  packageCategory?: string;
  recipientName: string;
  recipientPhone: string;
  deliveryInstructions?: string;
  idempotencyKey: string;
  testPaymentMode?: boolean; // DEV ONLY test payment mode
}

export class CourierService {
  /**
   * Generates a server-authoritative Point-to-Point Courier quote using PostGIS distance.
   * DEV pricing configuration: R25 base + R5.00/km + R3.50 service fee.
   */
  public static async createQuote(input: CourierQuoteInput) {
    // 1. Strict coordinate validation
    if (typeof input.pickup.latitude !== 'number' || typeof input.pickup.longitude !== 'number' ||
        typeof input.dropoff.latitude !== 'number' || typeof input.dropoff.longitude !== 'number') {
      throw new Error('INVALID_COORDINATES: Pickup and dropoff coordinates must be valid numbers');
    }

    if (input.pickup.latitude < -90 || input.pickup.latitude > 90 ||
        input.dropoff.latitude < -90 || input.dropoff.latitude > 90) {
      throw new Error('INVALID_LATITUDE_BOUNDARY: Latitude must be between -90 and 90');
    }

    if (input.pickup.longitude < -180 || input.pickup.longitude > 180 ||
        input.dropoff.longitude < -180 || input.dropoff.longitude > 180) {
      throw new Error('INVALID_LONGITUDE_BOUNDARY: Longitude must be between -180 and 180');
    }

    const client = await postgresAdapter.pool.connect();
    try {
      // 2. Authoritative PostGIS distance calculation
      const distRes = await client.query(`
        SELECT ST_Distance(
          ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography,
          ST_SetSRID(ST_Point($4::float8, $3::float8), 4326)::geography
        ) AS distance_meters;
      `, [
        input.pickup.latitude,
        input.pickup.longitude,
        input.dropoff.latitude,
        input.dropoff.longitude
      ]);

      const distanceMeters = parseFloat(distRes.rows[0].distance_meters) || 0;
      const distanceKm = distanceMeters / 1000.0;

      // 3. Server-authoritative Pricing Model (DEV Configuration)
      const baseFeeCents = 2500; // R25.00
      const perKmFeeCents = 500;  // R5.00 / km
      const distanceFeeCents = Math.round(distanceKm * perKmFeeCents);
      const serviceFeeCents = 350; // R3.50
      const totalCents = baseFeeCents + distanceFeeCents + serviceFeeCents;

      // 4. Persist Quote with 15-minute expiration
      const quoteRes = await client.query(`
        INSERT INTO courier_quotes (
          id, customer_id, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude,
          distance_meters, base_fee_cents, distance_fee_cents, service_fee_cents, total_cents,
          currency, pricing_config_version, expires_at, consumed
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          'ZAR', 'DEV_COURIER_V1', NOW() + INTERVAL '15 minutes', false
        )
        RETURNING id, customer_id, distance_meters, base_fee_cents, distance_fee_cents, service_fee_cents, total_cents, currency, expires_at;
      `, [
        input.customerId,
        input.pickup.latitude,
        input.pickup.longitude,
        input.dropoff.latitude,
        input.dropoff.longitude,
        distanceMeters,
        baseFeeCents,
        distanceFeeCents,
        serviceFeeCents,
        totalCents
      ]);

      const row = quoteRes.rows[0];
      return {
        quoteId: row.id,
        customerId: row.customer_id,
        distanceMeters: parseFloat(row.distance_meters),
        distanceKm: Math.round((parseFloat(row.distance_meters) / 1000) * 100) / 100,
        feeBreakdown: {
          baseFeeCents: row.base_fee_cents,
          distanceFeeCents: row.distance_fee_cents,
          serviceFeeCents: row.service_fee_cents,
          totalCents: row.total_cents
        },
        currency: row.currency,
        pricingConfigVersion: 'DEV_COURIER_V1',
        expiresAt: row.expires_at
      };
    } finally {
      client.release();
    }
  }

  /**
   * Creates a persistent Courier delivery request with strict idempotency and cryptographic proof codes (2C.10, 2C.15, 2C.28).
   */
  public static async createCourierRequest(input: CreateCourierRequestInput) {
    if (!input.idempotencyKey) {
      throw new Error('IDEMPOTENCY_KEY_REQUIRED');
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Idempotency Check
      const existing = await client.query(`
        SELECT id, status, payment_status, delivery_fee_cents, pickup_address_id, dropoff_address_id, created_at
        FROM deliveries WHERE idempotency_key = $1;
      `, [input.idempotencyKey]);

      if (existing.rows.length > 0) {
        await client.query('ROLLBACK;');
        return {
          delivery: existing.rows[0],
          isIdempotentReplay: true
        };
      }

      // 2. Authoritative Quote Retrieval & Validation
      const quoteRes = await client.query(`
        SELECT * FROM courier_quotes
        WHERE id = $1 FOR UPDATE;
      `, [input.quoteId]);

      if (quoteRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('QUOTE_NOT_FOUND');
      }

      const quote = quoteRes.rows[0];

      // Ownership enforcement
      if (quote.customer_id !== input.customerId) {
        await client.query('ROLLBACK;');
        throw new Error('FORBIDDEN_QUOTE_OWNERSHIP: Quote belongs to a different customer');
      }

      // Consumed check
      if (quote.consumed) {
        await client.query('ROLLBACK;');
        throw new Error('QUOTE_ALREADY_CONSUMED: Quote has already been used for a booking');
      }

      // Expiration check
      if (new Date(quote.expires_at) < new Date()) {
        await client.query('ROLLBACK;');
        throw new Error('QUOTE_EXPIRED: Courier quote has expired, please request a fresh quote');
      }

      // 3. Create or resolve Pickup and Dropoff Address Records
      const pickupAddrId = (await client.query(`
        INSERT INTO addresses (id, user_id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address)
        VALUES (uuid_generate_v4(), $1, 'Point-to-Point Pickup', 'City', '0001', 'ZAF', $2::numeric, $3::numeric, ST_SetSRID(ST_Point($3::numeric, $2::numeric), 4326), 'COURIER PICKUP')
        RETURNING id;
      `, [input.customerId, quote.pickup_latitude, quote.pickup_longitude])).rows[0].id;

      const dropoffAddrId = (await client.query(`
        INSERT INTO addresses (id, user_id, street_line_1, city, postal_code, country_code, latitude, longitude, geom, normalized_address)
        VALUES (uuid_generate_v4(), $1, 'Point-to-Point Dropoff', 'City', '0001', 'ZAF', $2::numeric, $3::numeric, ST_SetSRID(ST_Point($3::numeric, $2::numeric), 4326), 'COURIER DROPOFF')
        RETURNING id;
      `, [input.customerId, quote.dropoff_latitude, quote.dropoff_longitude])).rows[0].id;

      // 4. Generate Cryptographically Secure Proof Codes (6 digits)
      const pickupCode = String(crypto.randomInt(100000, 1000000));
      const deliveryOtp = String(crypto.randomInt(100000, 1000000));
      const pickupCodeHash = crypto.createHash('sha256').update(pickupCode).digest('hex');
      const deliveryOtpHash = crypto.createHash('sha256').update(deliveryOtp).digest('hex');

      // 5. Payment Gate Policy (2C.16):
      // Production mode defaults to PAYMENT_INTEGRATION_PENDING (unpaid).
      // If testPaymentMode is explicitly enabled (DEV only), payment is marked AUTHORISED.
      const isTestPayment = Boolean(input.testPaymentMode);
      const paymentStatus = isTestPayment ? 'AUTHORISED' : 'PAYMENT_INTEGRATION_PENDING';
      const initialDeliveryStatus = isTestPayment ? 'SEARCHING_FOR_DRIVER' : 'REQUESTED';

      // 6. Insert Delivery
      const delivRes = await client.query(`
        INSERT INTO deliveries (
          id, order_id, delivery_type, customer_id, business_id,
          pickup_address_id, dropoff_address_id, status,
          package_description, package_category, recipient_name, recipient_phone,
          delivery_instructions, distance_meters, estimated_duration_minutes,
          delivery_fee_cents, currency, payment_status, quote_id, idempotency_key,
          pickup_code_hash, delivery_otp_hash
        )
        VALUES (
          uuid_generate_v4(), NULL, 'COURIER', $1, NULL,
          $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18
        )
        RETURNING *;
      `, [
        input.customerId,
        pickupAddrId,
        dropoffAddrId,
        initialDeliveryStatus,
        input.packageDescription,
        input.packageCategory || 'STANDARD',
        input.recipientName,
        input.recipientPhone,
        input.deliveryInstructions || null,
        quote.distance_meters,
        Math.max(15, Math.round(parseFloat(quote.distance_meters) / 500)), // ~30 km/h avg
        quote.total_cents,
        quote.currency,
        paymentStatus,
        quote.id,
        input.idempotencyKey,
        pickupCodeHash,
        deliveryOtpHash
      ]);

      const delivery = delivRes.rows[0];

      // Mark quote as consumed
      await client.query('UPDATE courier_quotes SET consumed = true WHERE id = $1;', [quote.id]);

      // Record immutable delivery event
      await client.query(`
        INSERT INTO delivery_events (id, delivery_id, event_type, latitude, longitude, event_timestamp, event_data, actor_id, actor_role)
        VALUES (
          uuid_generate_v4(), $1, 'COURIER_REQUEST_CREATED', $2, $3, NOW(),
          $4, $5, 'CUSTOMER'
        );
      `, [
        delivery.id,
        quote.pickup_latitude,
        quote.pickup_longitude,
        JSON.stringify({
          deliveryType: 'COURIER',
          totalCents: quote.total_cents,
          paymentStatus,
          status: initialDeliveryStatus
        }),
        input.customerId
      ]);

      await client.query('COMMIT;');

      return {
        delivery: {
          id: delivery.id,
          deliveryType: delivery.delivery_type,
          customerId: delivery.customer_id,
          status: delivery.status,
          paymentStatus: delivery.payment_status,
          deliveryFeeCents: delivery.delivery_fee_cents,
          distanceMeters: parseFloat(delivery.distance_meters),
          recipientName: delivery.recipient_name,
          recipientPhone: delivery.recipient_phone,
          pickupCode, // Returned to creator for pickup handoff
          deliveryOtp, // Returned to creator / recipient for delivery proof
          createdAt: delivery.created_at
        },
        isIdempotentReplay: false
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves Courier delivery details for the customer.
   * Enforces strict IDOR protection: only the customer who booked it can read it.
   */
  public static async getCourierDeliveryForCustomer(deliveryId: string, customerId: string) {
    const res = await postgresAdapter.pool.query(`
      SELECT d.*, 
        pa.street_line_1 as pickup_street, pa.city as pickup_city, pa.latitude as pickup_lat, pa.longitude as pickup_lng,
        da.street_line_1 as dropoff_street, da.city as dropoff_city, da.latitude as dropoff_lat, da.longitude as dropoff_lng,
        dp.vehicle_type as driver_vehicle_type, dp.vehicle_plate as driver_vehicle_plate,
        u.first_name as driver_first_name, u.phone_number as driver_phone
      FROM deliveries d
      JOIN addresses pa ON pa.id = d.pickup_address_id
      JOIN addresses da ON da.id = d.dropoff_address_id
      LEFT JOIN driver_profiles dp ON dp.id = d.driver_id
      LEFT JOIN users u ON u.id = dp.user_id
      WHERE d.id = $1;
    `, [deliveryId]);

    if (res.rows.length === 0) {
      throw new Error('DELIVERY_NOT_FOUND');
    }

    const delivery = res.rows[0];
    if (delivery.customer_id !== customerId) {
      throw new Error('FORBIDDEN_DELIVERY_ACCESS: You do not own this courier delivery');
    }

    return delivery;
  }
}
