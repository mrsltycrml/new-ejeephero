import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { getBrowserPosition } from './browserLocation';
import { validPoint } from './locationQuality';
import type { PassengerFix } from './passengerSafety';

export async function requestEmergencyFix(): Promise<PassengerFix | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = (async () => {
      const point = Platform.OS === 'web' ? await getBrowserPosition()
        : (await Location.requestForegroundPermissionsAsync()).status === 'granted'
          ? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }) : null;
      if (!point || !validPoint(point.coords) || !Number.isFinite(point.timestamp) || Math.abs(Date.now() - point.timestamp) > 60_000) return null;
      const { latitude, longitude, accuracy } = point.coords;
      return { latitude, longitude, accuracy, timestamp: point.timestamp };
    })();
    return await Promise.race([read, new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 15_000); })]);
  } catch { return null; }
  finally { clearTimeout(timeout); }
}
