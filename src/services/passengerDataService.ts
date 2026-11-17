import { realRows } from '../utils/realData';
import { supabase } from '../lib/supabase';
import { offlineTransit } from './offlineTransitService';
import type { LoadingZone } from './passengerSafety';
import type { FareMatrix, RoadSegment, WalkLink } from './passengerFare';

export async function loadPassengerPlanningData() {
  const [transit, segments, walks, matrices] = await Promise.all([
    offlineTransit.getTransitData(),
    supabase.from('passenger_route_segments').select('*'),
    supabase.from('passenger_walk_links').select('*'),
    supabase.from('passenger_fare_matrices').select('*').order('effective_from', { ascending: false }),
  ]);
  if (segments.error || walks.error || matrices.error) throw new Error('Passenger planning data unavailable.');
  return { ...transit, segments: realRows(segments.data || []) as RoadSegment[], walks: realRows(walks.data || []) as WalkLink[], matrices: realRows(matrices.data || []) as FareMatrix[] };
}

export async function loadLoadingZones(): Promise<LoadingZone[]> {
  const result = await supabase.from('passenger_loading_zones').select('*');
  if (result.error) throw result.error;
  // Do not infer a legal boundary from a landmark point or an arbitrary radius.
  return realRows(result.data || []) as LoadingZone[];
}
