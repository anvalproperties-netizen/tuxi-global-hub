// Google Maps Platform Global Configuration & Auth Guard
// Handles API key validation, auth failure defense, and graceful fallback to offline radar

const STORAGE_KEY = 'tuxi_gmp_api_key';

let hasAuthFailed = false;

// Global auth failure interceptor
if (typeof window !== 'undefined') {
  (window as any).gm_authFailure = () => {
    console.warn('[Google Maps] gm_authFailure fired (InvalidKeyMapError or billing error). Gracefully falling back to interactive vector radar.');
    hasAuthFailed = true;
    window.dispatchEvent(new CustomEvent('gmp-auth-failure'));
  };

  // Safe console error tap to intercept OverQuotaMapError or InvalidKeyMapError without crashing
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    const msg = args.map(a => String(a)).join(' ');
    if (msg.includes('InvalidKeyMapError') || msg.includes('OverQuotaMapError') || msg.includes('ApiNotActivatedMapError')) {
      hasAuthFailed = true;
      window.dispatchEvent(new CustomEvent('gmp-auth-failure', { detail: msg }));
    }
  };
}

export function getStoredGoogleMapsApiKey(): string {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return cached.trim();
  }
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  return envKey;
}

export function setStoredGoogleMapsApiKey(key: string) {
  if (typeof window !== 'undefined') {
    hasAuthFailed = false;
    localStorage.setItem(STORAGE_KEY, key.trim());
    window.dispatchEvent(new CustomEvent('gmp-key-updated', { detail: key.trim() }));
  }
}

/**
 * Validates if an API key conforms to Google Maps Platform API key format.
 * Standard Google Cloud API keys start with "AIzaSy" and are 39 characters long.
 * Tokens starting with "AQ." or other prefixes are NOT valid Google Maps API keys.
 */
export function isValidGoogleMapsKey(key: string): boolean {
  if (!key) return false;
  const clean = key.trim();
  return clean.startsWith('AIza') && clean.length >= 30;
}

export function isGoogleMapsAuthFailed(): boolean {
  return hasAuthFailed;
}

export function resetGoogleMapsAuthFailed() {
  hasAuthFailed = false;
}

export const GOOGLE_MAPS_API_KEY = getStoredGoogleMapsApiKey();
export const GOOGLE_MAPS_MAP_ID = 'DEMO_MAP_ID';
export const GMP_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

export const DEFAULT_MAP_CENTER = {
  lat: 51.5230,
  lng: -0.0780
};

export const DEFAULT_MAP_ZOOM = 14;
