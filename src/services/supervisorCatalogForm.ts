import type { RouteData, TerminalData } from './offlineTransitService';

export function routeForm(route?: RouteData) {
  return { name: route?.name ?? '', description: route?.description ?? '', operating_hours: route?.operating_hours ?? '',
    color_code: route?.color_code ?? '#1F4E79', is_coming_soon: route?.is_coming_soon ?? true };
}

export function routeChanges(form: ReturnType<typeof routeForm>, route?: RouteData) {
  const initial = routeForm(route);
  if (!form.name.trim()) throw new Error('Enter the route name and travel direction.');
  if (!/^#[a-f\d]{6}$/i.test(form.color_code.trim())) throw new Error('Enter a six-digit map color, including #.');
  return Object.fromEntries(Object.entries(form).filter(([k,v]) => !route || v !== initial[k as keyof typeof initial])
    .map(([k,v]) => [k, typeof v === 'string' ? v.trim() : v]));
}

export function stopForm(position: number, stop?: TerminalData) {
  return { name: stop?.name ?? '', sequence_order: String(position), latitude: stop?.latitude?.toString() ?? '',
    longitude: stop?.longitude?.toString() ?? '', location_source_url: stop?.location_source_url ?? '',
    landmark_desc: stop?.landmark_desc ?? '', boarding_side: stop?.boarding_side ?? '', travel_direction: stop?.travel_direction ?? '',
    entrance_instructions: stop?.entrance_instructions ?? '', stop_details_source_url: stop?.stop_details_source_url ?? '',
    useAction: '', useSource: '' };
}

type StopForm = ReturnType<typeof stopForm>;
export function https(value: string) {
  try { return /^https:\/\/[^/\s?#]+[^\s]*$/.test(value) && !!new URL(value).hostname; } catch { return false; }
}

export function stopChanges(form: StopForm, initial: StopForm, creating: boolean, maxPosition: number, verified: boolean, needsVerification = false) {
  const data: Record<string, string | number | null> = {};
  const changed = (key: keyof StopForm) => form[key].trim() !== initial[key].trim();
  if (!form.name.trim()) throw new Error('Enter the stop name.');
  if (creating || changed('name')) data.name = form.name.trim();
  if (creating || changed('sequence_order')) {
    const position = Number(form.sequence_order.trim());
    if (!Number.isInteger(position) || position < 1 || position > maxPosition) throw new Error(`Enter a stop position from 1 to ${maxPosition}.`);
    data.sequence_order = position;
  }
  for (const [key, max] of [['latitude',90],['longitude',180]] as const) {
    if (!creating && !changed(key)) continue;
    const value = form[key].trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || Math.abs(Number(value)) > max) throw new Error(`Enter a valid surveyed ${key}.`);
    if (creating || !initial[key].trim() || Number(value) !== Number(initial[key])) data[key] = Number(value);
  }
  const moved = !creating && ('latitude' in data || 'longitude' in data);
  const pinEdited = creating || moved || changed('location_source_url') || (verified && needsVerification && form.useAction !== 'withdraw');
  if (pinEdited) {
    if (!https(form.location_source_url.trim())) throw new Error('Enter the HTTPS source for this stop location.');
    data.location_source_url = form.location_source_url.trim();
  }
  const detailKeys = ['landmark_desc','boarding_side','travel_direction','entrance_instructions'] as const;
  for (const key of detailKeys) {
    if (changed(key)) data[key] = form[key].trim() || null;
  }
  const detailsEdited = detailKeys.some(key => key in data) || changed('stop_details_source_url') ||
    (moved && form.stop_details_source_url.trim() && detailKeys.some(key => form[key].trim()));
  if (detailsEdited) {
    if (!https(form.stop_details_source_url.trim())) throw new Error('Enter the HTTPS source for the boarding details.');
    data.stop_details_source_url = form.stop_details_source_url.trim();
    if (moved) for (const key of detailKeys) data[key] = form[key].trim() || null;
  }
  if ((pinEdited || detailsEdited) && !verified) throw new Error('Confirm that you checked the location or boarding details against the source.');
  if (form.useAction) {
    if (!['board','alight','both','withdraw'].includes(form.useAction)) throw new Error('Choose a passenger use.');
    if (!https(form.useSource.trim())) throw new Error('Enter the HTTPS operator source for this passenger use decision.');
    if (!verified) throw new Error('Confirm the passenger use decision against the operator source.');
    data.passenger_use = form.useAction === 'withdraw' ? null : form.useAction;
    data.passenger_use_source_url = form.useSource.trim();
  } else if (form.useSource.trim()) throw new Error('Choose a passenger use decision for this source.');
  return data;
}
