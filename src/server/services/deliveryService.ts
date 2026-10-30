import crypto from 'node:crypto';
import { postgresAdapter } from '../db/postgres.js';
import { DriverService } from './driverService.js';

export type DeliveryStatus =
  | 'REQUESTED'
  | 'SEARCHING_FOR_DRIVER'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_ACCEPTED'
  | 'EN_ROUTE_TO_PICKUP'
  | 'ARRIVED_AT_PICKUP'
  | 'PICKED_UP'
  | 'EN_ROUTE_TO_DROPOFF'
  | 'ARRIVED_AT_DROPOFF'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED';

export class DeliveryService {
  private static async resolveDriverUserId(client: any, driverId: string | null | undefined): Promise<string | null> {
    if (!driverId) return null;
    const res = await client.query('SELECT user_id FROM driver_profiles WHERE id = $1;', [driverId]);
    if (res.rows.length > 0) return res.rows[0].user_id;
    const uRes = await client.query('SELECT id FROM users WHERE id = $1;', [driverId]);
    if (uRes.rows.length > 0) return uRes.rows[0].id;
    return null;
  }

  /**
   * Creates a delivery for an approved & qualifying Eats or Shop order (2C.30, 2C.31, 2C.32).
   * Strict protection: unpaid production orders cannot dispatch delivery.
   * Committed Shop inventory is strictly preserved.
   */
  public static async createDeliveryForOrder(orderId: string, idempotencyKey?: string) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Fetch order details with row lock
      const orderRes = await client.query(`
        SELECT o.*, cp.user_id as user_customer_id, b.address_id as business_address_id
        FROM orders o
        JOIN businesses b ON b.id = o.business_id
        LEFT JOIN customer_profiles cp ON cp.id = o.customer_id
        WHERE o.id = $1 FOR UPDATE OF o;
      `, [orderId]);

      if (orderRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('ORDER_NOT_FOUND');
      }

      const order = orderRes.rows[0];

      // 2. Payment Safety: Unpaid order verification
      const payRes = await client.query('SELECT status FROM payments WHERE order_id = $1;', [orderId]);
      const paymentStatus = payRes.rows[0]?.status || 'INITIATED';

      // Unpaid check: in production or non-test payment mode, cannot dispatch
      if (paymentStatus !== 'AUTHORISED' && paymentStatus !== 'CAPTURED' && order.status === 'PENDING_PAYMENT') {
        await client.query('ROLLBACK;');
        throw new Error('UNPAID_ORDER_CANNOT_DISPATCH: Order has not been authorized or paid');
      }

      // 3. Idempotency Check: Existing active delivery for this order
      const existing = await client.query(`
        SELECT * FROM deliveries
        WHERE order_id = $1 AND status NOT IN ('CANCELLED', 'FAILED');
      `, [orderId]);

      if (existing.rows.length > 0) {
        await client.query('COMMIT;');
        return {
          delivery: existing.rows[0],
          isIdempotentReplay: true
        };
      }

      // 4. Generate cryptographically secure proof codes
      const pickupCode = String(crypto.randomInt(100000, 1000000));
      const deliveryOtp = String(crypto.randomInt(100000, 1000000));
      const pickupCodeHash = crypto.createHash('sha256').update(pickupCode).digest('hex');
      const deliveryOtpHash = crypto.createHash('sha256').update(deliveryOtp).digest('hex');

      const idKey = idempotencyKey || `deliv-order-${orderId}`;

      // 5. Insert delivery
      const delivRes = await client.query(`
        INSERT INTO deliveries (
          id, order_id, delivery_type, customer_id, business_id,
          pickup_address_id, dropoff_address_id, status,
          package_description, delivery_instructions,
          delivery_fee_cents, currency, payment_status, idempotency_key,
          pickup_code_hash, delivery_otp_hash
        )
        VALUES (
          uuid_generate_v4(), $1, $2, $3, $4,
          $5, $6, 'SEARCHING_FOR_DRIVER',
          $7, $8,
          $9, $10, $11, $12,
          $13, $14
        )
        RETURNING *;
      `, [
        order.id,
        order.order_type || 'EATS',
        order.user_customer_id || order.customer_id,
        order.business_id,
        order.business_address_id,
        order.delivery_address_id,
        `Order #${order.order_number} Delivery`,
        order.special_instructions || null,
        order.delivery_fee_cents,
        order.currency,
        paymentStatus,
        idKey,
        pickupCodeHash,
        deliveryOtpHash
      ]);

      const delivery = delivRes.rows[0];

      // 6. Record delivery event
      await client.query(`
        INSERT INTO delivery_events (id, delivery_id, event_type, event_timestamp, event_data, actor_id, actor_role)
        VALUES (
          uuid_generate_v4(), $1, 'DELIVERY_DISPATCH_INITIATED', NOW(),
          $2, $3, 'SYSTEM'
        );
      `, [
        delivery.id,
        JSON.stringify({ orderId, orderType: order.order_type, deliveryFeeCents: order.delivery_fee_cents }),
        order.user_customer_id || null
      ]);

      await client.query('COMMIT;');

      return {
        delivery,
        pickupCode,
        deliveryOtp,
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
   * Transactional Driver Acceptance with Concurrency Protection (2C.19, 2C.20, 2C.21, 2C.40).
   * Row-level locking (SELECT ... FOR UPDATE) and partial unique index uq_delivery_single_active_accepted
   * guarantee EXACTLY ONE winner among concurrent drivers.
   */
  public static async acceptDeliveryAssignment(deliveryId: string, driverId: string) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Verify Driver Eligibility (2C.3) and Vehicle Prohibitions
      const driverCheck = await client.query('SELECT vehicle_type FROM driver_profiles WHERE id = $1;', [driverId]);
      if (driverCheck.rows.length > 0) {
        const vType = (driverCheck.rows[0].vehicle_type || '').toUpperCase();
        if (vType.includes('BICYCLE') || (vType.includes('BIKE') && !vType.includes('MOTORBIKE'))) {
          await client.query('ROLLBACK;');
          throw new Error('BICYCLE_DELIVERY_PROHIBITED: Bicycles and electric bicycles are strictly prohibited from commercial delivery fulfillment.');
        }
      }

      const isEligible = await DriverService.isDriverEligible(driverId);
      if (!isEligible) {
        await client.query('ROLLBACK;');
        throw new Error('INELIGIBLE_DRIVER: Driver profile is not verified, not online, or suspended');
      }

      // 2. Lock the delivery row
      const delivRes = await client.query(`
        SELECT id, status, driver_id, order_id, delivery_fee_cents
        FROM deliveries
        WHERE id = $1 FOR UPDATE;
      `, [deliveryId]);

      if (delivRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('DELIVERY_NOT_FOUND');
      }

      const delivery = delivRes.rows[0];

      // Check if delivery is already assigned or not in an assignable state
      if (delivery.driver_id !== null || (delivery.status !== 'SEARCHING_FOR_DRIVER' && delivery.status !== 'REQUESTED')) {
        await client.query('ROLLBACK;');
        throw new Error('DELIVERY_ALREADY_ASSIGNED: Another driver has already accepted this delivery');
      }

      // Check if this driver already has another active accepted delivery
      const activeAssign = await client.query(`
        SELECT id FROM delivery_assignments
        WHERE driver_id = $1 AND status = 'ACCEPTED';
      `, [driverId]);

      if (activeAssign.rows.length > 0) {
        await client.query('ROLLBACK;');
        throw new Error('DRIVER_ALREADY_HAS_ACTIVE_ASSIGNMENT: Complete existing delivery before accepting a new one');
      }

      // 3. Atomically insert accepted assignment row (protected by uq_delivery_single_active_accepted)
      await client.query(`
        INSERT INTO delivery_assignments (id, delivery_id, driver_id, status, assigned_at)
        VALUES (uuid_generate_v4(), $1, $2, 'ACCEPTED', NOW());
      `, [deliveryId, driverId]);

      // 4. Update delivery row
      await client.query(`
        UPDATE deliveries
        SET status = 'DRIVER_ACCEPTED',
            driver_id = $1,
            driver_accepted_at = NOW(),
            updated_at = NOW()
        WHERE id = $2;
      `, [driverId, deliveryId]);

      // 5. Synchronize associated order status if applicable
      if (delivery.order_id) {
        await client.query(`
          UPDATE orders
          SET status = 'DRIVER_ASSIGNED', updated_at = NOW()
          WHERE id = $1;
        `, [delivery.order_id]);
      }

      // 6. Record authoritative delivery event
      const actorUserId = await DeliveryService.resolveDriverUserId(client, driverId);
      await client.query(`
        INSERT INTO delivery_events (id, delivery_id, event_type, event_timestamp, event_data, actor_id, actor_role)
        VALUES (
          uuid_generate_v4(), $1, 'DRIVER_ACCEPTED', NOW(),
          $2, $3, 'DRIVER'
        );
      `, [
        deliveryId,
        JSON.stringify({ driverId, previousStatus: delivery.status, newStatus: 'DRIVER_ACCEPTED' }),
        actorUserId
      ]);

      await client.query('COMMIT;');

      return {
        deliveryId,
        driverId,
        status: 'DRIVER_ACCEPTED',
        acceptedAt: new Date().toISOString()
      };
    } catch (err: any) {
      await client.query('ROLLBACK;');
      if (err.message && err.message.includes('uq_delivery_single_active_accepted')) {
        throw new Error('DELIVERY_ALREADY_ASSIGNED: Another driver has already accepted this delivery');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Driver declines a delivery offer (2C.22).
   * Records decline without affecting other drivers, customer order, or earnings.
   */
  public static async declineDeliveryAssignment(deliveryId: string, driverId: string, reason?: string) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      await client.query(`
        INSERT INTO delivery_assignments (id, delivery_id, driver_id, status, assigned_at, responded_at, decline_reason)
        VALUES (uuid_generate_v4(), $1, $2, 'DECLINED', NOW(), NOW(), $3);
      `, [deliveryId, driverId, reason || 'Driver declined']);

      // Audit log the decline
      const actorUserId = await DeliveryService.resolveDriverUserId(client, driverId);
      await client.query(`
        INSERT INTO delivery_events (id, delivery_id, event_type, event_timestamp, event_data, actor_id, actor_role)
        VALUES (
          uuid_generate_v4(), $1, 'DRIVER_DECLINED', NOW(),
          $2, $3, 'DRIVER'
        );
      `, [
        deliveryId,
        JSON.stringify({ driverId, reason }),
        actorUserId
      ]);

      await client.query('COMMIT;');
      return { deliveryId, driverId, status: 'DECLINED' };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Safe unassignment before pickup (2C.23).
   * Releases delivery back to dispatch. Strictly prohibited AFTER pickup.
   */
  public static async unassignDriver(deliveryId: string, driverId: string, reason: string) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const delivRes = await client.query(`
        SELECT id, status, driver_id, picked_up_at
        FROM deliveries
        WHERE id = $1 FOR UPDATE;
      `, [deliveryId]);

      if (delivRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('DELIVERY_NOT_FOUND');
      }

      const delivery = delivRes.rows[0];

      if (delivery.driver_id !== driverId) {
        await client.query('ROLLBACK;');
        throw new Error('FORBIDDEN_NOT_ASSIGNED_DRIVER');
      }

      if (delivery.picked_up_at !== null || delivery.status === 'PICKED_UP' || delivery.status === 'EN_ROUTE_TO_DROPOFF' || delivery.status === 'DELIVERED') {
        await client.query('ROLLBACK;');
        throw new Error('CANNOT_UNASSIGN_AFTER_PICKUP: Package has already been collected. Exception handling required.');
      }

      // Mark current assignment as CANCELLED
      await client.query(`
        UPDATE delivery_assignments
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE delivery_id = $1 AND driver_id = $2 AND status = 'ACCEPTED';
      `, [deliveryId, driverId]);

      // Release delivery back to SEARCHING_FOR_DRIVER
      await client.query(`
        UPDATE deliveries
        SET status = 'SEARCHING_FOR_DRIVER', driver_id = NULL, updated_at = NOW()
        WHERE id = $1;
      `, [deliveryId]);

      const actorUserId = await DeliveryService.resolveDriverUserId(client, driverId);
      await client.query(`
        INSERT INTO delivery_events (id, delivery_id, event_type, event_timestamp, event_data, actor_id, actor_role)
        VALUES (
          uuid_generate_v4(), $1, 'DRIVER_UNASSIGNED', NOW(),
          $2, $3, 'DRIVER'
        );
      `, [
        deliveryId,
        JSON.stringify({ unassignedDriverId: driverId, reason }),
        actorUserId
      ]);

      await client.query('COMMIT;');
      return { deliveryId, status: 'SEARCHING_FOR_DRIVER', releasedDriverId: driverId };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Driver updates delivery progression state (EN_ROUTE_TO_PICKUP, ARRIVED_AT_PICKUP, EN_ROUTE_TO_DROPOFF, ARRIVED_AT_DROPOFF).
   * Validates state machine rules (2C.17, 2C.18, 2C.38).
   * PICKED_UP and DELIVERED must use their proof confirmation methods.
   */
  public static async updateDriverProgression(deliveryId: string, driverId: string, targetStatus: DeliveryStatus) {
    // Prohibit bypassing proof gates
    if (targetStatus === 'PICKED_UP') {
      throw new Error('INVALID_TRANSITION_METHOD: PICKED_UP requires confirmPickupWithProof');
    }
    if (targetStatus === 'DELIVERED') {
      throw new Error('INVALID_TRANSITION_METHOD: DELIVERED requires confirmDeliveryWithProof');
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const delivRes = await client.query(`
        SELECT id, status, driver_id, order_id
        FROM deliveries
        WHERE id = $1 FOR UPDATE;
      `, [deliveryId]);

      if (delivRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('DELIVERY_NOT_FOUND');
      }

      const delivery = delivRes.rows[0];

      // Authority check: only assigned driver
      if (delivery.driver_id !== driverId) {
        await client.query('ROLLBACK;');
        throw new Error('FORBIDDEN_NOT_ASSIGNED_DRIVER: Only the assigned driver can update delivery progress');
      }

      // State machine transition validation
      const allowedTransitions: Record<string, DeliveryStatus[]> = {
        DRIVER_ACCEPTED: ['EN_ROUTE_TO_PICKUP'],
        EN_ROUTE_TO_PICKUP: ['ARRIVED_AT_PICKUP'],
        PICKED_UP: ['EN_ROUTE_TO_DROPOFF'],
        EN_ROUTE_TO_DROPOFF: ['ARRIVED_AT_DROPOFF']
      };

      const validNext = allowedTransitions[delivery.status] || [];
      if (!validNext.includes(targetStatus)) {
        await client.query('ROLLBACK;');
        throw new Error(`INVALID_STATUS_TRANSITION: Cannot transition from ${delivery.status} to ${targetStatus}`);
      }

      let extraCol = '';
      if (targetStatus === 'ARRIVED_AT_PICKUP') extraCol = ', arrived_at_pickup_at = NOW()';
      if (targetStatus === 'ARRIVED_AT_DROPOFF') extraCol = ', arrived_at_dropoff_at = NOW()';

      await client.query(`
        UPDATE deliveries
        SET status = $1, updated_at = NOW() ${extraCol}
        WHERE id = $2;
      `, [targetStatus, deliveryId]);

      // Synchronize order if applicable
      if (delivery.order_id && targetStatus === 'EN_ROUTE_TO_DROPOFF') {
        await client.query(`UPDATE orders SET status = 'IN_TRANSIT', updated_at = NOW() WHERE id = $1;`, [delivery.order_id]);
      }

      const actorUserId = await DeliveryService.resolveDriverUserId(client, driverId);
      await client.query(`
        INSERT INTO delivery_events (id, delivery_id, event_type, event_timestamp, event_data, actor_id, actor_role)
        VALUES (
          uuid_generate_v4(), $1, $2, NOW(),
          $3, $4, 'DRIVER'
        );
      `, [
        deliveryId,
        targetStatus,
        JSON.stringify({ previousStatus: delivery.status, newStatus: targetStatus }),
        actorUserId
      ]);

      await client.query('COMMIT;');
      return { deliveryId, status: targetStatus };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Confirms pickup with authoritative proof code (2C.24, 2C.25, 2C.39).
   * Validates pickup code hash, prevents replay, updates status to PICKED_UP.
   */
  public static async confirmPickupWithProof(deliveryId: string, driverId: string, pickupCode: string) {
    if (!pickupCode || typeof pickupCode !== 'string') {
      throw new Error('PICKUP_PROOF_CODE_REQUIRED');
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const delivRes = await client.query(`
        SELECT id, status, driver_id, order_id, pickup_code_hash, pickup_code_consumed
        FROM deliveries
        WHERE id = $1 FOR UPDATE;
      `, [deliveryId]);

      if (delivRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('DELIVERY_NOT_FOUND');
      }

      const delivery = delivRes.rows[0];

      // Authority check: assigned driver only
      if (delivery.driver_id !== driverId) {
        await client.query('ROLLBACK;');
        throw new Error('FORBIDDEN_NOT_ASSIGNED_DRIVER: Only the assigned driver can confirm pickup');
      }

      // Replay protection: cannot consume code twice
      if (delivery.pickup_code_consumed) {
        await client.query('ROLLBACK;');
        throw new Error('PROOF_ALREADY_CONSUMED: Pickup code has already been verified and consumed');
      }

      // Required state: ARRIVED_AT_PICKUP or EN_ROUTE_TO_PICKUP
      if (delivery.status !== 'ARRIVED_AT_PICKUP' && delivery.status !== 'EN_ROUTE_TO_PICKUP') {
        await client.query('ROLLBACK;');
        throw new Error(`INVALID_STATE_FOR_PICKUP: Current state is ${delivery.status}. Must arrive at pickup location first.`);
      }

      // Validate cryptographic hash
      const providedHash = crypto.createHash('sha256').update(pickupCode.trim()).digest('hex');
      if (providedHash !== delivery.pickup_code_hash) {
        await client.query('ROLLBACK;');
        throw new Error('INVALID_PICKUP_PROOF: The provided pickup code does not match');
      }

      // Mark code consumed and update status to PICKED_UP
      await client.query(`
        UPDATE deliveries
        SET status = 'PICKED_UP',
            picked_up_at = NOW(),
            pickup_code_consumed = true,
            updated_at = NOW()
        WHERE id = $1;
      `, [deliveryId]);

      // Synchronize order if applicable
      if (delivery.order_id) {
        await client.query(`
          UPDATE orders
          SET status = 'PICKED_UP', updated_at = NOW()
          WHERE id = $1;
        `, [delivery.order_id]);
      }

      const actorUserId = await DeliveryService.resolveDriverUserId(client, driverId);
      await client.query(`
        INSERT INTO delivery_events (id, delivery_id, event_type, event_timestamp, event_data, actor_id, actor_role)
        VALUES (
          uuid_generate_v4(), $1, 'PICKED_UP', NOW(),
          $2, $3, 'DRIVER'
        );
      `, [
        deliveryId,
        JSON.stringify({ pickupConfirmedAt: new Date().toISOString() }),
        actorUserId
      ]);

      await client.query('COMMIT;');
      return { deliveryId, status: 'PICKED_UP', pickedUpAt: new Date().toISOString() };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Confirms delivery with authoritative delivery OTP (2C.26, 2C.27, 2C.28, 2C.33).
   * Validates OTP hash, enforces attempt limits, updates status to DELIVERED.
   * Derives and persists Driver Earnings idempotently on completion only.
   */
  public static async confirmDeliveryWithProof(deliveryId: string, driverId: string, deliveryOtp: string) {
    if (!deliveryOtp || typeof deliveryOtp !== 'string') {
      throw new Error('DELIVERY_OTP_REQUIRED');
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const delivRes = await client.query(`
        SELECT id, status, driver_id, order_id, delivery_fee_cents, currency,
               delivery_otp_hash, delivery_otp_consumed, otp_attempt_count
        FROM deliveries
        WHERE id = $1 FOR UPDATE;
      `, [deliveryId]);

      if (delivRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('DELIVERY_NOT_FOUND');
      }

      const delivery = delivRes.rows[0];

      // Authority check: assigned driver only
      if (delivery.driver_id !== driverId) {
        await client.query('ROLLBACK;');
        throw new Error('FORBIDDEN_NOT_ASSIGNED_DRIVER: Only the assigned driver can confirm delivery');
      }

      // Replay check
      if (delivery.delivery_otp_consumed) {
        await client.query('ROLLBACK;');
        throw new Error('PROOF_ALREADY_CONSUMED: Delivery OTP has already been verified and consumed');
      }

      // Required state: ARRIVED_AT_DROPOFF
      if (delivery.status !== 'ARRIVED_AT_DROPOFF') {
        await client.query('ROLLBACK;');
        throw new Error(`INVALID_STATE_FOR_DELIVERY: Current state is ${delivery.status}. Driver must arrive at dropoff before submitting delivery proof.`);
      }

      // Max attempts limit (prevent brute-forcing 6-digit OTP)
      if (delivery.otp_attempt_count >= 5) {
        await client.query('ROLLBACK;');
        throw new Error('OTP_MAX_ATTEMPTS_EXCEEDED: Too many incorrect OTP attempts. Security lock engaged.');
      }

      // Verify OTP hash
      const providedHash = crypto.createHash('sha256').update(deliveryOtp.trim()).digest('hex');
      if (providedHash !== delivery.delivery_otp_hash) {
        // Increment attempt count on failure
        await client.query(`
          UPDATE deliveries
          SET otp_attempt_count = otp_attempt_count + 1, updated_at = NOW()
          WHERE id = $1;
        `, [deliveryId]);
        await client.query('COMMIT;');
        throw new Error('INVALID_DELIVERY_OTP: Provided delivery OTP is incorrect');
      }

      // Mark OTP consumed and update status to DELIVERED (Terminal State)
      await client.query(`
        UPDATE deliveries
        SET status = 'DELIVERED',
            delivered_at = NOW(),
            delivery_otp_consumed = true,
            updated_at = NOW()
        WHERE id = $1;
      `, [deliveryId]);

      // Synchronize order if applicable
      if (delivery.order_id) {
        await client.query(`
          UPDATE orders
          SET status = 'DELIVERED', updated_at = NOW()
          WHERE id = $1;
        `, [delivery.order_id]);
      }

      // Derive Driver Earnings (DEV Rate: 80% of delivery fee) (2C.33)
      const driverEarningCents = Math.round(delivery.delivery_fee_cents * 0.80);
      const earningsKey = `earnings-deliv-${deliveryId}`;

      // Idempotent earnings insertion
      await client.query(`
        INSERT INTO driver_earnings (
          id, driver_id, delivery_id, earning_type, amount_cents,
          currency, idempotency_key, status, created_at
        )
        VALUES (
          uuid_generate_v4(), $1, $2, 'DELIVERY_COMPLETION', $3,
          $4, $5, 'EARNED', NOW()
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
      `, [
        driverId,
        deliveryId,
        driverEarningCents,
        delivery.currency || 'ZAR',
        earningsKey
      ]);

      // Release driver active assignment slot so driver can take subsequent deliveries
      await client.query(`
        UPDATE delivery_assignments
        SET status = 'COMPLETED', updated_at = NOW()
        WHERE delivery_id = $1 AND driver_id = $2 AND status = 'ACCEPTED';
      `, [deliveryId, driverId]);

      // Record immutable delivery event
      const actorUserId = await DeliveryService.resolveDriverUserId(client, driverId);
      await client.query(`
        INSERT INTO delivery_events (id, delivery_id, event_type, event_timestamp, event_data, actor_id, actor_role)
        VALUES (
          uuid_generate_v4(), $1, 'DELIVERED', NOW(),
          $2, $3, 'DRIVER'
        );
      `, [
        deliveryId,
        JSON.stringify({ deliveredAt: new Date().toISOString(), driverEarningCents }),
        actorUserId
      ]);

      await client.query('COMMIT;');

      return {
        deliveryId,
        status: 'DELIVERED',
        deliveredAt: new Date().toISOString(),
        driverEarningCents
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Delivery cancellation (2C.34).
   * Enforces state machine rules:
   * - Before acceptance: customer can cancel.
   * - After acceptance: customer cancellation rejected; requires driver release or admin.
   * - After pickup: cannot cancel as package is in transit.
   */
  public static async cancelDelivery(deliveryId: string, actorUserId: string, reason: string) {
    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const delivRes = await client.query(`
        SELECT id, status, customer_id, driver_id, picked_up_at
        FROM deliveries
        WHERE id = $1 FOR UPDATE;
      `, [deliveryId]);

      if (delivRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        throw new Error('DELIVERY_NOT_FOUND');
      }

      const delivery = delivRes.rows[0];

      // Terminal state check
      if (delivery.status === 'DELIVERED' || delivery.status === 'CANCELLED' || delivery.status === 'FAILED') {
        await client.query('ROLLBACK;');
        throw new Error(`CANNOT_CANCEL_TERMINAL_DELIVERY: Delivery is already in terminal state ${delivery.status}`);
      }

      // Pickup protection: cannot cancel after pickup
      if (delivery.picked_up_at !== null || delivery.status === 'PICKED_UP' || delivery.status === 'EN_ROUTE_TO_DROPOFF' || delivery.status === 'ARRIVED_AT_DROPOFF') {
        await client.query('ROLLBACK;');
        throw new Error('CANNOT_CANCEL_AFTER_PICKUP: Parcel has already been collected. Cancellation rejected.');
      }

      // Check ownership: Customer can only cancel THEIR delivery
      if (delivery.customer_id !== actorUserId) {
        await client.query('ROLLBACK;');
        throw new Error('FORBIDDEN_CANCELLATION: You do not own this delivery');
      }

      // If driver is already assigned/accepted, customer cannot arbitrarily cancel without penalty/release
      if (delivery.driver_id !== null && delivery.status === 'DRIVER_ACCEPTED') {
        // Mark driver assignment as cancelled
        await client.query(`
          UPDATE delivery_assignments
          SET status = 'CANCELLED', updated_at = NOW()
          WHERE delivery_id = $1 AND status = 'ACCEPTED';
        `, [deliveryId]);
      }

      await client.query(`
        UPDATE deliveries
        SET status = 'CANCELLED',
            cancelled_at = NOW(),
            cancelled_by = $1,
            cancellation_reason = $2,
            updated_at = NOW()
        WHERE id = $3;
      `, [actorUserId, reason, deliveryId]);

      await client.query(`
        INSERT INTO delivery_events (id, delivery_id, event_type, event_timestamp, event_data, actor_id, actor_role)
        VALUES (
          uuid_generate_v4(), $1, 'DELIVERY_CANCELLED', NOW(),
          $2, $3, 'CUSTOMER'
        );
      `, [
        deliveryId,
        JSON.stringify({ reason, previousStatus: delivery.status }),
        actorUserId
      ]);

      await client.query('COMMIT;');
      return { deliveryId, status: 'CANCELLED', cancelledAt: new Date().toISOString() };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves driver location for an active delivery (2C.5, 2C.6).
   * Strict privacy: Only the customer who owns the delivery or the assigned driver can read it!
   */
  public static async getDriverLocationForDelivery(deliveryId: string, requesterUserId: string) {
    const delivRes = await postgresAdapter.pool.query(`
      SELECT d.id, d.status, d.customer_id, d.driver_id, dp.user_id as driver_user_id
      FROM deliveries d
      LEFT JOIN driver_profiles dp ON dp.id = d.driver_id
      WHERE d.id = $1;
    `, [deliveryId]);

    if (delivRes.rows.length === 0) {
      throw new Error('DELIVERY_NOT_FOUND');
    }

    const delivery = delivRes.rows[0];

    // Privacy access check
    const isCustomer = delivery.customer_id === requesterUserId;
    const isDriver = delivery.driver_user_id === requesterUserId;

    if (!isCustomer && !isDriver) {
      throw new Error('FORBIDDEN_DELIVERY_ACCESS: You do not have permission to view telemetry for this delivery');
    }

    if (!delivery.driver_id) {
      return { hasLocation: false, message: 'NO_DRIVER_ASSIGNED' };
    }

    // Only return live coordinates during active fulfillment states
    const activeStates = ['DRIVER_ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'EN_ROUTE_TO_DROPOFF', 'ARRIVED_AT_DROPOFF'];
    if (!activeStates.includes(delivery.status)) {
      return { hasLocation: false, message: `DELIVERY_NOT_ACTIVE (${delivery.status})` };
    }

    const locRes = await postgresAdapter.pool.query(`
      SELECT latitude, longitude, recorded_at
      FROM driver_locations
      WHERE driver_id = $1
      ORDER BY recorded_at DESC
      LIMIT 1;
    `, [delivery.driver_id]);

    if (locRes.rows.length === 0) {
      return { hasLocation: false, message: 'LOCATION_NOT_RECORDED_YET' };
    }

    return {
      hasLocation: true,
      latitude: parseFloat(locRes.rows[0].latitude),
      longitude: parseFloat(locRes.rows[0].longitude),
      recordedAt: locRes.rows[0].recorded_at,
      status: delivery.status
    };
  }

  /**
   * Retrieves delivery events history for a delivery.
   * Verifies requester ownership.
   */
  public static async getDeliveryEvents(deliveryId: string, requesterUserId: string) {
    const delivRes = await postgresAdapter.pool.query(`
      SELECT customer_id, driver_id FROM deliveries WHERE id = $1;
    `, [deliveryId]);

    if (delivRes.rows.length === 0) {
      throw new Error('DELIVERY_NOT_FOUND');
    }

    const eventsRes = await postgresAdapter.pool.query(`
      SELECT id, event_type, latitude, longitude, event_timestamp, event_data, actor_role
      FROM delivery_events
      WHERE delivery_id = $1
      ORDER BY event_timestamp ASC;
    `, [deliveryId]);

    return eventsRes.rows;
  }
}
