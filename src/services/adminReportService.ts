import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { supabase } from '../lib/supabase';
import { formatReportingPeriod, periodRangeUtc, type ReportingPeriod } from '../utils/reportingPeriod';
import { SimplePdf } from '../utils/simplePdf';
import { loadRegistry } from './fleetRegistryService';
import { ESAKAY_OPERATIONS, ROUTE_WAYPOINT_REVIEW } from '../constants/esakayOperations';

type Shift = { id: string; driver_id: string; route_id: string; body_number: string | null; plate_number: string | null; created_at: string; ended_at: string | null; is_active: boolean };
type Profile = { id: string; full_name: string | null; email: string | null; status: string | null };
type Route = { id: string; name: string };
type Speed = { id: string; driver_id: string; body_number: string | null; plate_number: string | null; speed_kph: number; limit_kph: number; zone_label: string | null; created_at: string; score_deduction: number | null };
type Cut = { id: string; driver_id: string; body_number: string | null; plate_number: string | null; status: string; reason: string; missed_stops: string[] | null; created_at: string };
export type ReportLiveUnit = { body: string; plate: string; speed: number; lastSeen: string; isSpeeding: boolean; driverId: string };
export type PreparedAdminReport = { url: string; filename: string; periodKey: string; periodMode: ReportingPeriod['mode'] };

const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
const unit = (body?: string | null, plate?: string | null) => [body || 'Unnumbered', plate && plate !== body && `Plate ${plate}`].filter(Boolean).join(' / ');

async function allPeriodRows<T>(tableName: string, start: string, end: string): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from(tableName).select('*').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false }).range(offset, offset + 499);
    if (result.error) throw new Error(`Could not load ${tableName}: ${result.error.message}`);
    const page = (result.data ?? []) as T[];
    all.push(...page);
    if (page.length < 500) return all;
  }
}

function jpegDimensions(jpeg: Uint8Array): { width: number; height: number } {
  let cursor = 2;
  while (cursor < jpeg.length - 10) {
    if (jpeg[cursor] !== 0xff) { cursor++; continue; }
    const marker = jpeg[cursor + 1];
    if (marker === 0xd8 || marker === 0xd9) { cursor += 2; continue; }
    const length = (jpeg[cursor + 2] << 8) | jpeg[cursor + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) return { height: (jpeg[cursor + 5] << 8) | jpeg[cursor + 6], width: (jpeg[cursor + 7] << 8) | jpeg[cursor + 8] };
    cursor += 2 + length;
  }
  throw new Error('Could not read the eSAKAY logo image.');
}

async function logoBytes() {
  const uri = Asset.fromModule(require('../../assets/esakay-official-logo.jpeg')).uri;
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not load the official logo for the report.');
  const jpeg = new Uint8Array(await response.arrayBuffer());
  return { jpeg, ...jpegDimensions(jpeg) };
}

export async function openAdminPeriodReport(period: ReportingPeriod, liveUnits: ReportLiveUnit[], adminId: string): Promise<PreparedAdminReport> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') throw new Error('PDF export is available in the web preview.');
  const { start, end } = periodRangeUtc(period);
  const [shifts, speeds, cuts, profileResult, routeResult, unitRegistry, driverRegistry, logo] = await Promise.all([
    allPeriodRows<Shift>('vehicles', start, end),
    allPeriodRows<Speed>('speed_events', start, end),
    allPeriodRows<Cut>('trip_violations', start, end),
    supabase.from('profiles').select('id,full_name,email,status').eq('role', 'driver'),
    supabase.from('routes').select('id,name'),
    loadRegistry('units', adminId), loadRegistry('drivers', adminId), logoBytes(),
  ]);
  if (profileResult.error) throw new Error(`Could not load drivers: ${profileResult.error.message}`);
  if (routeResult.error) throw new Error(`Could not load routes: ${routeResult.error.message}`);
  const profiles = (profileResult.data ?? []) as Profile[];
  const routes = (routeResult.data ?? []) as Route[];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const routeMap = new Map(routes.map((route) => [route.id, route.name]));
  const driverName = (id: string) => profileMap.get(id)?.full_name || profileMap.get(id)?.email || 'Unknown driver';
  const activeUnitRegistry = unitRegistry.rows.filter((entry) => !entry.deleted_at);
  const activeDriverRegistry = driverRegistry.rows.filter((entry) => !entry.deleted_at);
  const currentLive = liveUnits.filter((entry) => Date.now() - Date.parse(entry.lastSeen) <= 120_000);
  const periodLabel = formatReportingPeriod(period);
  const cadence = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[period.mode];
  const report = new SimplePdf(logo.jpeg, logo.width, logo.height, 'Operations report', `${periodLabel} / ${cadence}`);
  report.metrics([
    { value: currentLive.length, label: 'Live units now' }, { value: shifts.length, label: 'Shifts started' },
    { value: speeds.length, label: 'Speed offenses' }, { value: cuts.length, label: 'Route flags' },
  ]);
  report.paragraph(`Generated ${dateTime(new Date().toISOString())} in Philippine time. Historical sections use the selected ${period.mode}. Current GPS is a live snapshot. Sample records are excluded.`);
  if (unitRegistry.mode === 'local-preview' || driverRegistry.mode === 'local-preview') report.paragraph('Roster data is a local preview from this browser; it is not yet shared through the database.', '#933027');

  report.section('Fleet overview');
  report.paragraph(`${new Set(shifts.map((shift) => (shift.plate_number || shift.body_number || shift.id).toUpperCase())).size} units recorded shifts in this period. ${activeUnitRegistry.length} units and ${activeDriverRegistry.length} drivers are in the active managed roster.`);
  report.table(['Unit', 'Plate', 'Route', 'Assigned driver', 'Notes'], [80, 75, 160, 95, 100], activeUnitRegistry.map((entry) => [entry.body_number, entry.plate_number || '-', entry.route_name, entry.assigned_driver || '-', entry.notes || '-']));

  report.section('Service and route context');
  report.paragraph(`Operator-reported service: ${ESAKAY_OPERATIONS.serviceHours}; ${ESAKAY_OPERATIONS.reportedFleetSize} units; target ${ESAKAY_OPERATIONS.fullRoutesPerUnitTarget} full routes per unit. eSAKAY speed policy: ${ESAKAY_OPERATIONS.operatorSpeedCapKph} km/h. Base fares: PHP ${ESAKAY_OPERATIONS.regularBaseFare} regular and PHP ${ESAKAY_OPERATIONS.discountedBaseFare} discounted for ${ESAKAY_OPERATIONS.includedDistanceKm} km, then PHP ${ESAKAY_OPERATIONS.additionalFarePerKm} per extra km.`);
  report.paragraph('The following waypoint findings are provisional map references. They do not establish a verified road-following route.');
  report.table(['Waypoint', 'Status', 'Finding'], [135, 105, 270], ROUTE_WAYPOINT_REVIEW.map((waypoint) => [waypoint.name, waypoint.confidence, waypoint.finding]));

  report.keepTogether(105);
  report.section('Shift history');
  report.paragraph('Every recorded shift started in the selected period.');
  report.table(['Started', 'Ended', 'Unit', 'Driver', 'Route', 'Status'], [85, 85, 90, 80, 130, 55], shifts.map((shift) => [dateTime(shift.created_at), dateTime(shift.ended_at), unit(shift.body_number, shift.plate_number), driverName(shift.driver_id), routeMap.get(shift.route_id) || 'Unknown route', shift.is_active ? 'On trip' : 'Ended']));

  report.section('Live speed telemetry');
  report.paragraph('Current GPS snapshot when this PDF was generated, independent of the selected period.');
  report.table(['Unit', 'Driver', 'Speed', 'Last GPS', 'Alert'], [125, 140, 70, 110, 65], currentLive.map((entry) => [unit(entry.body, entry.plate), driverName(entry.driverId), `${Math.round(entry.speed)} km/h`, dateTime(entry.lastSeen), entry.isSpeeding ? 'Speed alert' : '-']));

  report.section('Driver safety report cards');
  report.paragraph('Score starts at 100, minus recorded speed deductions and 10 points per confirmed route cut during the selected period.');
  const scoreRows = profiles.map((profile) => {
    const events = speeds.filter((event) => event.driver_id === profile.id);
    const confirmed = cuts.filter((cut) => cut.driver_id === profile.id && cut.status === 'confirmed');
    const score = Math.max(0, Math.round(100 - events.reduce((sum, event) => sum + Number(event.score_deduction || 0), 0) - confirmed.length * 10));
    return [profile.full_name || profile.email || 'Unknown', profile.status || 'Unknown', shifts.filter((shift) => shift.driver_id === profile.id).length, events.length, confirmed.length, score];
  }).sort((a, b) => Number(a[5]) - Number(b[5]));
  report.table(['Driver', 'Account', 'Shifts', 'Speed', 'Route cuts', 'Score'], [150, 95, 55, 55, 80, 55], scoreRows);

  report.section('Speeding offenses');
  report.paragraph('Recorded phone GPS alerts. Review each GPS trail before taking action.');
  report.table(['Time', 'Driver', 'Unit', 'Speed / limit', 'Road or policy'], [110, 110, 105, 85, 105], speeds.map((event) => [dateTime(event.created_at), driverName(event.driver_id), unit(event.body_number, event.plate_number), `${Math.round(Number(event.speed_kph))} / ${Math.round(Number(event.limit_kph))} km/h`, event.zone_label || 'eSAKAY limit']));

  report.section('Trip-cutting records');
  report.paragraph('Three confirmed route cuts trigger suspension under the current rule.');
  report.table(['Time', 'Driver', 'Unit', 'Status', 'Reason / missed stops'], [100, 100, 100, 70, 135], cuts.map((cut) => [dateTime(cut.created_at), driverName(cut.driver_id), unit(cut.body_number, cut.plate_number), cut.status.replace(/_/g, ' '), `${cut.reason || ''}${cut.missed_stops?.length ? ` / Missed: ${cut.missed_stops.join(', ')}` : ''}`]));

  report.keepTogether(145);
  report.section('Driver roster');
  report.paragraph('Roster entries are separate from verified sign-in accounts.');
  report.table(['Driver', 'Email', 'Assigned unit', 'Notes'], [120, 180, 90, 120], activeDriverRegistry.map((entry) => [entry.full_name, entry.email, entry.assigned_unit || '-', entry.notes || '-']));
  report.preparedBy();

  const pdf = report.toBytes();
  const blob = new Blob([new Uint8Array(pdf)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  return { url, filename: `eSAKAY-operations-${period.key}-${period.mode}.pdf`, periodKey: period.key, periodMode: period.mode };
}

export function downloadAdminPeriodReport(report: PreparedAdminReport): void {
  const link = document.createElement('a');
  link.href = report.url;
  link.download = report.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
