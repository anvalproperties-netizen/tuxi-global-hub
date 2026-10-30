// ============================================================================
// TUXI PHASE 2G — INTEGRATION FRAMEWORK CORE TYPES
// Enforces provider lifecycle states and deterministic security gating.
// ============================================================================

export type IntegrationState =
  | 'NOT_CONFIGURED'
  | 'SANDBOX'
  | 'VERIFIED'
  | 'PRODUCTION_ENABLED'
  | 'SUSPENDED';

export type IntegrationProviderType =
  | 'PAYMENT_GATEWAY'
  | 'MAPS_AND_ROUTING'
  | 'NOTIFICATIONS'
  | 'AI_INTELLIGENCE'
  | 'PAYOUT_DISBURSEMENT';

export interface ProviderHealthCheckResult {
  providerId: string;
  success: boolean;
  state: IntegrationState;
  latencyMs: number;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface IIntegrationAdapter {
  readonly providerId: string;
  readonly name: string;
  readonly providerType: IntegrationProviderType;

  getState(): Promise<IntegrationState>;
  verifyConnectivity(): Promise<ProviderHealthCheckResult>;
  activateProduction(operatorToken: string, operatorUserId: string): Promise<{ success: boolean; message: string }>;
  suspend(reason: string, operatorUserId: string): Promise<{ success: boolean; message: string }>;
}

export interface CurrencyConfig {
  code: string; // e.g. 'ZAR', 'USD', 'EUR', 'GBP'
  name: string;
  minorUnitFactor: number; // 100 for cents, pence, etc.
  symbol: string;
  supportedLocales: string[];
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  ZAR: {
    code: 'ZAR',
    name: 'South African Rand',
    minorUnitFactor: 100,
    symbol: 'R',
    supportedLocales: ['en-ZA', 'af-ZA', 'zu-ZA']
  },
  USD: {
    code: 'USD',
    name: 'United States Dollar',
    minorUnitFactor: 100,
    symbol: '$',
    supportedLocales: ['en-US']
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    minorUnitFactor: 100,
    symbol: '€',
    supportedLocales: ['en-IE', 'de-DE', 'fr-FR']
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    minorUnitFactor: 100,
    symbol: '£',
    supportedLocales: ['en-GB']
  }
};
