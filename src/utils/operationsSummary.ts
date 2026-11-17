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

export type DriverSummary = {
  profile: DriverRecord;
  latestShift: FleetShift | null;
  activeShift: FleetShift | null;
  tripsToday: number;
  totalTrips: number;
};

export const FRESH_TELEMETRY_WINDOW_MS = 120_000;

/** Computes driver safety score from speed deductions and confirmed route cuts. */
export function calculateSafetyScore(speedDeductions: number, confirmedRouteCuts: number): number {
  return Math.max(0, Math.round(100 - speedDeductions - confirmedRouteCuts * 10));
}

export function isTodayInMakati(timestamp: string, now = new Date()): boolean {
  const day = (value: Date) => value.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
  return day(new Date(timestamp)) === day(now);
}

export function unitKey(shift: Pick<FleetShift, 'id' | 'plate_number' | 'body_number'>): string {
  return (shift.plate_number?.trim() || shift.body_number?.trim() || shift.id).toUpperCase();
}

export function summarizeUnits(shifts: FleetShift[], now = new Date()): UnitSummary[] {
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
        tripsToday: isTodayInMakati(shift.created_at, now) ? 1 : 0,
        totalTrips: 1,
        state: 'no_trip_today',
      });
      continue;
    }
    existing.totalTrips += 1;
    if (isTodayInMakati(shift.created_at, now)) existing.tripsToday += 1;
    if (shift.is_active && !existing.activeShift) existing.activeShift = shift;
    if (!existing.plateNumber) existing.plateNumber = shift.plate_number?.trim() || '';
    if (!existing.bodyNumber) existing.bodyNumber = shift.body_number?.trim() || '';
  }
  return [...map.values()].map((unit) => ({
    ...unit,
    state: unit.activeShift ? 'on_trip' : unit.tripsToday > 0 ? 'traveled_today' : 'no_trip_today',
  }));
}

export function summarizeDrivers(drivers: DriverRecord[], shifts: FleetShift[], now = new Date()): DriverSummary[] {
  const byDriver = new Map<string, DriverSummary>();
  for (const profile of drivers) {
    byDriver.set(profile.id, { profile, latestShift: null, activeShift: null, tripsToday: 0, totalTrips: 0 });
  }
  for (const shift of shifts) {
    const summary = byDriver.get(shift.driver_id);
    if (!summary) continue;
    summary.latestShift ??= shift;
    if (shift.is_active && !summary.activeShift) summary.activeShift = shift;
    if (isTodayInMakati(shift.created_at, now)) summary.tripsToday += 1;
    summary.totalTrips += 1;
  }
  return [...byDriver.values()].sort((a, b) => {
    if (Boolean(a.activeShift) !== Boolean(b.activeShift)) return a.activeShift ? -1 : 1;
    return (a.profile.full_name || a.profile.email || '').localeCompare(b.profile.full_name || b.profile.email || '');
  });
}

export type TelemetryRow = {
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
};

/** Picks the newest position per vehicle only if recorded within the fresh telemetry window. */
export function pickLatestFreshPositions<T extends TelemetryRow>(positions: T[], nowMs = Date.now()): Map<string, T> {
  const latest = new Map<string, T>();
  for (const position of positions) {
    const recordedMs = Date.parse(position.timestamp);
    if (!Number.isFinite(recordedMs) || nowMs - recordedMs > FRESH_TELEMETRY_WINDOW_MS) continue;
    const prev = latest.get(position.vehicle_id);
    if (!prev || recordedMs > Date.parse(prev.timestamp)) {
      latest.set(position.vehicle_id, position);
    }
  }
  return latest;
}
