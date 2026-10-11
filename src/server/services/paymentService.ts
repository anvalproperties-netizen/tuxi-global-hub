import { dbInstance } from '../db/database.js';
import { postgresAdapter } from '../db/postgres.js';

export interface PaymentGatewayProvider {
  providerName: string;
  createCharge(amountCents: number, currency: string, orderId: string, metadata?: any): Promise<PaymentResult>;
  refundCharge(paymentId: string, amountCents: number, reason: string): Promise<PaymentResult>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
}

export interface PaymentResult {
  status: 'INITIATED' | 'AUTHORISED' | 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'DISPUTED';
  providerTransactionId?: string;
  message?: string;
}

/**
 * Production Pending Payment Adapter.
 * Clearly declares that payment gateway credentials are not yet linked,
 * refusing to fabricate synthetic charges in production code.
 */
export class PendingPaymentGatewayProvider implements PaymentGatewayProvider {
  public providerName = 'PAYMENT_INTEGRATION_PENDING';

  async createCharge(amountCents: number, currency: string, orderId: string): Promise<PaymentResult> {
    return {
      status: 'INITIATED',
      message: 'PAYMENT_INTEGRATION_PENDING: Production gateway credentials (Stripe / Peach Payments) not yet linked. Transaction parked.'
    };
  }

  async refundCharge(paymentId: string, amountCents: number, reason: string): Promise<PaymentResult> {
    return {
      status: 'FAILED',
      message: 'PAYMENT_INTEGRATION_PENDING: Real refund cannot be executed without live payment credentials.'
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    return false;
  }
}

export class PaymentService {
  private static provider: PaymentGatewayProvider = new PendingPaymentGatewayProvider();

  public static getProviderName(): string {
    return this.provider.providerName;
  }

  /**
   * Processes webhook events with mandatory idempotency.
   */
  public static async handleWebhookEvent(idempotencyKey: string, eventType: string, payload: any) {
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        await client.query('BEGIN;');
        const exRes = await client.query('SELECT id FROM payment_transactions WHERE idempotency_key = $1;', [idempotencyKey]);
        if (exRes.rows.length > 0) {
          await client.query('ROLLBACK;');
          return { status: 'ALREADY_PROCESSED', isIdempotentReplay: true };
        }

        const insRes = await client.query(`
          INSERT INTO payment_transactions (id, payment_id, transaction_type, amount_cents, currency, idempotency_key, raw_response)
          VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6)
          RETURNING id;
        `, [
          payload.paymentId || 'UNKNOWN',
          eventType,
          payload.amountCents || 0,
          payload.currency || 'ZAR',
          idempotencyKey,
          JSON.stringify(payload)
        ]);

        await client.query('COMMIT;');
        return { status: 'RECORDED', txId: insRes.rows[0].id };
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      } finally {
        client.release();
      }
    }

    const existing = dbInstance.db.prepare(`
      SELECT id FROM payment_transactions WHERE idempotency_key = ?
    `).get(idempotencyKey);

    if (existing) {
      return { status: 'ALREADY_PROCESSED', isIdempotentReplay: true };
    }

    dbInstance.db.exec('BEGIN TRANSACTION;');
    try {
      const txId = dbInstance.generateUuid();
      dbInstance.db.prepare(`
        INSERT INTO payment_transactions (id, payment_id, transaction_type, amount_cents, currency, idempotency_key, raw_response)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId,
        payload.paymentId || 'UNKNOWN',
        eventType,
        payload.amountCents || 0,
        payload.currency || 'ZAR',
        idempotencyKey,
        JSON.stringify(payload)
      );

      dbInstance.db.exec('COMMIT;');
      return { status: 'RECORDED', txId };
    } catch (err) {
      dbInstance.db.exec('ROLLBACK;');
      throw err;
    }
  }
}
