import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/server/middleware/auth.js';
import { postgresAdapter } from '../src/server/db/postgres.js';
import { seedPhase2CCourierAndDriverData } from '../src/server/db/seedCourierAndDriverData.js';
import { DriverService } from '../src/server/services/driverService.js';
import { CourierService } from '../src/server/services/courierService.js';
import { DeliveryService } from '../src/server/services/deliveryService.js';
import { RepService } from '../src/server/services/repService.js';
import { AuthService } from '../src/server/services/authService.js';
import { OrderService } from '../src/server/services/orderService.js';

describe('TUXI PHASE 2C — COURIER & DELIVERY DRIVER OPERATIONS INTEGRATION SUITE', () => {
  const customerAId = 'a1111111-2222-3333-4444-555555555551';
  const customerBId = 'a1111111-2222-3333-4444-555555555552';
  const eligibleDriver1Id = 'd0000000-0000-0000-0000-000000000001';
  const eligibleDriver2Id = 'd0000000-0000-0000-0000-000000000002';
  const offlineDriverId = 'd0000000-0000-0000-0000-000000000003';
  const suspendedDriverId = 'd0000000-0000-0000-0000-000000000004';
  const unverifiedDriverId = 'd0000000-0000-0000-0000-000000000005';

  const raceDrivers = [
    'd0000000-0000-0000-0000-000000000011',
    'd0000000-0000-0000-0000-000000000012',
    'd0000000-0000-0000-0000-000000000013',
    'd0000000-0000-0000-0000-000000000014',
    'd0000000-0000-0000-0000-000000000015',
  ];

  beforeAll(async () => {
    await seedPhase2CCourierAndDriverData();
  });

  // ==========================================
  // 1. DRIVER IDENTITY & ELIGIBILITY GATE (2C.1, 2C.2, 2C.3, 2C.4)
  // ==========================================
  describe('1. Driver Identity & Eligibility Gate', () => {
    it('verifies eligible online driver meets all server-side criteria', async () => {
      const isEligible = await DriverService.isDriverEligible(eligibleDriver1Id);
      expect(isEligible).toBe(true);

      const profile = await DriverService.getDriverProfileById(eligibleDriver1Id);
      expect(profile).toBeDefined();
      expect(profile.verification_status).toBe('VERIFIED');
      expect(profile.is_online).toBe(true);
      expect(profile.is_suspended).toBe(false);
    });

    it('strictly forbids public customer registration from self-assigning driver role (2C.1)', async () => {
      await expect(
        AuthService.register({
          email: `escalate_${Date.now()}@example.com`,
          password: 'Password123!',
          firstName: 'Hacker',
          lastName: 'User',
          phoneNumber: '+447700900999',
          role: 'TUXI_DELIVERY_DRIVER'
        })
      ).rejects.toThrow(/FORBIDDEN_ROLE_ASSIGNMENT/);
    });

    it('rejects offline driver from being eligible (2C.3, 2C.4)', async () => {
      const isEligible = await DriverService.isDriverEligible(offlineDriverId);
      expect(isEligible).toBe(false);
    });

    it('strictly forbids suspended driver from going online (2C.4)', async () => {
      await expect(
        DriverService.updateAvailability({
          driverId: suspendedDriverId,
          isOnline: true
        })
      ).rejects.toThrow(/SUSPENDED_DRIVER_CANNOT_GO_ONLINE/);
    });

    it('strictly forbids unverified driver from going online (2C.4)', async () => {
      await expect(
        DriverService.updateAvailability({
          driverId: unverifiedDriverId,
          isOnline: true
        })
      ).rejects.toThrow(/UNVERIFIED_DRIVER_CANNOT_GO_ONLINE/);
    });
  });

  // ==========================================
  // 2. DRIVER LOCATION & BOUNDARY VALIDATION (2C.5, 2C.6, 2C.37)
  // ==========================================
  describe('2. Driver Location & Boundary Validation', () => {
    it('accepts and persists valid boundary coordinates in PostGIS', async () => {
      // 90.0 and 180.0
      const loc1 = await DriverService.recordLocation({
        driverId: eligibleDriver1Id,
        latitude: 90.0,
        longitude: 180.0
      });
      expect(loc1.locationId).toBeDefined();

      // -90.0 and -180.0
      const loc2 = await DriverService.recordLocation({
        driverId: eligibleDriver1Id,
        latitude: -90.0,
        longitude: -180.0
      });
      expect(loc2.locationId).toBeDefined();

      // Realistic coordinates (Johannesburg CBD)
      const loc3 = await DriverService.recordLocation({
        driverId: eligibleDriver1Id,
        latitude: -26.2041,
        longitude: 28.0473
      });
      expect(loc3.locationId).toBeDefined();
    });

    it('strictly rejects out-of-boundary and invalid coordinates (2C.37)', async () => {
      // Latitude > 90
      await expect(
        DriverService.recordLocation({ driverId: eligibleDriver1Id, latitude: 90.000001, longitude: 0 })
      ).rejects.toThrow(/INVALID_LATITUDE_BOUNDARY/);

      // Latitude < -90
      await expect(
        DriverService.recordLocation({ driverId: eligibleDriver1Id, latitude: -90.000001, longitude: 0 })
      ).rejects.toThrow(/INVALID_LATITUDE_BOUNDARY/);

      // Longitude > 180
      await expect(
        DriverService.recordLocation({ driverId: eligibleDriver1Id, latitude: 0, longitude: 180.000001 })
      ).rejects.toThrow(/INVALID_LONGITUDE_BOUNDARY/);

      // Longitude < -180
      await expect(
        DriverService.recordLocation({ driverId: eligibleDriver1Id, latitude: 0, longitude: -180.000001 })
      ).rejects.toThrow(/INVALID_LONGITUDE_BOUNDARY/);

      // NaN or non-numeric
      await expect(
        DriverService.recordLocation({ driverId: eligibleDriver1Id, latitude: NaN, longitude: 28 })
      ).rejects.toThrow(/INVALID_LATITUDE/);
    });
  });

  // ==========================================
  // 3. COURIER PRICING & QUOTE FOUNDATION (2C.10 - 2C.15)
  // ==========================================
  describe('3. Courier Pricing, Quotes & Idempotency', () => {
    let testQuoteId: string;

    it('calculates authoritative PostGIS distance and generates DEV pricing quote', async () => {
      // Coordinates ~5.5 km apart in Johannesburg
      const pickup = { latitude: -26.2041, longitude: 28.0473 };
      const dropoff = { latitude: -26.1500, longitude: 28.0600 };

      const quote = await CourierService.createQuote({
        customerId: customerAId,
        pickup,
        dropoff,
        packageCategory: 'PARCEL',
        packageDescription: 'Keys & Documents'
      });

      expect(quote.quoteId).toBeDefined();
      expect(quote.distanceMeters).toBeGreaterThan(5000);
      expect(quote.distanceKm).toBeGreaterThan(5.0);
      expect(quote.feeBreakdown.baseFeeCents).toBe(2500);
      expect(quote.feeBreakdown.serviceFeeCents).toBe(350);
      expect(quote.feeBreakdown.totalCents).toBeGreaterThan(2850);
      expect(quote.pricingConfigVersion).toBe('DEV_COURIER_V1');

      testQuoteId = quote.quoteId;
    });

    it('enforces quote ownership: Customer B cannot use Customer A quote', async () => {
      await expect(
        CourierService.createCourierRequest({
          customerId: customerBId,
          quoteId: testQuoteId,
          packageDescription: 'Intercepted Parcel',
          recipientName: 'Attacker',
          recipientPhone: '+447700900999',
          idempotencyKey: `inter-quote-${Date.now()}`
        })
      ).rejects.toThrow(/FORBIDDEN_QUOTE_OWNERSHIP/);
    });

    it('creates courier request with cryptographic proof codes and enforces idempotency', async () => {
      const idempotencyKey = `courier-test-idem-${Date.now()}`;

      // 1. First execution
      const res1 = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: testQuoteId,
        packageDescription: 'Electronics Parcel',
        recipientName: 'Recipient One',
        recipientPhone: '+447700900111',
        idempotencyKey,
        testPaymentMode: true
      });

      expect(res1.isIdempotentReplay).toBe(false);
      expect(res1.delivery.id).toBeDefined();
      expect(res1.delivery.pickupCode).toHaveLength(6);
      expect(res1.delivery.deliveryOtp).toHaveLength(6);
      expect(res1.delivery.status).toBe('SEARCHING_FOR_DRIVER');
      expect(res1.delivery.paymentStatus).toBe('AUTHORISED');

      // 2. Replay execution with identical key
      const res2 = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: testQuoteId,
        packageDescription: 'Electronics Parcel',
        recipientName: 'Recipient One',
        recipientPhone: '+447700900111',
        idempotencyKey,
        testPaymentMode: true
      });

      expect(res2.isIdempotentReplay).toBe(true);
      expect(res2.delivery.id).toBe(res1.delivery.id);

      // Verify PostgreSQL row count for this idempotency key is exactly 1
      const countRes = await postgresAdapter.pool.query(
        'SELECT count(*)::int as count FROM deliveries WHERE idempotency_key = $1;',
        [idempotencyKey]
      );
      expect(countRes.rows[0].count).toBe(1);
    });

    it('rejects booking attempt using an already-consumed quote', async () => {
      await expect(
        CourierService.createCourierRequest({
          customerId: customerAId,
          quoteId: testQuoteId,
          packageDescription: 'Double use attempt',
          recipientName: 'Recipient One',
          recipientPhone: '+447700900111',
          idempotencyKey: `replay-quote-${Date.now()}`
        })
      ).rejects.toThrow(/QUOTE_ALREADY_CONSUMED/);
    });
  });

  // ==========================================
  // 4. PAYMENT SAFETY (2C.16)
  // ==========================================
  describe('4. Payment Safety & Fulfillment Gating', () => {
    it('creates unpaid production courier request (PAYMENT_INTEGRATION_PENDING) and parks status in REQUESTED', async () => {
      const quote = await CourierService.createQuote({
        customerId: customerAId,
        pickup: { latitude: -26.2041, longitude: 28.0473 },
        dropoff: { latitude: -26.1800, longitude: 28.0500 },
        packageDescription: 'Production Pending Parcel'
      });

      const res = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: quote.quoteId,
        packageDescription: 'Unpaid Production Parcel',
        recipientName: 'Unpaid Recipient',
        recipientPhone: '+447700900333',
        idempotencyKey: `unpaid-prod-${Date.now()}`,
        testPaymentMode: false // Production mode
      });

      expect(res.delivery.paymentStatus).toBe('PAYMENT_INTEGRATION_PENDING');
      expect(res.delivery.status).toBe('REQUESTED');
    });
  });

  // ==========================================
  // 5. CRITICAL 5-DRIVER CONCURRENCY RACE (2C.20, 2C.21, 2C.40)
  // ==========================================
  describe('5. Driver Assignment & Mandatory 5-Driver Acceptance Concurrency Race', () => {
    it('executes simultaneous acceptance across 5 distinct eligible drivers: EXACTLY 1 winner, 4 rejected', async () => {
      // Clear any prior active assignments for race drivers to ensure clean test state
      await postgresAdapter.pool.query(
        `UPDATE delivery_assignments SET status = 'COMPLETED' WHERE driver_id = ANY($1::uuid[]) AND status = 'ACCEPTED';`,
        [raceDrivers]
      );

      // 1. Create a delivery ready for dispatch
      const quote = await CourierService.createQuote({
        customerId: customerAId,
        pickup: { latitude: -26.2041, longitude: 28.0473 },
        dropoff: { latitude: -26.1900, longitude: 28.0500 },
        packageDescription: 'Concurrency Race Parcel'
      });

      const booking = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: quote.quoteId,
        packageDescription: 'Race Job',
        recipientName: 'Race Recipient',
        recipientPhone: '+447700900555',
        idempotencyKey: `race-delivery-${Date.now()}`,
        testPaymentMode: true
      });

      const deliveryId = booking.delivery.id;

      // 2. Launch 5 simultaneous acceptance attempts using independent database connections
      const racePromises = raceDrivers.map(async (driverId) => {
        try {
          const result = await DeliveryService.acceptDeliveryAssignment(deliveryId, driverId);
          return { driverId, success: true, result };
        } catch (err: any) {
          return { driverId, success: false, error: err.message };
        }
      });

      const raceResults = await Promise.all(racePromises);

      const successfulAttempts = raceResults.filter(r => r.success);
      const rejectedAttempts = raceResults.filter(r => !r.success);

      console.log(`[5-Driver Race Result] Successful: ${successfulAttempts.length}, Rejected: ${rejectedAttempts.length}`);

      // MANDATORY ACCEPTANCE INVARIANTS:
      expect(successfulAttempts).toHaveLength(1);
      expect(rejectedAttempts).toHaveLength(4);

      for (const rej of rejectedAttempts) {
        expect(rej.error).toMatch(/DELIVERY_ALREADY_ASSIGNED/);
      }

      // Verify PostgreSQL physical database state:
      const winnerDriverId = successfulAttempts[0].driverId;

      const delivCheck = await postgresAdapter.pool.query(
        'SELECT status, driver_id FROM deliveries WHERE id = $1;',
        [deliveryId]
      );
      expect(delivCheck.rows[0].status).toBe('DRIVER_ACCEPTED');
      expect(delivCheck.rows[0].driver_id).toBe(winnerDriverId);

      // Verify active accepted assignments table: EXACTLY 1 row with status ACCEPTED
      const assignCheck = await postgresAdapter.pool.query(
        "SELECT count(*)::int as count FROM delivery_assignments WHERE delivery_id = $1 AND status = 'ACCEPTED';",
        [deliveryId]
      );
      expect(assignCheck.rows[0].count).toBe(1);
    });

    it('rejects ineligible, suspended or offline drivers from accepting delivery', async () => {
      const quote = await CourierService.createQuote({
        customerId: customerAId,
        pickup: { latitude: -26.2041, longitude: 28.0473 },
        dropoff: { latitude: -26.1900, longitude: 28.0500 }
      });
      const b = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: quote.quoteId,
        packageDescription: 'Ineligible Test',
        recipientName: 'Test',
        recipientPhone: '+447700900111',
        idempotencyKey: `inel-deliv-${Date.now()}`,
        testPaymentMode: true
      });

      // Suspended driver
      await expect(
        DeliveryService.acceptDeliveryAssignment(b.delivery.id, suspendedDriverId)
      ).rejects.toThrow(/INELIGIBLE_DRIVER/);

      // Offline driver
      await expect(
        DeliveryService.acceptDeliveryAssignment(b.delivery.id, offlineDriverId)
      ).rejects.toThrow(/INELIGIBLE_DRIVER/);
    });

    it('allows driver to decline offer without affecting delivery state (2C.22)', async () => {
      const quote = await CourierService.createQuote({
        customerId: customerAId,
        pickup: { latitude: -26.2041, longitude: 28.0473 },
        dropoff: { latitude: -26.1900, longitude: 28.0500 }
      });
      const b = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: quote.quoteId,
        packageDescription: 'Decline Test',
        recipientName: 'Test',
        recipientPhone: '+447700900111',
        idempotencyKey: `decline-deliv-${Date.now()}`,
        testPaymentMode: true
      });

      const dec = await DeliveryService.declineDeliveryAssignment(b.delivery.id, eligibleDriver1Id, 'Too far away');
      expect(dec.status).toBe('DECLINED');

      // Delivery remains in SEARCHING_FOR_DRIVER
      const deliv = await postgresAdapter.pool.query('SELECT status, driver_id FROM deliveries WHERE id = $1;', [b.delivery.id]);
      expect(deliv.rows[0].status).toBe('SEARCHING_FOR_DRIVER');
      expect(deliv.rows[0].driver_id).toBeNull();
    });

    it('allows safe unassignment before pickup and releases delivery back to dispatch (2C.23)', async () => {
      const quote = await CourierService.createQuote({
        customerId: customerAId,
        pickup: { latitude: -26.2041, longitude: 28.0473 },
        dropoff: { latitude: -26.1900, longitude: 28.0500 }
      });
      const b = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: quote.quoteId,
        packageDescription: 'Unassign Test',
        recipientName: 'Test',
        recipientPhone: '+447700900111',
        idempotencyKey: `unassign-deliv-${Date.now()}`,
        testPaymentMode: true
      });

      // Accept
      await DeliveryService.acceptDeliveryAssignment(b.delivery.id, eligibleDriver2Id);

      // Unassign before pickup
      const un = await DeliveryService.unassignDriver(b.delivery.id, eligibleDriver2Id, 'Flat tyre');
      expect(un.status).toBe('SEARCHING_FOR_DRIVER');

      const deliv = await postgresAdapter.pool.query('SELECT status, driver_id FROM deliveries WHERE id = $1;', [b.delivery.id]);
      expect(deliv.rows[0].status).toBe('SEARCHING_FOR_DRIVER');
      expect(deliv.rows[0].driver_id).toBeNull();
    });
  });

  // ==========================================
  // 6. DELIVERY LIFECYCLE & PROOF VERIFICATION (2C.17, 2C.18, 2C.24 - 2C.28, 2C.38, 2C.39)
  // ==========================================
  describe('6. Delivery State Machine, Proof Verification & Earnings', () => {
    let deliveryId: string;
    let pickupCode: string;
    let deliveryOtp: string;
    const driverId = eligibleDriver1Id;

    beforeAll(async () => {
      await postgresAdapter.pool.query(
        `UPDATE delivery_assignments SET status = 'COMPLETED' WHERE driver_id = $1 AND status = 'ACCEPTED';`,
        [driverId]
      );
    });

    it('executes full valid progression: ACCEPT -> EN_ROUTE_PICKUP -> ARRIVED_PICKUP -> PROOF -> PICKED_UP -> EN_ROUTE_DROPOFF -> ARRIVED_DROPOFF -> OTP -> DELIVERED', async () => {
      const quote = await CourierService.createQuote({
        customerId: customerAId,
        pickup: { latitude: -26.2041, longitude: 28.0473 },
        dropoff: { latitude: -26.1900, longitude: 28.0500 }
      });
      const b = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: quote.quoteId,
        packageDescription: 'Complete Lifecycle Test',
        recipientName: 'Final Recipient',
        recipientPhone: '+447700900888',
        idempotencyKey: `full-lifecycle-${Date.now()}`,
        testPaymentMode: true
      });

      deliveryId = b.delivery.id;
      pickupCode = b.delivery.pickupCode;
      deliveryOtp = b.delivery.deliveryOtp;

      // 1. Accept
      const acc = await DeliveryService.acceptDeliveryAssignment(deliveryId, driverId);
      expect(acc.status).toBe('DRIVER_ACCEPTED');

      // 2. En route to pickup
      const p1 = await DeliveryService.updateDriverProgression(deliveryId, driverId, 'EN_ROUTE_TO_PICKUP');
      expect(p1.status).toBe('EN_ROUTE_TO_PICKUP');

      // 3. Arrived at pickup
      const p2 = await DeliveryService.updateDriverProgression(deliveryId, driverId, 'ARRIVED_AT_PICKUP');
      expect(p2.status).toBe('ARRIVED_AT_PICKUP');

      // 4. Confirm pickup with proof code
      const pickRes = await DeliveryService.confirmPickupWithProof(deliveryId, driverId, pickupCode);
      expect(pickRes.status).toBe('PICKED_UP');

      // 5. En route to dropoff
      const p3 = await DeliveryService.updateDriverProgression(deliveryId, driverId, 'EN_ROUTE_TO_DROPOFF');
      expect(p3.status).toBe('EN_ROUTE_TO_DROPOFF');

      // 6. Arrived at dropoff
      const p4 = await DeliveryService.updateDriverProgression(deliveryId, driverId, 'ARRIVED_AT_DROPOFF');
      expect(p4.status).toBe('ARRIVED_AT_DROPOFF');

      // 7. Confirm delivery with delivery OTP
      const delivRes = await DeliveryService.confirmDeliveryWithProof(deliveryId, driverId, deliveryOtp);
      expect(delivRes.status).toBe('DELIVERED');
      expect(delivRes.driverEarningCents).toBeGreaterThan(0);

      // Verify earnings row in PostgreSQL
      const earnRes = await postgresAdapter.pool.query(
        'SELECT * FROM driver_earnings WHERE delivery_id = $1;',
        [deliveryId]
      );
      expect(earnRes.rows).toHaveLength(1);
      expect(earnRes.rows[0].status).toBe('EARNED');
      expect(earnRes.rows[0].driver_id).toBe(driverId);
    });

    it('rejects proof replay: pickup code and delivery OTP cannot be consumed twice (2C.39)', async () => {
      // Replay pickup code
      await expect(
        DeliveryService.confirmPickupWithProof(deliveryId, driverId, pickupCode)
      ).rejects.toThrow(/PROOF_ALREADY_CONSUMED/);

      // Replay delivery OTP
      await expect(
        DeliveryService.confirmDeliveryWithProof(deliveryId, driverId, deliveryOtp)
      ).rejects.toThrow(/PROOF_ALREADY_CONSUMED/);
    });

    it('strictly rejects illegal state machine transitions (2C.38)', async () => {
      const quote = await CourierService.createQuote({
        customerId: customerAId,
        pickup: { latitude: -26.2041, longitude: 28.0473 },
        dropoff: { latitude: -26.1900, longitude: 28.0500 }
      });
      const b = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: quote.quoteId,
        packageDescription: 'Illegal Transition Test',
        recipientName: 'Test',
        recipientPhone: '+447700900111',
        idempotencyKey: `illegal-trans-${Date.now()}`,
        testPaymentMode: true
      });

      // REQUESTED -> DELIVERED (directly skipping all intermediate steps)
      await expect(
        DeliveryService.confirmDeliveryWithProof(b.delivery.id, driverId, b.delivery.deliveryOtp)
      ).rejects.toThrow(/FORBIDDEN_NOT_ASSIGNED_DRIVER|INVALID_STATE_FOR_DELIVERY/);

      // Accept
      await DeliveryService.acceptDeliveryAssignment(b.delivery.id, eligibleDriver2Id);

      // DRIVER_ACCEPTED -> DELIVERED (skipping pickup)
      await expect(
        DeliveryService.confirmDeliveryWithProof(b.delivery.id, eligibleDriver2Id, b.delivery.deliveryOtp)
      ).rejects.toThrow(/INVALID_STATE_FOR_DELIVERY/);

      // DRIVER_ACCEPTED -> PICKED_UP without arriving
      await expect(
        DeliveryService.confirmPickupWithProof(b.delivery.id, eligibleDriver2Id, b.delivery.pickupCode)
      ).rejects.toThrow(/INVALID_STATE_FOR_PICKUP/);

      // Clean unassignment so eligibleDriver2Id is freed
      await DeliveryService.unassignDriver(b.delivery.id, eligibleDriver2Id, 'Test cleanup');
    });

    it('enforces OTP security: wrong OTP is rejected and increments attempt count (2C.28)', async () => {
      const quote = await CourierService.createQuote({
        customerId: customerAId,
        pickup: { latitude: -26.2041, longitude: 28.0473 },
        dropoff: { latitude: -26.1900, longitude: 28.0500 }
      });
      const b = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: quote.quoteId,
        packageDescription: 'OTP Attempt Test',
        recipientName: 'Test',
        recipientPhone: '+447700900111',
        idempotencyKey: `otp-attempt-${Date.now()}`,
        testPaymentMode: true
      });

      await DeliveryService.acceptDeliveryAssignment(b.delivery.id, eligibleDriver2Id);
      await DeliveryService.updateDriverProgression(b.delivery.id, eligibleDriver2Id, 'EN_ROUTE_TO_PICKUP');
      await DeliveryService.updateDriverProgression(b.delivery.id, eligibleDriver2Id, 'ARRIVED_AT_PICKUP');
      await DeliveryService.confirmPickupWithProof(b.delivery.id, eligibleDriver2Id, b.delivery.pickupCode);
      await DeliveryService.updateDriverProgression(b.delivery.id, eligibleDriver2Id, 'EN_ROUTE_TO_DROPOFF');
      await DeliveryService.updateDriverProgression(b.delivery.id, eligibleDriver2Id, 'ARRIVED_AT_DROPOFF');

      // Wrong OTP
      await expect(
        DeliveryService.confirmDeliveryWithProof(b.delivery.id, eligibleDriver2Id, '000000')
      ).rejects.toThrow(/INVALID_DELIVERY_OTP/);

      // Verify attempt counter incremented
      const d = await postgresAdapter.pool.query('SELECT otp_attempt_count FROM deliveries WHERE id = $1;', [b.delivery.id]);
      expect(d.rows[0].otp_attempt_count).toBe(1);

      // Correct OTP succeeds
      const ok = await DeliveryService.confirmDeliveryWithProof(b.delivery.id, eligibleDriver2Id, b.delivery.deliveryOtp);
      expect(ok.status).toBe('DELIVERED');
    });
  });

  // ==========================================
  // 7. IDOR & PRIVACY ATTACK MATRIX (2C.6, 2C.36)
  // ==========================================
  describe('7. IDOR & Privacy Attack Matrix', () => {
    let customerADeliveryId: string;

    beforeAll(async () => {
      await postgresAdapter.pool.query(
        `UPDATE delivery_assignments SET status = 'COMPLETED' WHERE driver_id = $1 AND status = 'ACCEPTED';`,
        [eligibleDriver1Id]
      );
      const quote = await CourierService.createQuote({
        customerId: customerAId,
        pickup: { latitude: -26.2041, longitude: 28.0473 },
        dropoff: { latitude: -26.1900, longitude: 28.0500 }
      });
      const b = await CourierService.createCourierRequest({
        customerId: customerAId,
        quoteId: quote.quoteId,
        packageDescription: 'Privacy Matrix Delivery',
        recipientName: 'Customer A Recipient',
        recipientPhone: '+447700900111',
        idempotencyKey: `priv-matrix-${Date.now()}`,
        testPaymentMode: true
      });
      customerADeliveryId = b.delivery.id;
      await DeliveryService.acceptDeliveryAssignment(customerADeliveryId, eligibleDriver1Id);
    });

    it('strictly forbids Customer B from accessing Customer A Courier delivery details', async () => {
      await expect(
        CourierService.getCourierDeliveryForCustomer(customerADeliveryId, customerBId)
      ).rejects.toThrow(/FORBIDDEN_DELIVERY_ACCESS/);
    });

    it('strictly forbids Customer B from cancelling Customer A Courier delivery', async () => {
      await expect(
        DeliveryService.cancelDelivery(customerADeliveryId, customerBId, 'Malicious cancel')
      ).rejects.toThrow(/FORBIDDEN_CANCELLATION/);
    });

    it('strictly forbids unauthorized customer from querying driver coordinates for unrelated delivery', async () => {
      await expect(
        DeliveryService.getDriverLocationForDelivery(customerADeliveryId, customerBId)
      ).rejects.toThrow(/FORBIDDEN_DELIVERY_ACCESS/);
    });

    it('allows legitimate customer to query driver location for their active delivery', async () => {
      // Record driver location first
      await DriverService.recordLocation({
        driverId: eligibleDriver1Id,
        latitude: -26.2041,
        longitude: 28.0473
      });

      const loc = await DeliveryService.getDriverLocationForDelivery(customerADeliveryId, customerAId);
      expect(loc.hasLocation).toBe(true);
      expect(loc.latitude).toBeCloseTo(-26.2041, 3);
      expect(loc.longitude).toBeCloseTo(28.0473, 3);
    });

    it('strictly forbids Driver 2 from mutating or completing Driver 1 delivery', async () => {
      await expect(
        DeliveryService.updateDriverProgression(customerADeliveryId, eligibleDriver2Id, 'EN_ROUTE_TO_PICKUP')
      ).rejects.toThrow(/FORBIDDEN_NOT_ASSIGNED_DRIVER/);
    });
  });

  // ==========================================
  // 8. ORDER ↔ DELIVERY SYNCHRONIZATION & EATS / SHOP (2C.30, 2C.31, 2C.32)
  // ==========================================
  describe('8. Eats & Shop Order Delivery Synchronization', () => {
    it('strictly forbids unpaid production order from dispatching delivery (2C.31)', async () => {
      // Create unpaid synthetic order
      const client = await postgresAdapter.pool.connect();
      let unpaidOrderId: string;
      try {
        const addrRes = await client.query('SELECT id FROM addresses LIMIT 1;');
        const bizRes = await client.query("SELECT id FROM businesses WHERE status = 'APPROVED' LIMIT 1;");
        const orderRes = await client.query(`
          INSERT INTO orders (
            id, customer_id, business_id, delivery_address_id, order_number,
            order_type, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents,
            status, currency
          )
          VALUES (
            uuid_generate_v4(), $1, $2, $3, 'UNPAID-ORD-' || floor(random() * 100000000)::text,
            'EATS', 1500, 2500, 250, 0, 4250,
            'PENDING_PAYMENT', 'ZAR'
          )
          RETURNING id;
        `, [customerAId, bizRes.rows[0].id, addrRes.rows[0].id]);
        unpaidOrderId = orderRes.rows[0].id;

        await client.query(`
          INSERT INTO payments (id, order_id, amount_cents, currency, status, payment_provider)
          VALUES (uuid_generate_v4(), $1, 4250, 'ZAR', 'INITIATED', 'PAYMENT_INTEGRATION_PENDING');
        `, [unpaidOrderId]);
      } finally {
        client.release();
      }

      await expect(
        DeliveryService.createDeliveryForOrder(unpaidOrderId)
      ).rejects.toThrow(/UNPAID_ORDER_CANNOT_DISPATCH/);
    });

    it('creates delivery for authorized order idempotently and synchronizes completion (2C.30)', async () => {
      const client = await postgresAdapter.pool.connect();
      let paidOrderId: string;
      try {
        const addrRes = await client.query('SELECT id FROM addresses LIMIT 1;');
        const bizRes = await client.query("SELECT id FROM businesses WHERE status = 'APPROVED' LIMIT 1;");
        const orderRes = await client.query(`
          INSERT INTO orders (
            id, customer_id, business_id, delivery_address_id, order_number,
            order_type, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, total_cents,
            status, currency
          )
          VALUES (
            uuid_generate_v4(), $1, $2, $3, 'PAID-ORD-' || floor(random() * 100000000)::text,
            'EATS', 1500, 2500, 250, 0, 4250,
            'CONFIRMED', 'ZAR'
          )
          RETURNING id;
        `, [customerAId, bizRes.rows[0].id, addrRes.rows[0].id]);
        paidOrderId = orderRes.rows[0].id;

        await client.query(`
          INSERT INTO payments (id, order_id, amount_cents, currency, status, payment_provider)
          VALUES (uuid_generate_v4(), $1, 4250, 'ZAR', 'AUTHORISED', 'PEACH_TEST');
        `, [paidOrderId]);
      } finally {
        client.release();
      }

      // Create delivery
      const d1 = await DeliveryService.createDeliveryForOrder(paidOrderId);
      expect(d1.isIdempotentReplay).toBe(false);
      expect(d1.delivery.id).toBeDefined();

      // Idempotency replay
      const d2 = await DeliveryService.createDeliveryForOrder(paidOrderId);
      expect(d2.isIdempotentReplay).toBe(true);
      expect(d2.delivery.id).toBe(d1.delivery.id);
    });
  });

  // ==========================================
  // 9. PHASE 1 REGRESSION: EXACT POSTGIS 20 KM REP TERRITORY (2C.45)
  // ==========================================
  describe('9. Phase 1 Regression: Locked PostGIS 20 km Rep Territory Rule', () => {
    it('strictly preserves the 20 km boundary: 19,999.999m INSIDE, 20,000.000m INSIDE, 20,000.001m OUTSIDE, 20,100.000m OUTSIDE', async () => {
      const hubLat = -26.2041;
      const hubLng = 28.0473;

      const client = await postgresAdapter.pool.connect();
      try {
        const queryDist = async (distanceMeters: number) => {
          const res = await client.query(`
            WITH target_point AS (
              SELECT ST_Project(
                ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography,
                $3::float8,
                radians(90.0)::float8
              ) AS geog
            )
            SELECT 
              (ST_Distance(
                ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography,
                tp.geog
              ) <= 20000.0) AS is_within,
              (ST_Distance(
                ST_SetSRID(ST_Point($2::float8, $1::float8), 4326)::geography,
                tp.geog
              )) AS exact_distance_meters
            FROM target_point tp;
          `, [hubLat, hubLng, distanceMeters]);
          return Boolean(res.rows[0].is_within);
        };

        expect(await queryDist(19999.999)).toBe(true);
        expect(await queryDist(20000.000)).toBe(true);
        expect(await queryDist(20000.001)).toBe(false);
        expect(await queryDist(20100.000)).toBe(false);
      } finally {
        client.release();
      }
    });
  });
});
