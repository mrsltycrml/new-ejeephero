import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { ESAKAY_OPERATIONS } from '../constants/esakayOperations';

export interface RouteData {
  id: string;
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
  speed: number;
  heading: number;
  passenger_count: number;
  max_capacity: number;
  is_full: boolean;
  status: 'Maluwag' | 'Sakto' | 'Puno';
  isSpeeding?: boolean;
  recorded_at?: string;
  is_sample?: boolean;
}

// Provisional route and stop labels. No boarding point or road line is verified yet.
export const MAKATI_PRIMARY_ROUTE: RouteData = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'MRT BUENDIA - MANDALUYONG CITY HALL',
  description: 'MRT Buendia to Mandaluyong City Hall. Road alignment and boarding points are under review.',
  color_code: '#C41E3A',
  operating_hours: ESAKAY_OPERATIONS.serviceHours,
  base_fare: ESAKAY_OPERATIONS.regularBaseFare,
  per_km_rate: ESAKAY_OPERATIONS.additionalFarePerKm,
  coordinates: [],
};

// Retained IDs and labels for existing records; coordinates are never treated as verified.
export const MAKATI_OFFICIAL_TERMINALS: TerminalData[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'MRT BUENDIA / ZODIAC TERMINAL',
    latitude: 14.557635,
    longitude: 121.032655,
    sequence_order: 0,
    landmark_desc: 'The exact eSAKAY boarding side has not been confirmed.',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'JUPITER ST., COR. MAKATI AVENUE',
    latitude: 14.560995,
    longitude: 121.029889,
    sequence_order: 1,
    landmark_desc: 'The exact loading point at this junction has not been confirmed.',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'LOPEZ DRIVE / ESTRELLA PANTALEON',
    latitude: 14.566822,
    longitude: 121.037619,
    sequence_order: 2,
    landmark_desc: 'The bridge entrance and legal approach from Lopez Drive need confirmation.',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'CITY MANDALUYONG SCIENCE HIGH',
    latitude: 14.568588,
    longitude: 121.035701,
    sequence_order: 3,
    landmark_desc: 'The school is mapped, but the eSAKAY loading bay is unconfirmed.',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'TIVOLI GARDEN RESIDENCES BAY',
    latitude: 14.572198,
    longitude: 121.031239,
    sequence_order: 4,
    landmark_desc: 'A named Tivoli Garden bus stop is mapped on Coronado Street.',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440006',
    route_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'MAYSILO CIRCLE / CITY HALL',
    latitude: 14.578322,
    longitude: 121.034201,
    sequence_order: 5,
    landmark_desc: 'City Hall is mapped at Maysilo Circle; the boarding bay is unconfirmed.',
  }
];

export const MAKATI_ROUTE_2_COMING_SOON: RouteData = {
  id: 'a2000000-0000-0000-0000-000000000002',
  name: 'Route 2: Coming soon',
  description: 'Details for this route will be available when the operator confirms its service plan.',
  color_code: '#1E3A5F',
  operating_hours: 'Coming Soon',
  base_fare: 15.0,
  per_km_rate: 2.2,
  is_coming_soon: true,
  coordinates: [],
};

export const OFFICIAL_TWO_ROUTES: RouteData[] = [
  { ...MAKATI_PRIMARY_ROUTE, is_coming_soon: false },
  MAKATI_ROUTE_2_COMING_SOON,
];

// Active fleet with real plate numbers & capacity status (SO4 & SO5)
// Never ship invented vehicle coordinates or plate numbers as if they were live fleet data.
export const INITIAL_VEHICLES: VehicleData[] = [];

const STORAGE_KEYS = {
  ROUTES: '@ejeephero_routes_cache_v7',
  TERMINALS: '@ejeephero_terminals_cache_v7',
  VEHICLES: '@ejeephero_vehicles_cache_v7',
  LAST_SYNC: '@ejeephero_last_sync_v7',
};

function enrichRoutesAndTerminals(rawRoutes: RouteData[], rawTerminals: TerminalData[]): {
  routes: RouteData[];
  terminals: TerminalData[];
} {
  const staticTerminalById = new Map(MAKATI_OFFICIAL_TERMINALS.map((t) => [t.id, t]));
  const terminals = rawTerminals.map((term) => {
    const fallback = staticTerminalById.get(term.id);
    const verified = Boolean(term.location_verified_at && term.location_source_url);
    return {
      ...fallback,
      ...term,
      is_well_lit: verified ? term.is_well_lit : undefined,
      cctv_monitored: verified ? term.cctv_monitored : undefined,
      is_esakay_hub: verified ? Boolean(term.is_esakay_hub) : false,
      landmark_photo: verified ? term.landmark_photo : undefined,
      landmark_desc: verified ? term.landmark_desc : fallback?.landmark_desc || `${term.name}: location pending verification.`,
    };
  });

  const routes = rawRoutes.map((route) => {
    if (route.id === MAKATI_PRIMARY_ROUTE.id) {
      return {
        ...MAKATI_PRIMARY_ROUTE,
        ...route,
        is_coming_soon: false,
        base_fare: ESAKAY_OPERATIONS.regularBaseFare,
        per_km_rate: ESAKAY_OPERATIONS.additionalFarePerKm,
        coordinates: route.geometry_verified_at && route.geometry_source_url && route.coordinates?.length > 1 ? route.coordinates : [],
      };
    }
    if (route.id === MAKATI_ROUTE_2_COMING_SOON.id || route.is_coming_soon) {
      return {
        ...MAKATI_ROUTE_2_COMING_SOON,
        ...route,
        is_coming_soon: true,
        coordinates: [],
      };
    }
    const routeStops = terminals
      .filter((t) => t.route_id === route.id)
      .sort((a, b) => a.sequence_order - b.sequence_order);
    return {
      ...route,
      color_code: route.color_code || '#C41E3A',
      base_fare: route.base_fare || 15.0,
      per_km_rate: route.per_km_rate || 2.2,
      // A list of stops is not a road-following route. Draw only sourced geometry.
      coordinates: route.geometry_verified_at && route.geometry_source_url && route.coordinates?.length > 1 ? route.coordinates : [],
    };
  });

  return { routes, terminals };
}

export class OfflineTransitService {
  private static instance: OfflineTransitService;
  private lastLatencyMs: number = 0;

  private constructor() {}

  public static getInstance(): OfflineTransitService {
    if (!OfflineTransitService.instance) {
      OfflineTransitService.instance = new OfflineTransitService();
    }
    return OfflineTransitService.instance;
  }

  /**
   * SO1: Cache-First Retrieval of Routes & Stops
   * Target: <2 seconds data retrieval latency (typically <50ms with local cache)
   */
  public async getTransitData(): Promise<{
    routes: RouteData[];
    terminals: TerminalData[];
    latencyMs: number;
    isFromCache: boolean;
  }> {
    const startTime = performance.now();

    try {
      // 1. Try reading from LocalStorage / AsyncStorage
      const [cachedRoutes, cachedTerminals] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ROUTES),
        AsyncStorage.getItem(STORAGE_KEYS.TERMINALS),
      ]);

      if (cachedRoutes && cachedTerminals) {
        const parsedRoutes = JSON.parse(cachedRoutes) as RouteData[];
        const parsedTerminals = JSON.parse(cachedTerminals) as TerminalData[];
        const { routes, terminals } = enrichRoutesAndTerminals(
          parsedRoutes.length > 0 ? parsedRoutes : OFFICIAL_TWO_ROUTES,
          parsedTerminals.length > 0 ? parsedTerminals : MAKATI_OFFICIAL_TERMINALS,
        );
        const latency = Math.round(performance.now() - startTime);
        this.lastLatencyMs = latency;

        // Background update from Supabase + Cloudflare R2 if network is available
        this.syncWithRemote().catch(() => {});

        return {
          routes,
          terminals,
          latencyMs: latency,
          isFromCache: true,
        };
      }
    } catch (e) {
      console.warn('Cache read failed, falling back to static seed:', e);
    }

    // 2. Cache miss: Seed local storage with Makati static data
    await this.seedInitialCache();
    const latency = Math.round(performance.now() - startTime);
    this.lastLatencyMs = latency;

    const provisional = enrichRoutesAndTerminals(OFFICIAL_TWO_ROUTES, MAKATI_OFFICIAL_TERMINALS);
    return {
      routes: provisional.routes,
      terminals: provisional.terminals,
      latencyMs: latency,
      isFromCache: true,
    };
  }

  /**
   * Seed static dataset to AsyncStorage
   */
  public async seedInitialCache(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(OFFICIAL_TWO_ROUTES)),
        AsyncStorage.setItem(STORAGE_KEYS.TERMINALS, JSON.stringify(MAKATI_OFFICIAL_TERMINALS)),
        AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(INITIAL_VEHICLES)),
        AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString()),
      ]);
    } catch (err) {
      console.error('Failed to seed initial transit cache:', err);
    }
  }

  /**
   * Sync with Supabase + Cloudflare R2 if online
   */
  public async syncWithRemote(): Promise<void> {
    try {
      const [{ data: rawRoutes }, { data: rawTerminals }] =
        await Promise.all([
          supabase.from('routes').select('*').limit(30),
          supabase.from('terminals').select('*, routes(*)').limit(100),
        ]);

      const routeMap = new Map<string, RouteData>();
      routeMap.set(MAKATI_PRIMARY_ROUTE.id, {
        ...MAKATI_PRIMARY_ROUTE,
        is_coming_soon: false,
        coordinates: [],
      });
      routeMap.set(MAKATI_ROUTE_2_COMING_SOON.id, MAKATI_ROUTE_2_COMING_SOON);

      if (rawRoutes && rawRoutes.length > 0) {
        for (const r of rawRoutes as RouteData[]) {
          if (r.id === MAKATI_PRIMARY_ROUTE.id) {
            routeMap.set(r.id, {
              ...MAKATI_PRIMARY_ROUTE,
              ...r,
              is_coming_soon: false,
              coordinates: r.geometry_verified_at && r.geometry_source_url && r.coordinates?.length > 1
                ? r.coordinates
                : [],
            });
          } else if (r.id === MAKATI_ROUTE_2_COMING_SOON.id || r.is_coming_soon) {
            routeMap.set(r.id, {
              ...MAKATI_ROUTE_2_COMING_SOON,
              ...r,
              is_coming_soon: true,
              coordinates: [],
            });
          }
        }
      }

      const termMap = new Map<string, TerminalData>();
      for (const t of MAKATI_OFFICIAL_TERMINALS) {
        termMap.set(t.id, t);
      }
      if (rawTerminals && rawTerminals.length > 0) {
        for (const t of rawTerminals as TerminalData[]) {
          if (t.route_id === MAKATI_PRIMARY_ROUTE.id) {
            termMap.set(t.id, {
              ...termMap.get(t.id),
              ...t,
            });
          }
        }
      }

      const { routes, terminals } = enrichRoutesAndTerminals(
        Array.from(routeMap.values()),
        Array.from(termMap.values()),
      );
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes)),
        AsyncStorage.setItem(STORAGE_KEYS.TERMINALS, JSON.stringify(terminals)),
        AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString()),
      ]);
    } catch (err) {
      // Offline: Silently fail, keep cache
    }
  }

  /** Get active vehicles with a current GPS position from the shared fleet records. */
  public async getVehicles(): Promise<VehicleData[]> {
    try {
      const { data: activeVehicles, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('id,route_id,body_number,plate_number,passenger_count,max_capacity')
        .eq('is_active', true);
      if (vehiclesError) throw vehiclesError;

      if (!activeVehicles?.length) {
        await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify([]));
        return [];
      }

      const vehicleIds = activeVehicles.map((vehicle) => vehicle.id);
      const { data: positions, error: positionsError } = await supabase
        .from('vehicle_positions')
        .select('vehicle_id,latitude,longitude,speed,heading,timestamp')
        .in('vehicle_id', vehicleIds)
        .order('timestamp', { ascending: false });
      if (positionsError) throw positionsError;

      const latestPosition = new Map<string, (typeof positions)[number]>();
      for (const position of positions ?? []) {
        if (!latestPosition.has(position.vehicle_id)) latestPosition.set(position.vehicle_id, position);
      }

      const currentVehicles = activeVehicles.flatMap((vehicle) => {
        const position = latestPosition.get(vehicle.id);
        if (!position || Date.now() - Date.parse(position.timestamp) > 120_000) return [];
        return [{
          id: vehicle.id,
          vehicle_id: vehicle.id,
          plate_number: vehicle.plate_number ?? '',
          body_number: vehicle.body_number ?? '',
          route_id: vehicle.route_id,
          latitude: position.latitude,
          longitude: position.longitude,
          speed: position.speed ?? 0,
          heading: position.heading ?? 0,
          recorded_at: position.timestamp,
          passenger_count: vehicle.passenger_count ?? 0,
          max_capacity: vehicle.max_capacity ?? 22,
          is_full: (vehicle.passenger_count ?? 0) >= (vehicle.max_capacity ?? 22),
          status: (vehicle.passenger_count ?? 0) >= (vehicle.max_capacity ?? 22)
            ? 'Puno' as const
            : (vehicle.passenger_count ?? 0) >= (vehicle.max_capacity ?? 22) * 0.7
              ? 'Sakto' as const
              : 'Maluwag' as const,
        }];
      });
      await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(currentVehicles));
      return currentVehicles;
    } catch (e) {
      console.warn('Live vehicle list unavailable:', e);
    }
    return [];
  }

  public getLastLatency(): number {
    return this.lastLatencyMs;
  }
}

export const offlineTransit = OfflineTransitService.getInstance();
