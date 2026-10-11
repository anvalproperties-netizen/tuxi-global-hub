// ============================================================================
// TUXI PHASE 2G — INTEGRATIONS API ROUTER
// Gated endpoints for Payment Webhooks, Checkout Sessions, Payout Batches,
// Driver Telematics, Route Planning, Notifications, and AI Operational Tasks.
// ============================================================================

import { Router, Request, Response } from 'express';
import { IntegrationRegistry } from '../integrations/integrationRegistry.js';
import { PaymentIntegrationService } from '../integrations/payment/paymentIntegrationService.js';
import { PayoutService } from '../integrations/payouts/payoutService.js';
import { GoogleMapsAdapter, DriverTelematicsService } from '../integrations/maps/mapsAdapter.js';
import { NotificationService } from '../integrations/notifications/notificationService.js';
import { GeminiOperationalService } from '../integrations/ai/geminiOperationalService.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';

export const integrationsRouter = Router();

const mapsAdapter = new GoogleMapsAdapter();

// ----------------------------------------------------------------------------
// 1. PROVIDER REGISTRY & HEALTH CHECKS
// ----------------------------------------------------------------------------
integrationsRouter.get('/providers', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const states = await IntegrationRegistry.getProviderStates();
    res.json({ providers: states });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

integrationsRouter.post('/health-check', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await IntegrationRegistry.runAllHealthChecks();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

integrationsRouter.post('/providers/:id/state', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetState, notes } = req.body;
    const result = await IntegrationRegistry.updateProviderState({
      providerId: req.params.id,
      targetState,
      operatorUserId: req.user!.userId,
      notes
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 2. PAYMENT GATEWAY ENDPOINTS
// ----------------------------------------------------------------------------
integrationsRouter.post('/payments/checkout-session', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, preferredProvider } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });
    }
    const session = await PaymentIntegrationService.createCheckoutSession(
      orderId,
      req.user!.email,
      preferredProvider
    );
    res.json(session);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Peach Payments Webhook Endpoint
integrationsRouter.post('/payments/webhooks/peach', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const headers = req.headers as Record<string, string | undefined>;
    const result = await PaymentIntegrationService.processWebhook('peach_payments', headers, rawBody);
    res.status(200).json(result);
  } catch (err: any) {
    const isVerificationError = err.message.includes('WEBHOOK_VERIFICATION_FAILED');
    res.status(isVerificationError ? 401 : 500).json({ error: err.message });
  }
});

// Stripe Webhook Endpoint
integrationsRouter.post('/payments/webhooks/stripe', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const headers = req.headers as Record<string, string | undefined>;
    const result = await PaymentIntegrationService.processWebhook('stripe', headers, rawBody);
    res.status(200).json(result);
  } catch (err: any) {
    const isVerificationError = err.message.includes('WEBHOOK_VERIFICATION_FAILED');
    res.status(isVerificationError ? 401 : 500).json({ error: err.message });
  }
});

// Process Refund (Full or Partial)
integrationsRouter.post('/payments/refund', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'TUXI_EATS_OWNER', 'TUXI_SHOP_OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, amountCents, reason } = req.body;
    if (!orderId || !amountCents || !reason) {
      return res.status(400).json({ error: 'MISSING_REFUND_PARAMETERS' });
    }
    const refund = await PaymentIntegrationService.processRefund(
      orderId,
      amountCents,
      reason,
      req.user!.userId
    );
    res.json(refund);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Payment Reconciliation Summary
integrationsRouter.get('/payments/reconciliation', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = await PaymentIntegrationService.getReconciliationSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 3. FINANCIAL DISBURSEMENTS & PAYOUTS
// ----------------------------------------------------------------------------
integrationsRouter.post('/payouts/accounts', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { beneficiaryType, accountHolderName, bankName, accountNumber, branchCode } = req.body;
    const account = await PayoutService.registerPayoutAccount({
      userId: req.user!.userId,
      beneficiaryType,
      accountHolderName,
      bankName,
      accountNumber,
      branchCode
    });
    res.status(201).json({ account });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

integrationsRouter.get('/payouts/eligibility', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = (req.query.role as any) || 'REP';
    const eligibility = await PayoutService.checkPayoutEligibility(req.user!.userId, role);
    res.json(eligibility);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

integrationsRouter.post('/payouts/hold', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { payoutAccountId, holdStatus, holdReason } = req.body;
    const result = await PayoutService.setPayoutHold({
      payoutAccountId,
      holdStatus,
      holdReason,
      adminUserId: req.user!.userId
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

integrationsRouter.post('/payouts/batches', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { items, notes } = req.body;
    const batch = await PayoutService.createPayoutBatch({
      adminUserId: req.user!.userId,
      items,
      notes
    });
    res.status(201).json(batch);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

integrationsRouter.post('/payouts/batches/:id/approve', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await PayoutService.approvePayoutBatch(req.params.id, req.user!.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 4. MAPS, ROUTING & DRIVER TELEMATICS
// ----------------------------------------------------------------------------
integrationsRouter.post('/telematics/ping', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { latitude, longitude, speedKmh, headingDegrees, accuracyMeters, deliveryId } = req.body;
    const ping = await DriverTelematicsService.recordDriverPing({
      driverUserId: req.user!.userId,
      latitude,
      longitude,
      speedKmh,
      headingDegrees,
      accuracyMeters,
      deliveryId
    });
    res.status(201).json(ping);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

integrationsRouter.get('/telematics/delivery/:deliveryId/live-location', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const location = await DriverTelematicsService.getDeliveryLiveLocation(
      req.params.deliveryId,
      req.user!.userId,
      req.user!.roles
    );
    res.json(location);
  } catch (err: any) {
    const isDenied = err.message.includes('ACCESS_DENIED');
    res.status(isDenied ? 403 : 400).json({ error: err.message });
  }
});

integrationsRouter.post('/maps/geocode', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { address } = req.body;
    const result = await mapsAdapter.geocodeAddress(address);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

integrationsRouter.post('/maps/route', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { origin, destination, travelMode } = req.body;
    const route = await mapsAdapter.calculateRoute(origin, destination, travelMode);
    res.json(route);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 5. UNIFIED NOTIFICATIONS
// ----------------------------------------------------------------------------
integrationsRouter.post('/notifications/dispatch', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channel, recipient, templateKey, subject, body, payload, locale } = req.body;
    const result = await NotificationService.dispatch({
      channel,
      recipient,
      templateKey,
      subject,
      body,
      payload,
      locale
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 6. GEMINI AI OPERATIONAL READINESS
// ----------------------------------------------------------------------------
integrationsRouter.post('/ai/enrich-menu', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'TUXI_EATS_OWNER', 'TUXI_SHOP_OWNER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, ingredients } = req.body;
    const task = await GeminiOperationalService.enrichMenuItem({ name, description, ingredients });
    res.json(task);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

integrationsRouter.post('/ai/moderate-image', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { imageUrl, context } = req.body;
    const task = await GeminiOperationalService.moderateImage({ imageUrl, context });
    res.json(task);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

integrationsRouter.post('/ai/triage-support', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customerMessage, orderId } = req.body;
    const task = await GeminiOperationalService.triageSupportTicket({ customerMessage, orderId });
    res.json(task);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

integrationsRouter.post('/ai/evaluate-risk', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, orderAmountCents, distanceKm, recentOrderCountLastHour } = req.body;
    const task = await GeminiOperationalService.evaluateOrderRisk({
      userId,
      orderAmountCents,
      distanceKm,
      recentOrderCountLastHour
    });
    res.json(task);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

integrationsRouter.post('/ai/tasks/:id/review', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action } = req.body;
    if (action !== 'APPROVED' && action !== 'REJECTED') {
      return res.status(400).json({ error: 'ACTION_MUST_BE_APPROVED_OR_REJECTED' });
    }
    const result = await GeminiOperationalService.reviewTask(req.params.id, req.user!.userId, action);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
