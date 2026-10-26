export type SampleUnit = {
  key: string;
  name: string;
  plateNumber: string;
  driverName: string;
  routeName: string;
  tripsToday: number;
  totalTrips: number;
  lastTripStarted: string;
  shiftEnded: string;
};

export type SampleDriver = {
  key: string;
  name: string;
  unitName: string;
  routeName: string;
};

const sampleNumber = (index: number) => String(index + 1).padStart(2, '0');
const sampleRouteName = 'MRT Buendia–Mandaluyong City Hall';

export const SAMPLE_UNITS: SampleUnit[] = Array.from({ length: 15 }, (_, index) => ({
  key: `SAMPLE-UNIT-${sampleNumber(index)}`,
  name: `Unit ${sampleNumber(index)}`,
  plateNumber: `TEST-${String(1001 + index)}`,
  driverName: `Driver ${sampleNumber(index)}`,
  routeName: sampleRouteName,
  tripsToday: index % 5 === 0 ? 0 : 2 + (index % 7),
  totalTrips: 36 + index * 11,
  lastTripStarted: `${String(5 + (index % 6)).padStart(2, '0')}:${index % 2 === 0 ? '15' : '40'} AM`,
  shiftEnded: index % 4 === 0 ? 'Not yet recorded' : `${String(6 + (index % 6)).padStart(2, '0')}:${index % 2 === 0 ? '05' : '30'} AM`,
}));

export const SAMPLE_DRIVERS: SampleDriver[] = Array.from({ length: 15 }, (_, index) => ({
  key: `SAMPLE-DRIVER-${sampleNumber(index)}`,
  name: `Driver ${sampleNumber(index)}`,
  unitName: `Unit ${sampleNumber(index)}`,
  routeName: sampleRouteName,
}));
