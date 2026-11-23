import { supabase } from '../lib/supabase';
import type { PassengerFix } from './passengerSafety';

export type FleetIncidentType = 'accident' | 'breakdown';
export type FleetIncidentStatus = 'open' | 'acknowledged' | 'dispatched' | 'resolved';
export type FleetIncident = {
  id: string;
  incident_type: FleetIncidentType;
  status: FleetIncidentStatus;
  captured_at: string;
  latitude: number;
  longitude: number;
  gps_accuracy_meters: number | null;
  vehicle_id: string | null;
  vehicle_body_number: string | null;
  vehicle_plate: string | null;
};

async function request<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try { return await run(controller.signal); }
  finally { clearTimeout(timer); }
}

export async function reportFleetIncident(requestId: string, kind: FleetIncidentType, fix: PassengerFix, vehicleId?: string) {
  const { data, error } = await request(signal => supabase.rpc('report_fleet_incident', {
    p_request_id: requestId, p_incident_type: kind, p_latitude: fix.latitude, p_longitude: fix.longitude,
    p_accuracy: fix.accuracy, p_captured_at: new Date(fix.timestamp).toISOString(), p_vehicle_id: vehicleId ?? null,
  }).abortSignal(signal));
  if (error?.code === '22023' && error.message === 'A fresh, valid GPS fix is required.') {
    return { status: 'locationRequired' as const };
  }
  if (error || data?.id !== requestId) throw new Error('Incident submission could not be confirmed.');
  return { status: 'submitted' as const, vehicleId: typeof data.vehicle_id === 'string' ? data.vehicle_id : null };
}

export async function loadFleetIncidents(): Promise<FleetIncident[]> {
  const { data, error } = await request(signal => supabase.rpc('get_fleet_incidents').abortSignal(signal));
  if (error || !Array.isArray(data)) throw new Error('Fleet incident reports unavailable.');
  return data;
}

export async function advanceFleetIncident(id: string, status: Exclude<FleetIncidentStatus, 'open'>) {
  const { error } = await request(signal => supabase.rpc('advance_fleet_incident', { p_id: id, p_next_status: status }).abortSignal(signal));
  if (error) throw new Error('Incident status could not be confirmed.');
}
