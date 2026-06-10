import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

interface LocationState {
  location: Location.LocationObject | null;
  error: string | null;
  loading: boolean;
}

export const useUserLocation = () => {
  const [state, setState] = useState<LocationState>({
    location: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let subscriber: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setState(s => ({ ...s, error: 'Permission to access location was denied', loading: false }));
          return;
        }

        // Get initial location fast
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        setState(s => ({ ...s, location: initialLocation, loading: false }));

        // Start watching for updates
        subscriber = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (newLocation) => {
            setState(s => ({ ...s, location: newLocation }));
          }
        );
      } catch (err) {
        setState(s => ({ ...s, error: err instanceof Error ? err.message : 'Failed to get location', loading: false }));
      }
    };

    startWatching();

    return () => {
      if (subscriber) {
        subscriber.remove();
      }
    };
  }, []);

  return state;
};
