import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService.js';
import { CustomerService } from '../services/customerService.js';
import { EatsService } from '../services/eatsService.js';
import { ShopService } from '../services/shopService.js';
import { OrderService } from '../services/orderService.js';
import { RepService } from '../services/repService.js';
import { RepAcquisitionService } from '../services/repAcquisitionService.js';
import { CommissionService } from '../services/commissionService.js';
import { AdminService } from '../services/adminService.js';
import { DriverService } from '../services/driverService.js';
import { CourierService } from '../services/courierService.js';
import { DeliveryService } from '../services/deliveryService.js';
import { MerchantService } from '../services/merchantService.js';
import { postgresAdapter } from '../db/postgres.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { aiRouter } from './aiRouter.js';
import { integrationsRouter } from './integrationsRouter.js';
import { SyntheticPaymentHarness } from '../services/syntheticPaymentHarness.js';

export const apiRouter = Router();

// ==========================================
// 0. ENTERPRISE GEMINI AI ROUTER (/api/ai/*)
// ==========================================
apiRouter.use('/ai', aiRouter);

// ==========================================
// 0.1 PHASE 2G EXTERNAL INTEGRATIONS ROUTER (/api/integrations/*)
// ==========================================
apiRouter.use('/integrations', integrationsRouter);

// ==========================================
// 1. AUTHENTICATION & IDENTITY ENDPOINTS
// ==========================================
interface LoginAttemptRecord {
  failedAttempts: number;
  lockedUntil?: number;
}
const loginRateLimitMap = new Map<string, LoginAttemptRecord>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 60 * 1000; // 60 seconds

export function resetLoginRateLimits() {
  loginRateLimitMap.clear();
}

apiRouter.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, phoneNumber, role } = req.body;
    if (!email || !password || !firstName || !lastName || !phoneNumber) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'All registration fields are required' });
    }
    const result = await AuthService.register({ email, password, firstName, lastName, phoneNumber, role });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'REGISTRATION_FAILED' });
  }
});

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const email = (req.body.email || '').toLowerCase().trim();
  const rateLimitKey = `${ip}:${email}`;
  const now = Date.now();

  const record = loginRateLimitMap.get(rateLimitKey);
  if (record && record.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many failed login attempts. Access temporarily locked. Try again in ${remainingSeconds} seconds.`,
      retryAfterSeconds: remainingSeconds
    });
  }

  try {
    const { password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'MISSING_CREDENTIALS', message: 'Email and password are required' });
    }
    const result = await AuthService.login(email, password);
    loginRateLimitMap.delete(rateLimitKey);
    res.json(result);
  } catch (err: any) {
    const current = loginRateLimitMap.get(rateLimitKey) || { failedAttempts: 0 };
    current.failedAttempts += 1;
    if (current.failedAttempts >= MAX_LOGIN_ATTEMPTS) {
      current.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    }
    loginRateLimitMap.set(rateLimitKey, current);

    const status = err.message.includes('ACCOUNT_DISABLED') ? 403 : 401;
    res.status(status).json({ error: err.message || 'LOGIN_FAILED' });
  }
});

apiRouter.get('/auth/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await AuthService.getCurrentUser(req.user!.userId);
    res.json({ user });
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'USER_NOT_FOUND' });
  }
});

apiRouter.post('/auth/logout', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// ==========================================
// 2. CUSTOMER PROFILE ENDPOINTS
// ==========================================
apiRouter.get('/customer/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await CustomerService.getProfile(req.user!.userId);
    res.json(profile);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'PROFILE_NOT_FOUND' });
  }
});

apiRouter.put('/customer/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { firstName, lastName, phoneNumber, preferredLanguage, preferredCurrency, notificationPreferences } = req.body;
    const updated = await CustomerService.updateProfile(req.user!.userId, {
      firstName,
      lastName,
      phoneNumber,
      preferredLanguage,
      preferredCurrency,
      notificationPreferences
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'PROFILE_UPDATE_FAILED' });
  }
});

// ==========================================
// 3. CUSTOMER ADDRESSES ENDPOINTS
// ==========================================
apiRouter.get('/customer/addresses', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const addresses = await CustomerService.getAddresses(req.user!.userId);
    res.json(addresses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/customer/addresses', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { streetLine1, streetLine2, city, stateProvince, postalCode, countryCode, latitude, longitude, label, isDefault, deliveryInstructions } = req.body;
    const address = await CustomerService.createAddress(req.user!.userId, {
      streetLine1,
      streetLine2,
      city,
      stateProvince,
      postalCode,
      countryCode,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      label,
      isDefault: !!isDefault,
      deliveryInstructions
    });
    res.status(201).json(address);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'ADDRESS_CREATION_FAILED' });
  }
});

apiRouter.put('/customer/addresses/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await CustomerService.updateAddress(req.user!.userId, req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message || 'ADDRESS_UPDATE_FAILED' });
  }
});

apiRouter.delete('/customer/addresses/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await CustomerService.deleteAddress(req.user!.userId, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message || 'ADDRESS_DELETION_FAILED' });
  }
});

apiRouter.post('/customer/addresses/:id/set-default', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await CustomerService.setDefaultAddress(req.user!.userId, req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 4. TUXI EATS DISCOVERY & MENUS
// ==========================================
apiRouter.get('/eats/businesses', async (req: Request, res: Response) => {
  try {
    const businesses = await EatsService.getApprovedBusinesses();
    res.json(businesses);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'FAILED_TO_LOAD_EATS_BUSINESSES' });
  }
});

apiRouter.get('/eats/businesses/:id', async (req: Request, res: Response) => {
  try {
    const business = await EatsService.getBusinessDetail(req.params.id);
    res.json(business);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'EATS_BUSINESS_NOT_FOUND' });
  }
});

apiRouter.get('/eats/businesses/:id/menu', async (req: Request, res: Response) => {
  try {
    const menu = await EatsService.getBusinessMenu(req.params.id);
    res.json(menu);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'MENU_NOT_FOUND' });
  }
});

// ==========================================
// 4B. TUXI SHOP DISCOVERY & PRODUCT CATALOGUE (PHASE 2B)
// ==========================================
apiRouter.get('/shop/businesses', async (req: Request, res: Response) => {
  try {
    const shops = await ShopService.getApprovedShops();
    res.json(shops);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'FAILED_TO_LOAD_SHOPS' });
  }
});

apiRouter.get('/shop/businesses/:id', async (req: Request, res: Response) => {
  try {
    const shop = await ShopService.getShopDetail(req.params.id);
    res.json(shop);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'SHOP_NOT_FOUND' });
  }
});

apiRouter.get('/shop/businesses/:id/products', async (req: Request, res: Response) => {
  try {
    const products = await ShopService.getShopProducts(req.params.id);
    res.json({ businessId: req.params.id, products });
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'PRODUCTS_NOT_FOUND' });
  }
});

apiRouter.get('/shop/products/:id', async (req: Request, res: Response) => {
  try {
    const product = await ShopService.getProductDetail(req.params.id);
    res.json(product);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'PRODUCT_NOT_FOUND' });
  }
});

apiRouter.get('/shop/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string || '';
    const results = await ShopService.searchShopsAndProducts(query);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'SEARCH_FAILED' });
  }
});

// ==========================================
// 5. BASKET REPRICING & REAL ORDER CREATION
// ==========================================
apiRouter.post('/orders/reprice', async (req: Request, res: Response) => {
  try {
    const { businessId, items, tipCents } = req.body;
    const repriced = await OrderService.repriceBasket({ businessId, items, tipCents });
    res.json(repriced);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'REPRICING_FAILED' });
  }
});

apiRouter.post('/orders', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (await AdminService.isEmergencyKillSwitchActive()) {
      return res.status(503).json({ error: 'EMERGENCY_KILL_SWITCH_ACTIVE', message: 'Platform operations currently suspended under emergency controls' });
    }

    const { businessId, deliveryAddressId, deliveryAddress, items, tipCents, specialInstructions, idempotencyKey, isTestPayment } = req.body;

    const result = await OrderService.createOrder({
      customerId: req.user!.userId,
      businessId,
      deliveryAddressId,
      deliveryAddress,
      items,
      tipCents,
      specialInstructions,
      idempotencyKey,
      isTestPayment: Boolean(isTestPayment)
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'ORDER_CREATION_FAILED' });
  }
});

apiRouter.get('/orders', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orders = await OrderService.getCustomerOrders(req.user!.userId);
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'FAILED_TO_LOAD_ORDERS' });
  }
});

apiRouter.get('/orders/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = await OrderService.getOrderById(req.params.id, req.user!.userId, req.user!.roles);
    res.json(order);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 404;
    res.status(status).json({ error: err.message || 'ORDER_FETCH_FAILED' });
  }
});

apiRouter.post('/orders/:id/cancel', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const result = await OrderService.cancelOrder(req.params.id, req.user!.userId, reason);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message || 'ORDER_CANCELLATION_FAILED' });
  }
});

apiRouter.post('/orders/:id/status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetStatus } = req.body;
    const result = await OrderService.updateOrderStatus(req.params.id, targetStatus, req.user!.userId, req.user!.roles);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message || 'STATUS_UPDATE_FAILED' });
  }
});

// ==========================================
// 6. TUXI REP & BUSINESS ACQUISITION ENDPOINTS (PHASE 2D)
// ==========================================
apiRouter.post('/rep/register', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { birthDate, hasMobilePhone, hasMobileData, hasOwnTransport, transportDetails, hubAddress, termsVersionId } = req.body;
    if (!birthDate || !hubAddress) {
      return res.status(400).json({ error: 'MISSING_REP_REGISTRATION_FIELDS' });
    }

    if (process.env.SQL_HOST) {
      const result = await RepAcquisitionService.registerRep({
        userId: req.user!.userId,
        birthDate,
        hasMobilePhone: !!hasMobilePhone,
        hasMobileData: !!hasMobileData,
        hasOwnTransport: !!hasOwnTransport,
        transportDetails,
        hubAddress,
        termsVersionId,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.get('user-agent') || 'TUXI_APP'
      });
      return res.status(201).json(result);
    }

    const result = RepService.registerRep({
      userId: req.user!.userId,
      birthDate,
      hasMobilePhone: !!hasMobilePhone,
      hasMobileData: !!hasMobileData,
      hasOwnTransport: !!hasOwnTransport,
      transportDetails,
      hubAddress,
      termsVersionId: termsVersionId || 'default-terms',
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.get('user-agent') || 'TUXI_APP'
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'REP_REGISTRATION_FAILED' });
  }
});

apiRouter.get('/rep/terms/current', async (_req: Request, res: Response) => {
  try {
    const current = await RepAcquisitionService.getCurrentTermsVersion();
    res.json(current);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'TERMS_FETCH_FAILED' });
  }
});

apiRouter.post('/rep/terms/accept', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { termsVersionId, affirmativeConsent } = req.body;
    if (!termsVersionId) {
      return res.status(400).json({ error: 'MISSING_TERMS_VERSION_ID' });
    }
    if (affirmativeConsent === false) {
      return res.status(400).json({ error: 'AFFIRMATIVE_CONSENT_REQUIRED: Must affirmatively accept TUXI Rep Terms' });
    }

    // Authoritative Server-Side Clickwrap Acceptance:
    // Client cannot forge userId, repProfileId, acceptedAt, contentHash, or acceptanceMethod
    const result = await RepAcquisitionService.acceptTerms(
      req.user!.userId,
      termsVersionId,
      req.ip || '127.0.0.1',
      req.get('user-agent') || 'TUXI_APP',
      {
        affirmativeStatement: 'I have read and accept the TUXI Rep Terms',
        sessionEvidence: { tokenUserId: req.user!.userId, clientIp: req.ip }
      }
    );
    res.status(200).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'TERMS_ACCEPTANCE_FAILED' });
  }
});

apiRouter.get('/rep/territory-check', async (req: Request, res: Response) => {
  const hubLat = parseFloat(req.query.hubLat as string);
  const hubLng = parseFloat(req.query.hubLng as string);
  const bizLat = parseFloat(req.query.bizLat as string);
  const bizLng = parseFloat(req.query.bizLng as string);

  if (isNaN(hubLat) || isNaN(hubLng) || isNaN(bizLat) || isNaN(bizLng)) {
    return res.status(400).json({ error: 'INVALID_COORDINATES' });
  }

  const result = await RepService.validateTerritoryAuthoritative(hubLat, hubLng, bizLat, bizLng, 20.0);
  res.json(result);
});

// Drafts
apiRouter.post('/rep/drafts', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const draft = await RepAcquisitionService.createDraft(req.user!.userId, req.body);
    res.status(201).json(draft);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'DRAFT_CREATION_FAILED' });
  }
});

apiRouter.get('/rep/drafts', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const drafts = await RepAcquisitionService.listDrafts(req.user!.userId);
    res.json(drafts);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'DRAFTS_FETCH_FAILED' });
  }
});

apiRouter.get('/rep/drafts/:id', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const draft = await RepAcquisitionService.getDraft(req.params.id, req.user!.userId);
    res.json(draft);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : err.message.includes('NOT_FOUND') ? 404 : 400;
    res.status(status).json({ error: err.message || 'DRAFT_FETCH_FAILED' });
  }
});

apiRouter.put('/rep/drafts/:id', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const draft = await RepAcquisitionService.updateDraft(req.params.id, req.user!.userId, req.body);
    res.json(draft);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message || 'DRAFT_UPDATE_FAILED' });
  }
});

// Owner Consent
apiRouter.post('/rep/drafts/:id/consent/request-otp', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ownerPhone, ownerEmail } = req.body;
    if (!ownerPhone || !ownerEmail) {
      return res.status(400).json({ error: 'MISSING_OWNER_CONTACT' });
    }
    const result = await RepAcquisitionService.generateOwnerConsentOtp(req.params.id, req.user!.userId, ownerPhone, ownerEmail);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'CONSENT_OTP_GENERATION_FAILED' });
  }
});

apiRouter.post('/rep/drafts/:id/consent/verify-otp', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { consentId, otp } = req.body;
    if (!consentId || !otp) {
      return res.status(400).json({ error: 'MISSING_CONSENT_FIELDS' });
    }
    const result = await RepAcquisitionService.verifyOwnerConsentOtp(consentId, otp, req.user!.userId, req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'CONSENT_OTP_VERIFICATION_FAILED' });
  }
});

// Documents
apiRouter.post('/rep/drafts/:id/documents', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const doc = await RepAcquisitionService.addDocument(req.params.id, req.user!.userId, req.body);
    res.status(201).json(doc);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'DOCUMENT_UPLOAD_FAILED' });
  }
});

apiRouter.get('/rep/documents/:id', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const doc = await RepAcquisitionService.getDocument(req.params.id, req.user!.userId);
    res.json(doc);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : err.message.includes('NOT_FOUND') ? 404 : 400;
    res.status(status).json({ error: err.message || 'DOCUMENT_FETCH_FAILED' });
  }
});

// Submission
apiRouter.post('/rep/drafts/:id/submit', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const idempotencyKey = req.body.idempotencyKey || `rep-sub-${req.params.id}`;
    const result = await RepAcquisitionService.submitBusinessAcquisition(req.params.id, req.user!.userId, idempotencyKey);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'BUSINESS_SUBMISSION_FAILED' });
  }
});

// Dashboard
apiRouter.get('/rep/dashboard', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dashboard = await RepAcquisitionService.getRepDashboard(req.user!.userId);
    res.json(dashboard);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'DASHBOARD_FETCH_FAILED' });
  }
});

// AI/OCR Draft Suggestions
apiRouter.post('/rep/ocr/extract-draft', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  const result = RepAcquisitionService.extractBusinessDraftSuggestions(req.body);
  res.json(result);
});

// Legacy Onboard Business route
apiRouter.post('/rep/onboard-business', authenticateToken, requireRole('TUXI_REP', 'ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, name, legalEntityName, taxOrVatId, contactEmail, contactPhone, address, openingHours, ownerConsentObtained } = req.body;

    const result = RepService.onboardBusiness({
      repUserId: req.user!.userId,
      type,
      name,
      legalEntityName,
      taxOrVatId,
      contactEmail,
      contactPhone,
      address,
      openingHours,
      ownerConsentObtained: !!ownerConsentObtained
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'BUSINESS_ONBOARDING_FAILED' });
  }
});

// ==========================================
// 7. COMMISSION LEDGER ENDPOINTS
// ==========================================
apiRouter.post('/commissions/process-order', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, idempotencyKey } = req.body;
    if (!orderId || !idempotencyKey) {
      return res.status(400).json({ error: 'MISSING_COMMISSION_PARAMS' });
    }
    const result = CommissionService.processOrderCommission(orderId, idempotencyKey);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'COMMISSION_PROCESSING_FAILED' });
  }
});

apiRouter.post('/commissions/refund-order', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, reason, refundAmountCents, idempotencyKey } = req.body;
    const result = CommissionService.reverseOrderCommission(orderId, reason || 'Customer Refund', idempotencyKey, refundAmountCents);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'REFUND_REVERSAL_FAILED' });
  }
});

// ==========================================
// 8. ADMIN & GOVERNANCE ENDPOINTS
// ==========================================
apiRouter.get('/admin/dashboard', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = await AdminService.getAdminDashboardSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/mfa/setup', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await AdminService.setupAdminMfa(req.user!.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/admin/mfa/verify', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    const result = await AdminService.verifyAdminMfa(req.user!.userId, code);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('RATE_LIMIT') ? 429 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/admin/mfa/revoke', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mfaToken } = req.body;
    const token = mfaToken || (req.headers['x-mfa-token'] as string);
    if (!token) {
      return res.status(400).json({ error: 'MFA_TOKEN_REQUIRED' });
    }
    const result = await AdminService.revokeMfaSession(req.user!.userId, token);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/admin/role/escalate', authenticateToken, requireRole('SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetUserId, role, mfaToken } = req.body;
    const token = mfaToken || (req.headers['x-mfa-token'] as string);
    const result = await AdminService.escalateUserRole(req.user!.userId, targetUserId, role, token);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('MFA') || err.message.includes('DENIED') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/admin/business/:id/decision', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { decision, reason } = req.body;
    const result = (process.env.SQL_HOST && !process.env.FORCE_SQLITE)
      ? await AdminService.reviewBusinessApplicationPostgres(req.user!.userId, req.params.id, decision, reason)
      : AdminService.reviewBusinessApplication(req.user!.userId, req.params.id, decision, reason);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('SELF_APPROVAL') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/admin/rep/:id/verification', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { decision, reason } = req.body;
    const result = await AdminService.reviewRepVerification(req.user!.userId, req.params.id, decision, reason);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('SELF_VERIFICATION') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.get('/admin/territories/oversight', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await AdminService.getTerritoryOversightPostgis();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/territories/disputes/:id/resolve', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { decision, awardedRepId, resolutionNotes } = req.body;
    const result = await AdminService.resolveTerritoryDispute(req.user!.userId, req.params.id, decision, awardedRepId, resolutionNotes);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/admin/orders/:id/dispatch', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (await AdminService.isEmergencyKillSwitchActive()) {
      return res.status(503).json({ error: 'EMERGENCY_KILL_SWITCH_ACTIVE', message: 'Platform operations currently suspended under emergency controls' });
    }
    const { driverId } = req.body;
    const result = await AdminService.dispatchOrder(req.user!.userId, req.params.id, driverId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/admin/financial-policies/propose', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { policyKey, valueNumeric, description } = req.body;
    const result = await AdminService.proposeFinancialPolicy(req.user!.userId, policyKey, valueNumeric, description);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/admin/financial-policies/:key/review', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { decision, mfaToken } = req.body;
    const token = mfaToken || (req.headers['x-mfa-token'] as string);
    const result = await AdminService.reviewFinancialPolicy(req.user!.userId, req.params.key, decision, token);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('DUAL_AUTH') || err.message.includes('MFA') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/admin/risk-investigations', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await AdminService.createRiskInvestigation(req.user!.userId, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.put('/admin/risk-investigations/:id', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, actionTaken, notes } = req.body;
    const result = await AdminService.updateRiskInvestigation(req.user!.userId, req.params.id, status, actionTaken, notes);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/admin/recommendations/review', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { recommendationId, decision } = req.body;
    const result = await AdminService.reviewOperationalRecommendation(req.user!.userId, recommendationId, decision);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/admin/sanctions', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetUserId, sanctionType, reason, mfaToken } = req.body;
    const token = mfaToken || (req.headers['x-mfa-token'] as string);
    const result = await AdminService.applyAccountSanction(req.user!.userId, targetUserId, sanctionType, reason, token);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('SELF_SANCTION') || err.message.includes('MFA') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/admin/kill-switch', authenticateToken, requireRole('SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason, mfaToken } = req.body;
    const token = mfaToken || (req.headers['x-mfa-token'] as string);
    const result = (process.env.SQL_HOST && !process.env.FORCE_SQLITE)
      ? await AdminService.triggerEmergencyKillSwitchPostgres(req.user!.userId, reason || 'Emergency stop requested', token)
      : AdminService.triggerEmergencyKillSwitch(req.user!.userId, reason || 'Emergency stop requested');
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('MFA') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/admin/kill-switch/rollback', authenticateToken, requireRole('SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason, mfaToken } = req.body;
    const token = mfaToken || (req.headers['x-mfa-token'] as string);
    const result = await AdminService.rollbackEmergencyKillSwitchPostgres(req.user!.userId, reason || 'Emergency rollback requested', token);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('MFA') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.get('/admin/audit-logs', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const logs = (process.env.SQL_HOST && !process.env.FORCE_SQLITE)
    ? await AdminService.getAuditLogsPostgres(limit)
    : AdminService.getAuditLogs(limit);
  res.json({ logs });
});

// ==========================================
// 8B. PHASE 2C: COURIER & DELIVERY DRIVER ENDPOINTS
// ==========================================

// Driver Onboarding
apiRouter.post('/driver/onboard', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { licenseNumber, vehicleType, vehiclePlate } = req.body;
    if (!licenseNumber || !vehicleType || !vehiclePlate) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'License number, vehicle type, and plate are required' });
    }
    const profile = await DriverService.onboardDriver({
      userId: req.user!.userId,
      licenseNumber,
      vehicleType,
      vehiclePlate
    });
    res.status(201).json(profile);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Driver Profile
apiRouter.get('/driver/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await DriverService.getDriverProfileByUserId(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
    }
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Driver Availability (Online / Offline)
apiRouter.post('/driver/availability', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await DriverService.getDriverProfileByUserId(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
    }
    const { isOnline } = req.body;
    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({ error: 'INVALID_AVAILABILITY', message: 'isOnline must be a boolean' });
    }
    const result = await DriverService.updateAvailability({
      driverId: profile.id,
      isOnline
    });
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('CANNOT_GO_ONLINE') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Driver Location Update
apiRouter.post('/driver/location', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await DriverService.getDriverProfileByUserId(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
    }
    const { latitude, longitude, accuracyMeters } = req.body;
    const result = await DriverService.recordLocation({
      driverId: profile.id,
      latitude,
      longitude,
      accuracyMeters
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Available Deliveries for Online Drivers
apiRouter.get('/driver/available-deliveries', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = await postgresAdapter.pool.connect();
    try {
      const result = await client.query(`
        SELECT d.id, d.delivery_type, d.package_description, d.distance_meters,
               d.delivery_fee_cents, d.currency, d.status, d.created_at,
               pa.street_line_1 as pickup_street, pa.city as pickup_city,
               da.street_line_1 as dropoff_street, da.city as dropoff_city
        FROM deliveries d
        JOIN addresses pa ON pa.id = d.pickup_address_id
        JOIN addresses da ON da.id = d.dropoff_address_id
        WHERE d.status IN ('SEARCHING_FOR_DRIVER', 'REQUESTED')
          AND d.driver_id IS NULL
        ORDER BY d.created_at DESC
        LIMIT 20;
      `);
      res.json({ deliveries: result.rows });
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Accept Delivery Assignment
apiRouter.post('/driver/deliveries/:id/accept', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (await AdminService.isEmergencyKillSwitchActive()) {
      return res.status(503).json({ error: 'EMERGENCY_KILL_SWITCH_ACTIVE', message: 'Platform operations currently suspended under emergency controls' });
    }
    const profile = await DriverService.getDriverProfileByUserId(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
    }
    const result = await DeliveryService.acceptDeliveryAssignment(req.params.id, profile.id);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('ALREADY_ASSIGNED') ? 409 : (err.message.includes('INELIGIBLE') ? 403 : 400);
    res.status(status).json({ error: err.message });
  }
});

// Decline Delivery Assignment
apiRouter.post('/driver/deliveries/:id/decline', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await DriverService.getDriverProfileByUserId(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
    }
    const { reason } = req.body;
    const result = await DeliveryService.declineDeliveryAssignment(req.params.id, profile.id, reason);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Progress Delivery State
apiRouter.post('/driver/deliveries/:id/progress', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await DriverService.getDriverProfileByUserId(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
    }
    const { targetStatus } = req.body;
    const result = await DeliveryService.updateDriverProgression(req.params.id, profile.id, targetStatus);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Confirm Pickup with Proof Code
apiRouter.post('/driver/deliveries/:id/confirm-pickup', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await DriverService.getDriverProfileByUserId(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
    }
    const { pickupCode } = req.body;
    const result = await DeliveryService.confirmPickupWithProof(req.params.id, profile.id, pickupCode);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Confirm Delivery with Delivery OTP
apiRouter.post('/driver/deliveries/:id/confirm-delivery', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await DriverService.getDriverProfileByUserId(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
    }
    const { deliveryOtp } = req.body;
    const result = await DeliveryService.confirmDeliveryWithProof(req.params.id, profile.id, deliveryOtp);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Unassign Driver Before Pickup
apiRouter.post('/driver/deliveries/:id/unassign', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await DriverService.getDriverProfileByUserId(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
    }
    const { reason } = req.body;
    const result = await DeliveryService.unassignDriver(req.params.id, profile.id, reason || 'Driver unavailable');
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Driver Earnings
apiRouter.get('/driver/earnings', authenticateToken, requireRole('TUXI_DELIVERY_DRIVER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await DriverService.getDriverProfileByUserId(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'DRIVER_PROFILE_NOT_FOUND' });
    }
    const client = await postgresAdapter.pool.connect();
    try {
      const resData = await client.query(`
        SELECT * FROM driver_earnings
        WHERE driver_id = $1
        ORDER BY created_at DESC;
      `, [profile.id]);

      const totalRes = await client.query(`
        SELECT COALESCE(SUM(amount_cents), 0)::int as total_cents
        FROM driver_earnings
        WHERE driver_id = $1 AND status = 'EARNED';
      `, [profile.id]);

      res.json({
        totalEarnedCents: totalRes.rows[0].total_cents,
        earningsLedger: resData.rows
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Courier Quote
apiRouter.post('/courier/quote', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pickup, dropoff, packageCategory, packageDescription } = req.body;
    if (!pickup || !dropoff) {
      return res.status(400).json({ error: 'MISSING_COORDINATES', message: 'Pickup and dropoff locations required' });
    }
    const quote = await CourierService.createQuote({
      customerId: req.user!.userId,
      pickup,
      dropoff,
      packageCategory,
      packageDescription
    });
    res.json(quote);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Courier Request / Booking
apiRouter.post('/courier/request', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      quoteId,
      packageDescription,
      packageCategory,
      recipientName,
      recipientPhone,
      deliveryInstructions,
      idempotencyKey,
      testPaymentMode
    } = req.body;

    if (!quoteId || !recipientName || !recipientPhone) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Quote ID, recipient name and phone are required' });
    }

    const result = await CourierService.createCourierRequest({
      customerId: req.user!.userId,
      quoteId,
      packageDescription: packageDescription || 'Parcel',
      packageCategory,
      recipientName,
      recipientPhone,
      deliveryInstructions,
      idempotencyKey: idempotencyKey || `courier-key-${Date.now()}`,
      testPaymentMode
    });

    const status = result.isIdempotentReplay ? 200 : 201;
    res.status(status).json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Get Courier Delivery for Customer
apiRouter.get('/courier/deliveries/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const delivery = await CourierService.getCourierDeliveryForCustomer(req.params.id, req.user!.userId);
    res.json(delivery);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 404;
    res.status(status).json({ error: err.message });
  }
});

// Telemetry Driver Location (IDOR Protected)
apiRouter.get('/deliveries/:id/driver-location', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loc = await DeliveryService.getDriverLocationForDelivery(req.params.id, req.user!.userId);
    res.json(loc);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 404;
    res.status(status).json({ error: err.message });
  }
});

// Delivery Events History
apiRouter.get('/deliveries/:id/events', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const events = await DeliveryService.getDeliveryEvents(req.params.id, req.user!.userId);
    res.json({ events });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Cancel Delivery
apiRouter.post('/deliveries/:id/cancel', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const result = await DeliveryService.cancelDelivery(req.params.id, req.user!.userId, reason || 'Customer requested cancellation');
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 8C. PHASE 2E: EATS OWNER & SHOP OWNER OPERATIONS
// ==========================================

// Merchant Businesses
apiRouter.get('/merchant/businesses', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businesses = await MerchantService.getMerchantBusinesses(req.user!.userId);
    res.json(businesses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Operational Dashboard
apiRouter.get('/merchant/:id/dashboard', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dashboard = await MerchantService.getDashboard(req.user!.userId, req.params.id);
    res.json(dashboard);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : err.message.includes('NOT_FOUND') ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Operational Status Update (OPEN, PAUSED, CLOSED)
apiRouter.post('/merchant/:id/operational-status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { operationalStatus, operationalNotes, prepTimeMinutes } = req.body;
    if (!operationalStatus || !['OPEN', 'PAUSED', 'CLOSED'].includes(operationalStatus)) {
      return res.status(400).json({ error: 'INVALID_STATUS', message: 'operationalStatus must be OPEN, PAUSED, or CLOSED' });
    }
    const result = await MerchantService.updateOperationalStatus(
      req.user!.userId,
      req.params.id,
      { operationalStatus, operationalNotes, prepTimeMinutes },
      req.ip,
      req.headers['user-agent'] as string
    );
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Menu Management (Eats)
apiRouter.get('/merchant/:id/menu', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const menu = await MerchantService.getMenu(req.user!.userId, req.params.id);
    res.json(menu);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/menu/categories', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'MISSING_NAME', message: 'Category name is required' });
    const cat = await MerchantService.createMenuCategory(req.user!.userId, req.params.id, { name, sortOrder });
    res.status(201).json(cat);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.put('/merchant/:id/menu/categories/:catId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cat = await MerchantService.updateMenuCategory(req.user!.userId, req.params.id, req.params.catId, req.body);
    res.json(cat);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.delete('/merchant/:id/menu/categories/:catId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await MerchantService.deleteMenuCategory(req.user!.userId, req.params.id, req.params.catId);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/menu/items', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { categoryId, name, description, basePriceCents, currency, isAvailable, dietaryFlags, allergens, imageUrl, modifiers } = req.body;
    if (!categoryId || !name || basePriceCents === undefined) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'categoryId, name, and basePriceCents are required' });
    }
    const item = await MerchantService.createMenuItem(req.user!.userId, req.params.id, {
      categoryId, name, description, basePriceCents, currency, isAvailable, dietaryFlags, allergens, imageUrl, modifiers
    });
    res.status(201).json(item);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.put('/merchant/:id/menu/items/:itemId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await MerchantService.updateMenuItem(req.user!.userId, req.params.id, req.params.itemId, req.body);
    res.json(item);
  } catch (err: any) {
    const status = err.message.includes('CONCURRENT_MODIFICATION') ? 409 : err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/menu/items/:itemId/toggle-86', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { isAvailable } = req.body;
    const item = await MerchantService.toggleMenuItemAvailability(req.user!.userId, req.params.id, req.params.itemId, !!isAvailable);
    res.json(item);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.delete('/merchant/:id/menu/items/:itemId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await MerchantService.deleteMenuItem(req.user!.userId, req.params.id, req.params.itemId);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Product & Inventory Management (Shop)
apiRouter.get('/merchant/:id/products', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const products = await MerchantService.getProducts(req.user!.userId, req.params.id);
    res.json(products);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/products', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      sku, name, description, priceCents, salePriceCents, isOnSale, isAvailable, 
      category, initialStock, imageUrl, variants,
      weightGrams, lengthCm, widthCm, heightCm, isBulk, isWholesale
    } = req.body;
    if (!sku || !name || priceCents === undefined) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'sku, name, and priceCents are required' });
    }
    const product = await MerchantService.createProduct(req.user!.userId, req.params.id, {
      sku, name, description, priceCents, salePriceCents, isOnSale, isAvailable, category, initialStock, imageUrl, variants,
      weightGrams, lengthCm, widthCm, heightCm, isBulk, isWholesale
    });
    res.status(201).json(product);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.put('/merchant/:id/products/:productId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const product = await MerchantService.updateProduct(req.user!.userId, req.params.id, req.params.productId, req.body);
    res.json(product);
  } catch (err: any) {
    const status = err.message.includes('CONCURRENT_MODIFICATION') ? 409 : err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Stage 1: Merchant Measurement Submission for Pending Delivery Requests
apiRouter.post('/merchant/:id/orders/:orderId/measurements', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { measurements, amendmentReason, evidenceNotes } = req.body;
    const assessment = await MerchantService.submitOrderMeasurements(
      req.user!.userId,
      req.params.id,
      req.params.orderId,
      { measurements, amendmentReason, evidenceNotes }
    );
    res.json(assessment);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Stage 1: Get Order Payload Assessment & History
apiRouter.get('/orders/:orderId/payload-assessment', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    if (process.env.SQL_HOST && !process.env.FORCE_SQLITE) {
      const client = await postgresAdapter.pool.connect();
      try {
        const historyRes = await client.query(`
          SELECT * FROM order_payload_assessments 
          WHERE order_id = $1 
          ORDER BY version ASC;
        `, [orderId]);
        res.json({
          assessments: historyRes.rows,
          current: historyRes.rows[historyRes.rows.length - 1] || null
        });
      } finally {
        client.release();
      }
    } else {
      const rows = dbInstance.db.prepare(`
        SELECT * FROM order_payload_assessments 
        WHERE order_id = ? 
        ORDER BY version ASC;
      `).all(orderId);
      res.json({
        assessments: rows,
        current: rows[rows.length - 1] || null
      });
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Stage 1: Administrative Driver Capacity Certification
apiRouter.post('/admin/drivers/:driverId/capacity-certification', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await MerchantService.certifyDriverCapacity(
      req.user!.userId,
      req.params.driverId,
      req.body
    );
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Stage 1: Administrative Driver Capacity Revocation
apiRouter.post('/admin/drivers/:driverId/capacity-revocation', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const result = await MerchantService.revokeDriverCapacity(
      req.user!.userId,
      req.params.driverId,
      reason
    );
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});


apiRouter.post('/merchant/:id/products/:productId/toggle-availability', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { isAvailable } = req.body;
    const product = await MerchantService.toggleProductAvailability(req.user!.userId, req.params.id, req.params.productId, !!isAvailable);
    res.json(product);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Inventory Adjustments & Restock
apiRouter.post('/merchant/:id/inventory/adjust', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { inventoryId, productId, variantId, adjustmentType, quantityDelta, reason, idempotencyKey } = req.body;
    if (!adjustmentType || quantityDelta === undefined) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'adjustmentType and quantityDelta are required' });
    }
    const result = await MerchantService.adjustInventory(req.user!.userId, req.params.id, {
      inventoryId, productId, variantId, adjustmentType, quantityDelta, reason, idempotencyKey
    });
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.get('/merchant/:id/inventory/ledger', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const ledger = await MerchantService.getInventoryAuditLedger(req.user!.userId, req.params.id, limit);
    res.json(ledger);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.get('/merchant/:id/inventory/low-stock', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const threshold = parseInt(req.query.threshold as string) || 5;
    const alerts = await MerchantService.getLowStockAlerts(req.user!.userId, req.params.id, threshold);
    res.json(alerts);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Order Operations
apiRouter.get('/merchant/:id/orders', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = req.query.status as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const orders = await MerchantService.getOrders(req.user!.userId, req.params.id, { status, limit });
    res.json(orders);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/orders/:orderId/accept', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prepTimeMinutes } = req.body;
    const result = await MerchantService.acceptOrder(req.user!.userId, req.params.id, req.params.orderId, prepTimeMinutes);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/orders/:orderId/ready', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await MerchantService.markOrderReady(req.user!.userId, req.params.id, req.params.orderId);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/orders/:orderId/handoff', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pickupCode, driverId } = req.body;
    const result = await MerchantService.handoffToCourier(req.user!.userId, req.params.id, req.params.orderId, { pickupCode, driverId });
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/orders/:orderId/cancel', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reasonCode, reasonText } = req.body;
    if (!reasonCode || !reasonText) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'reasonCode and reasonText are required' });
    }
    const result = await MerchantService.rejectOrCancelOrder(req.user!.userId, req.params.id, req.params.orderId, { reasonCode, reasonText });
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/orders/:orderId/pack-checklist', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { packedItemIds } = req.body;
    const result = await MerchantService.updatePickPackChecklist(req.user!.userId, req.params.id, req.params.orderId, packedItemIds || []);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Promotions
apiRouter.get('/merchant/:id/promotions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const promos = await MerchantService.getPromotions(req.user!.userId, req.params.id);
    res.json(promos);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/promotions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const promo = await MerchantService.createPromotion(req.user!.userId, req.params.id, req.body);
    res.status(201).json(promo);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.put('/merchant/:id/promotions/:promoId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { isActive } = req.body;
    const promo = await MerchantService.togglePromotion(req.user!.userId, req.params.id, req.params.promoId, !!isActive);
    res.json(promo);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/promotions/evaluate', async (req: Request, res: Response) => {
  try {
    const { code, subtotalCents } = req.body;
    if (!code || subtotalCents === undefined) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'code and subtotalCents are required' });
    }
    const evalResult = await MerchantService.evaluatePromotion(req.params.id, code, subtotalCents);
    res.json(evalResult);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Analytics & Financials
apiRouter.get('/merchant/:id/analytics', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const period = (req.query.period as any) || 'WEEK';
    const analytics = await MerchantService.getAnalytics(req.user!.userId, req.params.id, period);
    res.json(analytics);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.get('/merchant/:id/financials', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fin = await MerchantService.getFinancialSummary(req.user!.userId, req.params.id);
    res.json(fin);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Staff Management
apiRouter.get('/merchant/:id/staff', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const staff = await MerchantService.getStaff(req.user!.userId, req.params.id);
    res.json(staff);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.post('/merchant/:id/staff', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetUserId, staffRole } = req.body;
    const result = await MerchantService.addStaff(req.user!.userId, req.params.id, targetUserId, staffRole);
    res.status(201).json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

apiRouter.delete('/merchant/:id/staff/:targetUserId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await MerchantService.removeStaff(req.user!.userId, req.params.id, req.params.targetUserId);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('FORBIDDEN') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 9. HARDENED ZERO-DISCLOSURE HEALTH ENDPOINT
// ==========================================
apiRouter.get('/database-status', async (req: Request, res: Response) => {
  try {
    const { postgresAdapter } = await import('../db/postgres.js');
    const health = await postgresAdapter.checkHealth();
    if (health.connected) {
      return res.json({ status: 'CONNECTED' });
    }
    return res.status(503).json({ status: 'DISCONNECTED' });
  } catch (err: any) {
    console.error('[Database Health Check Error]', err.message);
    return res.status(503).json({ status: 'DISCONNECTED' });
  }
});

// ==========================================
// 10. SAFE SYNTHETIC PAYMENT TESTING HARNESS
// ==========================================
apiRouter.post('/payments/synthetic-test', async (req: Request, res: Response) => {
  try {
    const { scenario, orderId, amountCents, currency, idempotencyKey, reason, payload } = req.body;
    let result;

    switch (scenario) {
      case 'SUCCESSFUL_AUTHORIZATION':
        result = await SyntheticPaymentHarness.simulateSuccessfulAuth({
          orderId: orderId || 'ord_synthetic_01',
          amountCents: amountCents ?? 15000,
          currency: currency || 'ZAR',
          idempotencyKey: idempotencyKey || `idem_${Date.now()}`
        });
        break;
      case 'DECLINED_PAYMENT':
        result = await SyntheticPaymentHarness.simulateDeclinedPayment({
          orderId: orderId || 'ord_synthetic_02',
          amountCents: amountCents ?? 25000,
          currency: currency || 'ZAR',
          reason: reason || 'CARD_DECLINED_INSUFFICIENT_FUNDS',
          idempotencyKey: idempotencyKey || `idem_${Date.now()}`
        });
        break;
      case 'DUPLICATE_WEBHOOK':
        result = await SyntheticPaymentHarness.simulateDuplicateWebhook(payload);
        break;
      case 'REFUND_SIMULATION':
        result = await SyntheticPaymentHarness.simulateRefund({
          paymentId: req.body.paymentId || 'pay_synth_ref_01',
          orderId: orderId || 'ord_synthetic_03',
          amountCents: amountCents ?? 5000,
          currency: currency || 'ZAR',
          reason: reason || 'CUSTOMER_REQUESTED_REFUND',
          idempotencyKey: idempotencyKey || `idem_refund_${Date.now()}`
        });
        break;
      case 'CANCELLED_TRANSACTION':
        result = await SyntheticPaymentHarness.simulateCancellation({
          orderId: orderId || 'ord_synthetic_04',
          idempotencyKey: idempotencyKey || `idem_cancel_${Date.now()}`
        });
        break;
      default:
        return res.status(400).json({ error: `UNKNOWN_SCENARIO: '${scenario}' is not a valid synthetic scenario` });
    }

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/payments/synthetic-webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-tuxi-signature'] as string;
    const rawPayload = JSON.stringify(req.body);

    const isVerified = SyntheticPaymentHarness.verifySignature(rawPayload, signature);
    if (!isVerified) {
      return res.status(401).json({ error: 'INVALID_WEBHOOK_SIGNATURE: Webhook signature verification failed' });
    }

    const { idempotencyKey } = req.body;
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'MISSING_IDEMPOTENCY_KEY: Webhook requires mandatory idempotency key' });
    }

    const result = await SyntheticPaymentHarness.simulateDuplicateWebhook(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
