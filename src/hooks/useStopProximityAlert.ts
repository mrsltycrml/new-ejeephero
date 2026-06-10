import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { isWithinRadius } from '../utils/geo';
import { LocationObject } from 'expo-location';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const useStopProximityAlert = (
  userLocation: LocationObject | null,
  targetTerminalLat: number | null,
  targetTerminalLon: number | null,
  isActive: boolean = false
) => {
  const hasAlerted = useRef(false);

  useEffect(() => {
    // Reset alert flag if target changes or becomes inactive
    if (!isActive || !targetTerminalLat || !targetTerminalLon) {
      hasAlerted.current = false;
      return;
    }

    if (userLocation && !hasAlerted.current) {
      const withinRadius = isWithinRadius(
        userLocation.coords.latitude,
        userLocation.coords.longitude,
        targetTerminalLat,
        targetTerminalLon,
        300 // 300 meters threshold
      );

      if (withinRadius) {
        hasAlerted.current = true;
        
        // Trigger Haptics
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // Trigger local notification
        Notifications.scheduleNotificationAsync({
          content: {
            title: "Approaching Stop! 🛑",
            body: "You are within 300 meters of your alighting terminal. Get ready!",
          },
          trigger: null, // trigger immediately
        });
      }
    }
  }, [userLocation, targetTerminalLat, targetTerminalLon, isActive]);
};
