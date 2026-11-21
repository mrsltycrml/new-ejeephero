import { realRows } from '../utils/realData';
import { supabase } from '../lib/supabase';
import type { LoadingZone } from './passengerSafety';
import type { FareMatrix, RoadSegment, WalkLink } from './passengerFare';

async function planningRows<T>(table: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset <= 5000; offset += 500) {
    const result = await supabase.from(table).select('*').order('id').range(offset, offset + 499);
    if (result.error || !Array.isArray(result.data)) throw new Error('Passenger planning data unavailable.');
    rows.push(...realRows(result.data) as T[]);
    if (rows.length > 5000) break;
    if (result.data.length < 500) return rows;
  }
  // Refuse a partial catalog that could incorrectly claim no cheaper option.
  throw new Error('Passenger planning data is too large to compare completely.');
}

export const loadPassengerRideSegments = () => planningRows<RoadSegment>('passenger_route_segments');
export const loadPassengerWalkLinks = () => planningRows<WalkLink>('passenger_walk_links');

export async function loadPassengerFareMatrices() {
  const matrices = await planningRows<FareMatrix>('passenger_fare_matrices');
  return matrices.sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)));
}

export async function loadPassengerFareData() {
  const [segments, matrices] = await Promise.all([loadPassengerRideSegments(), loadPassengerFareMatrices()]);
  return { segments, matrices };
}

export async function loadLoadingZones(): Promise<LoadingZone[]> {
  const result = await supabase.from('passenger_loading_zones').select('*');
  if (result.error) throw result.error;
  // Do not infer a legal boundary from a landmark point or an arbitrary radius.
  return realRows(result.data || []) as LoadingZone[];
}
