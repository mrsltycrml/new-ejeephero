import test from 'node:test';
import assert from 'node:assert/strict';
import { quotePassengerFare, findVerifiedSavings, verifiedRideDistance, type FareMatrix } from '../src/services/passengerFare.ts';

const date = '2026-11-18';
const evidence = { source_url: 'https://example.test/source', verified_at: '2026-11-01T00:00:00Z' };
const matrix: FareMatrix = { ...evidence, route_id: 'r', currency: 'PHP', effective_from: '2026-11-01', effective_to: null, brackets: [{ up_to_km: 4, regular: 15, discounted: 11 }, { up_to_km: 8, regular: 20, discounted: 14 }] };
const stops = ['a', 'b', 'c', 'branch'].map((id, i) => ({ id, name: id, route_id: 'r', latitude: 14.56, longitude: 121.03 + i * .001, sequence_order: i, location_source_url: evidence.source_url, location_verified_at: evidence.verified_at,
  passenger_use: 'both' as const, passenger_use_source_url: evidence.source_url, passenger_use_verified_at: evidence.verified_at }));
const segments = [{ ...evidence, route_id: 'r', from_stop_id: 'a', to_stop_id: 'b', distance_meters: 3000 }, { ...evidence, route_id: 'r', from_stop_id: 'b', to_stop_id: 'c', distance_meters: 4000 }];
const walk = { ...evidence, from_stop_id: 'a', to_stop_id: 'b', distance_meters: 108, duration_seconds: 120, accessible: null, accessibility_source_url: null, accessibility_verified_at: null, coordinates: stops.slice(0, 2).map(({latitude, longitude}) => ({latitude, longitude})), steps: [{ instruction: 'Follow the marked path', distance_meters: 108, duration_seconds: 120, fromIndex: 0, toIndex: 1 }] };
const input = { originId: 'a', destinationId: 'c', routeId: 'r', type: 'regular' as const, stops, segments, walks: [walk], matrix, date, maxWalkMeters: 500 };

test('fare requires a current selected-route matrix; no formula or authority inference', () => {
  for (const source of [null, { ...matrix, route_id: 'other' }, { ...matrix, effective_to: '2026-11-17' }, { ...matrix, effective_from: '2026-11-19' }]) assert.equal(quotePassengerFare(4, 'regular', { id: 'r' }, source, date), null);
  const quote = quotePassengerFare(4, 'student', { id: 'r' }, matrix, date)!;
  assert.deepEqual([quote.regular, quote.discount, quote.amount, quote.basis], [15, 4, 11, 'Sourced matrix']);
  for (const category of ['senior', 'pwd'] as const) assert.equal(quotePassengerFare(7, category, { id: 'r' }, matrix, date)?.amount, 14);
});
test('whole fare table must be numeric, ordered, coherent and sourced', () => {
  const bad = [
    { brackets: [] }, { brackets: [matrix.brackets[1], matrix.brackets[0]] },
    { brackets: [matrix.brackets[0], { up_to_km: 4, regular: 20, discounted: 14 }] },
    { brackets: [matrix.brackets[0], { up_to_km: 8, regular: 10, discounted: 9 }] },
    { brackets: [matrix.brackets[0], { up_to_km: 8, regular: Infinity, discounted: 14 }] },
    { brackets: [{ up_to_km: 4, regular: 1e308, discounted: 0 }] },
    { brackets: [{ up_to_km: '4', regular: 15, discounted: 11 }] },
    { brackets: [{ up_to_km: 4, regular: 15, discounted: 16 }] },
    { source_url: 'javascript:alert(1)' }, { verified_at: 'tomorrow' }, { verified_at: '2099-01-01T00:00:00Z' },
    { currency: null }, { currency: 'USD' },
    { effective_from: '2026-02-30' }, { effective_to: '2026-10-01' },
  ];
  for (const patch of bad) assert.equal(quotePassengerFare(3, 'regular', { id: 'r' }, { ...matrix, ...patch } as any, date), null, JSON.stringify(patch));
  for (const km of [NaN, Infinity, -1, 0, 201, 9]) assert.equal(quotePassengerFare(km, 'regular', { id: 'r' }, matrix, date), null);
  assert.equal(quotePassengerFare(3, 'regular', { id: 'r' }, matrix, '2026-02-30'), null);
});
test('ride distances require sourced directed connections', () => {
  assert.equal(verifiedRideDistance('a', 'c', 'r', segments, stops), 7);
  assert.equal(verifiedRideDistance('c', 'a', 'r', segments, stops), null);
  assert.equal(verifiedRideDistance('a', 'c', 'r', [{ ...segments[0], source_url: 'bad' }, segments[1]], stops), null);
});
test('savings compare the same category on a downstream baseline path', () => {
  const result = findVerifiedSavings(input);
  assert.equal(result.status, 'available');
  assert.equal(result.suggestions[0].stop.id, 'b');
  assert.deepEqual([result.suggestions[0].currentFare, result.suggestions[0].fare, result.suggestions[0].savings], [20, 15, 5]);
  assert.equal(result.suggestions[0].walk.steps[0].instruction, 'Follow the marked path');
  assert.equal(findVerifiedSavings({ ...input, type: 'student' }).suggestions[0].savings, 3);
});
test('missing or incomplete walking evidence is unavailable, not no-saving', () => {
  for (const patch of [{ walks: [] }, { matrix: null }, { segments: [] }, { maxWalkMeters: 100 }, { stepFreeOnly: true }, { originId: 'c', destinationId: 'a' }, { walks: [{ ...walk, steps: [] }] }, { walks: [{ ...walk, coordinates: [] }] }]) assert.equal(findVerifiedSavings({ ...input, ...patch }).status, 'unavailable');
  assert.equal(findVerifiedSavings({ ...input, stepFreeOnly: true, walks: [{ ...walk, accessible: true }] }).status, 'unavailable');
  assert.equal(findVerifiedSavings({ ...input, stepFreeOnly: true, walks: [{ ...walk, accessible: true, accessibility_source_url: evidence.source_url, accessibility_verified_at: evidence.verified_at }] }).status, 'available');
});
test('equal sourced fares explicitly mean no saving among evaluated paths', () => {
  const result = findVerifiedSavings({ ...input, matrix: { ...matrix, brackets: [{ up_to_km: 8, regular: 15, discounted: 11 }] } });
  assert.equal(result.status, 'no-saving');
  assert.equal(result.suggestions.length, 0);
});
test('a cheaper branch outside the baseline ride path is not a recommendation', () => {
  const branch = { ...walk, to_stop_id: 'branch', coordinates: [walk.coordinates[0], stops[3]], distance_meters: 323, steps: [{ ...walk.steps[0], distance_meters: 323 }] };
  const result = findVerifiedSavings({ ...input, walks: [branch], segments: [...segments, { ...segments[0], from_stop_id: 'branch', to_stop_id: 'c', distance_meters: 1000 }] });
  assert.equal(result.status, 'unavailable');
});

test('ambiguous directed fare paths and missing downstream evidence do not claim no-saving', () => {
  assert.equal(verifiedRideDistance('a', 'c', 'r', [...segments, { ...segments[0], to_stop_id: 'c', distance_meters: 5000 }], stops), null);
  assert.equal(findVerifiedSavings({ ...input, stops: stops.map(s => s.id === 'b' ? { ...s, sequence_order: -1 } : s) }).status, 'unavailable');
  const more = [...stops.slice(0, 3), { ...stops[3], id: 'd', sequence_order: 4 }];
  const result = findVerifiedSavings({ ...input, destinationId: 'd', stops: more, segments: [...segments, { ...segments[0], from_stop_id: 'c', to_stop_id: 'd', distance_meters: 500 }], matrix: { ...matrix, brackets: [{ up_to_km: 10, regular: 15, discounted: 11 }] } });
  assert.equal(result.status, 'unavailable');
});

test('verified intermediate stops contribute distance but need boarding permission for Walk & Save', () => {
  for (const use of [null, 'alight'] as const) {
    const catalog = stops.map(s => s.id === 'b' ? { ...s, passenger_use: use } : s);
    assert.equal(verifiedRideDistance('a', 'c', 'r', segments, catalog), 7);
    assert.deepEqual(findVerifiedSavings({ ...input, stops: catalog }).suggestions, []);
  }
  for (const [id, use] of [['a', 'alight'], ['c', 'board']] as const) {
    const catalog = stops.map(s => s.id === id ? { ...s, passenger_use: use } : s);
    assert.equal(verifiedRideDistance('a', 'c', 'r', segments, catalog), null);
    assert.equal(findVerifiedSavings({ ...input, stops: catalog }).status, 'unavailable');
  }
  assert.equal(verifiedRideDistance('a', 'c', 'r', segments, stops.filter(s => s.id !== 'b')), null);
});
