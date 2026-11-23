import type { Point } from '../walking-directions/contract.ts';

export function projectOntoSegment(a: Point, b: Point, target: Point) {
  const scale = Math.cos(target.latitude * Math.PI / 180);
  const dx = (b.longitude - a.longitude) * scale, dy = b.latitude - a.latitude;
  const fraction = Math.max(0, Math.min(1, ((target.longitude - a.longitude) * scale * dx + (target.latitude - a.latitude) * dy) / (dx * dx + dy * dy || 1)));
  const point = { latitude: a.latitude + dy * fraction, longitude: a.longitude + (b.longitude - a.longitude) * fraction };
  return { point, fraction };
}
