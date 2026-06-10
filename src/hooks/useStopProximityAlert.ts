import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { getDistance } from '../utils/geo';

export const useStopProximityAlert = (
  userLat: number | null,
  userLon: number | null,
  targetLat: number | null,
  targetLon: number | null,
  enabled: boolean = false
) => {
  useEffect(() => {
    if (!enabled || !userLat || !userLon || !targetLat || !targetLon) return;

    const distance = getDistance(userLat, userLon, targetLat, targetLon);
    const PROXIMITY_THRESHOLD = 0.3; // 300 meters

    if (distance <= PROXIMITY_THRESHOLD) {
      // Trigger Notification
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Malapit na Tayo!",
          body: "You are within 300m of your alighting terminal. Please prepare to get off.",
          sound: true,
        },
        trigger: null, // immediate
      });

      // Trigger Haptics
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [userLat, userLon, targetLat, targetLon, enabled]);
};
