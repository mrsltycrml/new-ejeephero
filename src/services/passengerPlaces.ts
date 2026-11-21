import type { TerminalData } from './offlineTransitService';
import { permitsPassengerUse } from './routeMap.ts';

export type PassengerPlace = { id: string; name: string; address: string; latitude: number; longitude: number };
export type PlaceBounds = [west: number, south: number, east: number, north: number];
export function parsePlaces(data: any, [west, south, east, north]: PlaceBounds): PassengerPlace[] {
  if (!Array.isArray(data?.features)) return [];
  return data.features.flatMap((f: any) => {
    const p = f?.properties; const c = f?.geometry?.coordinates;
    if (!p || !Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || c[0] < west || c[0] > east || c[1] < south || c[1] > north) return [];
    const name = [p.name, p.street].find(value => typeof value === 'string' && value.trim())?.trim();
    if (!name) return [];
    const id = p.osm_type && p.osm_id != null ? `${p.osm_type}-${p.osm_id}` : `place:${name}:${c[0]},${c[1]}`;
    return [{ id, name, address: [p.housenumber, p.street, p.district, p.city, p.state].filter((v: unknown) => typeof v === 'string').join(', '), longitude: c[0], latitude: c[1] }];
  });
}
function distance(a: PassengerPlace, b: TerminalData) {
  const r = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function nearestRouteStop(place: PassengerPlace, stops: TerminalData[]) {
  const candidates = stops.filter(stop => permitsPassengerUse(stop, 'alight'))
    .map(stop => ({ stop, distance: distance(place, stop), verified: true }))
    .filter(s => s.distance <= 2000).sort((a, b) => a.distance - b.distance);
  return candidates[0] || null;
}
