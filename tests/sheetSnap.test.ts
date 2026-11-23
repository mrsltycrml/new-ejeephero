import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestSheetSnap, sheetHeights, sheetSnap } from '../src/constants/sheetSnap.ts';

test('sheet snaps leave a peek short enough for a phone map and an expanded sheet under the screen height', () => {
  const heights = sheetHeights(844);
  assert.equal(heights.peek, sheetSnap.peek);
  assert.ok(heights.peek < 200, 'peek should stay a short summary');
  assert.ok(heights.half > heights.peek);
  assert.ok(heights.expanded > heights.half);
  assert.ok(heights.expanded < 844);
  assert.equal(nearestSheetSnap(heights.peek, heights), 'peek');
  assert.equal(nearestSheetSnap(heights.half, heights), 'half');
  assert.equal(nearestSheetSnap(heights.expanded, heights), 'expanded');
  assert.equal(nearestSheetSnap(heights.peek + 10, heights, -1.2), 'half');
  assert.equal(nearestSheetSnap(heights.expanded - 10, heights, 1.2), 'half');
});

test('a taller peek never shrinks below the requested summary height', () => {
  const heights = sheetHeights(844, 210);
  assert.equal(heights.peek, 210);
  assert.ok(heights.half > 210);
});
