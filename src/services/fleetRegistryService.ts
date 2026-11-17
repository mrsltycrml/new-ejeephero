import { supabase } from '../lib/supabase';
import { realRows } from '../utils/realData';

export type RegistryMode = 'database';
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

export async function loadActiveFleetUnits(): Promise<Array<Pick<ManagedUnit, 'body_number' | 'plate_number'>>> {
  const { data, error } = await supabase.rpc('get_available_fleet_units');
  if (error) throw new Error(error.message);
  return realRows(data ?? []);
}

export async function loadRegistry(kind: 'units', adminId: string): Promise<{ rows: ManagedUnit[]; mode: RegistryMode }>;
export async function loadRegistry(kind: 'drivers', adminId: string): Promise<{ rows: ManagedDriver[]; mode: RegistryMode }>;
export async function loadRegistry(kind: RegistryKind, adminId: string): Promise<{ rows: (ManagedUnit | ManagedDriver)[]; mode: RegistryMode }> {
  const { data, error } = await supabase.from(tableFor(kind)).select('*').order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load the ${kind} registry: ${error.message}`);
  return { rows: realRows(data ?? []) as (ManagedUnit | ManagedDriver)[], mode: 'database' };
}

export async function saveRegistryRecord(kind: 'units', adminId: string, mode: RegistryMode, input: UnitInput, editingId?: string): Promise<void>;
export async function saveRegistryRecord(kind: 'drivers', adminId: string, mode: RegistryMode, input: DriverInput, editingId?: string): Promise<void>;
export async function saveRegistryRecord(kind: RegistryKind, adminId: string, mode: RegistryMode, input: UnitInput | DriverInput, editingId?: string): Promise<void> {
  const result = kind === 'units'
    ? (editingId ? await supabase.from('fleet_registry_units').update(input as UnitInput).eq('id', editingId) : await supabase.from('fleet_registry_units').insert(input as UnitInput))
    : (editingId ? await supabase.from('fleet_registry_drivers').update(input as DriverInput).eq('id', editingId) : await supabase.from('fleet_registry_drivers').insert(input as DriverInput));
  if (result.error) throw new Error(result.error.message);
}

export async function setRegistryDeleted(kind: RegistryKind, adminId: string, mode: RegistryMode, id: string, deleted: boolean): Promise<void> {
  const { error } = await supabase.from(tableFor(kind)).update({ deleted_at: deleted ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw new Error(error.message);
}
