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
  return { ...transit, segments: (segments.data || []) as RoadSegment[], walks: (walks.data || []) as WalkLink[], matrices: (matrices.data || []) as FareMatrix[] };
}

export async function loadLoadingZones(): Promise<LoadingZone[]> {
  const result = await supabase.from('passenger_loading_zones').select('*');
  if (result.error) throw result.error;
  // Do not infer a legal boundary from a landmark point or an arbitrary radius.
  return (result.data || []) as LoadingZone[];
}
