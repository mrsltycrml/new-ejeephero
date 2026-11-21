import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { FRESH_TELEMETRY_WINDOW_MS, pickLatestFreshPositions, type FleetShift, type TelemetryRow } from '../utils/operationsSummary';
import { realRows } from '../utils/realData';
import { telemetryFix, positionPayload, type MeasuredFix } from './locationQuality';
import { activeRoute, verifiedRoute, verifiedStop } from './routeMap';
import type { PassengerUse } from '../../supabase/functions/_shared/passengerStopUse';

export interface RouteData {
  id: string;
  route1_variant?: string | null;
  is_sample?: boolean;
  is_archived?: boolean;
  is_active?: boolean;
  is_published?: boolean;
  deleted_at?: string | null;
  status?: string;
  name: string;
  description: string;
  color_code: string;
  operating_hours: string;
  base_fare: number;
  per_km_rate: number;
  is_coming_soon?: boolean;
  r2_geometry_url?: string;
  geometry_verified_at?: string | null;
  geometry_source_url?: string | null;
  coordinates: Array<{ latitude: number; longitude: number }>;
}

export interface TerminalData {
  is_sample?: boolean;
  is_active?: boolean;
  deleted_at?: string | null;
  id: string;
  route_id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence_order: number;
  regular_fare?: number;
  student_fare?: number;
  elderly_fare?: number;
  disabled_fare?: number;
  geofence_radius_meters?: number;
  location_verified_at?: string | null;
  location_source_url?: string | null;
  passenger_use?: PassengerUse | null;
  passenger_use_verified_at?: string | null;
  passenger_use_source_url?: string | null;
  is_esakay_hub?: boolean;
  landmark_photo?: string;
  landmark_desc?: string;
  landmark_photo_source_url?: string | null;
  boarding_side?: string | null;
  travel_direction?: string | null;
  entrance_instructions?: string | null;
  stop_details_source_url?: string | null;
  stop_details_verified_at?: string | null;
  is_well_lit?: boolean;
  cctv_monitored?: boolean;
}

export interface VehicleData {
  id: string;
  vehicle_id: string;
  plate_number: string;
  body_number: string;
  route_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  passenger_count: number | null;
  max_capacity: number | null;
  is_full: boolean | null;
  status: 'Maluwag' | 'Sakto' | 'Puno' | null;
  isSpeeding?: boolean;
  recorded_at?: string;
  accuracy?: number | null;
  is_sample?: boolean;
}


export type TransitResult = {
  routes: RouteData[];
  terminals: TerminalData[];
  latencyMs: number;
  isFromCache: boolean;
  status: 'ready' | 'cached' | 'unavailable';
  syncedAt: string | null;
  error: string | null;
};
type TransitSnapshot = Pick<TransitResult, 'routes' | 'terminals'> & { syncedAt: string };
type FleetPosition = TelemetryRow & {
  id: string;
  vehicles: FleetShift & { is_sample?: boolean; deleted_at?: string | null };
};

// One new envelope prevents old seeded caches and partial writes from returning.
const CACHE_KEY = '@ejeephero_real_transit_v1';

function normalizeTransit(rawRoutes: RouteData[], rawTerminals: TerminalData[]) {
  const routes = realRows(rawRoutes).filter(activeRoute).map(route => ({
    ...route,
    coordinates: verifiedRoute(route) ? route.coordinates : [],
  }));
  const routeIds = new Set(routes.map(route => route.id));
  const terminals = realRows(rawTerminals).filter(stop => routeIds.has(stop.route_id) && verifiedStop(stop));
  return { routes, terminals };
}

async function readAll<T>(table: string, columns = '*'): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, count, error } = await supabase.from(table).select(columns, { count: 'exact' }).order('id').range(rows.length, rows.length + 499)
      .overrideTypes<T[], { merge: false }>();
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error(`Could not read ${table}.`);
    rows.push(...data);
    if (!data.length || (count != null && rows.length >= count)) return rows;
  }
}

export class OfflineTransitService {
  private static instance: OfflineTransitService;
  private lastLatencyMs = 0;
  private snapshot: TransitSnapshot | null = null;
  private requestSequence = 0;
  private successfulRequest = 0;
  private cacheWrite: Promise<void> = Promise.resolve();
  private serviceColumns = '*';
  private constructor() {}
  public static getInstance(): OfflineTransitService {
    return OfflineTransitService.instance ??= new OfflineTransitService();
  }

  public async getTransitData(): Promise<TransitResult> {
    const start = performance.now();
    let result: Omit<TransitResult, 'latencyMs'>;
    try {
      const current = await this.syncWithRemote();
      result = { ...current, isFromCache: false, status: 'ready', error: null };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Transit data unavailable.';
      result = { routes: [], terminals: [], syncedAt: null, isFromCache: false, status: 'unavailable', error };
      let cached = this.snapshot;
      try {
        if (!cached) {
          const raw = await AsyncStorage.getItem(CACHE_KEY);
          const stored = raw ? JSON.parse(raw) : null;
          if (stored && Array.isArray(stored.routes) && Array.isArray(stored.terminals) && Number.isFinite(Date.parse(stored.syncedAt)) && Date.parse(stored.syncedAt) <= Date.now()) cached = stored;
        }
      } catch { /* A corrupt cache must never become a successful empty read. */ }
      // A successful source read can supersede disk while getItem is pending.
      cached = this.snapshot ?? cached;
      try {
        if (cached) result = { ...normalizeTransit(cached.routes, cached.terminals), syncedAt: cached.syncedAt, isFromCache: true, status: 'cached', error };
      } catch { /* Malformed cached rows leave the original unavailable result intact. */ }
    }
    this.lastLatencyMs = Math.round(performance.now() - start);
    return { ...result, latencyMs: this.lastLatencyMs };
  }

  public async syncWithRemote(): Promise<TransitSnapshot> {
    const request = ++this.requestSequence;
    const [routes, terminals] = await Promise.all([readAll<RouteData>('routes'), readAll<TerminalData>('terminals')]);
    const current = { ...normalizeTransit(routes, terminals), syncedAt: new Date().toISOString() };
    if (request > this.successfulRequest) {
      this.successfulRequest = request;
      this.snapshot = current;
      // Serialize writes; a queued snapshot may already have been superseded.
      this.cacheWrite = this.cacheWrite.then(async () => {
        if (this.snapshot !== current) return;
        try {
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(current));
        } catch { /* Keep the successful in-memory snapshot even when disk fails. */ }
      });
    }
    await this.cacheWrite;
    return this.snapshot!;
  }

  /** Publishes measured evidence; never substitutes server time or unknown values. */
  public async publishPosition(vehicleId: string, fix: MeasuredFix): Promise<void> {
    const { error } = await supabase.from('vehicle_positions').insert(positionPayload(vehicleId, fix));
    if (error) throw new Error(error.message);
  }

  /** Legacy catalogs differ in optional publication flags. Poll only the columns this catalog exposes. */
  public async getInServiceRouteIds(): Promise<Set<string>> {
    const rows = await readAll<RouteData>('routes', this.serviceColumns);
    if (this.serviceColumns === '*' && rows.length) {
      this.serviceColumns = ['id','is_archived','is_coming_soon','is_sample','is_active','is_published','deleted_at','status']
        .filter(column => column in rows[0]).join(',');
    }
    return new Set(rows.filter(activeRoute).map(route => route.id));
  }

  /** A failed fleet request rejects; an empty successful feed returns []. */
  public async getVehicles(routeIds?: ReadonlySet<string>): Promise<VehicleData[]> {
    const inService = routeIds ?? await this.getInServiceRouteIds();
    if (!inService.size) return [];
    const since = new Date(Date.now() - FRESH_TELEMETRY_WINDOW_MS).toISOString();
    const positions: FleetPosition[] = [];
    let afterId: string | null = null;
    for (;;) {
      let query = supabase.from('vehicle_positions').select('*,vehicles!inner(*)')
        .eq('vehicles.is_active', true).is('vehicles.ended_at', null)
        .gte('timestamp', since).gte('captured_at', since);
      if (afterId) query = query.gt('id', afterId);
      const { data, error } = await query.order('id').limit(500).overrideTypes<FleetPosition[], { merge: false }>();
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error('Could not read vehicle positions.');
      if (!data.length) break;
      positions.push(...realRows(data));
      // Continue even on short pages: the server may enforce a lower row cap.
      afterId = data[data.length - 1].id;
    }
    const latest = pickLatestFreshPositions(positions);
    return [...latest.values()].flatMap(position => {
      const vehicle = position.vehicles;
      if (vehicle.is_sample || vehicle.deleted_at || !inService.has(vehicle.route_id)) return [];
      const fix = telemetryFix(position);
      const count = Number.isFinite(vehicle.passenger_count) ? vehicle.passenger_count : null;
      const capacity = vehicle.max_capacity != null && Number.isFinite(vehicle.max_capacity) && vehicle.max_capacity > 0 ? vehicle.max_capacity : null;
      const full = count != null && capacity != null ? count >= capacity : null;
      return [{
        id: vehicle.id, vehicle_id: vehicle.id, route_id: vehicle.route_id,
        plate_number: vehicle.plate_number ?? '', body_number: vehicle.body_number ?? '',
        latitude: position.latitude, longitude: position.longitude,
        speed: fix.speed, heading: fix.heading, accuracy: fix.accuracy, recorded_at: position.captured_at!,
        passenger_count: count, max_capacity: capacity, is_full: full,
        status: count == null || capacity == null ? null : full ? 'Puno' as const : count >= capacity * 0.7 ? 'Sakto' as const : 'Maluwag' as const,
      }];
    });
  }

  public getLastLatency(): number { return this.lastLatencyMs; }
}
export const offlineTransit = OfflineTransitService.getInstance();
