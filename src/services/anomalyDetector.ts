import { Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { supabase } from '../lib/supabase';

// Conditionally import notifications - skip on web and Expo Go (SDK 53+)
let Notifications: any = null;
if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
  } catch {
    // Notifications unavailable in Expo Go
  }
}

let accelerometerSubscription: { remove: () => void } | null = null;
let lastAnomalyTimestamp = 0;
const ANOMALY_COOLDOWN_MS = 15_000;

export const startAnomalyDetection = async (vehicleId: string) => {
  if (Platform.OS === 'web' || accelerometerSubscription) return;

  try {
    const available = await Accelerometer.isAvailableAsync();
    if (!available || accelerometerSubscription) return;

    Accelerometer.setUpdateInterval(500);
    accelerometerSubscription = Accelerometer.addListener(async ({ x, y, z }) => {
      const gForce = Math.sqrt(x * x + y * y + z * z);

      // G-force > 2.5 indicates a hard brake or potential crash; debounce 15s
      const now = Date.now();
      if (gForce > 2.5 && now - lastAnomalyTimestamp >= ANOMALY_COOLDOWN_MS) {
        lastAnomalyTimestamp = now;
        await triggerAnomaly(vehicleId, 'High G-Force / Potential Crash', gForce);
      }
    });
  } catch {
    // Ignore sensor initialization errors on unsupported devices
  }
};

export const stopAnomalyDetection = () => {
  if (accelerometerSubscription) {
    accelerometerSubscription.remove();
    accelerometerSubscription = null;
  }
};

const triggerAnomaly = async (vehicleId: string, type: string, gForce: number) => {
  const { data: pos } = await supabase
    .from('vehicle_positions')
    .select('latitude, longitude')
    .eq('vehicle_id', vehicleId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from('anomalies').insert({
    vehicle_id: vehicleId,
    type: `${type} (G-Force: ${gForce.toFixed(2)})`,
    latitude: pos?.latitude ?? null,
    longitude: pos?.longitude ?? null,
  });

  if (Notifications) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Anomaly Detected!',
          body: 'High G-Force event detected. Is everything okay? Tap SOS if you need help.',
          sound: true,
          priority: Notifications.AndroidNotificationPriority?.MAX,
        },
        trigger: null,
      });
    } catch {
      // Ignore local notification errors
    }
  }
};
