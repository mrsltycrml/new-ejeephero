import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { normalizeEmergencyPhone } from './passengerSafety';

export type EmergencyContact = { id?: string; user_id: string; contact_name: string; phone_number: string; preset_message: string; localOnly?: boolean };
const key = (userId: string) => `esakay:emergency-contacts:${userId}`;
export async function callEmergencyService(token: string | null, body: Record<string, unknown>) {
  if (!token) throw new Error('Sign in again to use automatic emergency messages.');
  const controller = new AbortController();
  // Leave room for the Edge function's 12 s provider deadline and its status write.
  const timeout = setTimeout(() => controller.abort(), body.action === 'dispatch' ? 18_000 : 4_000);
  try {
    const { data, error } = await supabase.functions.invoke('emergency-dispatch', { headers: { Authorization: `Bearer ${token}` }, body, signal: controller.signal });
    if (error || data?.error) throw new Error(data?.error || 'Automatic messaging is unavailable.');
    return data;
  } finally { clearTimeout(timeout); }
}
async function localContacts(userId: string): Promise<EmergencyContact[]> {
  try {
    const saved = await AsyncStorage.getItem(key(userId));
    const source = saved ?? await AsyncStorage.getItem('@ejeephero_emergency_contact');
    if (!source) return [];
    const parsed = JSON.parse(source);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(contact => contact?.user_id === userId
      && typeof contact.contact_name === 'string' && typeof contact.phone_number === 'string')
      .map(contact => ({ ...contact, preset_message: typeof contact.preset_message === 'string' ? contact.preset_message : '' }));
  } catch { return []; }
}

const columns = 'id,user_id,contact_name,phone_number,preset_message';

async function contactRequest<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([run(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Contacts timed out.')); }, 8000);
    })]);
  } finally { clearTimeout(timer); }
}

// A refresh and an edit share one device cache. Finish each read/merge/write before the next.
let pending = Promise.resolve();
function inOrder<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.then(() => {}, () => {});
  return result;
}

async function readContacts(userId: string) {
  const local = await localContacts(userId);
  try {
    const { data, error } = await contactRequest(signal => supabase.from('emergency_contacts')
      .select(columns).eq('user_id', userId).order('created_at').limit(5).abortSignal(signal));
    if (error || !Array.isArray(data)) throw new Error('Contacts unavailable.');
    const merged = new Map<string, EmergencyContact>();
    for (const contact of data) {
      if (contact.user_id === userId) merged.set(contact.phone_number, contact);
    }
    for (const contact of local) {
      if (contact.localOnly && !merged.has(contact.phone_number)) merged.set(contact.phone_number, contact);
    }
    const contacts = [...merged.values()];
    await AsyncStorage.setItem(key(userId), JSON.stringify(contacts)).catch(() => {});
    return { contacts, synced: true };
  } catch { return { contacts: local, synced: false }; }
}

export function readEmergencyContacts(userId: string) {
  return inOrder(() => readContacts(userId));
}

export async function loadEmergencyContacts(userId: string): Promise<EmergencyContact[]> {
  return (await readEmergencyContacts(userId)).contacts;
}

export function saveEmergencyContact(userId: string, contact: EmergencyContact) {
  return inOrder(async () => {
    const phone = normalizeEmergencyPhone(contact.phone_number);
    if (!phone || !contact.contact_name.trim()) throw new Error('invalid');
    const { contacts, synced } = await readContacts(userId);
    const existing = contacts.find(c => c.phone_number === phone);
    if (!existing && contacts.length >= 5) throw new Error('limit');
    const row = { user_id: userId, phone_number: phone, contact_name: contact.contact_name.trim().slice(0, 80),
      preset_message: contact.preset_message.trim().slice(0, 300) };
    let saved: EmergencyContact = { ...row, localOnly: true };
    if (synced) {
      const query = existing && !existing.localOnly
        ? supabase.from('emergency_contacts').update({ contact_name: row.contact_name, preset_message: row.preset_message })
          .eq('user_id', userId).eq('phone_number', phone)
        : supabase.from('emergency_contacts').upsert(row, { onConflict: 'user_id,phone_number' });
      const { data, error } = await contactRequest(signal => query.select(columns).abortSignal(signal).single());
      if (error || !data || data.user_id !== userId) throw new Error('save');
      saved = data;
    } else if (existing && !existing.localOnly) {
      throw new Error('save');
    }
    const next = [...contacts.filter(c => c.phone_number !== phone), saved];
    const write = AsyncStorage.setItem(key(userId), JSON.stringify(next));
    if (saved.localOnly) await write;
    else await write.catch(() => {});
    return saved;
  });
}

export function removeEmergencyContact(userId: string, contact: EmergencyContact) {
  return inOrder(async () => {
    if (contact.user_id !== userId) throw new Error('remove');
    if (!contact.localOnly) {
      const { error } = await contactRequest(signal => supabase.from('emergency_contacts')
        .delete().eq('user_id', userId).eq('phone_number', contact.phone_number).abortSignal(signal));
      if (error) throw new Error('remove');
    }
    const next = (await localContacts(userId)).filter(c => c.phone_number !== contact.phone_number);
    await AsyncStorage.setItem(key(userId), JSON.stringify(next));
    return next;
  });
}
