import { GeoPoint } from '../types';

/**
 * Calculates the great-circle distance between two points on the earth's surface
 * using the Haversine formula. Result is in kilometers.
 */
export function calculateDistanceKm(point1: GeoPoint, point2: GeoPoint): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(point2.lat - point1.lat);
  const dLng = toRad(point2.lng - point1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(point1.lat)) *
      Math.cos(toRad(point2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;

  return Math.round(d * 10) / 10; // 1 decimal place
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function isWithinTerritory(
  businessLocation: GeoPoint,
  repHub: GeoPoint,
  radiusKm: number = 20
): { isWithin: boolean; distanceKm: number } {
  const distanceKm = calculateDistanceKm(repHub, businessLocation);
  return {
    isWithin: distanceKm <= radiusKm,
    distanceKm,
  };
}

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

// Convert LatLng to SVG viewport coordinates (normalized around a center)
export function projectToMap(
  point: GeoPoint,
  center: GeoPoint,
  svgWidth: number,
  svgHeight: number,
  scale: number = 3800 // scale factor for ~25km bounding box
): { x: number; y: number } {
  const x = svgWidth / 2 + (point.lng - center.lng) * scale * Math.cos(toRad(center.lat));
  const y = svgHeight / 2 - (point.lat - center.lat) * scale;
  return { x, y };
}
