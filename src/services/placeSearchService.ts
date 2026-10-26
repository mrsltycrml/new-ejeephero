import AsyncStorage from '@react-native-async-storage/async-storage';
import { parsePlaces, type PassengerPlace } from './passengerPlaces';

// User-submitted searches only; no background requests or precise passenger GPS sent.
// Provider can be replaced with a hosted Photon-compatible service for production volume.
const endpoint = process.env.EXPO_PUBLIC_PLACE_SEARCH_URL || 'https://photon.komoot.io/api/';
let lastRequest = 0;
export async function searchPassengerPlaces(query: string): Promise<PassengerPlace[]> {
  const q = query.trim();
  if (q.length < 3) throw new Error('Enter at least 3 characters.');
  const cacheKey = `esakay-place-search-v1:${q.toLowerCase()}`;
  try {
    const cached = JSON.parse(await AsyncStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.at < 86400000 && Array.isArray(cached.results)) return cached.results;
  } catch { /* A cache miss must not block a search. */ }
  if (Date.now() - lastRequest < 1200) throw new Error('Please wait a moment before searching again.');
  lastRequest = Date.now();
  const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 12000);
  try {
    const params = new URLSearchParams({ q, limit: '8', lang: 'en', lat: '14.57', lon: '121.03', bbox: '120.85,14.4,121.15,14.75' });
    const response = await fetch(`${endpoint}?${params}`, { signal: abort.signal });
    if (!response.ok) throw new Error('Place search is unavailable. Please try again shortly.');
    const results = parsePlaces(await response.json());
    try { await AsyncStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), results })); } catch { /* Optional cache. */ }
    return results;
  } catch (error: any) {
    throw new Error(error?.name === 'AbortError' ? 'Search took too long. Please try again.' : error?.message || 'Could not search places. Check your connection.');
  } finally { clearTimeout(timeout); }
}
