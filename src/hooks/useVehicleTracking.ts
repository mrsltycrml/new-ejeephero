import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface VehiclePosition {
  id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: string;
  route_id?: string;
}

export const useVehicleTracking = (routeId?: string) => {
  const [vehicles, setVehicles] = useState<Record<string, VehiclePosition>>({});

  useEffect(() => {
    const fetchInitialPositions = async () => {
      // Get all active vehicles
      const { data: activeVehicles } = await supabase
        .from('vehicles')
        .select('id, route_id')
        .eq('is_active', true);

      if (!activeVehicles) return;

      const vehicleIds = activeVehicles
        .filter(v => !routeId || v.route_id === routeId)
        .map(v => v.id);

      if (vehicleIds.length === 0) {
        setVehicles({});
        return;
      }

      // Get latest position for these vehicles
      const { data: positions } = await supabase
        .from('vehicle_positions')
        .select('*')
        .in('vehicle_id', vehicleIds)
        .order('timestamp', { ascending: false });

      if (positions) {
        const latest: Record<string, VehiclePosition> = {};
        positions.forEach(pos => {
          if (!latest[pos.vehicle_id] || new Date(pos.timestamp) > new Date(latest[pos.vehicle_id].timestamp)) {
            latest[pos.vehicle_id] = {
              ...pos,
              route_id: activeVehicles.find(v => v.id === pos.vehicle_id)?.route_id
            };
          }
        });
        setVehicles(latest);
      }
    };

    fetchInitialPositions();

    // Subscribe to realtime updates
    const channel = supabase.channel('vehicle_tracking')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vehicle_positions' },
        async (payload) => {
          const newPos = payload.new as VehiclePosition;

          // Check if vehicle belongs to the tracked route
          const { data: vehicle } = await supabase
            .from('vehicles')
            .select('route_id, is_active')
            .eq('id', newPos.vehicle_id)
            .single();

          if (vehicle?.is_active && (!routeId || vehicle.route_id === routeId)) {
            setVehicles(prev => ({
              ...prev,
              [newPos.vehicle_id]: { ...newPos, route_id: vehicle.route_id }
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [routeId]);

  return Object.values(vehicles);
};
