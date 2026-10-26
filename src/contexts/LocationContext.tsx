import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { useAuth } from './AuthContext';

type LocationContextType = {
  location: Location.LocationObject | null;
  errorMsg: string | null;
};

const LocationContext = createContext<LocationContextType>({ location: null, errorMsg: null });

export const LocationProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setLocation(null);
    setErrorMsg(null);
    if (!user) return;

    let cancelled = false;
    let subscriber: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          return;
        }

        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
          (loc) => {
            if (!cancelled) setLocation(loc);
          }
        );

        if (cancelled) {
          sub.remove();
        } else {
          subscriber = sub;
        }
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Location unavailable');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (subscriber) {
        subscriber.remove();
        subscriber = null;
      }
    };
  }, [user?.id]);

  return (
    <LocationContext.Provider value={{ location, errorMsg }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => useContext(LocationContext);
