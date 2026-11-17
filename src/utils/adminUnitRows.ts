import type { ManagedUnit } from '../services/fleetRegistryService';
import type { UnitSummary } from './operationsSummary';

export type UnifiedUnitRow = {
  key: string;
  body: string;
  plate: string | null;
  driverName: string;
  routeName: string;
  state: 'on_shift' | 'stale' | 'inactive';
  shiftStarted?: string;
  lastGps?: string;
  activeShiftId?: string;
  registryId?: string;
  registryDeletedAt: string | null;
};

export function mergeAdminUnits(dbUnits: UnitSummary[], driversMap: Map<string, string>, routes: { id: string; name: string }[], registryUnits: ManagedUnit[]): UnifiedUnitRow[] {
  const matchedRegistryIds = new Set<string>();
  const normalized = (value: string | null) => value?.trim().toUpperCase() || '';
  const fromDb: UnifiedUnitRow[] = dbUnits.map((u) => {
    const shift = u.activeShift || u.latestShift;
    const matches = (r: ManagedUnit) =>
      (!!normalized(u.bodyNumber) && normalized(r.body_number) === normalized(u.bodyNumber)) ||
      (!!normalized(u.plateNumber) && normalized(r.plate_number) === normalized(u.plateNumber));
    const candidates = registryUnits.filter(matches);
    // Reused identifiers cannot establish identity; leave ambiguous records separate.
    const registry = candidates.length === 1 ? candidates[0] : undefined;
    if (registry) matchedRegistryIds.add(registry.id);
    return {
      key: u.key,
      body: registry ? registry.body_number : u.bodyNumber,
      plate: registry ? registry.plate_number : u.plateNumber || null,
      driverName: driversMap.get(shift.driver_id) || 'Driver',
      routeName: routes.find(route => route.id === shift.route_id)?.name || 'Route unavailable',
      state: u.activeShift ? 'on_shift' : 'inactive',
      shiftStarted: new Date(shift.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      lastGps: 'GPS unavailable',
      activeShiftId: u.activeShift?.id,
      registryId: registry?.id,
      registryDeletedAt: registry?.deleted_at ?? null,
    };
  });
  const fromReg: UnifiedUnitRow[] = registryUnits
    .filter((r) => !matchedRegistryIds.has(r.id))
    .map((r) => {
      return {
        key: `registry-${r.id}`,
        body: r.body_number,
        plate: r.plate_number,
        driverName: r.assigned_driver || 'Unassigned',
        routeName: r.route_name || 'Route unavailable',
        state: 'inactive',
        registryId: r.id,
        registryDeletedAt: r.deleted_at,
      };
    });
  return [...fromDb, ...fromReg];
}
