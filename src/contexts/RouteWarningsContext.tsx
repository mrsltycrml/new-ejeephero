import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

type RouteWarning = {
  id: string;
  route_name: string;
  unit_label: string;
  captured_at: string;
  created_at: string;
  closed_at: string | null;
  distance_meters: number;
  accuracy_meters: number;
};
type WarningRead = { warnings: RouteWarning[]; error: string };
const empty: WarningRead = { warnings: [], error: '' };
const RouteWarnings = createContext<WarningRead & {
  nextWarning?: RouteWarning;
  acknowledge: (id: string) => void;
}>({ ...empty, acknowledge: () => {} });

export const useRouteWarnings = () => useContext(RouteWarnings);

async function readWarnings(driverId?: string) {
  const query = () => {
    const rows = supabase.from('route_deviation_events')
      .select('id,route_name,unit_label,captured_at,created_at,closed_at,distance_meters,accuracy_meters');
    return driverId ? rows.eq('driver_id', driverId) : rows;
  };
  const warnings = new Map<string, RouteWarning>();
  let after: string | undefined;
  // Page by identity so closures cannot shift remaining open rows past an offset.
  while (true) {
    const page = query().is('closed_at', null).order('id').limit(500);
    const { data, error } = await (after ? page.gt('id', after) : page);
    if (error || !data) throw new Error('Route alerts unavailable.');
    if (!data.length) break;
    for (const warning of data) warnings.set(warning.id, warning);
    after = data[data.length - 1].id;
  }
  const { data, error } = await query().not('closed_at', 'is', null)
    .order('created_at', { ascending: false }).order('id').limit(20);
  if (error || !data) throw new Error('Route alerts unavailable.');
  for (const warning of data) warnings.set(warning.id, warning);
  return [...warnings.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function RouteWarningsProvider({ children, driverOnly = false }: { children: React.ReactNode; driverOnly?: boolean }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [result, setResult] = useState<{ userId: string; read: WarningRead } | null>(null);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let reading = false;
    let repeat = false;
    const refresh = async () => {
      if (cancelled) return;
      if (reading) { repeat = true; return; }
      reading = true;
      try {
        const warnings = await readWarnings(driverOnly ? userId : undefined);
        if (!cancelled) setResult({ userId, read: { warnings, error: '' } });
      } catch {
        if (!cancelled) setResult(last => ({
          userId, read: { warnings: last?.userId === userId ? last.read.warnings : [], error: 'Live route alerts unavailable.' },
        }));
      } finally {
        reading = false;
        if (repeat) { repeat = false; void refresh(); }
      }
    };
    const channel = supabase.channel(`route-warnings-${driverOnly ? 'driver' : 'supervisor'}-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_deviation_events', ...(driverOnly ? { filter: `driver_id=eq.${userId}` } : {}) }, () => void refresh())
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => { cancelled = true; clearInterval(timer); void supabase.removeChannel(channel); };
  }, [userId, driverOnly]);

  const read = result && result.userId === userId ? result.read : empty;
  const nextWarning = read.warnings.find(warning => !warning.closed_at && !seen.has(warning.id));
  const acknowledge = (id: string) => setSeen(previous => new Set(previous).add(id));
  return <RouteWarnings.Provider value={{ ...read, nextWarning, acknowledge }}>{children}</RouteWarnings.Provider>;
}
