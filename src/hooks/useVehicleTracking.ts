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
}

export const useVehicleTracking = (routeId?: string) => {
  const [vehicles, setVehicles] = useState<Record<string, VehiclePosition>>({});

  useEffect(() => {
    // Initial fetch of active vehicles on the route
    const fetchInitialPositions = async () => {
      let query = supabase.from('vehicle_positions').select('*');
      
      // Note: We should ideally join with vehicles to filter by route_id, 
      // but for simplicity in realtime updates we'll just track all or filter later.
      // If we had a direct route_id on vehicle_positions it would be easier.
      
      const { data } = await query.order('timestamp', { ascending: false }).limit(50);
      if (data) {
        const initial: Record<string, VehiclePosition> = {};
        data.forEach(pos => {
          if (!initial[pos.vehicle_id] || new Date(pos.timestamp) > new Date(initial[pos.vehicle_id].timestamp)) {
            initial[pos.vehicle_id] = pos;
          }
        });
        setVehicles(initial);
      }
    };

    fetchInitialPositions();

    // Subscribe to realtime updates
    const channel = supabase.channel('public:vehicle_positions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vehicle_positions' },
        (payload) => {
          const newPos = payload.new as VehiclePosition;
          setVehicles(prev => ({
            ...prev,
            [newPos.vehicle_id]: newPos
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [routeId]);

  return Object.values(vehicles);
};
