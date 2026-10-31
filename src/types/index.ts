export type UserRole = 'customer' | 'rep' | 'eats_owner' | 'shop_owner' | 'driver' | 'admin';

export type BusinessType = 'eats' | 'shop';

export type BusinessStatus = 
  | 'draft' 
  | 'submitted' 
  | 'ai_checks' 
  | 'needs_information' 
  | 'under_review' 
  | 'approved' 
  | 'live' 
  | 'rejected' 
  | 'suspended';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface MenuItemModifier {
  id: string;
  name: string;
  options: { name: string; extraPrice: number }[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  isAvailable: boolean;
  imageUrl?: string;
  prepTimeMinutes?: number;
  modifiers?: MenuItemModifier[];
  posSyncedId?: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  priceDelta?: number;
  salePrice?: number;
  stock: number;
  stockCount?: number;
  inStock?: boolean;
  sku: string;
  attributes?: Record<string, any>;
  weightGrams?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  isBulk?: boolean | null;
  isWholesale?: boolean | null;
}

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  salePrice?: number;
  isOnSale?: boolean;
  sku: string;
  barcode?: string;
  stock: number;
  stockCount?: number;
  isAvailable: boolean;
  inStock?: boolean;
  variants?: ProductVariant[];
  imageUrl?: string;
  posSyncedId?: string;
  weightGrams?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  isBulk?: boolean;
  isWholesale?: boolean;
}

export type AllowedVehicleClass = 'MOTORCYCLE' | 'CAR' | 'BAKKIE';
export type RequiredVehicleClass = 'MOTORCYCLE' | 'CAR' | 'BAKKIE' | 'BAKKIE_VERIFIED_HEAVY' | 'MANUAL_ASSESSMENT';

export interface OrderPayloadLineSnapshot {
  itemId: string;
  variantId?: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitWeightGrams: number | null;
  unitLengthCm: number | null;
  unitWidthCm: number | null;
  unitHeightCm: number | null;
  isBulk: boolean;
  isWholesale: boolean;
  lineTotalWeightGrams: number | null;
  hasUnspecifiedAttributes: boolean;
}

export interface OrderPayloadAssessment {
  id: string;
  orderId: string;
  version: number;
  assessmentStatus: 'VERIFIED_COMPLETE' | 'UNASSESSED_MISSING_ATTRIBUTES';
  knownWeightGrams: number;
  unknownItemCount: number;
  totalActualWeightGrams: number | null;
  maxLengthCm: number | null;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
  totalVolumeCm3: number | null;
  parcelCount: number;
  hasBulkItem: boolean;
  hasWholesaleItem: boolean;
  hasUnspecifiedAttributes: boolean;
  eligibleVehicleClasses: AllowedVehicleClass[];
  requiredVehicleClass: RequiredVehicleClass;
  lineSnapshots: OrderPayloadLineSnapshot[];
  assessedByActorId?: string | null;
  assessedByRole: 'SYSTEM' | 'MERCHANT' | 'OPERATIONS_ADMIN';
  amendmentReason?: string | null;
  evidenceNotes?: string | null;
  previousAssessmentId?: string | null;
  createdAt: string;
}

export interface DriverCapacityCertificationInput {
  verifiedPayloadKg: number;
  cargoLengthCm?: number;
  cargoWidthCm?: number;
  cargoHeightCm?: number;
  capacityCertificateId?: string;
  capacityEvidenceDocUrl?: string;
  validityMonths?: number;
}


export interface BusinessDocument {
  id: string;
  type: 'business_license' | 'tax_cert' | 'food_hygiene' | 'id_proof' | 'menu_photo' | 'storefront_photo';
  name: string;
  fileUrl: string;
  ocrExtractedText?: string;
  confidenceScore?: number;
  verified: boolean;
  extractedFields?: Record<string, string>;
}

// POS Integration Types
export type POSProvider = 'square' | 'clover' | 'toast' | 'lightspeed' | 'shopify_pos' | 'revel' | 'custom_api';

export interface POSIntegrationConfig {
  provider: POSProvider;
  isConnected: boolean;
  merchantId: string;
  storeLocationId: string;
  autoSyncInventory: boolean;
  auto86Items: boolean;
  autoSendOrdersToKitchenKDS: boolean;
  lastSyncTimestamp: string;
  webhookStatus: 'active' | 'degraded' | 'disconnected';
}

// Monetization Plan Types
export type EatsMonetizationPlan = 'lite' | 'plus' | 'premium' | 'custom';
export type FulfillmentType = 'merchant_pack' | 'shop_and_deliver';

export interface Business {
  id: string;
  type: BusinessType;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  address: string;
  location: GeoPoint;
  city: string;
  country: string;
  distanceFromRepHubKm?: number;
  repId: string;
  repName: string;
  status: BusinessStatus;
  category: string;
  rating: number;
  reviewCount: number;
  openingHours: string;
  prepTimeMinutes: number;
  bannerImage: string;
  menuItems?: MenuItem[];
  products?: ProductItem[];
  documents: BusinessDocument[];
  consentObtained: boolean;
  ownerSignatureDate?: string;
  createdAt: string;
  updatedAt: string;
  commissionRate: number; // e.g. 20%
  salesVolumeYtd: number;
  activeOrderCount: number;
  aiRiskScore?: number; // 0 to 100, 0 = safest
  aiRiskFlags?: string[];
  rejectionReason?: string;
  missingInformationNotes?: string;
  // Monetization & POS
  eatsPlan?: EatsMonetizationPlan;
  shopFulfillmentType?: FulfillmentType;
  isNationalChain?: boolean;
  offersSelfDelivery?: boolean;
  offersPickup?: boolean;
  posConfig?: POSIntegrationConfig;
}

export type OrderType = 'eats' | 'shop' | 'courier';

export type OrderStatus = 
  | 'placed' 
  | 'accepted' 
  | 'preparing' 
  | 'ready' 
  | 'driver_assigned' 
  | 'picked_up' 
  | 'in_transit' 
  | 'delivered' 
  | 'cancelled' 
  | 'refunded';

export interface OrderCartItem {
  id: string;
  itemId: string;
  variantId?: string;
  sku?: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions?: string[];
  notes?: string;
  addedByMemberId?: string;
  addedByMemberName?: string;
}

export type SplitPaymentMode = 'by_items' | 'equal' | 'host_pays';

export interface GroupOrderMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  isHost: boolean;
  status: 'active' | 'ready' | 'paid';
  paymentMethodTitle?: string;
  amountOwed?: number;
}

export interface GroupOrderSession {
  id: string;
  code: string;
  businessId: string;
  businessName: string;
  hostId: string;
  hostName: string;
  members: GroupOrderMember[];
  splitMode: SplitPaymentMode;
  spendingLimitPerPerson?: number;
  lockStatus: 'open' | 'locked' | 'checkout';
  createdAt: string;
}

export type PaymentMethodType = 'credit_card' | 'debit_card' | 'digital_wallet' | 'apple_pay' | 'google_pay' | 'paypal';

export interface SavedPaymentMethod {
  id: string;
  type: PaymentMethodType;
  title: string;
  lastFour?: string;
  brand?: 'visa' | 'mastercard' | 'amex' | 'apple' | 'google' | 'paypal';
  expiry?: string;
  isDefault: boolean;
  tokenizedId: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  type: OrderType;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCoords: GeoPoint;
  businessId?: string;
  businessName?: string;
  businessCoords?: GeoPoint;
  items: OrderCartItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  groceryFee?: number;
  tip: number;
  total: number;
  status: OrderStatus;
  paymentMethod?: SavedPaymentMethod;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  driverCoords?: GeoPoint;
  createdAt: string;
  estimatedDeliveryTime: string;
  deliveryNotes?: string;
  fulfillmentType?: FulfillmentType;
  isPickupOrder?: boolean;
  proofOfDelivery?: {
    photoUrl?: string;
    signatureUrl?: string;
    recipientName?: string;
    timestamp: string;
  };
  courierDetails?: {
    packageType: string;
    weightKg: number;
    isFragile: boolean;
    pickupNotes: string;
    dropoffNotes: string;
  };
  isGroupOrder?: boolean;
  groupOrderDetails?: {
    code: string;
    splitMode: SplitPaymentMode;
    members: {
      id: string;
      name: string;
      email: string;
      amountPaid: number;
      paymentMethodTitle: string;
      status: 'charged' | 'authorized';
    }[];
  };
  biometricAuthDetails?: {
    verified: boolean;
    method: 'FaceID' | 'TouchID' | 'WindowsHello' | 'Passkey';
    credentialId?: string;
    verifiedAt: string;
    thresholdApplied?: number;
  };
}

// Biometric Authentication & Passkey Standards
export type BiometricAuthType = 'face_id' | 'touch_id' | 'windows_hello' | 'passkey';

export interface RegisteredPasskey {
  id: string;
  name: string;
  type: BiometricAuthType;
  createdAt: string;
  lastUsedAt?: string;
  deviceLabel: string;
  aaguid?: string;
}

export interface BiometricSecuritySettings {
  isEnabled: boolean;
  preferredType: BiometricAuthType;
  requireForLargePayments: boolean;
  largePaymentThreshold: number; // e.g. 25.00
  requireForAccountAccess: boolean;
  registeredPasskeys: RegisteredPasskey[];
}

// Background GPS Safety Tracking Modes
export type GPSTrackingMode = 'offline' | 'stationary' | 'distance_based' | 'high_precision';

export interface DriverTelemetry {
  batteryLevel: number; // 0 - 100
  isCharging: boolean;
  trackingMode: GPSTrackingMode;
  pingIntervalSeconds: number;
  metersMovedSinceLastPing: number;
  lastPingTimestamp: string;
  osBackgroundPermissionGranted: boolean;
  iosPermissionKey: 'NSLocationAlwaysAndWhenInUseUsageDescription';
  androidPermissionKey: 'ACCESS_BACKGROUND_LOCATION';
}

// AI-Powered Multi-Stop Route Optimization Types
export type RouteOptimizationObjective = 'fastest_time' | 'fuel_efficient' | 'balanced_ai';

export interface RouteStopWaypoint {
  id: string;
  orderId: string;
  orderNumber: string;
  type: 'pickup' | 'dropoff';
  title: string;
  contactName: string;
  contactPhone?: string;
  address: string;
  coords: { lat: number; lng: number };
  packageSummary: string;
  timeWindowDeadline: string; // e.g. "12:45"
  serviceDurationMinutes: number; // e.g. 3 mins at stop
  completed: boolean;
}

export interface RouteLeg {
  fromStopId: string;
  toStopId: string;
  fromName: string;
  toName: string;
  distanceKm: number;
  durationMinutes: number;
  trafficDelayMinutes: number;
  congestionLevel: 'low' | 'moderate' | 'heavy' | 'gridlock';
  trafficSpeedKmh: number;
  roadName: string;
  incidentAlert?: string;
  fuelLiters: number;
  co2Grams: number;
}

export interface MultiStopOptimizedRoute {
  id: string;
  driverId: string;
  objective: RouteOptimizationObjective;
  stops: RouteStopWaypoint[];
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  totalTrafficDelayMinutes: number;
  estimatedArrivalAtFinalStop: string;
  totalFuelLiters: number;
  fuelSavedLiters: number;
  fuelSavingsPercent: number;
  co2SavedKg: number;
  aiOptimizationInsights: string[];
  liveCongestionSeverity: 'smooth' | 'moderate' | 'severe';
  generatedAt: string;
}

export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  isOnline: boolean;
  vehicleType: 'motorcycle' | 'scooter' | 'car' | 'bakkie' | 'van' | 'light_truck';
  vehiclePlate: string;
  currentLocation: GeoPoint;
  rating: number;
  totalTrips: number;
  todayEarnings: number;
  pendingPayout: number;
  verificationStatus: 'verified' | 'pending' | 'rejected';
  telemetry: DriverTelemetry;
  documents: {
    driversLicense: boolean;
    vehicleInsurance: boolean;
    backgroundCheck: boolean;
    prdpLicenseSouthAfrica?: boolean;
    biometricSelfieVerified?: boolean;
  };
}

export interface Rep {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  hubLocation: GeoPoint;
  hubAddress: string;
  city: string;
  country: string;
  territoryRadiusKm: number; // Strictly 10km radius from approved hub
  totalAcquiredBusinesses: number;
  liveBusinessesCount: number;
  totalCommissionEarned: number;
  pendingCommission: number;
  onboardingDisputes: number;
  eligibilityVerified: boolean;
  joinedDate: string;
}

export interface AIExceptionItem {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'territory_breach' | 'document_mismatch' | 'duplicate_business' | 'unusual_payout' | 'fraud_alert' | 'low_confidence_ocr';
  entityType: 'business' | 'driver' | 'order' | 'rep';
  entityId: string;
  title: string;
  description: string;
  evidence: string;
  aiSummary: string;
  confidenceScore: number;
  recommendedNextStep: string;
  status: 'pending' | 'resolved' | 'overridden' | 'dismissed';
  createdAt: string;
  assignedAdmin?: string;
}

export interface AIWorkflowRun {
  id: string;
  timestamp: string;
  workflow: 'business_onboarding' | 'document_ocr' | 'territory_check' | 'order_dispatch' | 'fraud_screen' | 'payout_audit' | 'pos_sync';
  targetId: string;
  targetName: string;
  modelVersion: string;
  confidenceScore: number;
  actionTaken: string;
  reason: string;
  outcome: 'auto_approved' | 'escalated_to_exception' | 'auto_rejected' | 're_prompt_sent';
  humanOverridden: boolean;
}

// Global Cities & Regions
export interface GlobalCity {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  currencySymbol: string;
  currencyCode: string;
  exchangeRateToUSD: number; // Relative conversion
  centerCoords: GeoPoint;
  isLaunched: boolean;
  activeStoresCount: number;
  activeDriversCount: number;
}

export interface PlatformMonetizationSettings {
  // Eats Plans
  eatsLiteCommission: number; // 20%
  eatsPlusStandardCommission: number; // 25% (or 15-20% base)
  eatsPlusTuxiOneCommission: number; // 30%
  eatsPremiumCommission: number; // 20% flat with priority promo
  pickupDiscountCommission: number; // 5% matching in-store, 7% standard
  selfDeliveryCommission: number; // 10%
  // Shop Plans
  shopChainCommission: number; // 10%
  shopIndependentCommission: number; // 20% - 25%
  shopAndDeliverCourierSurcharge: number; // Extra 5% for aisle picking
  groceryCustomerServiceFeePercent: number; // 5%
}

export interface PlatformConfig {
  aiMasterKillSwitch: boolean; // Pause all automatic approvals
  level2AutoApprovalEnabled: boolean;
  autoApprovalMinConfidence: number; // e.g. 0.90 (90%)
  territoryStrictEnforcement: true;
  repDefaultRadiusKm: number; // Strictly 10 km
  repAcquisitionBounty: number; // e.g. $150 or £150
  repRevSharePercent: number; // 1.0% exact on eligible Rep-attributed product subtotal
  activeCityId: string;
  activeCityName: string;
  activeCountry: string;
  activeCountryCode: string;
  currencySymbol: string;
  currencyCode: string;
  exchangeRateMultiplier: number;
  monetization: PlatformMonetizationSettings;
  enforceNoCashPolicy: boolean;
}

// Regulatory & Privacy Compliance (CCPA & POPIA)
export interface LegalComplianceState {
  doNotSellMyDataCCPA: boolean;
  popiaConsentAccepted: boolean;
  popiaDataProcessingVerified: boolean;
  checkrBackgroundSharingDeclared: boolean;
  stripePayPalSharingDeclared: boolean;
  dataDeletionRequests: {
    id: string;
    requestedAt: string;
    userEmail: string;
    status: 'pending' | 'processing' | 'completed';
    retentionPurgeDate: string;
  }[];
}

// Loyalty & Rewards Program
export interface LoyaltyActivityItem {
  id: string;
  title: string;
  pointsDelta: number;
  date: string;
  type: 'order_earn' | 'reward_redeem' | 'bonus' | 'referral';
  orderNumber?: string;
}

export interface LoyaltyProfile {
  totalPoints: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  nextTierPoints: number;
  multiplier: number;
  recentActivity: LoyaltyActivityItem[];
}

// Previously Viewed Items & Search History
export interface PreviouslyViewedItem {
  id: string;
  itemId: string;
  name: string;
  price: number;
  category?: string;
  businessId: string;
  businessName: string;
  businessType: 'eats' | 'shop';
  imageUrl?: string;
  viewedAt: string;
}

// Rep & Driver Application States (Phase C2 Secure Onboarding & Banking)
export interface RepApplicationState {
  id?: string;
  status: 'NONE' | 'DRAFT' | 'PENDING' | 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';
  full_legal_name?: string;
  id_document_number?: string;
  submittedAt?: string;
  hubAddress?: string;
  hub_street_line1?: string;
  hub_city?: string;
  hub_postal_code?: string;
  transportDetails?: string;
  territoryRadiusKm?: number; // strictly 10.0
  banking_bank_name?: string;
  banking_account_number_masked?: string;
  banking_branch_code?: string;
  banking_account_holder?: string;
  banking_verification_status?: string;
  proof_of_residence_doc_id?: string;
  id_document_doc_id?: string;
  proof_of_residence_status?: string;
  rejectionReason?: string;
  rejection_reason?: string;
  reviewNotes?: string;
  review_notes?: string;
}

export interface DriverApplicationState {
  id?: string;
  status: 'NONE' | 'DRAFT' | 'PENDING' | 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';
  full_legal_name?: string;
  submittedAt?: string;
  transportType?: 'motorcycle' | 'car' | 'bakkie' | 'light_truck' | 'MOTORCYCLE' | 'CAR' | 'BAKKIE' | 'LIGHT_TRUCK';
  transport_type?: string;
  vehiclePlate?: string;
  vehicle_plate?: string;
  licenseNumber?: string;
  license_number?: string;
  banking_bank_name?: string;
  banking_account_number_masked?: string;
  banking_branch_code?: string;
  banking_account_holder?: string;
  banking_verification_status?: string;
  id_document_doc_id?: string;
  proof_of_residence_doc_id?: string;
  driver_selfie_doc_id?: string;
  driver_transport_selfie_doc_id?: string;
  drivers_license_doc_id?: string;
  vehicle_roadworthy_doc_id?: string;
  payload_cert_doc_id?: string;
  facial_liveness_status?: string;
  transport_selfie_status?: string;
  proof_of_residence_status?: string;
  vehicle_documents_status?: string;
  rejectionReason?: string;
  rejection_reason?: string;
  reviewNotes?: string;
  review_notes?: string;
}

