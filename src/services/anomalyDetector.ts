import { supabase } from '../lib/supabase';
import { Accelerometer } from 'expo-sensors';
import { getDistance } from '../utils/geo';

let lastLocation: any = null;
let lastGForce: number = 0;
let crashDetectionActive = false;
let terminalsCache: any[] = [];
let vehicleRouteCache: Record<string, string> = {};

export const initAnomalyDetection = async () => {
  if (crashDetectionActive) return;
  
  const { data } = await supabase.from('terminals').select('latitude, longitude, route_id');
  terminalsCache = data || [];

  Accelerometer.setUpdateInterval(100);
  Accelerometer.addListener(({ x, y, z }) => {
    const gForce = Math.sqrt(x*x + y*y + z*z);
    lastGForce = gForce;

    if (gForce > 2.5) {
      checkCrashConfidence();
    }
  });

  crashDetectionActive = true;
};

const checkCrashConfidence = async () => {
  if (lastLocation && lastLocation.coords.speed < 1 && lastGForce > 2.5) {
    triggerCrashFlag();
  }
};

const triggerCrashFlag = async () => {
  if (!lastLocation) return;

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

  // 1. GPS anomaly detection
  if (speed === 0) {
    const isNearTerminal = terminalsCache.some(t =>
      getDistance(latitude, longitude, t.latitude, t.longitude) < 0.1
    );

    if (!isNearTerminal) {
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

  // 2. Route deviation
  let routeId = vehicleRouteCache[vehicleId];
  if (!routeId) {
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('route_id')
      .eq('id', vehicleId)
      .single();
    if (vehicle?.route_id) {
      routeId = vehicle.route_id;
      vehicleRouteCache[vehicleId] = routeId;
    }
  }

  if (routeId) {
    const routeTerminals = terminalsCache.filter(t => t.route_id === routeId);
    const minDistance = routeTerminals.length > 0
      ? Math.min(...routeTerminals.map(t => getDistance(latitude, longitude, t.latitude, t.longitude)))
      : 0;

    if (minDistance > 0.5) {
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
