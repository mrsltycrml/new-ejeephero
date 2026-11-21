import type { RouteData, TerminalData } from './offlineTransitService';
import type { Point } from './locationQuality.ts';
import type { PassengerPlace, PlaceBounds } from './passengerPlaces.ts';
import { passengerMapOverview } from './passengerMapOverview.ts';
import { meters } from './passengerJourney.ts';
import { activeRoute, projectOntoSegment, verifiedRoute, verifiedStop } from './routeMap.ts';
import { stopLandmarks } from './stopLandmarks.ts';

export type PassengerPlaceSearchScope = { routes: RouteData[]; stops: TerminalData[]; selectedRouteId?: string | null };
export const PLACE_CORRIDOR_METERS = 500;

export function routePlaceCatalog({ routes, stops, selectedRouteId }: PassengerPlaceSearchScope) {
  const scopedRoutes = routes.filter(r => activeRoute(r) && (!selectedRouteId || selectedRouteId === r.id));
  const routeNames = new Map(scopedRoutes.map(route => [route.id, route.name]));
  const located = stops.filter(s => routeNames.has(s.route_id) && verifiedStop(s));
  const overview = passengerMapOverview(scopedRoutes, located, selectedRouteId);
  const lines = [...scopedRoutes.filter(verifiedRoute).map(r => r.coordinates), ...(overview?.referenceLines.map(l => l.coordinates) ?? [])];
  const places: PassengerPlace[] = located.map(s => ({
    id: 'stop:' + s.id, name: s.name, latitude: s.latitude, longitude: s.longitude,
    address: [stopLandmarks(s)?.description, routeNames.get(s.route_id)].filter(Boolean).join(' · '),
  }));
  if (overview) {
    for (const pin of overview.landmarks) {
      places.push({ id: 'landmark:' + pin.id, name: pin.name, address: 'Map reference · ' + overview.variant.label, ...pin.point });
    }
  }
  return { places, lines };
}

export function corridorBounds(lines: Point[][]): PlaceBounds {
  let west = 180, south = 90, east = -180, north = -90;
  for (const line of lines) {
    for (const p of line) {
      west = Math.min(west, p.longitude);
      east = Math.max(east, p.longitude);
      south = Math.min(south, p.latitude);
      north = Math.max(north, p.latitude);
    }
  }
  // Slightly overpad the provider's bounds. Segment distance decides membership.
  const latPad = PLACE_CORRIDOR_METERS / 110000;
  const lonPad = latPad / Math.cos(Math.max(Math.abs(north), Math.abs(south)) * Math.PI / 180);
  return [Math.max(-180, west - lonPad), Math.max(-90, south - latPad), Math.min(180, east + lonPad), Math.min(90, north + latPad)];
}

export function inRouteCorridor(place: Point, lines: Point[][]) {
  return lines.some(line => line.some((end, i) => i > 0 &&
    meters(place, projectOntoSegment(line[i - 1], end, place).point) <= PLACE_CORRIDOR_METERS));
}

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function rankPlaces(query: string, local: PassengerPlace[], remote: PassengerPlace[] = []) {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(' ');
  const ranked = [...local, ...remote].map((place, index) => {
    const name = normalize(place.name);
    const nameWords = name.split(' ');
    let score = 5;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (words.every(word => nameWords.some(part => part.startsWith(word)))) score = 2;
    else if (name.includes(q)) score = 3;
    else if (normalize(place.address).includes(q)) score = 4;
    return { place, score, name, local: index < local.length };
  }).filter(hit => hit.score < 5 || !hit.local).sort((a, b) => a.score - b.score || Number(b.local) - Number(a.local));
  const hits: typeof ranked = [];
  for (const hit of ranked) {
    if (hits.some(other => other.place.id === hit.place.id || (other.name === hit.name && meters(other.place, hit.place) <= 40))) continue;
    hits.push(hit);
    if (hits.length === 8) break;
  }
  return hits.map(hit => hit.place);
}

export function searchLocalPassengerPlaces(query: string, scope: PassengerPlaceSearchScope): PassengerPlace[] {
  return scope && query.trim() ? rankPlaces(query, routePlaceCatalog(scope).places) : [];
}
