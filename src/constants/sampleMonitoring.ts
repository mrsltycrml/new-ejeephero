import { SAMPLE_DRIVERS, SAMPLE_UNITS } from './sampleFleet';
import { manilaDateKey } from '../utils/reportingPeriod';

export type SampleTelemetry = { id: string; unit: string; driver: string; speedKph: number };
export type SampleSpeedOffense = { id: string; unit: string; driver: string; speedKph: number; limitKph: number; createdAt: string };
export type SampleRouteCut = { id: string; unit: string; driver: string; reason: string; status: 'pending_review' | 'confirmed'; createdAt: string };

function sampleTime(daysAgo: number, hour: number, minute = 0): string {
  const [year, month, day] = manilaDateKey(new Date()).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - daysAgo, hour - 8, minute)).toISOString();
}

function sampleRecentTime(minutesAgo: number): string {
  const [year, month, day] = manilaDateKey(new Date()).split('-').map(Number);
  const startOfToday = Date.UTC(year, month - 1, day, -8);
  return new Date(Math.max(startOfToday + 60_000, Date.now() - minutesAgo * 60_000)).toISOString();
}

export const SAMPLE_TELEMETRY: SampleTelemetry[] = [
  { id: 'sample-telemetry-01', unit: SAMPLE_UNITS[0].name, driver: SAMPLE_DRIVERS[0].name, speedKph: 18 },
  { id: 'sample-telemetry-02', unit: SAMPLE_UNITS[3].name, driver: SAMPLE_DRIVERS[3].name, speedKph: 24 },
  { id: 'sample-telemetry-03', unit: SAMPLE_UNITS[6].name, driver: SAMPLE_DRIVERS[6].name, speedKph: 28 },
];

export const SAMPLE_SPEED_OFFENSES: SampleSpeedOffense[] = [
  { id: 'sample-speed-01', unit: SAMPLE_UNITS[3].name, driver: SAMPLE_DRIVERS[3].name, speedKph: 24, limitKph: 20, createdAt: sampleRecentTime(38) },
  { id: 'sample-speed-02', unit: SAMPLE_UNITS[6].name, driver: SAMPLE_DRIVERS[6].name, speedKph: 28, limitKph: 20, createdAt: sampleRecentTime(17) },
  { id: 'sample-speed-03', unit: SAMPLE_UNITS[1].name, driver: SAMPLE_DRIVERS[1].name, speedKph: 25, limitKph: 20, createdAt: sampleTime(1, 17, 6) },
  { id: 'sample-speed-04', unit: SAMPLE_UNITS[9].name, driver: SAMPLE_DRIVERS[9].name, speedKph: 23, limitKph: 20, createdAt: sampleTime(12, 12, 30) },
];

export const SAMPLE_ROUTE_CUTS: SampleRouteCut[] = [
  { id: 'sample-cut-01', unit: SAMPLE_UNITS[2].name, driver: SAMPLE_DRIVERS[2].name, reason: 'Ended before the final route checkpoint', status: 'pending_review', createdAt: sampleRecentTime(52) },
  { id: 'sample-cut-02', unit: SAMPLE_UNITS[7].name, driver: SAMPLE_DRIVERS[7].name, reason: 'Skipped two ordered stops on the return trip', status: 'confirmed', createdAt: sampleTime(1, 18, 5) },
  { id: 'sample-cut-03', unit: SAMPLE_UNITS[4].name, driver: SAMPLE_DRIVERS[4].name, reason: 'Route ended outside the destination area', status: 'pending_review', createdAt: sampleTime(9, 15, 45) },
];
