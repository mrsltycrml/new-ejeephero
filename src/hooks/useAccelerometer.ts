import { useState, useEffect } from 'react';
import { Accelerometer } from 'expo-sensors';
import { detectCrashAnomaly } from '../services/anomalyDetector';
import { Alert } from 'react-native';

export const useAccelerometerCrashDetection = (onCrashDetected: () => void) => {
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    // Set update interval to 100ms
    Accelerometer.setUpdateInterval(100);

    const sub = Accelerometer.addListener(accelerometerData => {
      const { x, y, z } = accelerometerData;
      
      const isCrash = detectCrashAnomaly(x, y, z, 4.0); // 4G threshold
      if (isCrash) {
        // Debounce or immediately trigger
        onCrashDetected();
      }
    });

    setSubscription(sub);

    return () => {
      if (sub) {
        sub.remove();
      }
    };
  }, []);
};
