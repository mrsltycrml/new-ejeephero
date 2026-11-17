import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { FRESH_TELEMETRY_WINDOW_MS, pickLatestFreshPositions } from '../utils/operationsSummary';
import { realRows } from '../utils/realData';
import { telemetryFix, positionPayload, validPoint, type MeasuredFix } from './locationQuality';
import { activeRoute, verifiedRoute, verifiedStop } from './routeMap';

export interface RouteData {
  id: string;
  is_sample?: boolean;
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
  is_esakay_hub?: boolean;
  landmark_photo?: string;
  landmark_desc?: string;
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

async function readAll<T>(table: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select('*').order('id').range(offset, offset + 499);
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error(`Could not read ${table}.`);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export class OfflineTransitService {
  private static instance: OfflineTransitService;
  private lastLatencyMs = 0;
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
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        const cached = raw ? JSON.parse(raw) : null;
        if (cached && Array.isArray(cached.routes) && Array.isArray(cached.terminals) && Number.isFinite(Date.parse(cached.syncedAt)) && Date.parse(cached.syncedAt) <= Date.now()) {
          result = { ...normalizeTransit(cached.routes, cached.terminals), syncedAt: cached.syncedAt, isFromCache: true, status: 'cached', error };
        }
      } catch { /* A corrupt cache must never become a successful empty read. */ }
    }
    this.lastLatencyMs = Math.round(performance.now() - start);
    return { ...result, latencyMs: this.lastLatencyMs };
  }

  public async syncWithRemote() {
    const [routes, terminals] = await Promise.all([readAll<RouteData>('routes'), readAll<TerminalData>('terminals')]);
    const current = { ...normalizeTransit(routes, terminals), syncedAt: new Date().toISOString() };
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(current));
    } catch { /* Cache persistence must not override a successful source read. */ }
    return current;
  }

  /** Publishes measured evidence; never substitutes server time or unknown values. */
  public async publishPosition(vehicleId: string, fix: MeasuredFix): Promise<void> {
    const { error } = await supabase.from('vehicle_positions').insert(positionPayload(vehicleId, fix));
    if (error) throw new Error(error.message);
  }

  /** A failed fleet request rejects; an empty successful feed returns []. */
  public async getVehicles(): Promise<VehicleData[]> {
    const { data, error } = await supabase.from('vehicles').select('*').eq('is_active', true);
    if (error) throw new Error(error.message);
    const activeVehicles = realRows<any>(data ?? []).filter(vehicle => vehicle.is_active && !vehicle.deleted_at);
    if (!activeVehicles.length) return [];
    const { data: positions, error: positionError } = await supabase.from('vehicle_positions')
      .select('*').in('vehicle_id', activeVehicles.map(vehicle => vehicle.id))
      .gte('timestamp', new Date(Date.now() - FRESH_TELEMETRY_WINDOW_MS).toISOString())
      .order('timestamp', { ascending: false }).limit(300);
    if (positionError) throw new Error(positionError.message);
    const latest = pickLatestFreshPositions(realRows(positions ?? []));
    return activeVehicles.flatMap(vehicle => {
      const position = latest.get(vehicle.id);
      if (!position || !validPoint(position)) return [];
      const fix = telemetryFix(position);
      const count = Number.isFinite(vehicle.passenger_count) ? vehicle.passenger_count : null;
      const capacity = Number.isFinite(vehicle.max_capacity) && vehicle.max_capacity > 0 ? vehicle.max_capacity : null;
      const full = count != null && capacity != null ? count >= capacity : null;
      return [{
        id: vehicle.id, vehicle_id: vehicle.id, route_id: vehicle.route_id,
        plate_number: vehicle.plate_number ?? '', body_number: vehicle.body_number ?? '',
        latitude: position.latitude, longitude: position.longitude,
        speed: fix.speed, heading: fix.heading, accuracy: fix.accuracy, recorded_at: position.captured_at!,
        passenger_count: count, max_capacity: capacity, is_full: full,
        status: full == null ? null : full ? 'Puno' as const : count >= capacity * 0.7 ? 'Sakto' as const : 'Maluwag' as const,
      }];
    });
  }

  public getLastLatency(): number { return this.lastLatencyMs; }
}
export const offlineTransit = OfflineTransitService.getInstance();
