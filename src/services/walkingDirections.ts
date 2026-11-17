import { parseWalkingRoute, validPoint, type Point, type WalkingResult } from '../../supabase/functions/walking-directions/contract.ts';
export { parseWalkingRoute, parseOrsRoute, validSource, validDateKey } from '../../supabase/functions/walking-directions/contract.ts';
export type { Point, WalkingRoute, WalkingStep, WalkingResult } from '../../supabase/functions/walking-directions/contract.ts';

// Called only by an explicit passenger action; no location polling or persistence.
export async function getWalkingDirections(from: Point, to: Point, token: string | null): Promise<WalkingResult> {
  if (!token) return { status: 'unavailable', reason: 'Sign in again to request walking directions.' };
  if (!validPoint(from) || !validPoint(to)) return { status: 'unavailable', reason: 'Choose a stop and wait for a precise current location.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase.functions.invoke('walking-directions', { headers: { Authorization: `Bearer ${token}` }, body: { from, to }, signal: controller.signal });
    if (!error && data?.status === 'available') {
      const route = parseWalkingRoute(data.route, from, to);
      if (route) return { status: 'available', route: { ...route, accessible: null } };
    }
    const status = (error as any)?.context?.status;
    return { status: 'unavailable', reason: status === 429 ? 'Too many requests. Wait a minute and try again.' : status === 401 || status === 403 ? 'Sign in again with an active account to request directions.' : 'Walking directions are unavailable. Try again later and follow local signs.' };
  } catch { return { status: 'unavailable', reason: 'Could not load walking directions. Check your connection and try again.' }; }
  finally { clearTimeout(timer); }
}
