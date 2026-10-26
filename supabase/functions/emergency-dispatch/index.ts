import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';
import { createRemoteJWKSet, jwtVerify } from 'https://deno.land/x/jose@v5.9.6/index.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const issuer = Deno.env.get('CLERK_ISSUER_URL')?.replace(/\/$/, '');
const clerkKeys = issuer?.startsWith('https://') ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) : null;
const text = (s: unknown, max: number) => typeof s === 'string' ? s.trim().slice(0, max) : '';
function normalizePhone(raw: unknown) {
  const number = text(raw, 24).replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(number)) return `+63${number.slice(1)}`;
  if (/^639\d{9}$/.test(number)) return `+${number}`;
  return /^\+639\d{9}$/.test(number) ? number : null;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!url || !serviceKey || !token) return json({ error: 'Sign in is required.' }, 401);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let userId: string | null = null;
    const { data: auth } = await db.auth.getUser(token);
    if (auth.user) userId = auth.user.id;
    if (!userId && issuer && clerkKeys) {
      try {
        const { payload } = await jwtVerify(token, clerkKeys, { issuer, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'] });
        if (payload.email_verified !== true && payload.email_verified !== 'true') return json({ error: 'Verify your email address before saving emergency contacts.' }, 403);
        const parties = (Deno.env.get('CLERK_AUTHORIZED_PARTIES') || '').split(',').map(s => s.trim()).filter(Boolean);
        if (payload.azp && parties.length && !parties.includes(String(payload.azp))) return json({ error: 'Invalid sign-in origin.' }, 401);
        const { data: profile } = await db.from('profiles').select('id').eq('clerk_id', payload.sub!).single();
        userId = profile?.id ?? null;
      } catch { return json({ error: 'Your session is not valid.' }, 401); }
    }
    // Never accept identity from request.userId or an unsigned JWT.
    if (!userId) return json({ error: 'Your session is not valid.' }, 401);
    const { data: profile } = await db.from('profiles').select('status').eq('id', userId).single();
    if (profile?.status !== 'approved') return json({ error: 'Your account is not active.' }, 403);
    const body = await request.json();
    if (body.action === 'contacts:list') {
      const result = await db.from('emergency_contacts').select('*').eq('user_id', userId).order('created_at').limit(5);
      if (result.error) return json({ error: 'Could not load contacts.' }, 500);
      return json({ contacts: result.data });
    }
    if (body.action === 'contacts:save') {
      const contact = body.contact || {};
      const phone = normalizePhone(contact.phone_number);
      const name = text(contact.contact_name, 80);
      if (!phone || !name) return json({ error: 'Enter a name and Philippine mobile number.' }, 400);
      const { data: existing, error } = await db.from('emergency_contacts').select('phone_number').eq('user_id', userId);
      if (error) return json({ error: 'Could not read contacts.' }, 500);
      if (existing.length >= 5 && !existing.some(c => c.phone_number === phone)) return json({ error: 'You can save up to five contacts.' }, 409);
      const saved = await db.from('emergency_contacts').upsert({ user_id: userId, phone_number: phone, contact_name: name, preset_message: text(contact.preset_message, 300) || 'EMERGENCY! I need help. Please check on me.' }, { onConflict: 'user_id,phone_number' }).select().single();
      if (saved.error) return json({ error: 'Could not save the contact.' }, 500);
      return json({ contact: saved.data });
    }
    if (body.action === 'contacts:delete') {
      const phone = normalizePhone(body.phone);
      if (!phone) return json({ error: 'Invalid mobile number.' }, 400);
      const result = await db.from('emergency_contacts').delete().eq('user_id', userId).eq('phone_number', phone);
      return result.error ? json({ error: 'Could not remove contact.' }, 500) : json({ deleted: true });
    }
    return json({ error: 'SOS alerts open Messages on your phone. Tap Send there to share your alert.' }, 400);
  } catch {
    // Do not log private coordinates, contact numbers or tokens.
    return json({ error: 'Could not complete the request. Use Messages or call a hotline.' }, 500);
  }
});
