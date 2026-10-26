import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReportingPeriod, periodContains, periodRangeUtc, weekStartKey } from '../src/utils/reportingPeriod.ts';

test('Philippine reporting day uses the correct UTC boundaries', () => {
  const period = { mode: 'day' as const, key: '2026-10-27' };
  assert.deepEqual(periodRangeUtc(period), {
    start: '2026-10-26T16:00:00.000Z',
    end: '2026-10-27T16:00:00.000Z',
  });
  assert.equal(periodContains('2026-10-26T15:59:59.000Z', period), false);
  assert.equal(periodContains('2026-10-26T16:00:00.000Z', period), true);
  assert.equal(periodContains('2026-10-27T15:59:59.000Z', period), true);
  assert.equal(periodContains('2026-10-27T16:00:00.000Z', period), false);
});

test('Philippine reporting month includes each local day and excludes the next month', () => {
  const period = { mode: 'month' as const, key: '2026-10' };
  assert.deepEqual(periodRangeUtc(period), {
    start: '2026-09-30T16:00:00.000Z',
    end: '2026-10-31T16:00:00.000Z',
  });
  assert.equal(periodContains('2026-10-31T15:59:59.000Z', period), true);
  assert.equal(periodContains('2026-10-31T16:00:00.000Z', period), false);
});

test('reporting week starts Monday and includes seven Philippine days across month boundaries', () => {
  const period = { mode: 'week' as const, key: weekStartKey('2026-10-27') };
  assert.equal(period.key, '2026-10-26');
  assert.deepEqual(periodRangeUtc(period), {
    start: '2026-10-25T16:00:00.000Z',
    end: '2026-11-01T16:00:00.000Z',
  });
  assert.equal(periodContains('2026-10-25T15:59:59.000Z', period), false);
  assert.equal(periodContains('2026-11-01T15:59:59.000Z', period), true);
  assert.equal(periodContains('2026-11-01T16:00:00.000Z', period), false);
  assert.equal(formatReportingPeriod(period).includes('Nov 1, 2026'), true);
});

test('reporting year includes local January through December and excludes the next year', () => {
  const period = { mode: 'year' as const, key: '2026' };
  assert.deepEqual(periodRangeUtc(period), {
    start: '2025-12-31T16:00:00.000Z',
    end: '2026-12-31T16:00:00.000Z',
  });
  assert.equal(periodContains('2026-12-31T15:59:59.000Z', period), true);
  assert.equal(periodContains('2026-12-31T16:00:00.000Z', period), false);
  assert.equal(formatReportingPeriod(period), '2026');
});

test('month boundaries remain correct at year end and in leap February', () => {
  assert.equal(periodRangeUtc({ mode: 'month', key: '2026-12' }).end, '2026-12-31T16:00:00.000Z');
  assert.equal(periodRangeUtc({ mode: 'month', key: '2028-02' }).end, '2028-02-29T16:00:00.000Z');
  assert.equal(weekStartKey('2027-01-01'), '2026-12-28');
});
