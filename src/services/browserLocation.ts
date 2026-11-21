const options: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 };
const blocked = 'Location access is blocked for this website. Allow Location for this site and try again.';

// WebKit exposes these as prototype getters. Journey and boarding consumers copy the plain coordinates.
function deviceReading({ timestamp, coords }: GeolocationPosition) {
  const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = coords;
  return { timestamp, coords: { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } };
}

function deviceGPS(): Geolocation {
  if (!window.isSecureContext) throw new Error('Open eSAKAY over HTTPS to use location.');
  if (!navigator.geolocation) throw new Error('This browser cannot access your location. Open eSAKAY directly in Safari or another browser.');
  return navigator.geolocation;
}

export function getBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => deviceGPS().getCurrentPosition(resolve, reject, options));
}

function errorMessage(error: GeolocationPositionError): string {
  if (error.code === 1) return blocked;
  if (error.code === 3) return 'GPS timed out. Move near a window or outdoors and try again.';
  return 'Your device could not determine its position. Check Location Services and try again.';
}

// Start directly from the tap. Safari can provide a position even when a permissions query is unavailable.
export function browserLocationWatch(onPosition: (position: ReturnType<typeof deviceReading>) => void, onStatus: (message: string) => void,
  requested: { current: boolean }) {
  let watchId: number | undefined;
  let gps: Geolocation | undefined;
  let generation = 0;
  function stop() {
    generation++;
    if (watchId !== undefined) gps?.clearWatch(watchId);
    watchId = undefined;
  }
  function startWatch() {
    stop();
    const request = generation;
    try {
      gps = deviceGPS();
      onStatus('Getting a fresh GPS reading…');
      watchId = gps.watchPosition(position => {
        if (generation === request) onPosition(deviceReading(position));
      }, error => {
        if (generation !== request) return;
        if (error.code === 1) { requested.current = false; stop(); }
        onStatus(errorMessage(error));
      }, options);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'GPS could not start. Try again.');
    }
  }
  function start() { requested.current = true; startWatch(); }
  async function resume() {
    const request = generation;
    let permission: PermissionState | undefined;
    try { permission = (await navigator.permissions.query({ name: 'geolocation' })).state; }
    catch { /* An explicit request can still use the device GPS. */ }
    if (request !== generation) return;
    if (permission === 'denied') { requested.current = false; stop(); onStatus(blocked); }
    else if (permission === 'granted' || requested.current) startWatch();
    else onStatus('Enable location to get a reading from your device.');
  }
  return { start, resume, stop };
}
