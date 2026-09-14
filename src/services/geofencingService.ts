import { TerminalData, MAKATI_OFFICIAL_TERMINALS } from './offlineTransitService';

export interface GeofenceEvaluationResult {
  isInsideLegalZone: boolean;
  currentZone: TerminalData | null;
  nearestZone: TerminalData;
  distanceToNearestMeters: number;
  bearingToNearestDegrees: number;
  statusMessage: string;
}

// Haversine formula calculation returning meters
export function computeDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Compute compass bearing from point 1 to point 2 (degrees 0 - 360)
export function computeBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return Math.round(bearing);
}

/**
 * Standard authorized loading bay boundary radius.
 * Official designated waiting sheds in Makati typically have a 40-meter physical boundary.
 */
export const OFFICIAL_BAY_RADIUS_METERS = 45;

/**
 * SO2: Spatial geofencing evaluator
 * Evaluates commuter's current coordinates against all official loading bays.
 */
export function evaluateGeofence(
  userLat: number,
  userLon: number,
  terminals: TerminalData[] = MAKATI_OFFICIAL_TERMINALS
): GeofenceEvaluationResult {
  if (!terminals || terminals.length === 0) {
    terminals = MAKATI_OFFICIAL_TERMINALS;
  }

  let nearestZone = terminals[0];
  let minDistance = computeDistanceMeters(
    userLat,
    userLon,
    terminals[0].latitude,
    terminals[0].longitude
  );

  let matchedZone: TerminalData | null = null;

  for (const terminal of terminals) {
    const dist = computeDistanceMeters(userLat, userLon, terminal.latitude, terminal.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      nearestZone = terminal;
    }
    // Check if user is within the legal loading bay radius
    if (dist <= OFFICIAL_BAY_RADIUS_METERS) {
      matchedZone = terminal;
    }
  }

  const bearing = computeBearing(userLat, userLon, nearestZone.latitude, nearestZone.longitude);

  if (matchedZone) {
    return {
      isInsideLegalZone: true,
      currentZone: matchedZone,
      nearestZone: matchedZone,
      distanceToNearestMeters: minDistance,
      bearingToNearestDegrees: bearing,
      statusMessage: `Legal Boarding Zone: ${matchedZone.name}`,
    };
  }

  return {
    isInsideLegalZone: false,
    currentZone: null,
    nearestZone,
    distanceToNearestMeters: minDistance,
    bearingToNearestDegrees: bearing,
    statusMessage: `Warning: No Loading Area! Proceed ${minDistance}m to ${nearestZone.name}`,
  };
}
