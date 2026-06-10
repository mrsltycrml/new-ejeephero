import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import { supabase } from '../lib/supabase';
import { detectAnomalies, initAnomalyDetection, stopAnomalyDetection } from './anomalyDetector';

let locationSubscription: Location.LocationSubscription | null = null;
let batterySubscription: Battery.Subscription | null = null;
let currentVehicleId: string | null = null;
let currentInterval: number = 3000;

export const startTelemetry = async (vehicleId: string) => {
  if (locationSubscription) {
    stopTelemetry();
  }

  currentVehicleId = vehicleId;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.error('Location permission not granted');
    return;
  }

  initAnomalyDetection();

  const batteryLevel = await Battery.getBatteryLevelAsync();
  currentInterval = (batteryLevel > 0 && batteryLevel < 0.2) ? 5000 : 3000;

  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: currentInterval,
      distanceInterval: 5,
    },
    handleLocationUpdate
  );

  batterySubscription = Battery.addBatteryLevelListener(({ batteryLevel: newLevel }) => {
    const newInterval = (newLevel > 0 && newLevel < 0.2) ? 5000 : 3000;
    if (newInterval !== currentInterval) {
      restartTelemetryWithInterval(newInterval);
    }
  });
};

const handleLocationUpdate = async (location: Location.LocationObject) => {
  if (!currentVehicleId) return;

  const { latitude, longitude, speed, heading } = location.coords;

  const { error } = await supabase.from('vehicle_positions').insert({
    vehicle_id: currentVehicleId,
    latitude,
    longitude,
    speed: speed || 0,
    heading: heading || 0,
    timestamp: new Date(location.timestamp).toISOString()
  });

  if (error) console.error('Error pushing telemetry:', error);

  detectAnomalies(currentVehicleId, location);
};

const restartTelemetryWithInterval = async (interval: number) => {
  if (!currentVehicleId) return;
  
  currentInterval = interval;
  if (locationSubscription) {
    locationSubscription.remove();
  }

  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: currentInterval,
      distanceInterval: 5,
    },
    handleLocationUpdate
  );
};

export const stopTelemetry = () => {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
  if (batterySubscription) {
    batterySubscription.remove();
    batterySubscription = null;
  }
  stopAnomalyDetection();
  currentVehicleId = null;
};
