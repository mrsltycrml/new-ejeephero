export type ReportingPeriod = { mode: 'day' | 'week' | 'month' | 'year'; key: string };

const MANILA_TIME_ZONE = 'Asia/Manila';
const pad = (value: number) => String(value).padStart(2, '0');

export function manilaDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function weekStartKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function currentReportingPeriod(mode: ReportingPeriod['mode'] = 'day'): ReportingPeriod {
  const today = manilaDateKey(new Date());
  const key = mode === 'week' ? weekStartKey(today)
    : mode === 'month' ? today.slice(0, 7)
    : mode === 'year' ? today.slice(0, 4)
    : today;
  return { mode, key };
}

export function periodRangeUtc(period: ReportingPeriod): { start: string; end: string } {
  const [year, month = 1, day = 1] = period.key.split('-').map(Number);
  // Philippine Standard Time is UTC+8 and does not observe daylight saving time.
  const start = new Date(Date.UTC(year, month - 1, day, -8));
  const end = period.mode === 'month' ? new Date(Date.UTC(year, month, 1, -8))
    : period.mode === 'year' ? new Date(Date.UTC(year + 1, 0, 1, -8))
    : new Date(Date.UTC(year, month - 1, day + (period.mode === 'week' ? 7 : 1), -8));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function periodContains(timestamp: string | null | undefined, period: ReportingPeriod): boolean {
  if (!timestamp) return false;
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return false;
  const { start, end } = periodRangeUtc(period);
  return time >= Date.parse(start) && time < Date.parse(end);
}

export function formatReportingPeriod(period: ReportingPeriod): string {
  const [year, month = 1, day = 1] = period.key.split('-').map(Number);
  if (period.mode === 'year') return String(year);
  if (period.mode === 'month') {
    return new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)));
  }
  if (period.mode === 'week') {
    const start = new Date(Date.UTC(year, month - 1, day));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const format = (date: Date, includeYear: boolean) => new Intl.DateTimeFormat('en-PH', {
      timeZone: 'UTC', month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' } : {}),
    }).format(date);
    return `${format(start, start.getUTCFullYear() !== end.getUTCFullYear())} – ${format(end, true)}`;
  }
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day)));
}
