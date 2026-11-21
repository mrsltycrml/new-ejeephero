import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransitChatContext } from '../supabase/functions/herobot-chat/context.ts';
const boarding = { passenger_use: 'board', passenger_use_verified_at: '2026-01-01', passenger_use_source_url: 'https://operator.example/use' };

test('chat context never turns fare defaults or active shifts into current operational facts', () => {
  const context = buildTransitChatContext([{ id: 'r', name: 'Real route', base_fare: 15, operating_hours: 'Unconfirmed hours' }], [
    { route_id: 'r', name: 'Unverified bay', is_well_lit: true, cctv_monitored: true },
  ]);
  assert.match(context, /Real route/);
  assert.match(context, /Fare amounts.*unavailable/);
  assert.match(context, /Live vehicle positions.*unavailable/);
  assert.doesNotMatch(context, /15|Unconfirmed hours|Unverified bay|Safe Night Stop/);
});

test('chat context excludes samples and unpublished routes and requires sourced stop evidence', () => {
  const context = buildTransitChatContext([
    { id: 'r', name: 'Published route' }, { id: 's', name: 'Seed route', is_sample: true },
    { id: 'a', name: 'Archived route', is_archived: true }, { id: 'c', name: 'Future route', is_coming_soon: true },
  ], [
    { ...boarding, route_id: 'r', name: 'Sourced stop', latitude: 14.5, longitude: 121, location_source_url: 'https://operator.example/stop', location_verified_at: '2026-01-01', sequence_order: 1 },
    { route_id: 'r', name: 'Unconfirmed use', latitude: 14.5, longitude: 121, location_source_url: 'https://operator.example/stop', location_verified_at: '2026-01-01' },
    { route_id: 'r', name: 'Seed stop', is_sample: true, location_source_url: 'https://operator.example/stop', location_verified_at: '2026-01-01' },
    { route_id: 'r', name: 'Invalid stop', latitude: 100, longitude: 121, location_source_url: 'https://operator.example/stop', location_verified_at: '2026-01-01' },
  ]);
  assert.match(context, /Sourced stop/);
  assert.match(context, /https:\/\/operator.example\/stop/);
  assert.match(context, /"passengerUse":"board"/);
  assert.doesNotMatch(context, /Seed|Archived|Future|Invalid stop|Unconfirmed use/);
});

test('failed and empty chat reference reads remain distinct and both forbid invented facts', () => {
  assert.match(buildTransitChatContext(null, null), /Directory unavailable/);
  assert.match(buildTransitChatContext([], []), /No published active routes/);
  for (const context of [buildTransitChatContext(null, null), buildTransitChatContext([], [])]) {
    assert.match(context, /Never invent/);
    assert.match(context, /Do not use earlier chat answers/);
  }
});

test('chat reference excludes future verification while retaining past sourced stops', () => {
  const stop = { ...boarding, route_id: 'r', name: 'Past stop', latitude: 14.5, longitude: 121, location_source_url: 'https://operator.example/stop', location_verified_at: '2026-01-01' };
  for (const future of ['2099-01-01', new Date(Date.now() + 60000).toISOString()]) {
    const context = buildTransitChatContext([{ id: 'r', name: 'Published route' }], [stop, { ...stop, name: 'Future stop', location_verified_at: future }]);
    assert.match(context, /Past stop/);
    assert.doesNotMatch(context, /Future stop/);
    assert.match(context, /Never invent/);
  }
});
