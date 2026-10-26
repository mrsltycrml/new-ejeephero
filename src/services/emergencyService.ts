import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { normalizeEmergencyPhone } from './passengerSafety';

export type EmergencyContact = { id?: string; user_id: string; contact_name: string; phone_number: string; preset_message: string; localOnly?: boolean };
const key = (userId: string) => `esakay:emergency-contacts:${userId}`;
export async function callEmergencyService(token: string | null, body: Record<string, unknown>) {
  if (!token) throw new Error('Sign in again to use automatic emergency messages.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), body.action === 'dispatch' ? 20000 : 8000);
  try {
    const { data, error } = await supabase.functions.invoke('emergency-dispatch', { headers: { Authorization: `Bearer ${token}` }, body, signal: controller.signal });
    if (error || data?.error) throw new Error(data?.error || 'Automatic messaging is unavailable.');
    return data;
  } finally { clearTimeout(timeout); }
}
async function localContacts(userId: string): Promise<EmergencyContact[]> {
  try {
    const saved = await AsyncStorage.getItem(key(userId));
    if (saved) return JSON.parse(saved).filter((c: EmergencyContact) => c.user_id === userId);
    // Migrate only contacts explicitly belonging to this account.
    const legacy = JSON.parse(await AsyncStorage.getItem('@ejeephero_emergency_contact') || '[]');
    return (Array.isArray(legacy) ? legacy : [legacy]).filter((c: EmergencyContact) => c.user_id === userId);
  } catch { return []; }
}
export async function loadEmergencyContacts(userId: string, token: string | null): Promise<EmergencyContact[]> {
  const local = await localContacts(userId);
  try {
    const result = await callEmergencyService(token, { action: 'contacts:list' });
    if (!Array.isArray(result.contacts)) return local;
    const map = new Map<string, EmergencyContact>();
    for (const c of [...result.contacts, ...local.filter(c => c.localOnly)]) map.set(c.phone_number, c);
    const contacts = [...map.values()].slice(0, 5);
    await AsyncStorage.setItem(key(userId), JSON.stringify(contacts));
    return contacts;
  } catch { return local; }
}
export async function saveEmergencyContact(userId: string, token: string | null, contact: EmergencyContact) {
  const phone = normalizeEmergencyPhone(contact.phone_number);
  if (!phone || !contact.contact_name.trim()) throw new Error('Enter a name and a valid Philippine mobile number.');
  const current = await loadEmergencyContacts(userId, token);
  if (current.length >= 5 && !current.some(c => c.phone_number === phone)) throw new Error('You can save up to five emergency contacts.');
  let saved: EmergencyContact = { ...contact, user_id: userId, contact_name: contact.contact_name.trim().slice(0, 80), phone_number: phone, localOnly: true };
  try { const result = await callEmergencyService(token, { action: 'contacts:save', contact: saved }); if (result.contact) saved = result.contact; }
  catch { if (current.some(c => c.phone_number === phone && !c.localOnly)) throw new Error('Could not update this contact. Check your connection and try again.'); }
  await AsyncStorage.setItem(key(userId), JSON.stringify([...current.filter(c => c.phone_number !== phone), saved]));
  return saved;
}
export async function removeEmergencyContact(userId: string, token: string | null, contact: EmergencyContact) {
  if (!contact.localOnly) await callEmergencyService(token, { action: 'contacts:delete', phone: contact.phone_number });
  const next = (await localContacts(userId)).filter(c => c.phone_number !== contact.phone_number);
  await AsyncStorage.setItem(key(userId), JSON.stringify(next));
  return next;
}
