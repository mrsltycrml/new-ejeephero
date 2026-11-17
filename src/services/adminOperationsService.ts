import { realRows } from '../utils/realData';
import { supabase } from '../lib/supabase';
import {
  type FleetShift,
  type DriverRecord,
  type UnitSummary,
  type DriverSummary,
  isTodayInMakati,
  unitKey,
  summarizeUnits,
  summarizeDrivers,
  calculateSafetyScore,
} from '../utils/operationsSummary';

export {
  type FleetShift,
  type DriverRecord,
  type UnitSummary,
  type DriverSummary,
  isTodayInMakati,
  unitKey,
  summarizeUnits,
  summarizeDrivers,
  calculateSafetyScore,
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
    let query = supabase.from(table).select('*').order(orderColumn, { ascending: orderColumn !== 'created_at' });
    if (roleFilter) query = query.eq('role', 'driver');
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load ${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...realRows(page));
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

export async function forceEndShift(vehicleId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_force_end_shift', { target_vehicle_id: vehicleId });
  if (error) throw new Error(error.message);
}

export async function setDriverHidden(driverId: string, hidden: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_driver_hidden', { target_id: driverId, hidden });
  if (error) throw new Error(error.message);
}
