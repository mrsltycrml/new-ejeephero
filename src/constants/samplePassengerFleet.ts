import { SAMPLE_UNITS } from './sampleFleet';
import { MAKATI_OFFICIAL_TERMINALS, MAKATI_PRIMARY_ROUTE, type VehicleData } from '../services/offlineTransitService';

// Illustrative positions, NOT telemetry, verified loading points or road geometry.
export const SAMPLE_PASSENGER_VEHICLES: VehicleData[] = SAMPLE_UNITS.map((unit, index) => {
  const anchor = MAKATI_OFFICIAL_TERMINALS[index % MAKATI_OFFICIAL_TERMINALS.length];
  const group = Math.floor(index / MAKATI_OFFICIAL_TERMINALS.length);
  const count = 3 + index % 14;
  return {
    id: unit.key, vehicle_id: unit.key, body_number: unit.name, plate_number: unit.plateNumber,
    route_id: MAKATI_PRIMARY_ROUTE.id, latitude: anchor.latitude + group * 0.0005,
    longitude: anchor.longitude + group * 0.0005, speed: 0, heading: 0,
    passenger_count: count, max_capacity: 22, is_full: false,
    status: count >= 15 ? 'Sakto' : 'Maluwag', is_sample: true,
  };
});
