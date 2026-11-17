import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAdminUnits } from '../src/utils/adminUnitRows.ts';
import { summarizeUnits, type FleetShift } from '../src/utils/operationsSummary.ts';
import type { ManagedUnit } from '../src/services/fleetRegistryService.ts';

const registry: ManagedUnit = {
  id: 'registry-1', body_number: 'Unit One', plate_number: null, route_name: 'Source route',
  assigned_driver: 'Source driver', notes: 'Keep this note', deleted_at: null,
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
};
const shift: FleetShift = {
  id: 'shift-1', body_number: 'Unit One', plate_number: null, route_id: 'route-1',
  driver_id: 'driver-1', passenger_count: 0, max_capacity: 20, is_active: false,
  created_at: '2026-11-18T00:00:00Z', ended_at: '2026-11-18T01:00:00Z',
};
const merge = (shifts: FleetShift[], units: ManagedUnit[]) => mergeAdminUnits(summarizeUnits(shifts), new Map(), [], units);

test('an absent plate stays null for editing, with and without shift history', () => {
  assert.equal(merge([], [registry])[0].plate, null);
  assert.equal(merge([shift], [registry])[0].plate, null);
  assert.equal(merge([shift], [])[0].plate, null);
});

test('shift-derived units retain the matching registry identity and current values', () => {
  const rows = merge([{ ...shift, body_number: ' unit one ', plate_number: 'OLD-1' }], [registry]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].registryId, 'registry-1');
  assert.equal(rows[0].body, 'Unit One');
  assert.equal(rows[0].plate, null);
});

test('registry deletion is independent of active and ended shifts', () => {
  for (const is_active of [false, true]) {
    const active = merge([{ ...shift, is_active }], [registry])[0];
    assert.equal(active.registryDeletedAt, null);
    assert.equal(active.state, is_active ? 'on_shift' : 'inactive');
    const deleted = merge([{ ...shift, is_active }], [{ ...registry, deleted_at: '2026-11-18T02:00:00Z' }])[0];
    assert.equal(deleted.registryId, 'registry-1');
    assert.equal(deleted.registryDeletedAt, '2026-11-18T02:00:00Z');
    assert.equal(deleted.state, is_active ? 'on_shift' : 'inactive');
  }
});

test('registry-only deleted units remain reachable for restoration', () => {
  const rows = merge([], [registry, { ...registry, id: 'deleted-2', body_number: 'Unit Two', deleted_at: '2026-11-18T02:00:00Z' }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].registryDeletedAt, null);
  assert.equal(rows[1].registryId, 'deleted-2');
  assert.equal(rows[1].registryDeletedAt, '2026-11-18T02:00:00Z');
  assert.equal(rows[0].activeShiftId, undefined);
});

test('matching by plate keeps uniquely matched renamed units editable', () => {
  const rows = merge([{ ...shift, plate_number: 'real-1' }], [
    { ...registry, id: 'current', body_number: 'Renamed unit', plate_number: 'REAL-1' },
  ]);
  assert.equal(rows[0].registryId, 'current');
  assert.equal(rows[0].body, 'Renamed unit');
  assert.equal(rows.length, 1);
});

test('conflicting identifiers keep registry candidates separate in either order', () => {
  const activeShift = { ...shift, plate_number: 'A-PLATE', is_active: true, ended_at: null };
  const deletionStates = [null, '2026-11-18T02:00:00Z'];
  for (const deletedA of deletionStates) {
    for (const deletedB of deletionStates) {
      const unitA = { ...registry, id: 'unit-a', body_number: 'Renamed unit', plate_number: 'A-PLATE', deleted_at: deletedA };
      const unitB = { ...registry, id: 'unit-b', plate_number: 'B-PLATE', deleted_at: deletedB, created_at: '2026-11-18T03:00:00Z' };
      for (const candidates of [[unitB, unitA], [unitA, unitB]]) {
        const rows = merge([activeShift], candidates);
        const shiftRow = rows[0];
        assert.equal(shiftRow.registryId, undefined);
        assert.equal(shiftRow.registryDeletedAt, null);
        assert.equal(shiftRow.activeShiftId, activeShift.id);
        assert.equal(shiftRow.body, activeShift.body_number);
        assert.equal(shiftRow.plate, activeShift.plate_number);
        assert.equal(rows.length, 3);
        for (const candidate of candidates) {
          const row = rows.find(item => item.registryId === candidate.id);
          assert.ok(row);
          assert.equal(row.key, `registry-${candidate.id}`);
          assert.equal(row.body, candidate.body_number);
          assert.equal(row.plate, candidate.plate_number);
          assert.equal(row.registryDeletedAt, candidate.deleted_at);
          assert.equal(row.activeShiftId, undefined);
        }
      }
    }
  }
});
