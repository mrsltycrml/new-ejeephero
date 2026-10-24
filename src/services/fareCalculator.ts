function computeDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type FarePassengerType = 'regular' | 'student' | 'senior' | 'pwd';

export interface FareRouteStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence_order: number;
}

export interface FareRouteConfig {
  base_fare: number;
  per_km_rate: number;
  base_distance_km?: number;
}

export interface WalkAndSaveSuggestion {
  stop: FareRouteStop;
  walkDistanceMeters: number;
  walkingTimeMinutes: number;
  currentFare: number;
  suggestedFare: number;
  savings: number;
}

const DISCOUNT_RATE: Record<FarePassengerType, number> = {
  regular: 0,
  student: 0.2,
  senior: 0.2,
  pwd: 0.2,
};

export function calculateConfiguredFare(
  distanceKm: number,
  route: FareRouteConfig,
  passengerType: FarePassengerType,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  const baseFare = Math.max(0, route.base_fare || 0);
  const rate = Math.max(0, route.per_km_rate || 0);
  const includedKm = Math.max(0, route.base_distance_km ?? 4);
  const discount = 1 - DISCOUNT_RATE[passengerType];
  const fare = (baseFare * discount)
    + (Math.max(0, distanceKm - includedKm) * rate * discount);
  // LTFRB fare matrices round the resulting fare to the nearest ₱0.25.
  return Math.round(fare * 4) / 4;
}

export function routeDistanceKm(stops: FareRouteStop[]): number {
  const ordered = [...stops].sort((a, b) => a.sequence_order - b.sequence_order);
  let meters = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    meters += computeDistanceMeters(
      ordered[i - 1].latitude,
      ordered[i - 1].longitude,
      ordered[i].latitude,
      ordered[i].longitude,
    );
  }
  return meters / 1000;
}

export function findWalkAndSaveSuggestion(args: {
  origin: { latitude: number; longitude: number };
  destination: FareRouteStop;
  stops: FareRouteStop[];
  route: FareRouteConfig;
  passengerType: FarePassengerType;
  maxWalkMeters?: number;
  walkingMetersPerMinute?: number;
}): WalkAndSaveSuggestion | null {
  const { origin, destination, route, passengerType } = args;
  const maxWalkMeters = args.maxWalkMeters ?? 300;
  const walkingMetersPerMinute = args.walkingMetersPerMinute ?? 75;
  const ordered = [...args.stops].sort((a, b) => a.sequence_order - b.sequence_order);
  const destinationIndex = ordered.findIndex((stop) => stop.id === destination.id);
  if (destinationIndex <= 0) return null;

  const candidates = ordered
    .slice(0, destinationIndex)
    .map((stop) => ({
      stop,
      distanceMeters: computeDistanceMeters(origin.latitude, origin.longitude, stop.latitude, stop.longitude),
    }))
    .filter((candidate) => candidate.distanceMeters <= maxWalkMeters);

  if (!candidates.length) return null;

  const nearest = candidates.reduce((best, current) =>
    current.distanceMeters < best.distanceMeters ? current : best,
  );
  const nearestIndex = ordered.findIndex((stop) => stop.id === nearest.stop.id);
  const currentFare = calculateConfiguredFare(
    routeDistanceKm(ordered.slice(nearestIndex, destinationIndex + 1)),
    route,
    passengerType,
  );

  const cheaper = candidates
    .map((candidate) => {
      const boardIndex = ordered.findIndex((stop) => stop.id === candidate.stop.id);
      const segmentDistance = routeDistanceKm(ordered.slice(boardIndex, destinationIndex + 1));
      const fare = calculateConfiguredFare(segmentDistance, route, passengerType);
      return { ...candidate, fare };
    })
    .filter((candidate) => candidate.fare < currentFare)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.fare - b.fare)[0];

  if (!cheaper) return null;
  return {
    stop: cheaper.stop,
    walkDistanceMeters: Math.round(cheaper.distanceMeters),
    walkingTimeMinutes: Math.max(1, Math.ceil(cheaper.distanceMeters / walkingMetersPerMinute)),
    currentFare,
    suggestedFare: cheaper.fare,
    savings: Math.round((currentFare - cheaper.fare) * 100) / 100,
  };
}
