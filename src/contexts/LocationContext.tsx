import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from './AuthContext';
import { acceptFix, fromDeviceLocation, locationQuality, type MeasuredFix, type LocationQuality } from '../services/locationQuality';
import { browserLocationWatch } from '../services/browserLocation';

type LocationContextType = {
  location: Location.LocationObject | null;
  errorMsg: string | null;
  fix: MeasuredFix | null;
  quality: LocationQuality;
  now: number;
  foreground: boolean;
  enableLocation: () => Promise<void>;
};

const LocationContext = createContext<LocationContextType>({ location: null, errorMsg: null, fix: null, quality: 'unavailable', now: Date.now(), foreground: true, enableLocation: async () => {} });

export const LocationProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [now, setNow] = useState(Date.now());
  const [revision, setRevision] = useState(0);
  const previous = useRef<MeasuredFix | null>(null);
  const browserStart = useRef<(() => void) | null>(null);
  const browserLocated = useRef(false);
  const enableLocation = useCallback(async () => {
    if (Platform.OS === 'web') { browserStart.current?.(); return; }
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      setErrorMsg(permission.status === 'granted' ? null : 'Location permission denied. Enable it in device settings.');
      setRevision(r => r + 1);
    } catch { setErrorMsg('Location permission unavailable.'); }
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { setForeground(state === 'active'); setNow(Date.now()); });
    return () => sub.remove();
  }, []);
  useEffect(() => { setLocation(null); previous.current = null; browserLocated.current = false; }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false, checking = false;
    const onPosition = (loc: Location.LocationObject) => {
      if (cancelled) return;
      const next = fromDeviceLocation(loc);
      const last = previous.current;
      const repeat = last && next.timestamp === last.timestamp && next.latitude === last.latitude &&
        next.longitude === last.longitude && locationQuality(next) === 'live';
      if (!repeat && !acceptFix(last, next)) { setErrorMsg('Waiting for a fresh, valid GPS reading.'); return; }
      if (locationQuality(next) === 'live') previous.current = next;
      setLocation(loc);
      setNow(Date.now());
      setErrorMsg(null);
    };
    if (Platform.OS === 'web') {
      if (!foreground) { setErrorMsg('Tracking paused. Reopen eSAKAY to resume GPS.'); return; }
      const watch = browserLocationWatch(pos => { browserLocated.current = true; onPosition(pos); }, message => {
        setLocation(null);
        setErrorMsg(message);
      });
      browserStart.current = watch.start;
      void watch.resume(browserLocated.current);
      const timer = setInterval(() => setNow(Date.now()), 5000);
      return () => { cancelled = true; browserStart.current = null; watch.stop(); clearInterval(timer); };
    }
    let subscriber: Location.LocationSubscription | null = null;
    const stop = () => { subscriber?.remove(); subscriber = null; };
    const check = async () => {
      setNow(Date.now());
      if (checking) return;
      checking = true;
      try {
        if (!foreground) { stop(); setErrorMsg('Tracking paused. Keep the app open; tracking is foreground only.'); return; }
        const permission = await Location.getForegroundPermissionsAsync();
        const enabled = await Location.hasServicesEnabledAsync();
        if (cancelled) return;
        if (permission.status !== 'granted') { stop(); setErrorMsg('Location access needed.'); return; }
        if (!enabled) { stop(); setErrorMsg('Location services are disabled. Enable device location.'); return; }
        if (subscriber) return;
        setErrorMsg(null);
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 0 },
          onPosition,
          reason => { if (!cancelled) { stop(); setErrorMsg(`Location unavailable: ${reason}`); } }
        );
        if (cancelled) sub.remove(); else subscriber = sub;
      } catch { if (!cancelled) { stop(); setErrorMsg('Location unavailable. Check device location settings.'); } }
      finally { checking = false; }
    };
    void check();
    const timer = setInterval(() => void check(), 5000);
    return () => { cancelled = true; clearInterval(timer); stop(); };
  }, [user?.id, foreground, revision]);

  const fix = location ? fromDeviceLocation(location) : null;
  return (
    <LocationContext.Provider value={{ location, fix, quality: locationQuality(fix, now), now, errorMsg, foreground, enableLocation }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => useContext(LocationContext);
