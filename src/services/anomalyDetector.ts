import { supabase } from '../lib/supabase';
import { Accelerometer } from 'expo-sensors';
import { getDistance } from '../utils/geo';

let lastLocation: any = null;
let lastGForce: number = 0;
let crashDetectionActive = false;

export const initAnomalyDetection = () => {
  if (crashDetectionActive) return;
  
  Accelerometer.setUpdateInterval(100);
  Accelerometer.addListener(({ x, y, z }) => {
    const gForce = Math.sqrt(x*x + y*y + z*z);
    lastGForce = gForce;

    if (gForce > 2.5) {
      // Possible crash
      checkCrashConfidence();
    }
  });

  crashDetectionActive = true;
};

const checkCrashConfidence = async () => {
  // Combined trigger: GPS stop + G-force spike within same 5s window = HIGH CONFIDENCE CRASH
  // We'll check the last known speed if it was low
  if (lastLocation && lastLocation.coords.speed < 1 && lastGForce > 2.5) {
    triggerCrashFlag();
  }
};

const triggerCrashFlag = async () => {
  if (!lastLocation) return;

  // Fetch vehicle ID
  const { data: { user } } = await supabase.auth.getUser();
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('driver_id', user?.id)
    .single();

  if (vehicle) {
    await supabase.from('anomalies').insert({
      vehicle_id: vehicle.id,
      type: 'crash_detected',
      latitude: lastLocation.coords.latitude,
      longitude: lastLocation.coords.longitude,
      detected_at: new Date().toISOString(),
      severity: 'critical'
    });
  }
};

export const detectAnomalies = async (vehicleId: string, location: any) => {
  lastLocation = location;
  const { latitude, longitude, speed } = location.coords;

  // 1. GPS anomaly detection: speed drops to 0 outside terminal zone for >60s
  // (Simplified for this exercise: if speed is 0 and not near terminal)
  if (speed === 0) {
    // Check if near any terminal
    const { data: terminals } = await supabase
      .from('terminals')
      .select('latitude, longitude');

    const isNearTerminal = terminals?.some(t =>
      getDistance(latitude, longitude, t.latitude, t.longitude) < 0.1 // 100m
    );

    if (!isNearTerminal) {
      // Could be prolonged stop anomaly
      // In a real app, we'd check if it stayed 0 for 60s
      await supabase.from('anomalies').insert({
        vehicle_id: vehicleId,
        type: 'prolonged_stop',
        latitude,
        longitude,
        detected_at: new Date().toISOString(),
        severity: 'medium'
      });
    }
  }

  // 2. Route deviation > 200m
  // Fetch route terminals
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('route_id')
    .eq('id', vehicleId)
    .single();

  if (vehicle?.route_id) {
    const { data: terminals } = await supabase
      .from('terminals')
      .select('latitude, longitude')
      .eq('route_id', vehicle.route_id);

    // Simple deviation check: distance to nearest terminal/path
    const minDistance = Math.min(...(terminals?.map(t =>
      getDistance(latitude, longitude, t.latitude, t.longitude)
    ) || [0]));

    if (minDistance > 0.5) { // 500m for simplified logic
      await supabase.from('anomalies').insert({
        vehicle_id: vehicleId,
        type: 'route_deviation',
        latitude,
        longitude,
        detected_at: new Date().toISOString(),
        severity: 'low'
      });
    }
  }
};
