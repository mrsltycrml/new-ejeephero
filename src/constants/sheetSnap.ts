/** Collapsible map-sheet snap sizes. Peek is a fixed handle + summary; half and expanded scale with the window. */
export const sheetSnap = {
  peek: 160,
  halfRatio: 0.42,
  expandedRatio: 0.88,
} as const;

export type SheetSnap = 'peek' | 'half' | 'expanded';

export function sheetHeights(windowHeight: number, peek: number = sheetSnap.peek): Record<SheetSnap, number> {
  const peekHeight = Math.max(sheetSnap.peek, peek);
  const half = Math.max(peekHeight + 48, Math.round(windowHeight * sheetSnap.halfRatio));
  const expanded = Math.max(half + 48, Math.round(windowHeight * sheetSnap.expandedRatio));
  return { peek: peekHeight, half, expanded };
}

export function nearestSheetSnap(
  height: number,
  heights: Record<SheetSnap, number>,
  velocityY = 0,
): SheetSnap {
  if (velocityY < -0.7) {
    return height < heights.half - 8 ? 'half' : 'expanded';
  }
  if (velocityY > 0.7) {
    return height > heights.half + 8 ? 'half' : 'peek';
  }
  const snaps: SheetSnap[] = ['peek', 'half', 'expanded'];
  return snaps.reduce((best, snap) =>
    Math.abs(heights[snap] - height) < Math.abs(heights[best] - height) ? snap : best
  );
}

/**
 * Snap heights for a sheet inside a screen area of `areaHeight`. The open sheet always stops
 * `topClearance` below the top of that area, so floating controls and the handle stay reachable.
 */
export function fitSheetHeights(areaHeight: number, peek?: number, topClearance = 96): Record<SheetSnap, number> {
  const raw = sheetHeights(areaHeight, peek);
  const max = Math.max(raw.peek, areaHeight - topClearance);
  return { peek: raw.peek, half: Math.min(raw.half, max), expanded: Math.min(raw.expanded, max) };
}
