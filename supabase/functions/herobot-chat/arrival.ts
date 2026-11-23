import { projectOntoSegment } from '../_shared/routeProjection.ts';
import { distanceMeters, validPoint, validSource, type Point } from '../walking-directions/contract.ts';

export type ArrivalFix = Point & {
  route_id: string;
  recorded_at: string;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
};

type ArrivalRoute = { id: string; coordinates?: unknown; geometry_verified_at?: unknown; geometry_source_url?: unknown };

export function arrivalForRoute(route: ArrivalRoute, vehicles: ArrivalFix[], now: number) {
  const { coordinates, geometry_verified_at, geometry_source_url } = route;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 20000 || !coordinates.every(validPoint)
    || !validSource(geometry_source_url, geometry_verified_at, now)
    || typeof geometry_verified_at !== 'string' || Date.parse(geometry_verified_at) > now) return () => null;

  let offset = 0;
  const segments = coordinates.slice(1).map((end, index) => {
    const start: Point = coordinates[index];
    const length = distanceMeters(start, end);
    const heading = Math.atan2((end.longitude - start.longitude) * Math.cos(start.latitude * Math.PI / 180), end.latitude - start.latitude) * 180 / Math.PI;
    const segment = { start, end, offset, length, heading };
    offset += length;
    return segment;
  }).filter(segment => segment.length > 0.01);

  function locate(target: Point, maxDistance: number, uncertainty: number) {
    const candidates = segments.map(segment => {
      const { point, fraction } = projectOntoSegment(segment.start, segment.end, target);
      return { along: segment.offset + segment.length * fraction, distance: distanceMeters(point, target), heading: segment.heading };
    });
    const best = candidates.reduce<typeof candidates[number] | null>(
      (previous, item) => !previous || item.distance < previous.distance ? item : previous, null,
    );
    if (!best || best.distance > maxDistance || candidates.some(candidate =>
      candidate.distance <= best.distance + uncertainty && Math.abs(candidate.along - best.along) > 75)) return null;
    return best;
  }

  const approaching = vehicles.flatMap(vehicle => {
    const { accuracy, heading, speed, recorded_at } = vehicle;
    const captured = Date.parse(recorded_at);
    if (vehicle.route_id !== route.id || !validPoint(vehicle) || !Number.isFinite(captured)
      || captured < now - 30000 || captured > now + 5000 || captured < Date.parse(geometry_verified_at)
      || accuracy == null || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 30
      || heading == null || !Number.isFinite(heading) || heading < 0 || heading >= 360
      || speed == null || !Number.isFinite(speed) || speed < 4 || speed > 80) return [];
    const match = locate(vehicle, 50 - accuracy, Math.max(1, accuracy));
    if (!match || Math.abs(((heading - match.heading + 540) % 360) - 180) > 45) return [];
    const metresPerSecond = speed / 3.6;
    const elapsedSeconds = Math.max(0, now - captured) / 1000;
    return [{ along: match.along + metresPerSecond * elapsedSeconds, accuracy, metresPerSecond, recorded_at }];
  });

  return (stop: unknown) => {
    if (!approaching.length || !validPoint(stop)) return null;
    const match = locate(stop, 30, 2);
    if (!match) return null;
    let best: { seconds: number; fromGpsAt: string } | null = null;
    for (const vehicle of approaching) {
      const remaining = match.along - vehicle.along;
      const seconds = remaining / vehicle.metresPerSecond;
      if (remaining <= vehicle.accuracy || seconds > 900 || (best && seconds >= best.seconds)) continue;
      best = { seconds, fromGpsAt: vehicle.recorded_at };
    }
    // shortcut: use current measured speed; replace with calibrated traffic and dwell estimates when those data are available.
    return best && { minutes: Math.max(1, Math.ceil(best.seconds / 60)), fromGpsAt: best.fromGpsAt };
  };
}
