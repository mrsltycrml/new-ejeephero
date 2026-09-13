import { Accelerometer } from 'expo-sensors';
import { supabase } from '../lib/supabase';

// Conditionally import notifications - skip in Expo Go (SDK 53+)
let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (error) {
  console.warn('Notifications not available in this environment (Expo Go SDK 53+)');
}

let accelerometerSubscription: any = null;

export const startAnomalyDetection = (vehicleId: string) => {
  if (accelerometerSubscription) return;

  Accelerometer.setUpdateInterval(500);
  accelerometerSubscription = Accelerometer.addListener(async ({ x, y, z }) => {
    const gForce = Math.sqrt(x * x + y * y + z * z);
    
    // G-force > 2.5 indicates a hard brake or potential crash
    if (gForce > 2.5) {
      await triggerAnomaly(vehicleId, 'High G-Force / Potential Crash', gForce);
    }
  });
};

export const stopAnomalyDetection = () => {
  if (accelerometerSubscription) {
    accelerometerSubscription.remove();
    accelerometerSubscription = null;
  }
};

const triggerAnomaly = async (vehicleId: string, type: string, gForce: number) => {
  // Get latest position
  const { data: pos } = await supabase
    .from('vehicle_positions')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  await supabase.from('anomalies').insert({
    vehicle_id: vehicleId,
    type: `${type} (G-Force: ${gForce.toFixed(2)})`,
    latitude: pos?.latitude,
    longitude: pos?.longitude
  });

  // Local notification to warn driver (if notifications are available)
  if (Notifications) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "⚠️ Anomaly Detected!",
          body: "High G-Force event detected. Is everything okay? Tap SOS if you need help.",
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Failed to schedule notification:', error);
    }
  }
};
