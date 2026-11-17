import { distanceMeters, parseOrsRoute, validPoint } from './contract.ts';

type AuthConfig = { clerkIssuer?: string; authorizedParties: string[] };
// verifyClerk must verify the signature, issuer, exp and iat before returning claims.
export async function authenticateWalkingUser(token: string, db: any, verifyClerk: (token: string) => Promise<any>, config: AuthConfig): Promise<string | null> {
  if (!token || token.length > 8192) return null;
  try {
    const { data, error } = await db.auth.getUser(token);
    let userId = !error ? data?.user?.id : null;
    if (!userId) {
      if (!config.clerkIssuer?.startsWith('https://') || !config.authorizedParties.length) return null;
      const claims = await verifyClerk(token);
      if (claims.iss !== config.clerkIssuer || typeof claims.sub !== 'string' || !claims.sub
        || (claims.email_verified !== true && claims.email_verified !== 'true')
        || typeof claims.azp !== 'string' || !config.authorizedParties.includes(claims.azp)) return null;
      const result = await db.from('profiles').select('id').eq('clerk_id', claims.sub).single();
      if (result.error) return null;
      userId = result.data?.id;
    }
    if (!userId) return null;
    const profile = await db.from('profiles').select('status').eq('id', userId).single();
    return !profile.error && profile.data?.status === 'approved' ? userId : null;
  } catch { return null; }
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const unavailable = (reason: string, status: number) => json({ status: 'unavailable', reason }, status);
const inArea = (p: any) => validPoint(p) && p.latitude >= 14.4 && p.latitude <= 14.75 && p.longitude >= 120.85 && p.longitude <= 121.15;

async function boundedJson(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal) {
  if (!body) throw new Error('Missing body');
  const reader = body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

type Dependencies = {
  authenticate: (token: string) => Promise<string | null>;
  claim: (userId: string) => Promise<boolean>;
  apiKey: string | undefined;
  fetch: typeof fetch;
};
export function createWalkingHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (request.method !== 'POST') return unavailable('Method not allowed.', 405);
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token || token.length > 8192) return unavailable('Sign in to request directions.', 401);
    try {
      const userId = await deps.authenticate(token);
      if (!userId) return unavailable('Sign in with an active account to request directions.', 401);
      let body: any;
      try { body = await boundedJson(request.body, 8192, AbortSignal.timeout(5000)); }
      catch { return unavailable('Choose two valid nearby locations.', 400); }
      if (!inArea(body?.from) || !inArea(body?.to) || distanceMeters(body.from, body.to) < 1 || distanceMeters(body.from, body.to) > 5000) return unavailable('Choose two locations within 5 km in the service area.', 400);
      if (!deps.apiKey) return unavailable('Walking directions are not available yet. Follow local signs and try again later.', 503);
      if (!await deps.claim(userId)) return unavailable('Request limit reached. Wait before trying again.', 429);
      try {
        const signal = AbortSignal.timeout(10000);
        const response = await deps.fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
          method: 'POST', redirect: 'error', signal,
          headers: { Authorization: deps.apiKey, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
          body: JSON.stringify({ coordinates: [[body.from.longitude, body.from.latitude], [body.to.longitude, body.to.latitude]], instructions: true, instructions_format: 'text', language: 'en', units: 'm', radiuses: [30, 30] }),
        });
        if (!response.ok) { await response.body?.cancel(); return unavailable('Walking directions are unavailable. Try again later.', 502); }
        const route = parseOrsRoute(await boundedJson(response.body, 2_000_000, signal), body.from, body.to);
        return route ? json({ status: 'available', route }) : unavailable('A complete walking path could not be found. Follow local signs.', 502);
      } catch { return unavailable('Could not load walking directions. Try again later.', 502); }
    } catch {
      // Coordinates and tokens are never logged or stored.
      return unavailable('Walking directions are unavailable. Try again later.', 503);
    }
  };
}
