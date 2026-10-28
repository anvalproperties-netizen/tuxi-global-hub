import { Capacitor } from '@capacitor/core';
import { Geolocation, Position, PermissionStatus } from '@capacitor/geolocation';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
  source: 'native_gps' | 'web_geolocation' | 'mock_telemetry';
}

export interface GeolocationResult {
  success: boolean;
  coords?: LocationCoordinates;
  error?: string;
  source: 'native_gps' | 'web_geolocation' | 'mock_telemetry';
}

/**
 * Checks location permission status without prompting.
 */
export async function checkLocationPermissions(): Promise<'granted' | 'denied' | 'prompt'> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status: PermissionStatus = await Geolocation.checkPermissions();
      if (status.location === 'granted') return 'granted';
      if (status.location === 'denied') return 'denied';
      return 'prompt';
    } catch (err) {
      console.warn('[Geolocation] Failed to check native location permissions:', err);
      return 'prompt';
    }
  }

  if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      return perm.state;
    } catch {
      return 'prompt';
    }
  }

  return 'prompt';
}

/**
 * Explicitly requests location permissions on demand.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Geolocation.requestPermissions({ permissions: ['location'] });
      return status.location === 'granted';
    } catch (err) {
      console.warn('[Geolocation] Native permission request rejected:', err);
      return false;
    }
  }

  return true;
}

/**
 * Retrieves the current device location with high accuracy and sensible timeouts.
 * Strictly requires explicit user invocation.
 * Background continuous tracking is prohibited without a separate background-runner task.
 */
export async function getCurrentDevicePosition(options?: {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}): Promise<GeolocationResult> {
  const enableHighAccuracy = options?.enableHighAccuracy ?? true;
  const timeout = options?.timeoutMs ?? 10000;
  const maximumAge = options?.maximumAgeMs ?? 3000;

  // 1. Native Capacitor Geolocation (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      const permGranted = await requestLocationPermissions();
      if (!permGranted) {
        return {
          success: false,
          error: 'PERMISSION_DENIED: Geolocation access was denied by the user.',
          source: 'native_gps'
        };
      }

      const position: Position = await Geolocation.getCurrentPosition({
        enableHighAccuracy,
        timeout,
        maximumAge
      });

      return {
        success: true,
        coords: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          altitude: position.coords.altitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
          timestamp: position.timestamp,
          source: 'native_gps'
        },
        source: 'native_gps'
      };
    } catch (err: any) {
      return {
        success: false,
        error: `NATIVE_GPS_ERROR: ${err.message || 'Failed to acquire native GPS fix'}`,
        source: 'native_gps'
      };
    }
  }

  // 2. Web Browser Geolocation Fallback
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({
        success: false,
        error: 'ENVIRONMENT_ERROR: Geolocation is not supported by this runtime.',
        source: 'web_geolocation'
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          success: true,
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
            timestamp: pos.timestamp,
            source: 'web_geolocation'
          },
          source: 'web_geolocation'
        });
      },
      (err) => {
        let errorMsg = 'Failed to acquire location';
        if (err.code === 1) errorMsg = 'PERMISSION_DENIED: Geolocation permission was denied by user.';
        else if (err.code === 2) errorMsg = 'POSITION_UNAVAILABLE: GPS / Network position unavailable.';
        else if (err.code === 3) errorMsg = 'TIMEOUT: Location acquisition timed out.';

        resolve({
          success: false,
          error: errorMsg,
          source: 'web_geolocation'
        });
      },
      {
        enableHighAccuracy,
        timeout,
        maximumAge
      }
    );
  });
}

/**
 * Calculates great-circle Haversine distance between two coordinates in metres.
 * Used for client-side advisory checks; authoritative validation is strictly server-side PostGIS.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's mean radius in metres
  const toRad = (val: number) => (val * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Client-side boundary pre-check against TUXI Rep 20 km territory rule.
 * Device coordinates can never override the server-side PostGIS boundary.
 */
export function verifyCoordinatesAgainstRepTerritory(
  hubLat: number,
  hubLng: number,
  targetLat: number,
  targetLng: number,
  maxMeters = 20000.0
): { isWithin: boolean; distanceMeters: number; maxAllowedMeters: number } {
  const distanceMeters = calculateHaversineDistanceMeters(hubLat, hubLng, targetLat, targetLng);
  return {
    isWithin: distanceMeters <= maxMeters,
    distanceMeters,
    maxAllowedMeters: maxMeters
  };
}
