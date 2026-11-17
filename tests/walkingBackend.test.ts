import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateWalkingUser, createWalkingHandler } from '../supabase/functions/walking-directions/handler.ts';
const from = { latitude: 14.56, longitude: 121.03 }, to = { latitude: 14.56, longitude: 121.031 };
const req = (body: unknown = { from, to }, token = 'session') => new Request('https://example.test/walk', { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
const payload = { sub: 'user_clerk', iss: 'https://clerk.example.test', azp: 'https://app.example.test', email_verified: true };
const config = { clerkIssuer: 'https://clerk.example.test', authorizedParties: ['https://app.example.test'] };
function db(user: any, profile: any) {
  return { auth: { getUser: async () => ({ data: { user }, error: null }) }, from: () => {
    const q: any = { select: () => q, eq: () => q, single: async () => ({ data: profile, error: null }) }; return q;
  } };
}
test('walking auth accepts active Supabase or signed Clerk sessions only', async () => {
  const active = { id: 'profile', status: 'approved' };
  const mustNotVerify = async () => { throw new Error('not Clerk'); };
  assert.equal(await authenticateWalkingUser('token', db({ id: 'profile' }, active), mustNotVerify, config), 'profile');
  assert.equal(await authenticateWalkingUser('token', db(null, active), async () => payload, config), 'profile');
  for (const claims of [{ ...payload, azp: 'https://attacker.test' }, { ...payload, azp: undefined }, { ...payload, iss: 'https://other.test' }, { ...payload, sub: '' }, { ...payload, email_verified: false }]) assert.equal(await authenticateWalkingUser('token', db(null, active), async () => claims, config), null);
  assert.equal(await authenticateWalkingUser('unsigned', db(null, active), mustNotVerify, config), null);
  assert.equal(await authenticateWalkingUser('token', db({ id: 'profile' }, { ...active, status: 'pending' }), mustNotVerify, config), null);
  assert.equal(await authenticateWalkingUser('token', db(null, active), async () => payload, { ...config, authorizedParties: [] }), null);
});
const now = Date.now();
function providerBody() {
  return { type: 'FeatureCollection', metadata: { timestamp: now }, features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] }, properties: { summary: { distance: 108, duration: 120 }, segments: [{ steps: [{ instruction: 'Continue ahead', distance: 108, duration: 120, way_points: [0, 1] }] }] } }] };
}
test('walking handler authenticates and rate limits before requesting a bounded real route', async () => {
  const calls: any[] = [];
  const handler = createWalkingHandler({ authenticate: async token => token === 'session' ? 'user' : null, claim: async () => true, apiKey: 'server-secret',
    fetch: async (url: any, init: any) => { calls.push({ url, init }); return new Response(JSON.stringify(providerBody())); } });
  const response = await handler(req());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'available');
  assert.equal(result.route.accessible, null);
  assert.equal(result.route.distance_meters, 108);
  assert.equal(calls[0].url, 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.coordinates, [[121.03, 14.56], [121.031, 14.56]]);
  assert.deepEqual([body.instructions, body.instructions_format, body.units, body.radiuses], [true, 'text', 'm', [30, 30]]);
  assert.equal(calls[0].init.headers.Authorization, 'server-secret');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal((await handler(req({}, 'unsigned'))).status, 401);
  assert.equal(calls.length, 1);
});
test('missing configuration, malformed coordinates, quota and provider failures never return a path', async () => {
  let calls = 0;
  const options = { authenticate: async () => 'user', claim: async () => true, apiKey: 'key', fetch: async () => { calls++; return new Response('failed', { status: 503 }); } };
  assert.equal((await createWalkingHandler({ ...options, apiKey: '' })(req())).status, 503);
  assert.equal((await createWalkingHandler({ ...options, claim: async () => false })(req())).status, 429);
  for (const body of [{}, { from, to: { latitude: 91, longitude: 0 } }, { from, to: { latitude: 14.7, longitude: 121.1 } }, { from: { latitude: '14.56', longitude: 121 }, to }]) assert.equal((await createWalkingHandler(options)(req(body))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await createWalkingHandler(options)(req())).status, 502);
  assert.equal((await createWalkingHandler({ ...options, fetch: async () => new Response(JSON.stringify({ features: [] })) })(req())).status, 502);
  assert.equal((await createWalkingHandler({ ...options, fetch: async () => { throw new DOMException('Timeout', 'TimeoutError'); } })(req())).status, 502);
  assert.equal((await createWalkingHandler(options)(new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer token' }, body: 'x'.repeat(9000) }))).status, 400);
});

test('concurrent denied or failed quota claims cannot reach the provider', async () => {
  let release!: (allowed: boolean) => void;
  const claim = new Promise<boolean>(resolve => { release = resolve; });
  let calls = 0;
  const handler = createWalkingHandler({ authenticate: async () => 'user', claim: () => claim, apiKey: 'key', fetch: async () => { calls++; return new Response(JSON.stringify(providerBody())); } });
  const responses = [handler(req()), handler(req())];
  release(false);
  assert.deepEqual((await Promise.all(responses)).map(r => r.status), [429, 429]);
  assert.equal(calls, 0);
  const failed = createWalkingHandler({ authenticate: async () => 'user', claim: async () => { throw new Error('database down'); }, apiKey: 'key', fetch: async () => { calls++; return new Response(); } });
  assert.equal((await failed(req())).status, 503);
  assert.equal(calls, 0);
});

test('oversized provider responses and paths ending at a different place are unavailable', async () => {
  const options = { authenticate: async () => 'user', claim: async () => true, apiKey: 'key' };
  const oversized = createWalkingHandler({ ...options, fetch: async () => new Response(' '.repeat(2_000_001)) });
  assert.equal((await oversized(req())).status, 502);
  const wrong = providerBody();
  wrong.features[0].geometry.coordinates[1] = [121.04, 14.56];
  const wrongPlace = createWalkingHandler({ ...options, fetch: async () => new Response(JSON.stringify(wrong)) });
  assert.equal((await wrongPlace(req())).status, 502);
});
