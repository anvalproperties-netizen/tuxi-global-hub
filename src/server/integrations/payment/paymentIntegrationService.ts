// ============================================================================
// TUXI PHASE 2G — PAYMENT INTEGRATION SERVICE
// Provider-agnostic coordinator for Peach Payments, Stripe, and future gateways.
// Enforces webhook signature validation, idempotency deduplication,
// server-authoritative CAPTURED gating, minor unit integer cents, and Rep reversals.
// ============================================================================

import { IPaymentGatewayAdapter, PaymentSessionRequest, PaymentSessionResponse, WebhookVerificationResult, RefundRequest, RefundResult } from './types.js';
import { PeachPaymentsAdapter } from './peachPaymentsAdapter.js';
import { StripeAdapter } from './stripeAdapter.js';
import { postgresAdapter } from '../../db/postgres.js';
import { OrderService } from '../../services/orderService.js';
import { CommissionService } from '../../services/commissionService.js';
import { NotificationService } from '../notifications/notificationService.js';

export class PaymentIntegrationService {
  private static adapters: Map<string, IPaymentGatewayAdapter> = new Map<string, IPaymentGatewayAdapter>([
    ['peach_payments', new PeachPaymentsAdapter()],
    ['stripe', new StripeAdapter()]
  ]);

  public static getAdapter(providerId: string): IPaymentGatewayAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`UNKNOWN_PAYMENT_PROVIDER: Provider "${providerId}" is not registered`);
    }
    return adapter;
  }

  public static getRegisteredProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Creates a payment checkout session.
   * Derives provider from currency: ZAR -> Peach Payments; USD/EUR/GBP -> Stripe.
   */
  public static async createCheckoutSession(
    orderId: string,
    customerEmail: string,
    preferredProvider?: string
  ): Promise<PaymentSessionResponse> {
    const client = await postgresAdapter.pool.connect();
    try {
      // 1. Fetch order details from PostgreSQL
      const oRes = await client.query(
        'SELECT id, total_cents, status FROM orders WHERE id = $1;',
        [orderId]
      );
      if (oRes.rows.length === 0) {
        throw new Error('ORDER_NOT_FOUND: Cannot create payment session for non-existent order');
      }
      const order = oRes.rows[0];

      // Fetch payment record
      const pRes = await client.query(
        'SELECT id, currency, amount_cents, status, payment_provider FROM payments WHERE order_id = $1;',
        [orderId]
      );
      if (pRes.rows.length === 0) {
        throw new Error('PAYMENT_RECORD_NOT_FOUND');
      }
      const payment = pRes.rows[0];

      if (payment.status === 'CAPTURED') {
        throw new Error('ORDER_ALREADY_PAID: Cannot initiate checkout for already captured order');
      }

      const currency = payment.currency || 'ZAR';
      const providerId = preferredProvider || (currency === 'ZAR' ? 'peach_payments' : 'stripe');
      const adapter = this.getAdapter(providerId);

      // Verify provider state
      const state = await adapter.getState();
      if (state === 'NOT_CONFIGURED') {
        throw new Error(`GATEWAY_NOT_CONFIGURED: ${adapter.name} is not configured`);
      }
      if (state === 'SUSPENDED') {
        throw new Error(`GATEWAY_SUSPENDED: ${adapter.name} is suspended`);
      }

      // Check production gating: In production, provider must be PRODUCTION_ENABLED
      if (process.env.NODE_ENV === 'production' && state !== 'PRODUCTION_ENABLED') {
        throw new Error('PRODUCTION_GATEWAY_NOT_ACTIVE: Live payment processing requires operator authorization');
      }

      const sessionReq: PaymentSessionRequest = {
        orderId,
        amountCents: order.total_cents,
        currency,
        customerEmail,
        description: `TUXI Order #${orderId.slice(0, 8)}`,
        returnUrl: `/order/${orderId}/success`,
        cancelUrl: `/order/${orderId}/cancel`
      };

      const session = await adapter.createPaymentSession(sessionReq);

      // Update payments record with provider info
      await client.query(`
        UPDATE payments
        SET payment_provider = $1, provider_transaction_id = $2, updated_at = NOW()
        WHERE id = $3;
      `, [providerId, session.providerTxRef, payment.id]);

      return session;
    } finally {
      client.release();
    }
  }

  /**
   * Processes an incoming payment webhook with strict cryptographic verification,
   * database idempotency deduplication, and atomic order capture.
   */
  public static async processWebhook(
    providerId: string,
    headers: Record<string, string | undefined>,
    rawBody: string | Buffer
  ): Promise<{ status: string; eventId: string; orderId?: string; isDuplicate?: boolean }> {
    const adapter = this.getAdapter(providerId);

    // 1. Verify cryptographic signature & parse payload
    const verification: WebhookVerificationResult = await adapter.verifyAndParseWebhook(headers, rawBody);
    if (!verification.isValid) {
      throw new Error(`WEBHOOK_VERIFICATION_FAILED: ${verification.error || 'Invalid signature'}`);
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      // 2. Check duplicate webhook in payment_webhook_events
      const dupCheck = await client.query(`
        SELECT id, status FROM payment_webhook_events
        WHERE provider_id = $1 AND event_id = $2
        FOR UPDATE;
      `, [providerId, verification.eventId]);

      if (dupCheck.rows.length > 0) {
        await client.query('COMMIT;');
        return {
          status: 'DUPLICATE_WEBHOOK_ACKNOWLEDGED',
          eventId: verification.eventId,
          orderId: verification.orderId,
          isDuplicate: true
        };
      }

      // Record webhook event as PENDING
      const eventInsert = await client.query(`
        INSERT INTO payment_webhook_events (
          id, provider_id, event_id, event_type, payload, signature_verified, status, processed_at
        ) VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, TRUE, 'PENDING', NOW()
        ) RETURNING id;
      `, [
        providerId,
        verification.eventId,
        verification.eventType,
        JSON.stringify(verification.rawPayload)
      ]);
      const webhookDbId = eventInsert.rows[0].id;

      // 3. Process capture or failure if orderId is present
      if (verification.orderId) {
        const oRes = await client.query(
          'SELECT id, total_cents, status, business_id FROM orders WHERE id = $1 FOR UPDATE;',
          [verification.orderId]
        );

        if (oRes.rows.length > 0) {
          const order = oRes.rows[0];
          const pRes = await client.query(
            'SELECT id, status FROM payments WHERE order_id = $1 FOR UPDATE;',
            [order.id]
          );

          if (pRes.rows.length > 0) {
            const payment = pRes.rows[0];

            if (verification.paymentStatus === 'CAPTURED') {
              // Update payment to CAPTURED
              await client.query(`
                UPDATE payments
                SET status = 'CAPTURED',
                    provider_transaction_id = COALESCE($1, provider_transaction_id),
                    updated_at = NOW()
                WHERE id = $2;
              `, [verification.providerTxRef, payment.id]);

              // Update order status to PAID / CONFIRMED
              await client.query(`
                UPDATE orders
                SET status = 'CONFIRMED', updated_at = NOW()
                WHERE id = $1;
              `, [order.id]);

              // Commit inventory reservations
              await client.query(`
                UPDATE inventory_reservations
                SET status = 'COMMITTED'
                WHERE order_id = $1 AND status = 'RESERVED';
              `, [order.id]);

              // Record payment transaction
              const txIdempotencyKey = `tx_${providerId}_${verification.eventId}`;
              await client.query(`
                INSERT INTO payment_transactions (
                  id, payment_id, transaction_type, amount_cents, currency, idempotency_key, raw_response
                ) VALUES (
                  uuid_generate_v4(), $1, 'CHARGE', $2, $3, $4, $5
                ) ON CONFLICT (idempotency_key) DO NOTHING;
              `, [
                payment.id,
                verification.amountCents || order.total_cents,
                verification.currency || 'ZAR',
                txIdempotencyKey,
                JSON.stringify(verification.rawPayload)
              ]);

              // Accrue Rep commission (EXACTLY 1.0% of product subtotal) if business has active Rep attribution
              const repAttributionRes = await client.query(`
                SELECT rep_profile_id FROM rep_business_attributions
                WHERE business_id = $1 AND attribution_status = 'APPROVED';
              `, [order.business_id]);

              if (repAttributionRes.rows.length > 0) {
                const repProfileId = repAttributionRes.rows[0].rep_profile_id;
                // Fetch active commission rule
                const ruleRes = await client.query(`
                  SELECT id, percentage_rate FROM commission_rules
                  WHERE is_active = TRUE AND (target_role = 'TUXI_REP' OR target_role = 'REP')
                  ORDER BY created_at DESC LIMIT 1;
                `);
                if (ruleRes.rows.length > 0) {
                  const rule = ruleRes.rows[0];
                  const rawRate = Number(rule.percentage_rate);
                  if (rawRate !== 0.01) {
                    throw new Error(`INVALID_REP_COMMISSION_POLICY: Rep commission rate must be exactly 0.0100 (1.0%), received ${rawRate}`);
                  }
                  const rate = 0.0100;
                  // Strictly product subtotal cents; excludes delivery fees, tips, and service fees
                  const qualifyingSubtotalCents = order.subtotal_cents !== undefined 
                    ? order.subtotal_cents 
                    : (order.total_cents - (order.delivery_fee_cents || 0) - (order.service_fee_cents || 0) - (order.tip_cents || 0));
                  const earnedCommissionCents = Math.round(qualifyingSubtotalCents * rate);
                  const commIdempKey = `comm_accrue_${order.id}`;

                  await client.query(`
                    INSERT INTO commission_ledger (
                      id, rep_profile_id, business_id, order_id, qualifying_amount_cents,
                      applied_rule_id, applied_percentage, commission_cents, status, idempotency_key, notes
                    ) VALUES (
                      uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, 'EARNED', $8, $9
                    ) ON CONFLICT (idempotency_key) DO NOTHING;
                  `, [
                    repProfileId,
                    order.business_id,
                    order.id,
                    qualifyingSubtotalCents,
                    rule.id,
                    rate,
                    earnedCommissionCents,
                    commIdempKey,
                    `Earned 1.0% commission on qualifying product subtotal of order #${order.id}`
                  ]);
                }
              }

              // Dispatch notification
              await NotificationService.dispatch({
                channel: 'EMAIL',
                recipient: 'customer@tuxi.co.za',
                templateKey: 'PAYMENT_CONFIRMED',
                subject: `Payment Confirmed: Order #${order.id.slice(0, 8)}`,
                body: `Your payment of ${verification.currency || 'ZAR'} ${((verification.amountCents || order.total_cents) / 100).toFixed(2)} was received successfully.`,
                payload: { orderId: order.id, amountCents: order.total_cents }
              });

            } else if (verification.paymentStatus === 'FAILED') {
              await client.query(`
                UPDATE payments SET status = 'FAILED', updated_at = NOW() WHERE id = $1;
              `, [payment.id]);
              await client.query(`
                UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1;
              `, [order.id]);

              // Release inventory reservations back to stock
              await client.query(`
                UPDATE inventory_reservations SET status = 'RELEASED' WHERE order_id = $1 AND status = 'RESERVED';
              `, [order.id]);
            }
          }
        }
      }

      // Mark webhook event as PROCESSED
      await client.query(`
        UPDATE payment_webhook_events
        SET status = 'PROCESSED', processed_at = NOW()
        WHERE id = $1;
      `, [webhookDbId]);

      await client.query('COMMIT;');

      return {
        status: 'PROCESSED',
        eventId: verification.eventId,
        orderId: verification.orderId
      };
    } catch (err: any) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Processes a refund via the payment provider, creates database audit records,
   * and reverses qualifying Rep commission proportionally.
   */
  public static async processRefund(
    orderId: string,
    refundAmountCents: number,
    reason: string,
    refundedByUserId: string
  ): Promise<RefundResult> {
    if (refundAmountCents <= 0 || !Number.isInteger(refundAmountCents)) {
      throw new Error('INVALID_REFUND_AMOUNT: Refund must be a positive integer in minor cents');
    }

    const client = await postgresAdapter.pool.connect();
    try {
      await client.query('BEGIN;');

      const oRes = await client.query(
        'SELECT id, total_cents, status, business_id FROM orders WHERE id = $1 FOR UPDATE;',
        [orderId]
      );
      if (oRes.rows.length === 0) throw new Error('ORDER_NOT_FOUND');
      const order = oRes.rows[0];

      const pRes = await client.query(
        'SELECT id, currency, amount_cents, status, payment_provider, provider_transaction_id FROM payments WHERE order_id = $1 FOR UPDATE;',
        [orderId]
      );
      if (pRes.rows.length === 0) throw new Error('PAYMENT_RECORD_NOT_FOUND');
      const payment = pRes.rows[0];

      if (payment.status !== 'CAPTURED' && payment.status !== 'PARTIALLY_REFUNDED') {
        throw new Error(`REFUND_NOT_PERMITTED: Cannot refund payment with status "${payment.status}"`);
      }

      const isPartial = refundAmountCents < order.total_cents;
      const providerId = payment.payment_provider || 'peach_payments';
      const adapter = this.getAdapter(providerId);

      const refundReq: RefundRequest = {
        orderId,
        providerTxRef: payment.provider_transaction_id || `tx_${Date.now()}`,
        amountCents: refundAmountCents,
        currency: payment.currency,
        reason,
        refundedByUserId,
        isPartial
      };

      const result = await adapter.processRefund(refundReq);

      // Record refund entry
      await client.query(`
        INSERT INTO refunds (id, order_id, payment_id, amount_cents, reason, refunded_by)
        VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5);
      `, [orderId, payment.id, refundAmountCents, reason, refundedByUserId]);

      // Record transaction
      const idempotencyKey = `refund_${orderId}_${Date.now()}`;
      await client.query(`
        INSERT INTO payment_transactions (
          id, payment_id, transaction_type, amount_cents, currency, idempotency_key, raw_response
        ) VALUES (
          uuid_generate_v4(), $1, 'REFUND', $2, $3, $4, $5
        );
      `, [
        payment.id,
        refundAmountCents,
        payment.currency,
        idempotencyKey,
        JSON.stringify(result)
      ]);

      // Update payment & order status
      const newPaymentStatus = isPartial ? 'PARTIALLY_REFUNDED' : 'REFUNDED';
      await client.query('UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2;', [newPaymentStatus, payment.id]);
      await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2;', [isPartial ? 'CANCELLED' : 'REFUNDED', orderId]);

      // Reversal of qualifying Rep commission (mathematically proportional)
      const commissionRes = await client.query(`
        SELECT id, rep_profile_id, business_id, applied_rule_id, applied_percentage, commission_cents
        FROM commission_ledger 
        WHERE order_id = $1 AND status = 'EARNED'
        LIMIT 1;
      `, [orderId]);

      if (commissionRes.rows.length > 0) {
        const comm = commissionRes.rows[0];
        const reversalAmount = isPartial
          ? Math.round(Number(comm.commission_cents) * (refundAmountCents / order.total_cents))
          : Number(comm.commission_cents);

        if (reversalAmount > 0) {
          const revIdempKey = `comm_rev_${orderId}_${Date.now()}`;
          await client.query(`
            INSERT INTO commission_ledger (
              id, rep_profile_id, business_id, order_id, qualifying_amount_cents,
              applied_rule_id, applied_percentage, commission_cents, status, idempotency_key, notes
            ) VALUES (
              uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, 'REVERSED', $8, $9
            );
          `, [
            comm.rep_profile_id,
            comm.business_id,
            orderId,
            Math.max(0, refundAmountCents),
            comm.applied_rule_id,
            comm.applied_percentage,
            -reversalAmount,
            revIdempKey,
            `Compensating reversal on refund`
          ]);
        }
      }

      await client.query('COMMIT;');

      // Dispatch notification
      await NotificationService.dispatch({
        channel: 'EMAIL',
        recipient: 'customer@tuxi.co.za',
        templateKey: 'ORDER_CANCELLED',
        subject: `Refund Processed: Order #${orderId.slice(0, 8)}`,
        body: `A refund of ${payment.currency} ${(refundAmountCents / 100).toFixed(2)} has been processed for your order. Reason: ${reason}`,
        payload: { orderId, amountCents: refundAmountCents }
      });

      return result;
    } catch (err: any) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Generates a payment reconciliation summary across orders and transactions.
   */
  public static async getReconciliationSummary(): Promise<{
    totalCapturedCents: number;
    totalRefundedCents: number;
    netRevenueCents: number;
    capturedCount: number;
    refundedCount: number;
    pendingCount: number;
    providerBreakdown: Record<string, { capturedCents: number; count: number }>;
  }> {
    const res = await postgresAdapter.pool.query(`
      SELECT 
        status,
        payment_provider,
        COALESCE(SUM(amount_cents), 0)::bigint as sum_cents,
        COUNT(*)::int as count
      FROM payments
      GROUP BY status, payment_provider;
    `);

    let totalCapturedCents = 0;
    let totalRefundedCents = 0;
    let capturedCount = 0;
    let refundedCount = 0;
    let pendingCount = 0;
    const providerBreakdown: Record<string, { capturedCents: number; count: number }> = {};

    for (const row of res.rows) {
      const sum = Number(row.sum_cents);
      const cnt = Number(row.count);
      const prov = row.payment_provider || 'UNKNOWN';

      if (!providerBreakdown[prov]) {
        providerBreakdown[prov] = { capturedCents: 0, count: 0 };
      }

      if (row.status === 'CAPTURED') {
        totalCapturedCents += sum;
        capturedCount += cnt;
        providerBreakdown[prov].capturedCents += sum;
        providerBreakdown[prov].count += cnt;
      } else if (row.status === 'REFUNDED' || row.status === 'PARTIALLY_REFUNDED') {
        totalRefundedCents += sum;
        refundedCount += cnt;
      } else if (row.status === 'INITIATED' || row.status === 'AUTHORISED') {
        pendingCount += cnt;
      }
    }

    return {
      totalCapturedCents,
      totalRefundedCents,
      netRevenueCents: totalCapturedCents - totalRefundedCents,
      capturedCount,
      refundedCount,
      pendingCount,
      providerBreakdown
    };
  }
}
