export type Point = { latitude: number; longitude: number };
export type WalkingStep = { instruction: string; distance_meters: number; duration_seconds: number };
export type WalkingRoute = {
  coordinates: Point[]; distance_meters: number; duration_seconds: number;
  steps: WalkingStep[]; source_url: string; verified_at: string; accessible: boolean | null;
};
export type WalkingResult = { status: 'available'; route: WalkingRoute } | { status: 'unavailable'; reason: string };

export const validPoint = (p: any): p is Point => p != null && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
export const validDateKey = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
export function validSource(source: unknown, timestamp: unknown, now = Date.now()): boolean {
  if (typeof source !== 'string' || typeof timestamp !== 'string' || !validDateKey(timestamp.slice(0, 10))) return false;
  if (timestamp.length !== 10 && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(timestamp)) return false;
  const time = Date.parse(timestamp);
  try { const url = new URL(source); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && Number.isFinite(time) && time <= now + 5000; } catch { return false; }
}
export function distanceMeters(a: Point, b: Point): number {
  const r = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
const positive = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= max;
const coherent = (a: number, b: number) => Math.abs(a - b) <= Math.max(5, a * .02);

// Validate both stored paths and the function response before displaying a route.
export function parseWalkingRoute(value: any, from: Point, to: Point, now = Date.now()): WalkingRoute | null {
  if (!value || !validPoint(from) || !validPoint(to) || !validSource(value.source_url, value.verified_at, now)
    || !positive(value.distance_meters, 10000) || !positive(value.duration_seconds, 14400)
    || !Array.isArray(value.coordinates) || value.coordinates.length < 2 || value.coordinates.length > 20000 || !value.coordinates.every(validPoint)
    || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > 500) return null;
  const points: Point[] = value.coordinates;
  if (distanceMeters(from, points[0]) > 30 || distanceMeters(to, points[points.length - 1]) > 30) return null;
  const steps: WalkingStep[] = [];
  for (const s of value.steps) {
    if (!s || typeof s.instruction !== 'string' || !s.instruction.trim() || s.instruction.length > 500 || /[<>\u0000-\u001f]/.test(s.instruction)
      || !Number.isFinite(s.distance_meters) || s.distance_meters < 0 || !Number.isFinite(s.duration_seconds) || s.duration_seconds < 0) return null;
    steps.push({ instruction: s.instruction.trim(), distance_meters: s.distance_meters, duration_seconds: s.duration_seconds });
  }
  const length = points.slice(1).reduce((sum, p, i) => sum + distanceMeters(points[i], p), 0);
  if (length < 1 || length > value.distance_meters * 1.15 + 30 || value.distance_meters < distanceMeters(from, to) - 60
    || !coherent(value.distance_meters, steps.reduce((sum, s) => sum + s.distance_meters, 0))
    || !coherent(value.duration_seconds, steps.reduce((sum, s) => sum + s.duration_seconds, 0))) return null;
  return { coordinates: points.map(p => ({ latitude: p.latitude, longitude: p.longitude })), steps,
    distance_meters: value.distance_meters, duration_seconds: value.duration_seconds, source_url: value.source_url,
    verified_at: value.verified_at, accessible: typeof value.accessible === 'boolean' ? value.accessible : null };
}

export function parseOrsRoute(data: any, from: Point, to: Point, now = Date.now()): WalkingRoute | null {
  const feature = data?.type === 'FeatureCollection' && data.features?.length === 1 ? data.features[0] : null;
  const raw = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : null;
  const properties = feature?.properties, timestamp = data?.metadata?.timestamp;
  if (!Array.isArray(raw) || raw.some(p => !Array.isArray(p) || p.length < 2) || !Number.isFinite(timestamp) || timestamp < now - 60000 || timestamp > now + 5000
    || !Array.isArray(properties?.segments) || properties.segments.length !== 1 || !Array.isArray(properties.segments[0]?.steps)) return null;
  let end = 0;
  const steps: WalkingStep[] = [];
  for (const step of properties.segments[0].steps) {
    const indices = step?.way_points;
    if (!Array.isArray(indices) || indices.length !== 2 || !indices.every(Number.isInteger) || indices[0] !== end || indices[1] < end || indices[1] >= raw.length) return null;
    end = indices[1];
    steps.push({ instruction: step.instruction, distance_meters: step.distance, duration_seconds: step.duration });
  }
  if (end !== raw.length - 1) return null;
  return parseWalkingRoute({ coordinates: raw.map(p => ({ longitude: p[0], latitude: p[1] })), steps,
    distance_meters: properties.summary?.distance, duration_seconds: properties.summary?.duration,
    source_url: 'https://openrouteservice.org/', verified_at: new Date(timestamp).toISOString(), accessible: null }, from, to, now);
}
