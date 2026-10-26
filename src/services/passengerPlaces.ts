import type { TerminalData } from './offlineTransitService';

export type PassengerPlace = { id: string; name: string; address: string; latitude: number; longitude: number };
export function parsePlaces(data: any): PassengerPlace[] {
  if (!Array.isArray(data?.features)) return [];
  return data.features.flatMap((f: any) => {
    const p = f?.properties; const c = f?.geometry?.coordinates;
    if (!p || !Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || c[0] < 120.85 || c[0] > 121.15 || c[1] < 14.4 || c[1] > 14.75) return [];
    const name = p.name || p.street;
    if (typeof name !== 'string') return [];
    return [{ id: `${p.osm_type}-${p.osm_id}`, name, address: [p.housenumber, p.street, p.district, p.city, p.state].filter((v: unknown) => typeof v === 'string').join(', '), longitude: c[0], latitude: c[1] }];
  });
}
function distance(a: PassengerPlace, b: TerminalData) {
  const r = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function nearestRouteStop(place: PassengerPlace, stops: TerminalData[]) {
  const candidates = stops.filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude) && Math.abs(s.latitude) <= 90 && Math.abs(s.longitude) <= 180)
    .map(stop => ({ stop, distance: distance(place, stop), verified: Boolean(stop.location_verified_at && stop.location_source_url) }))
    .filter(s => s.distance <= 2000).sort((a, b) => a.distance - b.distance);
  return candidates[0] || null;
}
