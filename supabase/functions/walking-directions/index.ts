import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';
import { createRemoteJWKSet, jwtVerify } from 'https://deno.land/x/jose@v5.9.6/index.ts';
import { authenticateWalkingUser, createWalkingHandler } from './handler.ts';

const issuer = Deno.env.get('CLERK_ISSUER_URL')?.replace(/\/$/, '');
const parties = (Deno.env.get('CLERK_AUTHORIZED_PARTIES') || '').split(',').map(s => s.trim()).filter(Boolean);
const keys = issuer?.startsWith('https://') ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 5000 }) : null;
const url = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const db = url && serviceKey ? createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }) },
}) : null;

Deno.serve(createWalkingHandler({
  apiKey: Deno.env.get('ORS_API_KEY'), fetch,
  authenticate: token => db ? authenticateWalkingUser(token, db, async signedToken => {
    if (!keys || !issuer) throw new Error('Clerk unavailable');
    const { payload } = await jwtVerify(signedToken, keys, { issuer, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'] });
    return payload;
  }, { clerkIssuer: issuer, authorizedParties: parties }) : Promise.resolve(null),
  claim: async userId => {
    if (!db) return false;
    const { data, error } = await db.rpc('claim_walking_directions', { p_user_id: userId });
    return !error && data === true;
  },
}));
