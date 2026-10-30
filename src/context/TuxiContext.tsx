import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiClient } from '../services/apiClient.js';
import {
  UserRole,
  Business,
  ProductItem,
  Order,
  Driver,
  Rep,
  AIExceptionItem,
  AIWorkflowRun,
  PlatformConfig,
  GeoPoint,
  OrderStatus,
  OrderCartItem,
  GlobalCity,
  SavedPaymentMethod,
  POSIntegrationConfig,
  POSProvider,
  DriverTelemetry,
  GPSTrackingMode,
  LegalComplianceState,
  PlatformMonetizationSettings,
  EatsMonetizationPlan,
  FulfillmentType,
  LoyaltyProfile,
  LoyaltyActivityItem,
  GroupOrderSession,
  GroupOrderMember,
  SplitPaymentMode,
  RepApplicationState,
  DriverApplicationState
} from '../types';
import { calculateDistanceKm, isWithinTerritory } from '../utils/geospatial';
import { GLOBAL_LAUNCHED_CITIES, detectUserLocation, formatCurrency } from '../utils/currencyAndLocation';
import { getLanguageForCountry, translateKey } from '../utils/translationService';
import { 
  detectLocationWithAI, 
  getCachedAILocation, 
  aiResultToGlobalCity, 
  AILocationResult 
} from '../utils/aiLocationService';

export interface AILocationStatus {
  isDetecting: boolean;
  lastResult: AILocationResult | null;
  error: string | null;
}

interface TuxiContextType {
  // Current active role
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;

  // Global Dark / Light Theme Mode
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;

  // AI Translation & Localization Service
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string, fallback?: string) => string;

  // Rep In-Field Mobile simulation mode toggle
  isMobileRepView: boolean;
  setIsMobileRepView: (val: boolean) => void;

  // Global City & Automatic Currency Detection
  globalCities: GlobalCity[];
  activeCity: GlobalCity;
  switchGlobalCity: (cityId: string) => void;
  launchGlobalCity: (newCity: Omit<GlobalCity, 'id' | 'isLaunched' | 'activeStoresCount' | 'activeDriversCount'>) => void;
  autoDetectLocationAndCurrency: () => void;
  triggerAILocationDetection: () => Promise<AILocationResult>;
  aiLocationStatus: AILocationStatus;
  formatPrice: (amount: number) => string;

  // Platform Configuration & Monetization Plans
  config: PlatformConfig;
  updateConfig: (newConfig: Partial<PlatformConfig>) => void;
  updateMonetization: (newMonetization: Partial<PlatformMonetizationSettings>) => void;
  toggleAIKillSwitch: () => void;

  // Rep state
  currentRep: Rep;
  allReps: Rep[];
  updateRepHub: (coords: GeoPoint, address: string) => void;

  // Businesses & Onboarding
  businesses: Business[];
  createBusinessApplication: (app: Partial<Business>) => Business;
  updateBusinessStatus: (id: string, status: Business['status'], reason?: string) => void;
  updateBusiness: (id: string, updates: Partial<Business>) => void;

  // POS Integration Services
  syncStorePOS: (businessId: string, provider?: POSProvider) => void;
  togglePOS86Item: (businessId: string, itemId: string) => void;
  connectStorePOS: (businessId: string, config: Partial<POSIntegrationConfig>) => void;

  // Orders & Customer
  orders: Order[];
  placeOrder: (newOrder: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'status'>) => Order;
  updateOrderStatus: (orderId: string, status: OrderStatus, details?: Partial<Order>) => void;
  updateOrderDeliveryNotes: (orderId: string, notes: string) => void;

  // Payment Method Management
  paymentMethods: SavedPaymentMethod[];
  selectedPaymentMethodId: string;
  setSelectedPaymentMethodId: (id: string) => void;
  addPaymentMethod: (pm: Omit<SavedPaymentMethod, 'id' | 'tokenizedId'>) => void;
  deletePaymentMethod: (id: string) => void;
  setDefaultPaymentMethod: (id: string) => void;

  // Driver Cockpit & Background GPS Safety
  currentDriver: Driver;
  allDrivers: Driver[];
  toggleDriverOnline: () => void;
  acceptJobOffer: (orderId: string) => void;
  completeDriverDelivery: (orderId: string, proof: { photoUrl?: string; signatureUrl?: string; recipientName?: string }) => void;
  simulateDriverStep: () => void;
  setDriverTrackingMode: (mode: GPSTrackingMode) => void;

  // AI Command Center & Exceptions
  exceptions: AIExceptionItem[];
  resolveException: (id: string, action: 'approve' | 'request_info' | 'reject', overrideReason?: string) => void;
  aiWorkflowRuns: AIWorkflowRun[];
  logAIAction: (run: Omit<AIWorkflowRun, 'id' | 'timestamp'>) => void;

  // Legal Compliance & Privacy (CCPA & POPIA)
  legalCompliance: LegalComplianceState;
  toggleDoNotSellCCPA: (val: boolean) => void;
  togglePOPIAConsent: (val: boolean) => void;
  requestDataDeletion: (email: string) => void;

  // Loyalty & Rewards Program
  loyaltyProfile: LoyaltyProfile;
  redeemReward: (points: number, rewardTitle: string) => boolean;

  // Cart
  cart: OrderCartItem[];
  cartBusinessId: string | null;
  addToCart: (item: OrderCartItem, businessId: string) => void;
  removeFromCart: (cartItemId: string) => void;
  updateCartQuantity: (cartItemId: string, delta: number) => void;
  clearCart: () => void;

  // Group Order & Split Payment
  groupOrderSession: GroupOrderSession | null;
  activeGroupMemberId: string;
  setActiveGroupMemberId: (id: string) => void;
  startGroupOrder: (businessId: string, businessName: string, spendingLimit?: number) => GroupOrderSession;
  joinGroupOrder: (code: string, memberName: string, memberEmail?: string) => boolean;
  addSimulatedGroupMember: (name: string, email: string, itemsToAdd?: { itemId: string; name: string; price: number }[]) => void;
  removeGroupMember: (memberId: string) => void;
  updateSplitMode: (mode: SplitPaymentMode) => void;
  cancelGroupOrder: () => void;

  // Authenticated User Identity (Phase 2A)
  currentUser: any | null;
  setCurrentUser: (u: any | null) => void;
  isSessionValidating: boolean;
  logout: () => Promise<void>;
  refreshEatsBusinesses: () => Promise<void>;
  refreshOrders: () => Promise<void>;

  // Ecosystem Role Application & Onboarding
  repApplication: RepApplicationState | null;
  driverApplication: DriverApplicationState | null;
  isRepApplicantModalOpen: boolean;
  setIsRepApplicantModalOpen: (open: boolean) => void;
  isDriverApplicantModalOpen: boolean;
  setIsDriverApplicantModalOpen: (open: boolean) => void;
  submitRepApplication: (data: any) => Promise<void>;
  submitDriverApplication: (data: any) => Promise<void>;
  refreshApplicantStatus: () => Promise<void>;
}

const DEFAULT_MONETIZATION: PlatformMonetizationSettings = {
  eatsLiteCommission: 20,
  eatsPlusStandardCommission: 25,
  eatsPlusTuxiOneCommission: 30,
  eatsPremiumCommission: 20,
  pickupDiscountCommission: 5,
  selfDeliveryCommission: 10,
  shopChainCommission: 10,
  shopIndependentCommission: 22,
  shopAndDeliverCourierSurcharge: 5,
  groceryCustomerServiceFeePercent: 5
};

const DEFAULT_CONFIG: PlatformConfig = {
  aiMasterKillSwitch: false,
  level2AutoApprovalEnabled: true,
  autoApprovalMinConfidence: 0.90,
  territoryStrictEnforcement: true,
  repDefaultRadiusKm: 10,
  repAcquisitionBounty: 150,
  repRevSharePercent: 1.5,
  activeCityId: 'city-london',
  activeCityName: 'London',
  activeCountry: 'United Kingdom',
  activeCountryCode: 'GB',
  currencySymbol: '£',
  currencyCode: 'GBP',
  exchangeRateMultiplier: 1.0,
  monetization: DEFAULT_MONETIZATION,
  enforceNoCashPolicy: true
};

const DEFAULT_REP: Rep = {
  id: 'rep-01',
  name: 'Marcus Vance',
  email: 'marcus.vance@tuxi-rep.com',
  phone: '+44 7700 900142',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80',
  hubLocation: { lat: 51.5230, lng: -0.0780 }, // Shoreditch, London
  hubAddress: '42 Redchurch Street, Shoreditch, London E2 7DD',
  city: 'London',
  country: 'United Kingdom',
  territoryRadiusKm: 10,
  totalAcquiredBusinesses: 14,
  liveBusinessesCount: 11,
  totalCommissionEarned: 3450,
  pendingCommission: 450,
  onboardingDisputes: 1,
  eligibilityVerified: true,
  joinedDate: '2026-01-15',
};

const OTHER_REPS: Rep[] = [
  DEFAULT_REP,
  {
    id: 'rep-02',
    name: 'Sarah Chen',
    email: 'sarah.chen@tuxi-rep.com',
    phone: '+44 7700 900881',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&h=200&q=80',
    hubLocation: { lat: 51.4925, lng: -0.2240 }, // Hammersmith, London
    hubAddress: '15 King Street, Hammersmith, London W6 9HR',
    city: 'London',
    country: 'United Kingdom',
    territoryRadiusKm: 10,
    totalAcquiredBusinesses: 19,
    liveBusinessesCount: 17,
    totalCommissionEarned: 4890,
    pendingCommission: 300,
    onboardingDisputes: 0,
    eligibilityVerified: true,
    joinedDate: '2025-11-20',
  },
  {
    id: 'rep-03',
    name: 'Sipho Ndlovu',
    email: 'sipho.n@tuxi-rep.co.za',
    phone: '+27 82 555 0192',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&h=200&q=80',
    hubLocation: { lat: -33.9249, lng: 18.4241 }, // Cape Town
    hubAddress: 'Kloof Street, Gardens, Cape Town, 8001',
    city: 'Cape Town',
    country: 'South Africa',
    territoryRadiusKm: 10,
    totalAcquiredBusinesses: 12,
    liveBusinessesCount: 10,
    totalCommissionEarned: 38200,
    pendingCommission: 4500,
    onboardingDisputes: 0,
    eligibilityVerified: true,
    joinedDate: '2026-02-01',
  }
];

const INITIAL_BUSINESSES: Business[] = [
  {
    id: 'biz-01',
    type: 'eats',
    name: 'Artisan Woodfire & Bowls',
    ownerName: 'Marco Rossi',
    ownerEmail: 'marco@artisanwoodfire.co.uk',
    ownerPhone: '+44 20 7946 0192',
    address: '14 Brick Lane, London E1 6RF',
    city: 'London',
    country: 'United Kingdom',
    location: { lat: 51.5205, lng: -0.0718 },
    distanceFromRepHubKm: 0.5,
    repId: 'rep-01',
    repName: 'Marcus Vance',
    status: 'live',
    category: 'Italian & Woodfired',
    rating: 4.8,
    reviewCount: 142,
    openingHours: '11:30 - 22:30',
    prepTimeMinutes: 20,
    bannerImage: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
    commissionRate: 20,
    eatsPlan: 'premium',
    offersPickup: true,
    salesVolumeYtd: 18450,
    activeOrderCount: 2,
    consentObtained: true,
    ownerSignatureDate: '2026-02-10',
    createdAt: '2026-02-10',
    updatedAt: '2026-03-01',
    posConfig: {
      provider: 'toast',
      isConnected: true,
      merchantId: 'TOAST-MERCH-8821',
      storeLocationId: 'LOC-SHOREDITCH-1',
      autoSyncInventory: true,
      auto86Items: true,
      autoSendOrdersToKitchenKDS: true,
      lastSyncTimestamp: 'Just now (Real-time Webhook)',
      webhookStatus: 'active'
    },
    documents: [
      {
        id: 'doc-01',
        type: 'business_license',
        name: 'Premises_License_Certified.pdf',
        fileUrl: 'https://example.com/license.pdf',
        ocrExtractedText: 'PREMISES LICENCE No: TH-88291\nHolder: Artisan Woodfire Ltd\nCertified Valid',
        confidenceScore: 0.98,
        verified: true
      }
    ],
    menuItems: [
      {
        id: 'item-01',
        name: 'Truffle & Wild Mushroom Sourdough Pizza',
        description: 'Fior di latte mozzarella, black truffle crema, roasted portobello, fresh thyme.',
        price: 15.50,
        category: 'Woodfired Pizza',
        isAvailable: true,
        posSyncedId: 'POS-SKU-9921',
        prepTimeMinutes: 18,
        modifiers: [
          {
            id: 'mod-01',
            name: 'Crust Preference',
            options: [
              { name: 'Standard Sourdough', extraPrice: 0 },
              { name: 'Gluten-Free Base', extraPrice: 2.50 }
            ]
          }
        ]
      },
      {
        id: 'item-02',
        name: 'Burrata Pugliese & Heirloom Tomatoes',
        description: 'Fresh cream burrata, basil pesto, cold-pressed olive oil, toasted focaccia.',
        price: 11.00,
        category: 'Antipasti',
        isAvailable: true,
        posSyncedId: 'POS-SKU-9922',
        prepTimeMinutes: 10
      },
      {
        id: 'item-03',
        name: 'San Marzano Margherita D.O.P.',
        description: 'San Marzano tomatoes, buffalo mozzarella, fresh basil, organic extra virgin olive oil.',
        price: 13.00,
        category: 'Woodfired Pizza',
        isAvailable: true,
        posSyncedId: 'POS-SKU-9923',
        prepTimeMinutes: 15
      }
    ]
  },
  {
    id: 'biz-02',
    type: 'eats',
    name: 'Kintaro Craft Ramen Bar',
    ownerName: 'Kenji Takahashi',
    ownerEmail: 'kenji@kintaroramen.co.uk',
    ownerPhone: '+44 20 7946 0418',
    address: '88 Commercial Street, Spitalfields, London E1 6LZ',
    city: 'London',
    country: 'United Kingdom',
    location: { lat: 51.5188, lng: -0.0754 },
    distanceFromRepHubKm: 0.6,
    repId: 'rep-01',
    repName: 'Marcus Vance',
    status: 'live',
    category: 'Japanese & Ramen',
    rating: 4.9,
    reviewCount: 310,
    openingHours: '12:00 - 23:00',
    prepTimeMinutes: 25,
    bannerImage: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
    commissionRate: 25,
    eatsPlan: 'plus',
    salesVolumeYtd: 24900,
    activeOrderCount: 1,
    consentObtained: true,
    createdAt: '2026-01-22',
    updatedAt: '2026-03-05',
    posConfig: {
      provider: 'square',
      isConnected: true,
      merchantId: 'SQ-KINTARO-99',
      storeLocationId: 'SQ-LOC-LDN',
      autoSyncInventory: true,
      auto86Items: true,
      autoSendOrdersToKitchenKDS: true,
      lastSyncTimestamp: '3 mins ago',
      webhookStatus: 'active'
    },
    documents: [],
    menuItems: [
      {
        id: 'item-201',
        name: '24hr Tonkotsu Black Garlic Ramen',
        description: 'Rich pork bone broth, chashu pork belly, nitamago egg, black garlic oil.',
        price: 16.00,
        category: 'Ramen Bowls',
        isAvailable: true,
        posSyncedId: 'SQ-RAMEN-01',
        prepTimeMinutes: 20
      },
      {
        id: 'item-202',
        name: 'Crispy Wagyu Gyoza (5 pcs)',
        description: 'Pan-fried Japanese dumplings with minced wagyu beef and ponzu.',
        price: 8.50,
        category: 'Starters',
        isAvailable: true,
        posSyncedId: 'SQ-GYOZA-02',
        prepTimeMinutes: 12
      }
    ]
  },
  {
    id: 'biz-03',
    type: 'shop',
    name: 'Green Orchard Organic Market',
    ownerName: 'Clara Oswald',
    ownerEmail: 'clara@greenorchard.co.uk',
    ownerPhone: '+44 20 7946 0883',
    address: '64 Bethnal Green Rd, London E1 6GQ',
    city: 'London',
    country: 'United Kingdom',
    location: { lat: 51.5245, lng: -0.0722 },
    distanceFromRepHubKm: 0.4,
    repId: 'rep-01',
    repName: 'Marcus Vance',
    status: 'live',
    category: 'Organic Groceries & Produce',
    rating: 4.7,
    reviewCount: 94,
    openingHours: '08:00 - 21:00',
    prepTimeMinutes: 15,
    bannerImage: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80',
    commissionRate: 22,
    shopFulfillmentType: 'merchant_pack',
    salesVolumeYtd: 12800,
    activeOrderCount: 0,
    consentObtained: true,
    createdAt: '2026-02-14',
    updatedAt: '2026-02-28',
    posConfig: {
      provider: 'shopify_pos',
      isConnected: true,
      merchantId: 'SHPFY-GREENORCHARD',
      storeLocationId: 'SHOPIFY-LOC-BETHNAL',
      autoSyncInventory: true,
      auto86Items: true,
      autoSendOrdersToKitchenKDS: false,
      lastSyncTimestamp: '2 mins ago',
      webhookStatus: 'active'
    },
    documents: [],
    products: [
      {
        id: 'prod-01',
        name: 'Organic Sourdough Loaf (800g)',
        category: 'Bakery',
        description: 'Slow-fermented wild yeast country loaf baked daily.',
        price: 4.50,
        sku: 'BAK-SRD-800',
        stock: 18,
        isAvailable: true,
        posSyncedId: 'SHP-SKU-101'
      },
      {
        id: 'prod-02',
        name: 'Raw Unfiltered Wildflower Honey (350g)',
        category: 'Pantry',
        description: 'Locally harvested honey, unpasteurized and cold-extracted.',
        price: 7.20,
        sku: 'PAN-HNY-350',
        stock: 24,
        isAvailable: true,
        posSyncedId: 'SHP-SKU-102'
      }
    ]
  },
  {
    id: 'biz-04',
    type: 'shop',
    name: 'MediCare Express Pharmacy',
    ownerName: 'Dr. Tariq Khan',
    ownerEmail: 'tariq@medicareexpress.co.uk',
    ownerPhone: '+44 20 7946 0521',
    address: '110 Old Street, London EC1V 9BD',
    city: 'London',
    country: 'United Kingdom',
    location: { lat: 51.5255, lng: -0.0935 },
    distanceFromRepHubKm: 1.1,
    repId: 'rep-01',
    repName: 'Marcus Vance',
    status: 'live',
    category: 'Pharmacy & Wellness',
    rating: 4.9,
    reviewCount: 165,
    openingHours: '08:00 - 22:00',
    prepTimeMinutes: 10,
    bannerImage: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=800&q=80',
    commissionRate: 10, // Chain custom
    isNationalChain: true,
    shopFulfillmentType: 'shop_and_deliver',
    salesVolumeYtd: 31000,
    activeOrderCount: 1,
    consentObtained: true,
    createdAt: '2026-01-30',
    updatedAt: '2026-03-02',
    posConfig: {
      provider: 'clover',
      isConnected: true,
      merchantId: 'CLVR-MEDICARE-01',
      storeLocationId: 'CLVR-LOC-OLDST',
      autoSyncInventory: true,
      auto86Items: true,
      autoSendOrdersToKitchenKDS: false,
      lastSyncTimestamp: '1 min ago',
      webhookStatus: 'active'
    },
    documents: [],
    products: [
      {
        id: 'prod-101',
        name: 'Vitamin D3 + K2 Complex (90 caps)',
        category: 'Vitamins',
        description: 'High potency vegetarian formula for bone and immune health.',
        price: 12.99,
        sku: 'MED-VIT-D3',
        stock: 45,
        isAvailable: true,
        posSyncedId: 'CLV-SKU-9901'
      }
    ]
  }
];

const INITIAL_PAYMENT_METHODS: SavedPaymentMethod[] = [
  {
    id: 'pm-01',
    type: 'credit_card',
    title: 'Visa Platinum',
    lastFour: '4242',
    brand: 'visa',
    expiry: '08/28',
    isDefault: true,
    tokenizedId: 'tok_visa_4242_pci_dss'
  },
  {
    id: 'pm-02',
    type: 'digital_wallet',
    title: 'Apple Pay',
    brand: 'apple',
    isDefault: false,
    tokenizedId: 'tok_applepay_secure_enclave'
  },
  {
    id: 'pm-03',
    type: 'digital_wallet',
    title: 'Google Pay',
    brand: 'google',
    isDefault: false,
    tokenizedId: 'tok_gpay_wallet_token'
  },
  {
    id: 'pm-04',
    type: 'debit_card',
    title: 'Mastercard Debit',
    lastFour: '8831',
    brand: 'mastercard',
    expiry: '11/27',
    isDefault: false,
    tokenizedId: 'tok_mc_8831_debit'
  }
];

const INITIAL_DRIVERS: Driver[] = [
  {
    id: 'drv-01',
    name: 'Alex Turner',
    email: 'alex.t@tuxi-delivery.com',
    phone: '+44 7700 900512',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&h=200&q=80',
    isOnline: true,
    vehicleType: 'scooter',
    vehiclePlate: 'LD24 TUX',
    currentLocation: { lat: 51.5218, lng: -0.0740 },
    rating: 4.92,
    totalTrips: 648,
    todayEarnings: 84.50,
    pendingPayout: 320.00,
    verificationStatus: 'verified',
    telemetry: {
      batteryLevel: 86,
      isCharging: false,
      trackingMode: 'distance_based',
      pingIntervalSeconds: 30,
      metersMovedSinceLastPing: 22,
      lastPingTimestamp: '12s ago',
      osBackgroundPermissionGranted: true,
      iosPermissionKey: 'NSLocationAlwaysAndWhenInUseUsageDescription',
      androidPermissionKey: 'ACCESS_BACKGROUND_LOCATION'
    },
    documents: {
      driversLicense: true,
      vehicleInsurance: true,
      backgroundCheck: true,
      biometricSelfieVerified: true
    }
  },
  {
    id: 'drv-02',
    name: 'Maya Patel',
    email: 'maya.p@tuxi-delivery.com',
    phone: '+44 7700 900892',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&h=200&q=80',
    isOnline: true,
    vehicleType: 'scooter',
    vehiclePlate: 'LD24-SCT',
    currentLocation: { lat: 51.5240, lng: -0.0810 },
    rating: 4.88,
    totalTrips: 412,
    todayEarnings: 62.00,
    pendingPayout: 210.50,
    verificationStatus: 'verified',
    telemetry: {
      batteryLevel: 94,
      isCharging: true,
      trackingMode: 'distance_based',
      pingIntervalSeconds: 30,
      metersMovedSinceLastPing: 0,
      lastPingTimestamp: '5s ago',
      osBackgroundPermissionGranted: true,
      iosPermissionKey: 'NSLocationAlwaysAndWhenInUseUsageDescription',
      androidPermissionKey: 'ACCESS_BACKGROUND_LOCATION'
    },
    documents: {
      driversLicense: true,
      vehicleInsurance: true,
      backgroundCheck: true,
      biometricSelfieVerified: true
    }
  }
];

const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-101',
    orderNumber: 'TX-8921',
    type: 'eats',
    customerId: 'cust-01',
    customerName: 'Emma Watson',
    customerPhone: '+44 7700 900111',
    customerAddress: '24 City Road, Islington, London EC1Y 2AJ',
    customerCoords: { lat: 51.5250, lng: -0.0870 },
    businessId: 'biz-01',
    businessName: 'Artisan Woodfire & Bowls',
    businessCoords: { lat: 51.5205, lng: -0.0718 },
    items: [
      {
        id: 'c-item-1',
        itemId: 'item-01',
        name: 'Truffle & Wild Mushroom Sourdough Pizza',
        price: 15.50,
        quantity: 1
      },
      {
        id: 'c-item-2',
        itemId: 'item-02',
        name: 'Burrata Pugliese & Heirloom Tomatoes',
        price: 11.00,
        quantity: 1
      }
    ],
    subtotal: 26.50,
    deliveryFee: 2.99,
    serviceFee: 1.50,
    tip: 3.00,
    total: 33.99,
    status: 'in_transit',
    paymentMethod: INITIAL_PAYMENT_METHODS[0],
    driverId: 'drv-01',
    driverName: 'Alex Turner',
    driverPhone: '+44 7700 900512',
    driverCoords: { lat: 51.5228, lng: -0.0792 },
    createdAt: '2026-03-28T10:15:00Z',
    estimatedDeliveryTime: '10:48 AM',
    deliveryNotes: 'Please ring bell 4B on the 2nd floor.'
  }
];

const INITIAL_EXCEPTIONS: AIExceptionItem[] = [
  {
    id: 'exc-01',
    priority: 'critical',
    type: 'territory_breach',
    entityType: 'business',
    entityId: 'biz-05',
    title: 'Out-of-Territory Registration Claimed',
    description: 'Rep Marcus Vance attempted to submit Kensington Grand Bistro located 22.4 km from assigned home hub (Policy limit: 20.0 km).',
    evidence: 'Distance: 22.4 km. Rep Hub: Shoreditch (51.5230, -0.0780). Breaches autonomous approval boundary.',
    aiSummary: 'Geospatial engine blocked autonomous approval. Lead belongs to Sarah Chen (West London).',
    confidenceScore: 0.99,
    recommendedNextStep: 'Deny claim or reassign business to West London Rep.',
    status: 'pending',
    createdAt: '2026-03-27T14:32:00Z'
  }
];

const INITIAL_AI_RUNS: AIWorkflowRun[] = [
  {
    id: 'airun-pos-01',
    timestamp: '2026-03-28T10:31:00Z',
    workflow: 'pos_sync',
    targetId: 'biz-01',
    targetName: 'Artisan Woodfire Toast POS Sync',
    modelVersion: 'tuxi-pos-bridge-v3',
    confidenceScore: 0.99,
    actionTaken: 'Synchronized 3 menu items and live order #TX-8921 to Toast Kitchen Display System (KDS).',
    reason: 'Toast Webhook handshake validated token.',
    outcome: 'auto_approved',
    humanOverridden: false
  }
];

const INITIAL_LEGAL_COMPLIANCE: LegalComplianceState = {
  doNotSellMyDataCCPA: false,
  popiaConsentAccepted: true,
  popiaDataProcessingVerified: true,
  checkrBackgroundSharingDeclared: true,
  stripePayPalSharingDeclared: true,
  dataDeletionRequests: []
};

const INITIAL_LOYALTY: LoyaltyProfile = {
  totalPoints: 1480,
  tier: 'Gold',
  nextTierPoints: 2000,
  multiplier: 1.5,
  recentActivity: [
    {
      id: 'act-1',
      title: 'Order #TX-8921 (Artisan Woodfire & Bowls)',
      pointsDelta: 140,
      date: 'Today, 10:15 AM',
      type: 'order_earn',
      orderNumber: 'TX-8921'
    },
    {
      id: 'act-2',
      title: 'Order #TX-8820 (MediCare Pharmacy)',
      pointsDelta: 85,
      date: 'Yesterday, 3:45 PM',
      type: 'order_earn',
      orderNumber: 'TX-8820'
    },
    {
      id: 'act-3',
      title: 'Redeemed £5.00 Off Delivery Voucher',
      pointsDelta: -500,
      date: '25 Mar 2026',
      type: 'reward_redeem'
    },
    {
      id: 'act-4',
      title: 'TUXI Welcome & Onboarding Reward',
      pointsDelta: 200,
      date: '20 Mar 2026',
      type: 'bonus'
    }
  ]
};

const TuxiContext = createContext<TuxiContextType | undefined>(undefined);

export const TuxiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Authenticated User Identity (Phase 2A & AUTH-1A)
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isSessionValidating, setIsSessionValidating] = useState<boolean>(true);
  const [activeRole, setActiveRoleState] = useState<UserRole>('customer');

  const setActiveRole = (newRole: UserRole) => {
    if (!currentUser) {
      console.warn('[Role Security] Cannot switch roles without authentication');
      return;
    }
    const backendRoles: string[] = Array.isArray(currentUser.roles) ? currentUser.roles : ['CUSTOMER'];
    const rolePermissionMap: Record<UserRole, string[]> = {
      customer: ['CUSTOMER'],
      driver: ['TUXI_DELIVERY_DRIVER'],
      eats_owner: ['TUXI_EATS_OWNER'],
      shop_owner: ['TUXI_SHOP_OWNER'],
      rep: ['TUXI_REP'],
      admin: ['ADMIN', 'SUPER_ADMIN']
    };

    const allowedBackendRoles = rolePermissionMap[newRole] || [];
    const hasPermission = allowedBackendRoles.some(r => backendRoles.includes(r));

    if (hasPermission) {
      setActiveRoleState(newRole);
    } else {
      console.warn(`[Role Security] User ${currentUser.email} is not authorized for role ${newRole}`);
    }
  };

  const [isMobileRepView, setIsMobileRepView] = useState<boolean>(false);

  const safeGetStorage = (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem(key);
      }
    } catch (err) {
      // Graceful fallback for restricted storage environments
    }
    return null;
  };

  const safeSetStorage = (key: string, val: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, val);
      }
    } catch (err) {
      // Graceful fallback for restricted storage environments
    }
  };

  // Ecosystem Role Application Modals & State
  const [isRepApplicantModalOpen, setIsRepApplicantModalOpen] = useState<boolean>(false);
  const [isDriverApplicantModalOpen, setIsDriverApplicantModalOpen] = useState<boolean>(false);

  // Server-Authoritative Applicant State (Zero shared localStorage persistence)
  const [repApplication, setRepApplication] = useState<RepApplicationState | null>(null);
  const [driverApplication, setDriverApplication] = useState<DriverApplicationState | null>(null);

  const refreshApplicantStatus = async () => {
    try {
      const token = safeGetStorage('tuxi_auth_token');
      if (!token) {
        setRepApplication(null);
        setDriverApplication(null);
        return;
      }
      const res = await fetch('/api/applicant/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRepApplication(data.repApplication);
        setDriverApplication(data.driverApplication);
      } else {
        setRepApplication(null);
        setDriverApplication(null);
      }
    } catch (err) {
      console.warn('[Applicant Status Refresh]', err);
    }
  };

  const submitRepApplication = async (data: any) => {
    const token = safeGetStorage('tuxi_auth_token');
    if (!token) throw new Error('UNAUTHENTICATED: Please log in before submitting an application');

    const res = await fetch('/api/applicant/rep/apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        birthDate: data.birthDate,
        contactPhone: data.contactPhone || data.phone || currentUser?.phone || '+27820000000',
        hasMobilePhone: !!data.hasMobilePhone,
        hasMobileData: !!data.hasMobileData,
        hasOwnTransport: !!data.hasOwnTransport,
        transportDetails: data.transportDetails || 'Personal Car',
        residentialAddress: data.residentialAddress || {
          line1: data.hubAddress?.streetLine1 || '123 Main Rd',
          city: data.hubAddress?.city || 'Cape Town',
          postalCode: data.hubAddress?.postalCode || '8001',
          country: 'ZA'
        },
        hubAddress: {
          line1: data.hubAddress?.streetLine1 || 'Registered Home Hub',
          city: data.hubAddress?.city || 'Cape Town',
          postalCode: data.hubAddress?.postalCode || '8001',
          latitude: data.hubAddress?.latitude || -33.9249,
          longitude: data.hubAddress?.longitude || 18.4241
        },
        termsVersionId: 'v2.1-rep-terms-2026'
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Rep application submission failed');
    }

    await refreshApplicantStatus();
  };

  const submitDriverApplication = async (data: any) => {
    const token = safeGetStorage('tuxi_auth_token');
    if (!token) throw new Error('UNAUTHENTICATED: Please log in before submitting an application');

    const res = await fetch('/api/applicant/driver/apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        transportType: data.transportType,
        licenseNumber: data.licenseNumber,
        vehiclePlate: data.vehiclePlate,
        vehicleMakeModel: data.vehicleMakeModel,
        contactPhone: data.phone || currentUser?.phone || '+27820000000',
        idDocumentNumber: data.idDocumentNumber,
        safetyGearConfirmed: data.safetyGearConfirmed !== false,
        backgroundCheckConsent: data.backgroundCheckConsent !== false,
        safetyCharterConsent: data.safetyCharterConsent !== false,
        roadworthyInsuranceConfirmed: data.roadworthyInsuranceConfirmed !== false
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Driver application submission failed');
    }

    await refreshApplicantStatus();
  };

  // Global Theme Mode (Dark / Light) with session persistence
  // Authoritative Policy: Default to Light Mode for all new users on first launch.
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = safeGetStorage('tuxi_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
      } else {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
      }
      safeSetStorage('tuxi_theme', theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
  };

  // Global Cities & Worldwide Launcher State
  const [globalCities, setGlobalCities] = useState<GlobalCity[]>(() => {
    const saved = safeGetStorage('tuxi_global_cities');
    return saved ? JSON.parse(saved) : GLOBAL_LAUNCHED_CITIES;
  });

  const [activeCity, setActiveCity] = useState<GlobalCity>(() => {
    const saved = safeGetStorage('tuxi_active_city');
    if (saved) return JSON.parse(saved);
    return detectUserLocation();
  });

  // AI Translation & Localization Service State
  const [language, setLanguageState] = useState<string>(() => {
    const saved = safeGetStorage('tuxi_app_language');
    if (saved) return saved;
    const loc = detectUserLocation();
    return getLanguageForCountry(loc.countryCode);
  });

  const setLanguage = (newLang: string) => {
    setLanguageState(newLang);
    localStorage.setItem('tuxi_app_language', newLang);
  };

  const t = (key: string, fallback?: string): string => {
    return translateKey(key, language, fallback);
  };

  const [config, setConfig] = useState<PlatformConfig>(() => {
    const saved = localStorage.getItem('tuxi_config');
    if (saved) return JSON.parse(saved);
    const loc = detectUserLocation();
    return {
      ...DEFAULT_CONFIG,
      activeCityId: loc.id,
      activeCityName: loc.city,
      activeCountry: loc.country,
      activeCountryCode: loc.countryCode,
      currencySymbol: loc.currencySymbol,
      currencyCode: loc.currencyCode
    };
  });

  const [currentRep, setCurrentRep] = useState<Rep>(() => {
    const saved = localStorage.getItem('tuxi_current_rep');
    return saved ? JSON.parse(saved) : DEFAULT_REP;
  });

  const [allReps, setAllReps] = useState<Rep[]>(OTHER_REPS);

  const [businesses, setBusinesses] = useState<Business[]>(() => {
    const saved = localStorage.getItem('tuxi_businesses');
    return saved ? JSON.parse(saved) : INITIAL_BUSINESSES;
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('tuxi_orders');
    return saved ? JSON.parse(saved) : INITIAL_ORDERS;
  });

  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[]>(() => {
    const saved = localStorage.getItem('tuxi_payment_methods');
    return saved ? JSON.parse(saved) : INITIAL_PAYMENT_METHODS;
  });

  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>(() => {
    const defaultPm = paymentMethods.find(p => p.isDefault) || paymentMethods[0];
    return defaultPm ? defaultPm.id : '';
  });

  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS);
  const [currentDriver, setCurrentDriver] = useState<Driver>(INITIAL_DRIVERS[0]);

  const [exceptions, setExceptions] = useState<AIExceptionItem[]>(() => {
    const saved = localStorage.getItem('tuxi_exceptions');
    return saved ? JSON.parse(saved) : INITIAL_EXCEPTIONS;
  });

  const [aiWorkflowRuns, setAiWorkflowRuns] = useState<AIWorkflowRun[]>(() => {
    const saved = localStorage.getItem('tuxi_ai_runs');
    return saved ? JSON.parse(saved) : INITIAL_AI_RUNS;
  });

  const [legalCompliance, setLegalCompliance] = useState<LegalComplianceState>(() => {
    const saved = localStorage.getItem('tuxi_legal');
    return saved ? JSON.parse(saved) : INITIAL_LEGAL_COMPLIANCE;
  });

  const [loyaltyProfile, setLoyaltyProfile] = useState<LoyaltyProfile>(() => {
    const saved = localStorage.getItem('tuxi_loyalty');
    return saved ? JSON.parse(saved) : INITIAL_LOYALTY;
  });

  const refreshEatsBusinesses = async () => {
    try {
      const pgBusinesses = await ApiClient.getEatsBusinesses();
      if (pgBusinesses && Array.isArray(pgBusinesses) && pgBusinesses.length > 0) {
        setBusinesses(prev => {
          const nonEats = prev.filter(b => b.type !== 'eats');
          const mappedEats: Business[] = pgBusinesses.map(pb => ({
            id: pb.id,
            type: 'eats' as const,
            name: pb.name,
            ownerName: 'Verified Partner',
            ownerEmail: 'orders@tuxi.co.za',
            ownerPhone: '+27214240001',
            address: `${pb.address?.streetLine1 || 'Kloof St'}, ${pb.address?.city || 'Cape Town'}`,
            location: { lat: pb.address?.latitude || -33.9300, lng: pb.address?.longitude || 18.4200 },
            city: pb.address?.city || 'Cape Town',
            country: 'South Africa',
            repId: 'rep-01',
            repName: 'Marcus Rivera',
            status: 'live' as const,
            category: (pb.cuisineTypes && pb.cuisineTypes.length > 0) ? pb.cuisineTypes.join(' & ') : 'Gourmet Cuisine',
            rating: 4.9,
            reviewCount: 142,
            openingHours: '11:00 - 22:00',
            prepTimeMinutes: pb.prepTimeMinutes || 25,
            bannerImage: pb.bannerUrl || pb.imageUrl || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
            commissionRate: 20,
            eatsPlan: 'plus' as const,
            salesVolumeYtd: 38400,
            activeOrderCount: 0,
            consentObtained: true,
            createdAt: '2026-01-15',
            updatedAt: '2026-03-01',
            documents: [],
            menuItems: []
          }));
          return [...mappedEats, ...nonEats];
        });
      }
    } catch (err) {
      console.warn('[Eats Refresh Error]', err);
    }
  };

  const refreshShopBusinesses = async () => {
    try {
      const pgShops = await ApiClient.getShopBusinesses();
      if (pgShops && Array.isArray(pgShops) && pgShops.length > 0) {
        // Fetch products for each shop concurrently
        const shopWithProducts = await Promise.all(pgShops.map(async (ps) => {
          let prods: any[] = [];
          try {
            const pRes = await ApiClient.getShopProducts(ps.id);
            prods = pRes.products || [];
          } catch {
            prods = [];
          }

          const mappedProducts: ProductItem[] = prods.map(p => ({
            id: p.id,
            name: p.name,
            category: p.category,
            price: (p.effectivePriceCents || p.priceCents) / 100,
            description: p.description,
            imageUrl: p.imageUrl || 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=500&q=80',
            stock: p.stockAvailable || 0,
            stockCount: p.stockAvailable || 0,
            isAvailable: Boolean(p.isAvailable && p.stockAvailable > 0),
            inStock: Boolean(p.isAvailable && p.stockAvailable > 0),
            sku: p.sku,
            isOnSale: p.isOnSale,
            salePrice: p.salePriceCents ? p.salePriceCents / 100 : undefined,
            variants: p.variants?.map((v: any) => ({
              id: v.id,
              name: v.variantName,
              sku: v.variantSku,
              price: ((p.effectivePriceCents || p.priceCents) + (v.priceDeltaCents || 0)) / 100,
              priceDelta: (v.priceDeltaCents || 0) / 100,
              stock: v.stockAvailable || 0,
              stockCount: v.stockAvailable || 0,
              attributes: v.attributes,
              inStock: Boolean(v.isAvailable && v.stockAvailable > 0)
            })) || []
          }));

          return {
            id: ps.id,
            type: 'shop' as const,
            name: ps.name,
            ownerName: 'Verified Retail Partner',
            ownerEmail: 'retail@tuxi.co.za',
            ownerPhone: '+27214241122',
            address: `${ps.address?.streetLine1 || 'Kloof St'}, ${ps.address?.city || 'Cape Town'}`,
            location: { lat: ps.address?.latitude || -33.9310, lng: ps.address?.longitude || 18.4190 },
            city: ps.address?.city || 'Cape Town',
            country: 'South Africa',
            repId: 'rep-01',
            repName: 'Marcus Rivera',
            status: 'live' as const,
            category: ps.category || 'Retail & Goods',
            rating: 4.8,
            reviewCount: 96,
            openingHours: '08:00 - 20:00',
            prepTimeMinutes: 30,
            bannerImage: ps.bannerUrl || ps.imageUrl || 'https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=1200&q=80',
            commissionRate: 15,
            salesVolumeYtd: 42100,
            activeOrderCount: 0,
            consentObtained: true,
            createdAt: '2026-01-15',
            updatedAt: '2026-03-01',
            documents: [],
            menuItems: [],
            products: mappedProducts
          } as Business;
        }));

        setBusinesses(prev => {
          const nonShops = prev.filter(b => b.type !== 'shop');
          return [...nonShops, ...shopWithProducts];
        });
      }
    } catch (err) {
      console.warn('[Shop Refresh Error]', err);
    }
  };

  const refreshOrders = async () => {
    try {
      const token = ApiClient.getToken();
      if (token) {
        const pgOrders = await ApiClient.getOrders();
        if (pgOrders && Array.isArray(pgOrders) && pgOrders.length > 0) {
          setOrders(prev => {
            const mappedPgOrders: Order[] = pgOrders.map(po => ({
              id: po.id,
              orderNumber: po.orderNumber,
              type: 'eats' as const,
              businessId: po.businessId,
              businessName: po.businessName,
              businessCoords: { lat: -33.9300, lng: 18.4200 },
              customerAddress: 'Saved Delivery Address',
              customerCoords: { lat: -33.9249, lng: 18.4241 },
              customerId: po.customerId || 'cust-pg',
              customerName: 'Customer',
              customerPhone: '+27821234567',
              items: po.items?.map((i: any) => ({
                id: `item-${Date.now()}-${Math.random()}`,
                name: i.name,
                price: (i.unitPriceCents || 0) / 100,
                quantity: i.quantity
              })) || [],
              subtotal: (po.subtotalCents || 0) / 100,
              tip: (po.tipCents || 0) / 100,
              deliveryFee: 25.0,
              serviceFee: 1.5,
              total: (po.totalCents || 0) / 100,
              status: (po.status?.toLowerCase() || 'placed') as any,
              createdAt: po.createdAt,
              estimatedDeliveryTime: '30-40 min',
              isPickupOrder: false
            }));

            const existingIds = new Set(mappedPgOrders.map(o => o.id));
            const remainingLocal = prev.filter(o => !existingIds.has(o.id));
            return [...mappedPgOrders, ...remainingLocal];
          });
        }
      }
    } catch (err) {
      console.warn('[Orders Refresh Error]', err);
    }
  };

  useEffect(() => {
    const initData = async () => {
      try {
        const token = ApiClient.getToken();
        if (token) {
          const me = await ApiClient.getMe();
          if (me && me.user) {
            setCurrentUser(me.user);
          } else {
            ApiClient.clearToken();
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        console.warn('[Session Init]', err);
        ApiClient.clearToken();
        setCurrentUser(null);
      } finally {
        setIsSessionValidating(false);
      }
      await refreshEatsBusinesses();
      await refreshShopBusinesses();
    };

    initData();
  }, []);

  useEffect(() => {
    if (currentUser) {
      refreshOrders();
      refreshApplicantStatus();
    } else {
      setRepApplication(null);
      setDriverApplication(null);
    }
  }, [currentUser]);

  const logout = async () => {
    try {
      await ApiClient.logout();
    } catch (_) {}
    ApiClient.clearToken();
    setCurrentUser(null);
    setRepApplication(null);
    setDriverApplication(null);
    setActiveRoleState('customer');
  };

  // Cart state
  const [cart, setCart] = useState<OrderCartItem[]>([]);
  const [cartBusinessId, setCartBusinessId] = useState<string | null>(null);

  // Group Order & Split Payment State
  const [groupOrderSession, setGroupOrderSession] = useState<GroupOrderSession | null>(() => {
    const saved = localStorage.getItem('tuxi_group_order');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeGroupMemberId, setActiveGroupMemberId] = useState<string>('host-emma');

  useEffect(() => {
    if (groupOrderSession) {
      localStorage.setItem('tuxi_group_order', JSON.stringify(groupOrderSession));
    } else {
      localStorage.removeItem('tuxi_group_order');
    }
  }, [groupOrderSession]);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('tuxi_businesses', JSON.stringify(businesses));
  }, [businesses]);

  useEffect(() => {
    localStorage.setItem('tuxi_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('tuxi_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('tuxi_payment_methods', JSON.stringify(paymentMethods));
  }, [paymentMethods]);

  useEffect(() => {
    localStorage.setItem('tuxi_global_cities', JSON.stringify(globalCities));
  }, [globalCities]);

  useEffect(() => {
    localStorage.setItem('tuxi_legal', JSON.stringify(legalCompliance));
  }, [legalCompliance]);

  useEffect(() => {
    localStorage.setItem('tuxi_loyalty', JSON.stringify(loyaltyProfile));
  }, [loyaltyProfile]);

  // Switch City & Auto-update Currency throughout the whole platform
  const switchGlobalCity = (cityId: string) => {
    const city = globalCities.find(c => c.id === cityId);
    if (!city) return;

    setActiveCity(city);
    setConfig(prev => ({
      ...prev,
      activeCityId: city.id,
      activeCityName: city.city,
      activeCountry: city.country,
      activeCountryCode: city.countryCode,
      currencySymbol: city.currencySymbol,
      currencyCode: city.currencyCode
    }));

    // Re-center Rep Hub to this city's center
    setCurrentRep(prev => ({
      ...prev,
      city: city.city,
      country: city.country,
      hubLocation: city.centerCoords,
      hubAddress: `${city.city} Central Hub, ${city.country}`
    }));

    // Reposition active driver near this city center for realistic testing
    setCurrentDriver(prev => ({
      ...prev,
      currentLocation: {
        lat: Number((city.centerCoords.lat + 0.005).toFixed(4)),
        lng: Number((city.centerCoords.lng + 0.005).toFixed(4))
      }
    }));

    // Localize demo businesses to realistic coordinates within the active city
    setBusinesses(prev => prev.map((biz, idx) => {
      const angle = (idx * 2 * Math.PI) / (prev.length || 1);
      const radiusKm = 0.35 + (idx * 0.25);
      const latOffset = (radiusKm * Math.cos(angle)) / 111;
      const cosLat = Math.cos((city.centerCoords.lat * Math.PI) / 180) || 1;
      const lngOffset = (radiusKm * Math.sin(angle)) / (111 * cosLat);
      return {
        ...biz,
        city: city.city,
        country: city.country,
        address: `${12 + idx * 14} ${city.city} Central Promenade, ${city.country}`,
        location: {
          lat: Number((city.centerCoords.lat + latOffset).toFixed(4)),
          lng: Number((city.centerCoords.lng + lngOffset).toFixed(4))
        },
        distanceFromRepHubKm: Number(radiusKm.toFixed(1))
      };
    }));

    // Reposition active orders to the new city so Google Maps tracking reflects user's actual city
    setOrders(prev => prev.map((ord, idx) => {
      const bizLat = Number((city.centerCoords.lat - 0.003).toFixed(4));
      const bizLng = Number((city.centerCoords.lng - 0.003).toFixed(4));
      const custLat = Number((city.centerCoords.lat + 0.005).toFixed(4));
      const custLng = Number((city.centerCoords.lng + 0.004).toFixed(4));
      const drvLat = Number((city.centerCoords.lat + 0.001).toFixed(4));
      const drvLng = Number((city.centerCoords.lng + 0.001).toFixed(4));
      return {
        ...ord,
        businessCoords: { lat: bizLat, lng: bizLng },
        customerCoords: { lat: custLat, lng: custLng },
        driverCoords: { lat: drvLat, lng: drvLng },
        customerAddress: `${24 + idx * 5} ${city.city} District Way, ${city.country}`
      };
    }));

    // Automated AI language adaptation according to the country
    const targetLang = getLanguageForCountry(city.countryCode);
    setLanguage(targetLang);

    logAIAction({
      workflow: 'business_onboarding',
      targetId: city.id,
      targetName: `Global Launch Switch to ${city.city}, ${city.country}`,
      modelVersion: 'geo-currency-engine-v2',
      confidenceScore: 1.0,
      actionTaken: `Automated platform currency shifted to ${city.currencySymbol} (${city.currencyCode}). App language automatically adapted to "${targetLang.toUpperCase()}". Rep and driver telemetry localized.`,
      reason: 'User or administrator initiated global city handover with AI local language adaptation.',
      outcome: 'auto_approved',
      humanOverridden: true
    });
  };

  // Launch a new city anywhere in the world from Admin Panel
  const launchGlobalCity = (newCity: Omit<GlobalCity, 'id' | 'isLaunched' | 'activeStoresCount' | 'activeDriversCount'>) => {
    const cityId = `city-${newCity.city.toLowerCase().replace(/\s+/g, '-')}`;
    const launched: GlobalCity = {
      ...newCity,
      id: cityId,
      isLaunched: true,
      activeStoresCount: 1,
      activeDriversCount: 1
    };

    setGlobalCities(prev => [launched, ...prev]);
    switchGlobalCity(launched.id);
  };

  // Automatic detection trigger (Geolocation API / locale)
  const [aiLocationStatus, setAiLocationStatus] = useState<AILocationStatus>(() => ({
    isDetecting: false,
    lastResult: getCachedAILocation(),
    error: null
  }));

  const triggerAILocationDetection = async (): Promise<AILocationResult> => {
    setAiLocationStatus(prev => ({ ...prev, isDetecting: true, error: null }));
    try {
      const result = await detectLocationWithAI();
      setAiLocationStatus({ isDetecting: false, lastResult: result, error: null });

      // Match city in existing launched cities or dynamically register
      const existing = globalCities.find(c => 
        c.countryCode.toUpperCase() === result.countryCode.toUpperCase() &&
        (c.city.toLowerCase() === result.city.toLowerCase() || c.city.toLowerCase().includes(result.city.toLowerCase()))
      );

      if (existing) {
        switchGlobalCity(existing.id);
      } else {
        const newCity = aiResultToGlobalCity(result);
        setGlobalCities(prev => [newCity, ...prev]);
        switchGlobalCity(newCity.id);
      }

      if (result.suggestedLanguage) {
        setLanguage(result.suggestedLanguage);
      }

      logAIAction({
        workflow: 'business_onboarding',
        targetId: `loc-ai-${result.countryCode}`,
        targetName: `Autonomous AI Geolocation: ${result.city}, ${result.country}`,
        modelVersion: 'gemini-3.8-flash',
        confidenceScore: result.aiConfidenceScore || 0.98,
        actionTaken: `AI determined user location in ${result.city}, ${result.country}. Platform currency set to ${result.currencySymbol} (${result.currencyCode}). UI language adapted to "${result.suggestedLanguage.toUpperCase()}".`,
        reason: result.aiReasoning || `Real-time GPS signals and network telemetry analyzed via Gemini AI.`,
        outcome: 'auto_approved',
        humanOverridden: false
      });

      return result;
    } catch (err: any) {
      console.warn('[AI Location Error]', err);
      setAiLocationStatus(prev => ({ ...prev, isDetecting: false, error: err.message }));
      throw err;
    }
  };

  const autoDetectLocationAndCurrency = () => {
    triggerAILocationDetection().catch(e => console.warn('[Manual AI Location Trigger]', e));
  };

  // Automatically pick up where and in which country & city the app is being used via AI on load
  useEffect(() => {
    const hasManualOverride = localStorage.getItem('tuxi_user_manual_city_selection');
    const cached = getCachedAILocation();
    if (!hasManualOverride) {
      if (cached) {
        // Cached location exists from recent detection; apply without redundant network call
        const existing = globalCities.find(c => 
          c.countryCode.toUpperCase() === cached.countryCode.toUpperCase() &&
          (c.city.toLowerCase() === cached.city.toLowerCase() || c.city.toLowerCase().includes(cached.city.toLowerCase()))
        );
        if (existing) {
          switchGlobalCity(existing.id);
        }
        return;
      }
      triggerAILocationDetection().catch(e => console.warn('[Auto AI Location Init]', e));
    }
  }, []);

  const formatPrice = (amount: number): string => {
    return formatCurrency(amount, config.currencySymbol, config.currencyCode);
  };

  const updateConfig = (newConfig: Partial<PlatformConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  const updateMonetization = (newMonetization: Partial<PlatformMonetizationSettings>) => {
    setConfig(prev => ({
      ...prev,
      monetization: {
        ...prev.monetization,
        ...newMonetization
      }
    }));
  };

  const toggleAIKillSwitch = () => {
    setConfig(prev => {
      const updated = !prev.aiMasterKillSwitch;
      logAIAction({
        workflow: 'fraud_screen',
        targetId: 'system-config',
        targetName: 'Global AI Kill Switch',
        modelVersion: 'system-governance',
        confidenceScore: 1.0,
        actionTaken: updated ? 'EMERGENCY AI KILL SWITCH ENGAGED' : 'AI Automation Resumed',
        reason: updated ? 'Administrator initiated manual kill switch. All automated approvals suspended.' : 'Administrator re-enabled automated flows.',
        outcome: updated ? 'escalated_to_exception' : 'auto_approved',
        humanOverridden: true
      });
      return { ...prev, aiMasterKillSwitch: updated };
    });
  };

  const updateRepHub = (coords: GeoPoint, address: string) => {
    setCurrentRep(prev => ({
      ...prev,
      hubLocation: coords,
      hubAddress: address
    }));
  };

  const logAIAction = (run: Omit<AIWorkflowRun, 'id' | 'timestamp'>) => {
    const newRun: AIWorkflowRun = {
      ...run,
      id: `airun-${Date.now()}`,
      timestamp: new Date().toISOString()
    };
    setAiWorkflowRuns(prev => [newRun, ...prev]);
  };

  // Payment method management
  const addPaymentMethod = (pm: Omit<SavedPaymentMethod, 'id' | 'tokenizedId'>) => {
    const newPm: SavedPaymentMethod = {
      ...pm,
      id: `pm-${Date.now()}`,
      tokenizedId: `tok_${pm.type}_${Math.random().toString(36).substring(7)}_pci_dss`
    };
    setPaymentMethods(prev => [newPm, ...prev]);
    setSelectedPaymentMethodId(newPm.id);
  };

  const deletePaymentMethod = (id: string) => {
    setPaymentMethods(prev => {
      const next = prev.filter(p => p.id !== id);
      if (selectedPaymentMethodId === id && next.length > 0) {
        setSelectedPaymentMethodId(next[0].id);
      }
      return next;
    });
  };

  const setDefaultPaymentMethod = (id: string) => {
    setPaymentMethods(prev => prev.map(p => ({ ...p, isDefault: p.id === id })));
    setSelectedPaymentMethodId(id);
  };

  // POS Integration Methods
  const syncStorePOS = (businessId: string, provider: POSProvider = 'toast') => {
    setBusinesses(prev => prev.map(b => {
      if (b.id === businessId) {
        return {
          ...b,
          posConfig: {
            provider,
            isConnected: true,
            merchantId: b.posConfig?.merchantId || `POS-AUTO-${Date.now()}`,
            storeLocationId: b.posConfig?.storeLocationId || `LOC-${b.name.substring(0, 4).toUpperCase()}`,
            autoSyncInventory: true,
            auto86Items: true,
            autoSendOrdersToKitchenKDS: true,
            lastSyncTimestamp: 'Just now (Real-time Webhook)',
            webhookStatus: 'active'
          }
        };
      }
      return b;
    }));

    logAIAction({
      workflow: 'pos_sync',
      targetId: businessId,
      targetName: `POS 2-Way Sync (${provider.toUpperCase()})`,
      modelVersion: 'pos-cloud-bridge-v3',
      confidenceScore: 1.0,
      actionTaken: `POS integration activated with ${provider.toUpperCase()}. Catalogs and 86-item availability synchronized.`,
      reason: 'Merchant connected registered POS terminal to TUXI cloud.',
      outcome: 'auto_approved',
      humanOverridden: false
    });
  };

  const togglePOS86Item = (businessId: string, itemId: string) => {
    setBusinesses(prev => prev.map(b => {
      if (b.id === businessId && b.menuItems) {
        const updated = b.menuItems.map(item => {
          if (item.id === itemId) {
            const nextStatus = !item.isAvailable;
            logAIAction({
              workflow: 'pos_sync',
              targetId: itemId,
              targetName: `${item.name} 86-Item Sync`,
              modelVersion: 'pos-webhook-sync-v1',
              confidenceScore: 1.0,
              actionTaken: nextStatus ? 'Item restored to active ordering' : 'Item marked 86/Sold-out across POS and customer app',
              reason: 'POS webhook inventory event triggered.',
              outcome: 'auto_approved',
              humanOverridden: false
            });
            return { ...item, isAvailable: nextStatus };
          }
          return item;
        });
        return { ...b, menuItems: updated };
      }
      return b;
    }));
  };

  const connectStorePOS = (businessId: string, customConfig: Partial<POSIntegrationConfig>) => {
    setBusinesses(prev => prev.map(b => {
      if (b.id === businessId) {
        return {
          ...b,
          posConfig: {
            provider: customConfig.provider || 'toast',
            isConnected: true,
            merchantId: customConfig.merchantId || `MERCH-${Date.now()}`,
            storeLocationId: customConfig.storeLocationId || 'LOC-PRIMARY',
            autoSyncInventory: customConfig.autoSyncInventory ?? true,
            auto86Items: customConfig.auto86Items ?? true,
            autoSendOrdersToKitchenKDS: customConfig.autoSendOrdersToKitchenKDS ?? true,
            lastSyncTimestamp: 'Just now (Real-time)',
            webhookStatus: 'active'
          }
        };
      }
      return b;
    }));
  };

  // Driver GPS background telemetry and real-time movement simulator
  const setDriverTrackingMode = (mode: GPSTrackingMode) => {
    let pingInterval = 0;
    if (mode === 'distance_based') pingInterval = 30; // 50m moved or 30s stationary
    if (mode === 'high_precision') pingInterval = 5;  // 5s high-precision trip active

    setCurrentDriver(prev => ({
      ...prev,
      telemetry: {
        ...prev.telemetry,
        trackingMode: mode,
        pingIntervalSeconds: pingInterval,
        lastPingTimestamp: 'Just now'
      }
    }));
  };

  // Simulates incremental real-time GPS coordinate updates along delivery route
  const simulateDriverStep = () => {
    setCurrentDriver(prev => {
      const dLat = (Math.random() - 0.5) * 0.0012;
      const dLng = (Math.random() - 0.5) * 0.0012;
      const newLat = prev.currentLocation.lat + dLat;
      const newLng = prev.currentLocation.lng + dLng;

      // Update active in-transit order driver coordinates too
      setOrders(orderList => orderList.map(o => {
        if (o.status === 'in_transit' && o.driverId === prev.id) {
          return { ...o, driverCoords: { lat: newLat, lng: newLng } };
        }
        return o;
      }));

      return {
        ...prev,
        currentLocation: { lat: newLat, lng: newLng },
        telemetry: {
          ...prev.telemetry,
          metersMovedSinceLastPing: Math.floor(Math.random() * 45) + 15,
          batteryLevel: Math.max(12, prev.telemetry.batteryLevel - 0.1),
          lastPingTimestamp: '1s ago'
        }
      };
    });
  };

  // Legal & Regulatory Compliance Handlers
  const toggleDoNotSellCCPA = (val: boolean) => {
    setLegalCompliance(prev => ({
      ...prev,
      doNotSellMyDataCCPA: val
    }));
  };

  const togglePOPIAConsent = (val: boolean) => {
    setLegalCompliance(prev => ({
      ...prev,
      popiaConsentAccepted: val
    }));
  };

  const requestDataDeletion = (email: string) => {
    const purgeDate = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const newReq = {
      id: `del-${Date.now()}`,
      requestedAt: new Date().toISOString(),
      userEmail: email,
      status: 'pending' as const,
      retentionPurgeDate: purgeDate
    };
    setLegalCompliance(prev => ({
      ...prev,
      dataDeletionRequests: [newReq, ...prev.dataDeletionRequests]
    }));
  };

  // Business Onboarding
  const createBusinessApplication = (app: Partial<Business>): Business => {
    const bizLocation = app.location || activeCity.centerCoords;
    const { isWithin, distanceKm } = isWithinTerritory(bizLocation, currentRep.hubLocation, currentRep.territoryRadiusKm);

    const businessId = `biz-${Date.now()}`;
    const newBiz: Business = {
      id: businessId,
      type: app.type || 'eats',
      name: app.name || 'New Store',
      ownerName: app.ownerName || 'Store Owner',
      ownerEmail: app.ownerEmail || 'owner@example.com',
      ownerPhone: app.ownerPhone || '+44 7700 900000',
      address: app.address || `${activeCity.city}, ${activeCity.country}`,
      city: activeCity.city,
      country: activeCity.country,
      location: bizLocation,
      distanceFromRepHubKm: distanceKm,
      repId: currentRep.id,
      repName: currentRep.name,
      status: 'submitted',
      category: app.category || 'General',
      rating: 5.0,
      reviewCount: 0,
      openingHours: app.openingHours || '09:00 - 22:00',
      prepTimeMinutes: app.prepTimeMinutes || 20,
      bannerImage: app.bannerImage || (app.type === 'eats' 
        ? 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80' 
        : 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=80'),
      menuItems: app.menuItems || [],
      products: app.products || [],
      documents: app.documents || [],
      consentObtained: !!app.consentObtained,
      ownerSignatureDate: app.ownerSignatureDate || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      commissionRate: app.type === 'eats' ? config.monetization.eatsPremiumCommission : config.monetization.shopIndependentCommission,
      eatsPlan: app.type === 'eats' ? 'premium' : undefined,
      shopFulfillmentType: app.type === 'shop' ? 'merchant_pack' : undefined,
      salesVolumeYtd: 0,
      activeOrderCount: 0,
      aiRiskScore: isWithin ? 10 : 85,
      aiRiskFlags: isWithin ? [] : [`OUT_OF_TERRITORY_${distanceKm.toFixed(1)}KM`]
    };

    const killSwitchActive = config.aiMasterKillSwitch;
    const canAutoApprove = !killSwitchActive && config.level2AutoApprovalEnabled && isWithin && newBiz.consentObtained && (newBiz.documents.length > 0);

    if (canAutoApprove) {
      newBiz.status = 'approved';
      logAIAction({
        workflow: 'business_onboarding',
        targetId: newBiz.id,
        targetName: newBiz.name,
        modelVersion: 'gemini-tuxi-onboard-v3',
        confidenceScore: 0.94,
        actionTaken: 'Autonomous Level-2 Approval granted. Territory verified, document valid, consent verified.',
        reason: `Business is ${distanceKm} km from Rep Hub (limit: ${currentRep.territoryRadiusKm} km). All checks passed.`,
        outcome: 'auto_approved',
        humanOverridden: false
      });
    } else {
      newBiz.status = 'under_review';
      const reason = killSwitchActive
        ? 'Emergency AI Kill Switch active. Manual review required.'
        : !isWithin
        ? `Location is ${distanceKm} km away, exceeding Rep 10 km territory boundary!`
        : 'Pending document verification or owner signature review.';

      logAIAction({
        workflow: 'business_onboarding',
        targetId: newBiz.id,
        targetName: newBiz.name,
        modelVersion: 'gemini-tuxi-onboard-v3',
        confidenceScore: isWithin ? 0.82 : 0.40,
        actionTaken: 'Escalated to Admin Exception Queue.',
        reason,
        outcome: 'escalated_to_exception',
        humanOverridden: false
      });

      const exceptionItem: AIExceptionItem = {
        id: `exc-${Date.now()}`,
        priority: !isWithin ? 'critical' : 'medium',
        type: !isWithin ? 'territory_breach' : 'low_confidence_ocr',
        entityType: 'business',
        entityId: newBiz.id,
        title: !isWithin ? `Territory Boundary Exceeded (${distanceKm} km)` : `Application Review: ${newBiz.name}`,
        description: reason,
        evidence: `Distance: ${distanceKm} km. Hub: ${currentRep.hubAddress}. Business: ${newBiz.address}.`,
        aiSummary: !isWithin 
          ? 'Backend geospatial logic flagged this submission outside 10 km acquisition circle.'
          : 'Submission holds missing attributes or requires manual admin stamp.',
        confidenceScore: isWithin ? 0.85 : 0.35,
        recommendedNextStep: !isWithin ? 'Reject claim or grant administrative waiver.' : 'Review document attachments and approve.',
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      setExceptions(prev => [exceptionItem, ...prev]);
    }

    setBusinesses(prev => [newBiz, ...prev]);
    setCurrentRep(prev => ({
      ...prev,
      totalAcquiredBusinesses: prev.totalAcquiredBusinesses + 1,
      liveBusinessesCount: canAutoApprove ? prev.liveBusinessesCount + 1 : prev.liveBusinessesCount,
      pendingCommission: prev.pendingCommission + config.repAcquisitionBounty
    }));

    return newBiz;
  };

  const updateBusinessStatus = (id: string, status: Business['status'], reason?: string) => {
    setBusinesses(prev => prev.map(b => {
      if (b.id === id) {
        return {
          ...b,
          status,
          rejectionReason: status === 'rejected' ? reason : undefined,
          updatedAt: new Date().toISOString().split('T')[0]
        };
      }
      return b;
    }));
  };

  const updateBusiness = (id: string, updates: Partial<Business>) => {
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString().split('T')[0] } : b));
  };

  const placeOrder = (newOrderData: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'status'>): Order => {
    const orderNumber = `TX-${Math.floor(1000 + Math.random() * 9000)}`;
    const tempId = `ord-${Date.now()}`;
    const selectedPm = paymentMethods.find(p => p.id === selectedPaymentMethodId) || paymentMethods[0];

    const newOrder: Order = {
      ...newOrderData,
      id: tempId,
      orderNumber,
      status: 'placed',
      paymentMethod: selectedPm,
      createdAt: new Date().toISOString(),
      estimatedDeliveryTime: `${new Date(Date.now() + 35 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    };

    setOrders(prev => [newOrder, ...prev]);
    clearCart();

    // Asynchronously persist to PostgreSQL backend
    if (newOrderData.businessId && newOrderData.items && newOrderData.items.length > 0) {
      ApiClient.createOrder({
        businessId: newOrderData.businessId,
        items: newOrderData.items.map((i: any) => ({
          itemType: (newOrderData.type === 'shop' || i.variantId) ? 'PRODUCT' : 'MENU_ITEM',
          itemId: i.itemId || i.id,
          variantId: i.variantId,
          quantity: i.quantity || 1
        })),
        deliveryAddress: {
          streetLine1: newOrderData.customerAddress || '15 Long St',
          city: 'Cape Town',
          postalCode: '8001',
          countryCode: 'ZAF',
          latitude: newOrderData.customerCoords?.lat || -33.9249,
          longitude: newOrderData.customerCoords?.lng || 18.4241
        },
        tipCents: Math.round((newOrderData.tip || 0) * 100),
        idempotencyKey: `idem-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        isTestPayment: true
      }).then(realOrder => {
        setOrders(prev => prev.map(o => o.id === tempId ? {
          ...o,
          id: realOrder.orderId,
          orderNumber: realOrder.orderNumber,
          subtotal: realOrder.subtotalCents / 100,
          total: realOrder.totalCents / 100,
          status: realOrder.status?.toLowerCase() || 'placed'
        } : o));
      }).catch(err => {
        console.warn('[PostgreSQL Order Persistence Error]', err.message);
      });
    }

    // Award loyalty points (10 points per currency unit spent * tier multiplier)
    const pointsEarned = Math.round(newOrder.total * 10 * loyaltyProfile.multiplier);
    setLoyaltyProfile(prev => {
      const newTotal = prev.totalPoints + pointsEarned;
      let newTier = prev.tier;
      if (newTotal >= 2000) newTier = 'Platinum';
      else if (newTotal >= 1000) newTier = 'Gold';
      else if (newTotal >= 500) newTier = 'Silver';

      return {
        ...prev,
        totalPoints: newTotal,
        tier: newTier,
        recentActivity: [
          {
            id: `act-${Date.now()}`,
            title: `Order #${orderNumber} (${newOrder.businessName || 'TUXI Order'})`,
            pointsDelta: pointsEarned,
            date: 'Just now',
            type: 'order_earn',
            orderNumber
          },
          ...prev.recentActivity
        ]
      };
    });

    logAIAction({
      workflow: 'order_dispatch',
      targetId: newOrder.id,
      targetName: `Order ${orderNumber}`,
      modelVersion: 'gemini-tuxi-dispatch-v2',
      confidenceScore: 0.95,
      actionTaken: `Payment authorized via ${selectedPm?.title || 'Card'}. Order routed to merchant kitchen & POS.`,
      reason: 'No-cash policy enforced. Digital token settled via Stripe/ApplePay.',
      outcome: 'auto_approved',
      humanOverridden: false
    });

    return newOrder;
  };

  const redeemReward = (points: number, rewardTitle: string): boolean => {
    if (loyaltyProfile.totalPoints < points) return false;

    setLoyaltyProfile(prev => {
      const newTotal = prev.totalPoints - points;
      return {
        ...prev,
        totalPoints: newTotal,
        recentActivity: [
          {
            id: `act-${Date.now()}`,
            title: `Redeemed ${rewardTitle}`,
            pointsDelta: -points,
            date: 'Just now',
            type: 'reward_redeem'
          },
          ...prev.recentActivity
        ]
      };
    });

    logAIAction({
      workflow: 'order_dispatch',
      targetId: 'loyalty-reward',
      targetName: `Reward Redeemed: ${rewardTitle}`,
      modelVersion: 'gemini-3.8-flash',
      confidenceScore: 0.99,
      actionTaken: `Customer redeemed ${points} points for "${rewardTitle}". Balance updated.`,
      reason: 'Automated loyalty reward credit ledger.',
      outcome: 'auto_approved',
      humanOverridden: false
    });

    return true;
  };

  const updateOrderStatus = (orderId: string, status: OrderStatus, details?: Partial<Order>) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          status,
          ...(details || {})
        };
      }
      return o;
    }));

    // Adjust driver tracking mode automatically according to Background GPS Safety spec!
    if (status === 'in_transit' || status === 'picked_up') {
      setDriverTrackingMode('high_precision'); // 5s ping
    } else if (status === 'delivered') {
      setDriverTrackingMode('distance_based'); // 50m / 30s ping
    }
  };

  const updateOrderDeliveryNotes = (orderId: string, notes: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return { ...o, deliveryNotes: notes };
      }
      return o;
    }));

    logAIAction({
      workflow: 'order_dispatch',
      targetId: orderId,
      targetName: `Order Delivery Instructions Updated`,
      modelVersion: 'gemini-3.8-flash',
      confidenceScore: 0.98,
      actionTaken: `Customer updated delivery notes to: "${notes}". Transmitted to courier terminal.`,
      reason: 'Live customer chat instruction modification.',
      outcome: 'auto_approved',
      humanOverridden: false
    });
  };

  const toggleDriverOnline = () => {
    setCurrentDriver(prev => {
      const willBeOnline = !prev.isOnline;
      return {
        ...prev,
        isOnline: willBeOnline,
        telemetry: {
          ...prev.telemetry,
          trackingMode: willBeOnline ? 'distance_based' : 'offline',
          pingIntervalSeconds: willBeOnline ? 30 : 0
        }
      };
    });
  };

  const acceptJobOffer = (orderId: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          status: 'driver_assigned',
          driverId: currentDriver.id,
          driverName: currentDriver.name,
          driverPhone: currentDriver.phone,
          driverCoords: currentDriver.currentLocation
        };
      }
      return o;
    }));

    setDriverTrackingMode('high_precision');
  };

  const completeDriverDelivery = (orderId: string, proof: { photoUrl?: string; signatureUrl?: string; recipientName?: string }) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    const deliveryEarning = targetOrder.deliveryFee + targetOrder.tip;

    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          status: 'delivered',
          proofOfDelivery: {
            photoUrl: proof.photoUrl,
            signatureUrl: proof.signatureUrl,
            recipientName: proof.recipientName || 'Customer',
            timestamp: new Date().toISOString()
          }
        };
      }
      return o;
    }));

    setCurrentDriver(prev => ({
      ...prev,
      todayEarnings: prev.todayEarnings + deliveryEarning,
      totalTrips: prev.totalTrips + 1,
      telemetry: {
        ...prev.telemetry,
        trackingMode: 'distance_based',
        pingIntervalSeconds: 30
      }
    }));

    logAIAction({
      workflow: 'order_dispatch',
      targetId: orderId,
      targetName: `Delivery Completed ${targetOrder.orderNumber}`,
      modelVersion: 'tuxi-pod-verifier-v1',
      confidenceScore: 0.99,
      actionTaken: 'Proof of Delivery verified. Payout credited to driver wallet.',
      reason: 'Geolocation dropoff coordinates matched destination. Background GPS shifted to battery-saving distance filter.',
      outcome: 'auto_approved',
      humanOverridden: false
    });
  };

  const resolveException = (id: string, action: 'approve' | 'request_info' | 'reject', overrideReason?: string) => {
    const exc = exceptions.find(e => e.id === id);
    if (!exc) return;

    if (exc.entityType === 'business') {
      if (action === 'approve') {
        updateBusinessStatus(exc.entityId, 'live');
        logAIAction({
          workflow: 'business_onboarding',
          targetId: exc.entityId,
          targetName: exc.title,
          modelVersion: 'admin-manual-override',
          confidenceScore: 1.0,
          actionTaken: `Admin granted manual override approval. Reason: ${overrideReason || 'Territory boundary exemption authorized'}`,
          reason: 'Manual supervisor authorization recorded in audit trail.',
          outcome: 'auto_approved',
          humanOverridden: true
        });
      } else if (action === 'reject') {
        updateBusinessStatus(exc.entityId, 'rejected', overrideReason || 'Rejected by platform administrator');
      } else if (action === 'request_info') {
        updateBusinessStatus(exc.entityId, 'needs_information');
      }
    }

    setExceptions(prev => prev.map(e => e.id === id ? { ...e, status: 'resolved' } : e));
  };

  // Cart operations
  const addToCart = (item: OrderCartItem, businessId: string) => {
    const currentMember = groupOrderSession?.members.find(m => m.id === activeGroupMemberId);
    const taggedItem: OrderCartItem = {
      ...item,
      addedByMemberId: item.addedByMemberId || (groupOrderSession ? activeGroupMemberId : undefined),
      addedByMemberName: item.addedByMemberName || (groupOrderSession ? (currentMember?.name || 'Emma Watson (Host)') : undefined)
    };

    if (cartBusinessId && cartBusinessId !== businessId) {
      if (confirm('Adding items from a different store will reset your current basket. Continue?')) {
        setCart([taggedItem]);
        setCartBusinessId(businessId);
      }
      return;
    }

    setCartBusinessId(businessId);
    setCart(prev => {
      const existing = prev.find(i => 
        i.itemId === item.itemId && 
        i.addedByMemberId === taggedItem.addedByMemberId
      );
      if (existing) {
        return prev.map(i => 
          (i.itemId === item.itemId && i.addedByMemberId === taggedItem.addedByMemberId)
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      return [...prev, taggedItem];
    });
  };

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => {
      const next = prev.filter(i => i.id !== cartItemId);
      if (next.length === 0) setCartBusinessId(null);
      return next;
    });
  };

  const updateCartQuantity = (cartItemId: string, delta: number) => {
    setCart(prev => {
      const next = prev.map(i => {
        if (i.id === cartItemId) {
          const newQty = i.quantity + delta;
          return newQty > 0 ? { ...i, quantity: newQty } : null;
        }
        return i;
      }).filter(Boolean) as OrderCartItem[];
      if (next.length === 0) setCartBusinessId(null);
      return next;
    });
  };

  const clearCart = () => {
    setCart([]);
    setCartBusinessId(null);
  };

  // Group Order Methods
  const startGroupOrder = (businessId: string, businessName: string, spendingLimit?: number): GroupOrderSession => {
    const randomCode = `GRP-${Math.floor(1000 + Math.random() * 9000)}`;
    const newSession: GroupOrderSession = {
      id: `grp-${Date.now()}`,
      code: randomCode,
      businessId,
      businessName,
      hostId: 'host-emma',
      hostName: 'Emma Watson',
      members: [
        {
          id: 'host-emma',
          name: 'Emma Watson',
          email: 'emma.w@example.com',
          avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=80&h=80&q=80',
          isHost: true,
          status: 'ready',
          paymentMethodTitle: 'Visa •••• 4242'
        }
      ],
      splitMode: 'by_items',
      spendingLimitPerPerson: spendingLimit,
      lockStatus: 'open',
      createdAt: new Date().toISOString()
    };

    setGroupOrderSession(newSession);
    setActiveGroupMemberId('host-emma');
    setCartBusinessId(businessId);

    logAIAction({
      workflow: 'order_dispatch',
      targetId: newSession.id,
      targetName: `Group Order Session ${randomCode}`,
      modelVersion: 'tuxi-group-dispatch-v1',
      confidenceScore: 0.99,
      actionTaken: `Group order session created for ${businessName}. Automated digital split payment initialized.`,
      reason: 'Shared cart invitation link generated.',
      outcome: 'auto_approved',
      humanOverridden: false
    });

    return newSession;
  };

  const joinGroupOrder = (code: string, memberName: string, memberEmail?: string): boolean => {
    if (!groupOrderSession || groupOrderSession.code.toUpperCase() !== code.toUpperCase().trim()) {
      return false;
    }

    const newMemberId = `mbr-${Date.now()}`;
    const newMember: GroupOrderMember = {
      id: newMemberId,
      name: memberName,
      email: memberEmail || `${memberName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      isHost: false,
      status: 'active',
      paymentMethodTitle: 'Apple Pay'
    };

    setGroupOrderSession(prev => prev ? {
      ...prev,
      members: [...prev.members, newMember]
    } : null);

    setActiveGroupMemberId(newMemberId);
    return true;
  };

  const addSimulatedGroupMember = (
    name: string, 
    email: string, 
    itemsToAdd?: { itemId: string; name: string; price: number }[]
  ) => {
    if (!groupOrderSession) return;
    const memberId = `mbr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newMember: GroupOrderMember = {
      id: memberId,
      name,
      email,
      isHost: false,
      status: 'ready',
      paymentMethodTitle: name.includes('David') ? 'Apple Pay' : name.includes('Sophie') ? 'Mastercard •••• 8831' : 'Google Pay'
    };

    setGroupOrderSession(prev => prev ? {
      ...prev,
      members: [...prev.members, newMember]
    } : null);

    if (itemsToAdd && itemsToAdd.length > 0) {
      itemsToAdd.forEach(item => {
        addToCart({
          id: `item-${Date.now()}-${Math.random()}`,
          itemId: item.itemId,
          name: item.name,
          price: item.price,
          quantity: 1,
          addedByMemberId: memberId,
          addedByMemberName: name
        }, groupOrderSession.businessId);
      });
    }
  };

  const removeGroupMember = (memberId: string) => {
    if (!groupOrderSession) return;
    setGroupOrderSession(prev => prev ? {
      ...prev,
      members: prev.members.filter(m => m.id !== memberId)
    } : null);

    setCart(prev => prev.filter(i => i.addedByMemberId !== memberId));
    if (activeGroupMemberId === memberId) {
      setActiveGroupMemberId(groupOrderSession.hostId);
    }
  };

  const updateSplitMode = (mode: SplitPaymentMode) => {
    setGroupOrderSession(prev => prev ? {
      ...prev,
      splitMode: mode
    } : null);
  };

  const cancelGroupOrder = () => {
    setGroupOrderSession(null);
    setActiveGroupMemberId('host-emma');
  };

  return (
    <TuxiContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        isSessionValidating,
        logout,
        refreshEatsBusinesses,
        refreshOrders,
        activeRole,
        setActiveRole,
        theme,
        toggleTheme,
        setTheme,
        language,
        setLanguage,
        t,
        isMobileRepView,
        setIsMobileRepView,
        globalCities,
        activeCity,
        switchGlobalCity,
        launchGlobalCity,
        autoDetectLocationAndCurrency,
        triggerAILocationDetection,
        aiLocationStatus,
        formatPrice,
        config,
        updateConfig,
        updateMonetization,
        toggleAIKillSwitch,
        currentRep,
        allReps,
        updateRepHub,
        businesses,
        createBusinessApplication,
        updateBusinessStatus,
        updateBusiness,
        syncStorePOS,
        togglePOS86Item,
        connectStorePOS,
        orders,
        placeOrder,
        updateOrderStatus,
        updateOrderDeliveryNotes,
        paymentMethods,
        selectedPaymentMethodId,
        setSelectedPaymentMethodId,
        addPaymentMethod,
        deletePaymentMethod,
        setDefaultPaymentMethod,
        currentDriver,
        allDrivers: drivers,
        toggleDriverOnline,
        acceptJobOffer,
        completeDriverDelivery,
        simulateDriverStep,
        setDriverTrackingMode,
        exceptions,
        resolveException,
        aiWorkflowRuns,
        logAIAction,
        legalCompliance,
        toggleDoNotSellCCPA,
        togglePOPIAConsent,
        requestDataDeletion,
        loyaltyProfile,
        redeemReward,
        cart,
        cartBusinessId,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        groupOrderSession,
        activeGroupMemberId,
        setActiveGroupMemberId,
        startGroupOrder,
        joinGroupOrder,
        addSimulatedGroupMember,
        removeGroupMember,
        updateSplitMode,
        cancelGroupOrder,
        repApplication,
        driverApplication,
        isRepApplicantModalOpen,
        setIsRepApplicantModalOpen,
        isDriverApplicantModalOpen,
        setIsDriverApplicantModalOpen,
        submitRepApplication,
        submitDriverApplication,
        refreshApplicantStatus,
      }}
    >
      {children}
    </TuxiContext.Provider>
  );
};

export const useTuxi = () => {
  const context = useContext(TuxiContext);
  if (!context) {
    throw new Error('useTuxi must be used within a TuxiProvider');
  }
  return context;
};
