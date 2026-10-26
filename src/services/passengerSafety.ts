// Pure location rules: an absent stop is never proof that loading is illegal.
export type LoadingZone = {
  id: string; name: string; kind: 'loading' | 'no_loading';
  latitude: number; longitude: number; radius_meters: number;
  source_url: string; verified_at: string;
  photo_url?: string | null; photo_source_url?: string | null;
  photo_caption?: string | null; boarding_instructions?: string | null;
};
export type PassengerFix = { latitude: number; longitude: number; accuracy: number | null; timestamp: number };
export type BoardingStatus = { kind: 'unavailable' | 'uncertain' | 'allowed' | 'prohibited' | 'outside'; title: string; detail: string; zone?: LoadingZone };

export function isVerifiedLoadingZone(zone: LoadingZone) {
  return /^https:\/\//.test(zone.source_url) && Number.isFinite(Date.parse(zone.verified_at))
    && Number.isFinite(zone.latitude) && Math.abs(zone.latitude) <= 90
    && Number.isFinite(zone.longitude) && Math.abs(zone.longitude) <= 180
    && Number.isFinite(zone.radius_meters) && zone.radius_meters > 0 && zone.radius_meters <= 500;
}

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (n: number) => n * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function evaluateBoardingLocation(fix: PassengerFix | null, zones: LoadingZone[], now = Date.now()): BoardingStatus {
  if (!fix || now - fix.timestamp > 60_000 || fix.timestamp > now + 5000) return { kind: 'unavailable', title: 'Location needed', detail: 'Allow location access to check your waiting area.' };
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude) || Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180 || fix.accuracy == null || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 30) {
    return { kind: 'uncertain', title: 'Checking your location', detail: 'The GPS signal is not precise enough yet. Follow the signs at your stop.' };
  }
  const verified = zones.filter(isVerifiedLoadingZone);
  if (!verified.length) return { kind: 'unavailable', title: 'Follow designated loading signs', detail: 'Loading-area coverage is not available here yet. Wait at a marked eSAKAY stop.' };
  const candidates = verified.map(zone => ({ zone, distance: distanceMeters(fix, zone) }));
  const prohibited = candidates.find(x => x.zone.kind === 'no_loading' && x.distance + fix.accuracy! <= x.zone.radius_meters);
  if (prohibited) return { kind: 'prohibited', title: 'No loading in this area', detail: `You are in ${prohibited.zone.name}. Move to a designated loading bay before boarding.`, zone: prohibited.zone };
  // A fix that overlaps a prohibited boundary must never be marked safe.
  if (candidates.some(x => x.zone.kind === 'no_loading' && x.distance - fix.accuracy! <= x.zone.radius_meters)) return { kind: 'uncertain', title: 'Near a no-loading boundary', detail: 'Check the posted loading signs before boarding.' };
  const allowed = candidates.find(x => x.zone.kind === 'loading' && x.distance + fix.accuracy! <= x.zone.radius_meters);
  if (allowed) return { kind: 'allowed', title: 'At a designated loading bay', detail: allowed.zone.name, zone: allowed.zone };
  const nearest = candidates.filter(x => x.zone.kind === 'loading').sort((a, b) => a.distance - b.distance)[0];
  if (nearest && nearest.distance <= 1000) return { kind: 'outside', title: 'Outside the mapped loading bays', detail: `Wait at a marked stop. ${nearest.zone.name} is about ${Math.round(nearest.distance)} m away in a straight line.`, zone: nearest.zone };
  return { kind: 'unavailable', title: 'Follow designated loading signs', detail: 'Your location is outside the mapped loading areas. Check the signs where you are waiting.' };
}

export const BOARDING_EDUCATION = 'eSAKAY supports Makati’s transport modernization and strict loading rules. Board and alight only at designated stops. Keep crossings and traffic lanes clear.';
export const MAKATI_LOADING_SOURCE = 'https://www.makati.gov.ph/content/resolutions-and-ordinances/author/maccay%2C-elena/eeb420a6-a095-bd4a-bb85-8f62c75300c1?type=all';

export function normalizeEmergencyPhone(raw: string): string | null {
  const phone = raw.trim().replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(phone)) return `+63${phone.slice(1)}`;
  if (/^639\d{9}$/.test(phone)) return `+${phone}`;
  return /^\+639\d{9}$/.test(phone) ? phone : null;
}

export function buildEmergencyMessage(input: { message?: string; fix: PassengerFix; body?: string | null; plate?: string | null; isSample?: boolean }) {
  const { fix } = input;
  return `${input.message || 'EMERGENCY! I need help. Please check on me.'}\n\neSAKAY emergency alert${input.isSample ? ' [TEST RIDE — SAMPLE UNIT]' : ''}\nLocation: https://maps.google.com/?q=${fix.latitude},${fix.longitude}\nRecorded: ${new Date(fix.timestamp).toISOString()}${fix.accuracy == null ? '' : `\nGPS accuracy: ±${Math.round(fix.accuracy)} m`}\nBody number: ${input.body || 'Not selected'}\nPlate number: ${input.plate || 'Not selected'}`;
}

export const EMERGENCY_HOTLINES = [
  { name: 'National emergency', number: '911', dial: '911', source: 'https://ehotlines.e.gov.ph/' },
  { name: 'Makati Command Control', number: '168', dial: '168', source: 'https://barangaybelair.ph/emergency/' },
  { name: 'Makati emergency landline', number: '(02) 8236-5790', dial: '+63282365790', source: 'https://barangaybelair.ph/emergency/' },
];
