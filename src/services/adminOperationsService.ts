import { supabase } from '../lib/supabase';

export type FleetShift = {
  id: string;
  driver_id: string;
  route_id: string;
  body_number: string | null;
  plate_number: string | null;
  passenger_count: number | null;
  max_capacity: number | null;
  is_active: boolean;
  created_at: string;
  ended_at: string | null;
};

export type DriverRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: string | null;
};

export type RouteRecord = { id: string; name: string };

export type OperationsData = {
  shifts: FleetShift[];
  drivers: DriverRecord[];
  routes: RouteRecord[];
  speedEvents: { driver_id: string; created_at: string }[] | null;
  tripViolations: { driver_id: string; status: string; created_at: string }[] | null;
};

const PAGE_SIZE = 500;

async function readAll<T>(table: string, columns: string, orderColumn: string, roleFilter = false): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from(table).select(columns).order(orderColumn, { ascending: orderColumn !== 'created_at' });
    if (roleFilter) query = query.eq('role', 'driver');
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load ${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function loadAdminOperations(): Promise<OperationsData> {
  const [shifts, drivers, routes, speedEventsResult, tripViolationsResult] = await Promise.all([
    readAll<FleetShift>(
      'vehicles',
      'id,driver_id,route_id,body_number,plate_number,passenger_count,max_capacity,is_active,created_at,ended_at',
      'created_at'
    ),
    readAll<DriverRecord>('profiles', 'id,email,full_name,status', 'id', true),
    readAll<RouteRecord>('routes', 'id,name', 'id'),
    readAll<{ driver_id: string; created_at: string }>('speed_events', 'driver_id,created_at', 'created_at').catch(() => null),
    readAll<{ driver_id: string; status: string; created_at: string }>('trip_violations', 'driver_id,status,created_at', 'created_at').catch(() => null),
  ]);
  return { shifts, drivers, routes, speedEvents: speedEventsResult, tripViolations: tripViolationsResult };
}

export function isTodayInMakati(timestamp: string): boolean {
  const day = (value: Date) => value.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
  return day(new Date(timestamp)) === day(new Date());
}

export function unitKey(shift: FleetShift): string {
  return (shift.plate_number?.trim() || shift.body_number?.trim() || shift.id).toUpperCase();
}

export type UnitSummary = {
  key: string;
  plateNumber: string;
  bodyNumber: string;
  latestShift: FleetShift;
  activeShift: FleetShift | null;
  tripsToday: number;
  totalTrips: number;
  state: 'on_trip' | 'traveled_today' | 'no_trip_today';
};

export function summarizeUnits(shifts: FleetShift[]): UnitSummary[] {
  const map = new Map<string, UnitSummary>();
  for (const shift of shifts) {
    const key = unitKey(shift);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        plateNumber: shift.plate_number?.trim() || '',
        bodyNumber: shift.body_number?.trim() || '',
        latestShift: shift,
        activeShift: shift.is_active ? shift : null,
        tripsToday: isTodayInMakati(shift.created_at) ? 1 : 0,
        totalTrips: 1,
        state: 'no_trip_today',
      });
      continue;
    }
    existing.totalTrips += 1;
    if (isTodayInMakati(shift.created_at)) existing.tripsToday += 1;
    if (shift.is_active && !existing.activeShift) existing.activeShift = shift;
    if (!existing.plateNumber) existing.plateNumber = shift.plate_number?.trim() || '';
    if (!existing.bodyNumber) existing.bodyNumber = shift.body_number?.trim() || '';
  }
  return [...map.values()].map((unit) => ({
    ...unit,
    state: unit.activeShift ? 'on_trip' : unit.tripsToday > 0 ? 'traveled_today' : 'no_trip_today',
  }));
}

export type DriverSummary = {
  profile: DriverRecord;
  latestShift: FleetShift | null;
  activeShift: FleetShift | null;
  tripsToday: number;
  totalTrips: number;
};

export function summarizeDrivers(drivers: DriverRecord[], shifts: FleetShift[]): DriverSummary[] {
  const byDriver = new Map<string, DriverSummary>();
  for (const profile of drivers) {
    byDriver.set(profile.id, { profile, latestShift: null, activeShift: null, tripsToday: 0, totalTrips: 0 });
  }
  for (const shift of shifts) {
    const summary = byDriver.get(shift.driver_id);
    if (!summary) continue;
    summary.latestShift ??= shift;
    if (shift.is_active && !summary.activeShift) summary.activeShift = shift;
    if (isTodayInMakati(shift.created_at)) summary.tripsToday += 1;
    summary.totalTrips += 1;
  }
  return [...byDriver.values()].sort((a, b) => {
    if (Boolean(a.activeShift) !== Boolean(b.activeShift)) return a.activeShift ? -1 : 1;
    return (a.profile.full_name || a.profile.email || '').localeCompare(b.profile.full_name || b.profile.email || '');
  });
}
