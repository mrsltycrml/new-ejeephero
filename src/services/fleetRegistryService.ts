import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { SAMPLE_UNITS } from '../constants/sampleFleet';

export type RegistryMode = 'database' | 'local-preview';
export type RegistryKind = 'units' | 'drivers';

type RegistryBase = {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ManagedUnit = RegistryBase & {
  body_number: string;
  plate_number: string | null;
  route_name: string;
  assigned_driver: string | null;
  notes: string | null;
};

export type ManagedDriver = RegistryBase & {
  full_name: string;
  email: string;
  assigned_unit: string | null;
  notes: string | null;
};

export type UnitInput = Pick<ManagedUnit, 'body_number' | 'plate_number' | 'route_name' | 'assigned_driver' | 'notes'>;
export type DriverInput = Pick<ManagedDriver, 'full_name' | 'email' | 'assigned_unit' | 'notes'>;

const tableFor = (kind: RegistryKind) => kind === 'units' ? 'fleet_registry_units' : 'fleet_registry_drivers';
const keyFor = (kind: RegistryKind, adminId: string) => kind === 'units'
  ? 'esakay:registry-preview:shared:units'
  : `esakay:registry-preview:${adminId}:${kind}`;
const canUsePreview = typeof __DEV__ !== 'undefined' && __DEV__;

async function readLocal<T>(kind: RegistryKind, adminId: string): Promise<T[]> {
  let raw = await AsyncStorage.getItem(keyFor(kind, adminId));
  if (!raw && kind === 'units') {
    raw = await AsyncStorage.getItem(`esakay:registry-preview:${adminId}:units`);
    if (raw) await AsyncStorage.setItem(keyFor(kind, adminId), raw);
  }
  if (!raw) return [];
  try { return JSON.parse(raw) as T[]; } catch { return []; }
}

export async function loadActiveFleetUnits(): Promise<Array<Pick<ManagedUnit, 'body_number' | 'plate_number'>>> {
  const { data, error } = await supabase.rpc('get_available_fleet_units');
  if (!canUsePreview) return error ? [] : (data || []);
  const local = await readLocal<ManagedUnit>('units', 'shared');
  const merged = new Map<string, Pick<ManagedUnit, 'body_number' | 'plate_number'>>();
  for (const unit of data || []) merged.set(unit.body_number.trim().toUpperCase(), unit);
  for (const unit of local.filter((entry) => !entry.deleted_at)) {
    if (!merged.has(unit.body_number.trim().toUpperCase())) merged.set(unit.body_number.trim().toUpperCase(), unit);
  }
  for (const unit of SAMPLE_UNITS) {
    if (!merged.has(unit.name.toUpperCase())) merged.set(unit.name.toUpperCase(), { body_number: unit.name, plate_number: unit.plateNumber });
  }
  return [...merged.values()];
}

async function writeLocal<T>(kind: RegistryKind, adminId: string, rows: T[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(kind, adminId), JSON.stringify(rows));
}

export async function loadRegistry(kind: 'units', adminId: string): Promise<{ rows: ManagedUnit[]; mode: RegistryMode }>;
export async function loadRegistry(kind: 'drivers', adminId: string): Promise<{ rows: ManagedDriver[]; mode: RegistryMode }>;
export async function loadRegistry(kind: RegistryKind, adminId: string): Promise<{ rows: (ManagedUnit | ManagedDriver)[]; mode: RegistryMode }> {
  const { data, error } = await supabase.from(tableFor(kind)).select('*').order('created_at', { ascending: false });
  if (!error) return { rows: (data ?? []) as (ManagedUnit | ManagedDriver)[], mode: 'database' };
  if (!canUsePreview) throw new Error(`Could not load the ${kind} registry: ${error.message}`);
  return { rows: await readLocal<ManagedUnit | ManagedDriver>(kind, adminId), mode: 'local-preview' };
}

function validateNoDuplicate(kind: RegistryKind, rows: (ManagedUnit | ManagedDriver)[], input: UnitInput | DriverInput, editingId?: string) {
  const active = rows.filter((row) => !row.deleted_at && row.id !== editingId);
  if (kind === 'units') {
    const unit = input as UnitInput;
    if (active.some((row) => 'body_number' in row && row.body_number.trim().toLowerCase() === unit.body_number.trim().toLowerCase())) throw new Error('A unit with this body number already exists.');
    if (unit.plate_number && active.some((row) => 'plate_number' in row && row.plate_number?.trim().toLowerCase() === unit.plate_number?.trim().toLowerCase())) throw new Error('A unit with this plate number already exists.');
  } else {
    const driver = input as DriverInput;
    if (active.some((row) => 'email' in row && row.email.trim().toLowerCase() === driver.email.trim().toLowerCase())) throw new Error('A driver with this email already exists.');
  }
}

export async function saveRegistryRecord(kind: 'units', adminId: string, mode: RegistryMode, input: UnitInput, editingId?: string): Promise<void>;
export async function saveRegistryRecord(kind: 'drivers', adminId: string, mode: RegistryMode, input: DriverInput, editingId?: string): Promise<void>;
export async function saveRegistryRecord(kind: RegistryKind, adminId: string, mode: RegistryMode, input: UnitInput | DriverInput, editingId?: string): Promise<void> {
  if (mode === 'database') {
    const result = kind === 'units'
      ? (editingId ? await supabase.from('fleet_registry_units').update(input as UnitInput).eq('id', editingId) : await supabase.from('fleet_registry_units').insert(input as UnitInput))
      : (editingId ? await supabase.from('fleet_registry_drivers').update(input as DriverInput).eq('id', editingId) : await supabase.from('fleet_registry_drivers').insert(input as DriverInput));
    if (result.error) throw new Error(result.error.message);
    return;
  }
  const rows = await readLocal<ManagedUnit | ManagedDriver>(kind, adminId);
  validateNoDuplicate(kind, rows, input, editingId);
  const now = new Date().toISOString();
  if (editingId) {
    const index = rows.findIndex((row) => row.id === editingId && !row.deleted_at);
    if (index < 0) throw new Error('This entry is no longer in the active roster.');
    rows[index] = { ...rows[index], ...input, updated_at: now } as ManagedUnit | ManagedDriver;
  } else {
    rows.unshift({ id: `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...input, created_at: now, updated_at: now, deleted_at: null } as ManagedUnit | ManagedDriver);
  }
  await writeLocal(kind, adminId, rows);
}

export async function setRegistryDeleted(kind: RegistryKind, adminId: string, mode: RegistryMode, id: string, deleted: boolean): Promise<void> {
  if (mode === 'database') {
    const { error } = await supabase.from(tableFor(kind)).update({ deleted_at: deleted ? new Date().toISOString() : null }).eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  const rows = await readLocal<ManagedUnit | ManagedDriver>(kind, adminId);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error('This entry could not be found.');
  if (!deleted) {
    const row = rows[index];
    validateNoDuplicate(kind, rows, row as UnitInput | DriverInput, id);
  }
  rows[index] = { ...rows[index], deleted_at: deleted ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  await writeLocal(kind, adminId, rows);
}
