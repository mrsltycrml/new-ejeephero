import type { TerminalData } from './offlineTransitService';
import { verifiedStop } from './routeMap.ts';

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const https = (value: unknown) => typeof value === 'string' && /^https:\/\/\S+$/.test(value) ? value : null;

export function stopLandmarks(stop: TerminalData | null, now = Date.now()) {
  if (!stop || !verifiedStop(stop)) return null;
  const source = https(stop.stop_details_source_url);
  const verified = Date.parse(stop.stop_details_verified_at || '');
  if (!source || !Number.isFinite(verified) || verified > now + 5000) return null;
  const photoSource = https(stop.landmark_photo_source_url);
  return {
    source, verifiedAt: stop.stop_details_verified_at!,
    description: text(stop.landmark_desc), boardingSide: text(stop.boarding_side),
    direction: text(stop.travel_direction), entrance: text(stop.entrance_instructions),
    photo: photoSource ? https(stop.landmark_photo) : null, photoSource,
  };
}
