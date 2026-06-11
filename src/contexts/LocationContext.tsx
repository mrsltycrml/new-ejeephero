import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Location from 'expo-location';

type LocationContextType = {
  location: Location.LocationObject | null;
  errorMsg: string | null;
};

const LocationContext = createContext<LocationContextType>({ location: null, errorMsg: null });

export const LocationProvider = ({ children }: { children: React.ReactNode }) => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let subscriber: Location.LocationSubscription;
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      subscriber = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (loc) => setLocation(loc)
      );
    })();

    return () => {
      if (subscriber) subscriber.remove();
    };
  }, []);

  return (
    <LocationContext.Provider value={{ location, errorMsg }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => useContext(LocationContext);
