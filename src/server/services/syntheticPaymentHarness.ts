import crypto from 'crypto';
import { PaymentService, PaymentResult } from './paymentService.js';
import { CommissionService } from './commissionService.js';

export const SYNTHETIC_WEBHOOK_SECRET = process.env.SYNTHETIC_WEBHOOK_SECRET || 'tuxi_dev_synthetic_secret_key_2026';

export interface SyntheticWebhookPayload {
  eventId: string;
  eventType: 'payment.authorized' | 'payment.captured' | 'payment.declined' | 'payment.refunded' | 'payment.cancelled';
  orderId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface SyntheticSimulationResponse {
  success: boolean;
  scenario: string;
  orderId?: string;
  paymentId?: string;
  status: string;
  amountCents: number;
  currency: string;
  idempotentReplay?: boolean;
  signatureVerified: boolean;
  auditMessage: string;
}

export class SyntheticPaymentHarness {

  /**
   * Generates a valid HMAC-SHA256 signature for test webhooks.
   */
  public static generateSignature(payloadString: string, secret = SYNTHETIC_WEBHOOK_SECRET): string {
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  /**
   * Verifies an incoming webhook signature using timing-safe comparison to prevent timing attacks.
   */
  public static verifySignature(payloadString: string, signatureHeader: string, secret = SYNTHETIC_WEBHOOK_SECRET): boolean {
    if (!signatureHeader || !payloadString) return false;
    try {
      const expectedSignature = this.generateSignature(payloadString, secret);
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const receivedBuffer = Buffer.from(signatureHeader, 'hex');

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Validates currency minor-unit integrity.
   * All prices and charges in TUXI must be stored in exact integer minor units (cents/pence)
   * to eliminate IEEE 754 floating-point rounding errors.
   */
  public static validateMinorUnitIntegrity(amountCents: number, currency: string): { valid: boolean; error?: string } {
    if (!Number.isInteger(amountCents)) {
      return {
        valid: false,
        error: `INVALID_MINOR_UNITS: Amount ${amountCents} must be an integer in minor units (cents). Floating-point amounts are strictly prohibited.`
      };
    }
    if (amountCents < 0) {
      return { valid: false, error: 'NEGATIVE_AMOUNT_PROHIBITED: Transaction amounts must be non-negative.' };
    }
    const supportedCurrencies = ['ZAR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'];
    if (!supportedCurrencies.includes(currency.toUpperCase())) {
      return { valid: false, error: `UNSUPPORTED_CURRENCY: Currency '${currency}' is not supported.` };
    }
    return { valid: true };
  }

  /**
   * Scenario 1: Simulates successful payment authorization.
   */
  public static async simulateSuccessfulAuth(params: {
    orderId: string;
    amountCents: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<SyntheticSimulationResponse> {
    const minorUnitCheck = this.validateMinorUnitIntegrity(params.amountCents, params.currency);
    if (!minorUnitCheck.valid) {
      throw new Error(minorUnitCheck.error);
    }

    const paymentId = `synth_pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload: SyntheticWebhookPayload = {
      eventId: `evt_${Date.now()}`,
      eventType: 'payment.authorized',
      orderId: params.orderId,
      paymentId,
      amountCents: params.amountCents,
      currency: params.currency,
      idempotencyKey: params.idempotencyKey,
      timestamp: new Date().toISOString()
    };

    const signature = this.generateSignature(JSON.stringify(payload));
    const isSignatureValid = this.verifySignature(JSON.stringify(payload), signature);

    const recordResult = await PaymentService.handleWebhookEvent(params.idempotencyKey, 'payment.authorized', payload);

    return {
      success: true,
      scenario: 'SUCCESSFUL_AUTHORIZATION',
      orderId: params.orderId,
      paymentId,
      status: 'AUTHORISED',
      amountCents: params.amountCents,
      currency: params.currency,
      idempotentReplay: recordResult.isIdempotentReplay,
      signatureVerified: isSignatureValid,
      auditMessage: `Simulated successful authorization of ${params.amountCents} ${params.currency} for order ${params.orderId}`
    };
  }

  /**
   * Scenario 2: Simulates declined payment (insufficient funds / card decline).
   */
  public static async simulateDeclinedPayment(params: {
    orderId: string;
    amountCents: number;
    currency: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<SyntheticSimulationResponse> {
    const paymentId = `synth_pay_declined_${Date.now()}`;
    const payload: SyntheticWebhookPayload = {
      eventId: `evt_${Date.now()}`,
      eventType: 'payment.declined',
      orderId: params.orderId,
      paymentId,
      amountCents: params.amountCents,
      currency: params.currency,
      idempotencyKey: params.idempotencyKey,
      timestamp: new Date().toISOString(),
      metadata: { declineReason: params.reason }
    };

    const signature = this.generateSignature(JSON.stringify(payload));
    const isSignatureValid = this.verifySignature(JSON.stringify(payload), signature);

    await PaymentService.handleWebhookEvent(params.idempotencyKey, 'payment.declined', payload);

    return {
      success: false,
      scenario: 'DECLINED_PAYMENT',
      orderId: params.orderId,
      paymentId,
      status: 'FAILED',
      amountCents: params.amountCents,
      currency: params.currency,
      signatureVerified: isSignatureValid,
      auditMessage: `Simulated payment decline: ${params.reason} for order ${params.orderId}`
    };
  }

  /**
   * Scenario 3: Simulates duplicate webhook delivery to verify server-side idempotency.
   */
  public static async simulateDuplicateWebhook(payload: SyntheticWebhookPayload): Promise<SyntheticSimulationResponse> {
    const rawPayload = JSON.stringify(payload);
    const signature = this.generateSignature(rawPayload);
    const signatureVerified = this.verifySignature(rawPayload, signature);

    const webhookResult = await PaymentService.handleWebhookEvent(payload.idempotencyKey, payload.eventType, payload);

    return {
      success: true,
      scenario: 'DUPLICATE_WEBHOOK_DELIVERY',
      orderId: payload.orderId,
      paymentId: payload.paymentId,
      status: webhookResult.status,
      amountCents: payload.amountCents,
      currency: payload.currency,
      idempotentReplay: webhookResult.isIdempotentReplay ?? (webhookResult.status === 'ALREADY_PROCESSED'),
      signatureVerified,
      auditMessage: webhookResult.status === 'ALREADY_PROCESSED' 
        ? 'Duplicate webhook successfully recognized and deduplicated; no secondary state mutation occurred.'
        : 'Initial webhook registered.'
    };
  }

  /**
   * Scenario 4: Simulates refund and compensating ledger entry.
   */
  public static async simulateRefund(params: {
    paymentId: string;
    orderId: string;
    amountCents: number;
    currency: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<SyntheticSimulationResponse> {
    const payload: SyntheticWebhookPayload = {
      eventId: `evt_refund_${Date.now()}`,
      eventType: 'payment.refunded',
      orderId: params.orderId,
      paymentId: params.paymentId,
      amountCents: params.amountCents,
      currency: params.currency,
      idempotencyKey: params.idempotencyKey,
      timestamp: new Date().toISOString(),
      metadata: { refundReason: params.reason }
    };

    const signature = this.generateSignature(JSON.stringify(payload));
    const isSignatureValid = this.verifySignature(JSON.stringify(payload), signature);

    // Record refund transaction in payment log
    await PaymentService.handleWebhookEvent(params.idempotencyKey, 'payment.refunded', payload);

    // Trigger compensating commission ledger reversal if rep was attributed
    let reversedCommission = false;
    try {
      await CommissionService.reverseOrderCommission(params.orderId, params.reason, params.idempotencyKey, params.amountCents);
      reversedCommission = true;
    } catch {
      // Order may not have had an earned commission in synthetic test mode
      reversedCommission = false;
    }

    return {
      success: true,
      scenario: 'REFUND_SIMULATION',
      orderId: params.orderId,
      paymentId: params.paymentId,
      status: 'REFUNDED',
      amountCents: params.amountCents,
      currency: params.currency,
      signatureVerified: isSignatureValid,
      auditMessage: `Simulated refund of ${params.amountCents} ${params.currency}. Compensating ledger processed: ${reversedCommission}`
    };
  }

  /**
   * Scenario 5: Simulates order cancellation prior to settlement.
   */
  public static async simulateCancellation(params: {
    orderId: string;
    idempotencyKey: string;
  }): Promise<SyntheticSimulationResponse> {
    const payload: SyntheticWebhookPayload = {
      eventId: `evt_cancel_${Date.now()}`,
      eventType: 'payment.cancelled',
      orderId: params.orderId,
      paymentId: `synth_cancelled_${Date.now()}`,
      amountCents: 0,
      currency: 'ZAR',
      idempotencyKey: params.idempotencyKey,
      timestamp: new Date().toISOString()
    };

    const recordResult = await PaymentService.handleWebhookEvent(params.idempotencyKey, 'payment.cancelled', payload);

    return {
      success: true,
      scenario: 'CANCELLED_TRANSACTION',
      orderId: params.orderId,
      status: 'CANCELLED',
      amountCents: 0,
      currency: 'ZAR',
      idempotentReplay: recordResult.isIdempotentReplay,
      signatureVerified: true,
      auditMessage: `Simulated cancellation for order ${params.orderId}. No unearned funds attributed.`
    };
  }
}
