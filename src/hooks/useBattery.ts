import { useState, useEffect } from 'react';

export const useBattery = () => {
  const [batteryLevel, setBatteryLevel] = useState<number>(1); // 100%
  const [isLowPowerMode, setIsLowPowerMode] = useState<boolean>(false);

  // Since we didn't explicitly install expo-battery in the prompt constraints,
  // we'll mock the battery level here. In a real app we'd use:
  // import * as Battery from 'expo-battery';
  // Battery.getBatteryLevelAsync() etc.

  useEffect(() => {
    // Simulated battery drain for demo purposes
    const interval = setInterval(() => {
      setBatteryLevel(prev => {
        const newLevel = Math.max(0.1, prev - 0.05);
        if (newLevel <= 0.2) {
          setIsLowPowerMode(true);
        }
        return newLevel;
      });
    }, 60000); // drain 5% every minute

    return () => clearInterval(interval);
  }, []);

  return { batteryLevel, isLowPowerMode };
};
