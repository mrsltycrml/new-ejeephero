import { parsePlaces, type PassengerPlace } from './passengerPlaces.ts';
import { corridorBounds, inRouteCorridor, rankPlaces, routePlaceCatalog, type PassengerPlaceSearchScope } from './routePlaceSearch.ts';
export { searchLocalPassengerPlaces, PLACE_CORRIDOR_METERS, type PassengerPlaceSearchScope } from './routePlaceSearch.ts';

// Only the typed query and catalog map bounds go to the provider.
const endpoint = process.env.EXPO_PUBLIC_PLACE_SEARCH_URL || 'https://photon.komoot.io/api/';
let lastRequest = 0;

const cancelled = () => Object.assign(new Error('Place search cancelled.'), { name: 'AbortError' });
function checkCancellation(signal?: AbortSignal) {
  if (signal?.aborted) throw cancelled();
}

function waitForSlot(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(cancelled());
    }
    signal?.addEventListener('abort', onAbort);
  });
}

export async function searchPassengerPlaces(query: string, scope: PassengerPlaceSearchScope, signal?: AbortSignal): Promise<PassengerPlace[]> {
  checkCancellation(signal);
  const q = query.trim();
  if (!scope || !q) return [];
  const { places, lines } = routePlaceCatalog(scope);
  const local = rankPlaces(q, places);
  if (q.length < 3 || !lines.length) return local;
  while (Date.now() - lastRequest < 1200) {
    await waitForSlot(1200 - (Date.now() - lastRequest), signal);
    checkCancellation(signal);
  }
  lastRequest = Date.now();
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  signal?.addEventListener('abort', onAbort);
  const timeout = setTimeout(onAbort, 12000);
  try {
    const bounds = corridorBounds(lines);
    const [west, south, east, north] = bounds;
    const params = new URLSearchParams({ q, limit: '24', lang: 'en',
      lat: String((south + north) / 2), lon: String((west + east) / 2), bbox: bounds.join(',') });
    const response = await fetch(`${endpoint}?${params}`, { signal: abort.signal });
    if (!response.ok) throw new Error('Place search is unavailable. Please try again shortly.');
    const results = parsePlaces(await response.json(), bounds);
    checkCancellation(signal);
    if (abort.signal.aborted) throw new Error('Search took too long. Please try again.');
    return rankPlaces(q, local, results.filter(place => inRouteCorridor(place, lines)));
  } catch (error: any) {
    checkCancellation(signal);
    if (local.length) return local;
    throw new Error(abort.signal.aborted ? 'Search took too long. Please try again.' : error?.message || 'Could not search places. Check your connection.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
