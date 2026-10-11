// ============================================================================
// TUXI PHASE 2G — PAYMENT INTEGRATION TYPES & CONTRACTS
// Multi-currency, minor integer units, strict webhook verification.
// ============================================================================

import { IIntegrationAdapter } from '../types.js';

export interface PaymentSessionRequest {
  orderId: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  customerName?: string;
  description?: string;
  returnUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentSessionResponse {
  sessionId: string;
  checkoutUrl: string;
  providerTxRef: string;
  amountCents: number;
  currency: string;
  status: 'PENDING' | 'INITIATED';
  expiresAt: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  eventId: string;
  eventType: string;
  orderId?: string;
  providerTxRef?: string;
  amountCents?: number;
  currency?: string;
  paymentStatus?: 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  rawPayload: any;
  error?: string;
}

export interface RefundRequest {
  orderId: string;
  providerTxRef: string;
  amountCents: number; // integer minor units
  currency: string;
  reason: string;
  refundedByUserId: string;
  isPartial?: boolean;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  providerTxRef: string;
  amountRefundedCents: number;
  remainingAmountCents: number;
  status: 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'FAILED';
  rawResponse?: any;
  error?: string;
}

export interface IPaymentGatewayAdapter extends IIntegrationAdapter {
  createPaymentSession(request: PaymentSessionRequest): Promise<PaymentSessionResponse>;
  verifyAndParseWebhook(headers: Record<string, string | undefined>, rawBody: string | Buffer): Promise<WebhookVerificationResult>;
  processRefund(request: RefundRequest): Promise<RefundResult>;
  queryTransactionStatus(providerTxRef: string): Promise<{
    providerTxRef: string;
    status: 'PENDING' | 'AUTHORISED' | 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
    amountCents: number;
    currency: string;
    capturedAt?: string;
  }>;
}
