import { validPoint, type Point } from './locationQuality.ts';

export function parseVerifiedRouteLine(text: string): Point[] | null {
  if (text.length > 400000) return null;
  try {
    const json = JSON.parse(text);
    const line = json?.type === 'Feature' ? json.geometry : json;
    if (line?.type !== 'LineString' || !Array.isArray(line.coordinates) || line.coordinates.length < 2 || line.coordinates.length > 5000) return null;
    const points: (Point | null)[] = line.coordinates.map((coordinate: unknown) => Array.isArray(coordinate) && coordinate.length >= 2
      ? { longitude: coordinate[0], latitude: coordinate[1] }
      : null);
    if (!points.every((point): point is Point => validPoint(point)) ||
        !points.some(p => p.latitude !== points[0].latitude || p.longitude !== points[0].longitude)) return null;
    return points;
  } catch {
    return null;
  }
}
