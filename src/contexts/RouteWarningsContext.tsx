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
const RouteWarnings = createContext<WarningRead>(empty);

export const useRouteWarnings = () => useContext(RouteWarnings);

export function RouteWarningsProvider({ children, driverOnly = false }: { children: React.ReactNode; driverOnly?: boolean }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [result, setResult] = useState<{ userId: string; read: WarningRead } | null>(null);
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
        const query = supabase.from('route_deviation_events')
          .select('id,route_name,unit_label,captured_at,created_at,closed_at,distance_meters,accuracy_meters')
          .order('created_at', { ascending: false }).limit(20);
        const { data, error } = await (driverOnly ? query.eq('driver_id', userId) : query);
        if (error || !data) throw new Error('Route alerts unavailable.');
        if (!cancelled) setResult({ userId, read: { warnings: data, error: '' } });
      } catch {
        if (!cancelled) setResult({ userId, read: { warnings: [], error: 'Live route alerts unavailable.' } });
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

  return <RouteWarnings.Provider value={result && result.userId === userId ? result.read : empty}>{children}</RouteWarnings.Provider>;
}
