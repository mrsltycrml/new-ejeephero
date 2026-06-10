import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';

let positionSubscriber: Location.LocationSubscription | null = null;
let telemetryInterval: NodeJS.Timeout | null = null;
let latestLocation: Location.LocationObject | null = null;

export const startTelemetry = async (vehicleId: string, isLowBattery: boolean = false) => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('Location permission denied');

    // 1. Start watching location
    positionSubscriber = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      (location) => {
        latestLocation = location;
      }
    );

    // 2. Setup periodic broadcast (throttled by battery)
    const intervalMs = isLowBattery ? 5000 : 3000;
    
    telemetryInterval = setInterval(async () => {
      if (!latestLocation) return;
      
      const { latitude, longitude, speed, heading } = latestLocation.coords;
      
      // Fire and forget to Supabase
      supabase.from('vehicle_positions').insert({
        vehicle_id: vehicleId,
        latitude,
        longitude,
        speed: (speed || 0) * 3.6, // convert m/s to km/h
        heading: heading || 0
      }).then(({ error }) => {
        if (error) console.error('Telemetry broadcast failed:', error);
      });
      
    }, intervalMs);

    // 3. Mark vehicle active
    await supabase
      .from('vehicles')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', vehicleId);
      
    console.log(`Telemetry started. Interval: ${intervalMs}ms`);
    return true;
  } catch (error) {
    console.error('Error starting telemetry:', error);
    return false;
  }
};

export const stopTelemetry = async (vehicleId: string) => {
  if (positionSubscriber) {
    positionSubscriber.remove();
    positionSubscriber = null;
  }
  
  if (telemetryInterval) {
    clearInterval(telemetryInterval);
    telemetryInterval = null;
  }
  
  latestLocation = null;

  // Mark vehicle inactive
  await supabase
    .from('vehicles')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', vehicleId);
    
  console.log('Telemetry stopped');
};
