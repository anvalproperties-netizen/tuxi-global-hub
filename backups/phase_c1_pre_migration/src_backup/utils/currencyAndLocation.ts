import { GlobalCity, GeoPoint } from '../types';

export const GLOBAL_LAUNCHED_CITIES: GlobalCity[] = [
  {
    id: 'city-london',
    city: 'London',
    country: 'United Kingdom',
    countryCode: 'GB',
    currencySymbol: '£',
    currencyCode: 'GBP',
    exchangeRateToUSD: 1.28,
    centerCoords: { lat: 51.5230, lng: -0.0780 },
    isLaunched: true,
    activeStoresCount: 142,
    activeDriversCount: 38
  },
  {
    id: 'city-la',
    city: 'Los Angeles',
    country: 'United States',
    countryCode: 'US',
    currencySymbol: '$',
    currencyCode: 'USD',
    exchangeRateToUSD: 1.00,
    centerCoords: { lat: 34.0522, lng: -118.2437 },
    isLaunched: true,
    activeStoresCount: 310,
    activeDriversCount: 84
  },
  {
    id: 'city-nyc',
    city: 'New York',
    country: 'United States',
    countryCode: 'US',
    currencySymbol: '$',
    currencyCode: 'USD',
    exchangeRateToUSD: 1.00,
    centerCoords: { lat: 40.7128, lng: -74.0060 },
    isLaunched: true,
    activeStoresCount: 420,
    activeDriversCount: 112
  },
  {
    id: 'city-capetown',
    city: 'Cape Town',
    country: 'South Africa',
    countryCode: 'ZA',
    currencySymbol: 'R',
    currencyCode: 'ZAR',
    exchangeRateToUSD: 0.056, // ~18 ZAR per USD
    centerCoords: { lat: -33.9249, lng: 18.4241 },
    isLaunched: true,
    activeStoresCount: 94,
    activeDriversCount: 29
  },
  {
    id: 'city-joburg',
    city: 'Johannesburg',
    country: 'South Africa',
    countryCode: 'ZA',
    currencySymbol: 'R',
    currencyCode: 'ZAR',
    exchangeRateToUSD: 0.056,
    centerCoords: { lat: -26.2041, lng: 28.0473 },
    isLaunched: true,
    activeStoresCount: 128,
    activeDriversCount: 45
  },
  {
    id: 'city-toronto',
    city: 'Toronto',
    country: 'Canada',
    countryCode: 'CA',
    currencySymbol: 'CA$',
    currencyCode: 'CAD',
    exchangeRateToUSD: 0.74,
    centerCoords: { lat: 43.6532, lng: -79.3832 },
    isLaunched: true,
    activeStoresCount: 175,
    activeDriversCount: 52
  },
  {
    id: 'city-sydney',
    city: 'Sydney',
    country: 'Australia',
    countryCode: 'AU',
    currencySymbol: 'A$',
    currencyCode: 'AUD',
    exchangeRateToUSD: 0.65,
    centerCoords: { lat: -33.8688, lng: 151.2093 },
    isLaunched: true,
    activeStoresCount: 130,
    activeDriversCount: 41
  },
  {
    id: 'city-paris',
    city: 'Paris',
    country: 'France',
    countryCode: 'FR',
    currencySymbol: '€',
    currencyCode: 'EUR',
    exchangeRateToUSD: 1.09,
    centerCoords: { lat: 48.8566, lng: 2.3522 },
    isLaunched: true,
    activeStoresCount: 180,
    activeDriversCount: 60
  },
  {
    id: 'city-dubai',
    city: 'Dubai',
    country: 'United Arab Emirates',
    countryCode: 'AE',
    currencySymbol: 'AED',
    currencyCode: 'AED',
    exchangeRateToUSD: 0.27,
    centerCoords: { lat: 25.2048, lng: 55.2708 },
    isLaunched: true,
    activeStoresCount: 215,
    activeDriversCount: 78
  },
  {
    id: 'city-madrid',
    city: 'Madrid',
    country: 'Spain',
    countryCode: 'ES',
    currencySymbol: '€',
    currencyCode: 'EUR',
    exchangeRateToUSD: 1.09,
    centerCoords: { lat: 40.4168, lng: -3.7038 },
    isLaunched: true,
    activeStoresCount: 165,
    activeDriversCount: 54
  },
  {
    id: 'city-berlin',
    city: 'Berlin',
    country: 'Germany',
    countryCode: 'DE',
    currencySymbol: '€',
    currencyCode: 'EUR',
    exchangeRateToUSD: 1.09,
    centerCoords: { lat: 52.5200, lng: 13.4050 },
    isLaunched: true,
    activeStoresCount: 190,
    activeDriversCount: 65
  },
  {
    id: 'city-tokyo',
    city: 'Tokyo',
    country: 'Japan',
    countryCode: 'JP',
    currencySymbol: '¥',
    currencyCode: 'JPY',
    exchangeRateToUSD: 0.0067,
    centerCoords: { lat: 35.6762, lng: 139.6503 },
    isLaunched: true,
    activeStoresCount: 280,
    activeDriversCount: 95
  },
  {
    id: 'city-rome',
    city: 'Rome',
    country: 'Italy',
    countryCode: 'IT',
    currencySymbol: '€',
    currencyCode: 'EUR',
    exchangeRateToUSD: 1.09,
    centerCoords: { lat: 41.9028, lng: 12.4964 },
    isLaunched: true,
    activeStoresCount: 140,
    activeDriversCount: 46
  },
  {
    id: 'city-saopaulo',
    city: 'São Paulo',
    country: 'Brazil',
    countryCode: 'BR',
    currencySymbol: 'R$',
    currencyCode: 'BRL',
    exchangeRateToUSD: 0.18,
    centerCoords: { lat: -23.5505, lng: -46.6333 },
    isLaunched: true,
    activeStoresCount: 175,
    activeDriversCount: 58
  }
];

/**
 * Detect user's country & city using browser timezone and locale,
 * or navigator coordinates if available.
 */
export function detectUserLocation(): GlobalCity {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const lang = navigator.language || '';

    // South Africa
    if (tz.includes('Johannesburg') || tz.includes('Africa/Harare') || lang.includes('en-ZA') || lang.includes('af-ZA')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-capetown') || GLOBAL_LAUNCHED_CITIES[3];
    }
    // United States
    if (tz.includes('Los_Angeles') || tz.includes('Pacific')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-la') || GLOBAL_LAUNCHED_CITIES[1];
    }
    if (tz.includes('New_York') || tz.includes('Eastern') || tz.includes('America/')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-nyc') || GLOBAL_LAUNCHED_CITIES[2];
    }
    // Canada
    if (tz.includes('Toronto') || tz.includes('Vancouver') || tz.includes('Canada')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-toronto') || GLOBAL_LAUNCHED_CITIES[5];
    }
    // Australia
    if (tz.includes('Sydney') || tz.includes('Melbourne') || tz.includes('Australia')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-sydney') || GLOBAL_LAUNCHED_CITIES[6];
    }
    // France
    if (tz.includes('Paris') || lang.includes('fr-FR') || lang.includes('fr-')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-paris') || GLOBAL_LAUNCHED_CITIES[7];
    }
    // Spain
    if (tz.includes('Madrid') || lang.includes('es-ES') || lang.includes('es-')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-madrid') || GLOBAL_LAUNCHED_CITIES[0];
    }
    // Germany
    if (tz.includes('Berlin') || lang.includes('de-DE') || lang.includes('de-')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-berlin') || GLOBAL_LAUNCHED_CITIES[0];
    }
    // Japan
    if (tz.includes('Tokyo') || lang.includes('ja-JP') || lang.includes('ja')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-tokyo') || GLOBAL_LAUNCHED_CITIES[0];
    }
    // Italy
    if (tz.includes('Rome') || lang.includes('it-IT') || lang.includes('it')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-rome') || GLOBAL_LAUNCHED_CITIES[0];
    }
    // Brazil
    if (tz.includes('Sao_Paulo') || lang.includes('pt-BR')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-saopaulo') || GLOBAL_LAUNCHED_CITIES[0];
    }
    // UAE / Middle East
    if (tz.includes('Dubai') || tz.includes('Muscat')) {
      return GLOBAL_LAUNCHED_CITIES.find(c => c.id === 'city-dubai') || GLOBAL_LAUNCHED_CITIES[8];
    }
    // United Kingdom (Default)
    if (tz.includes('London') || lang.includes('en-GB')) {
      return GLOBAL_LAUNCHED_CITIES[0];
    }
  } catch (e) {
    console.warn('Geolocation detection fallback to London', e);
  }

  return GLOBAL_LAUNCHED_CITIES[0];
}

/**
 * Format monetary amount with the current currency symbol & rounding
 */
export function formatCurrency(
  baseAmount: number,
  currencySymbol: string = '£',
  currencyCode: string = 'GBP'
): string {
  // If currency is ZAR or AED, scale the baseline amount proportionally for realistic local prices
  let displayAmount = baseAmount;
  if (currencyCode === 'ZAR') {
    displayAmount = baseAmount * 18.5; // realistic ZAR menu prices (e.g. £15 pizza -> ~R275)
  } else if (currencyCode === 'AED') {
    displayAmount = baseAmount * 4.6;
  } else if (currencyCode === 'CAD' || currencyCode === 'AUD') {
    displayAmount = baseAmount * 1.7;
  } else if (currencyCode === 'USD') {
    displayAmount = baseAmount * 1.25;
  } else if (currencyCode === 'JPY') {
    displayAmount = Math.round(baseAmount * 190);
    return `${currencySymbol}${displayAmount.toLocaleString()}`;
  } else if (currencyCode === 'BRL') {
    displayAmount = baseAmount * 6.5;
  }

  return `${currencySymbol}${displayAmount.toFixed(2)}`;
}
