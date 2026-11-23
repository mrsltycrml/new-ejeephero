// node supabase/tests/emergency_dispatch_status.mjs [installed @electric-sql/pglite path]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2] || '@electric-sql/pglite');
const migration = new URL('../migrations/20261123020000_emergency_dispatch_status.sql', import.meta.url);
const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    create table public.profiles (id uuid primary key);
    insert into public.profiles values ('00000000-0000-4000-8000-000000000001');
  `);
  const legacy = readFileSync(new URL('../migrations/20261027130000_passenger_safety_and_fares.sql', import.meta.url), 'utf8');
  await db.exec(legacy.slice(legacy.indexOf('create table if not exists public.passenger_sos_dispatches'), legacy.indexOf('revoke all on public.emergency_contacts')));
  await db.exec(readFileSync(migration, 'utf8'));

  const owner = '00000000-0000-4000-8000-000000000001', request = '00000000-0000-4000-8000-000000000002';
  const status = 'select status, accepted_count, recipient_count from public.passenger_sos_dispatches where user_id = $1 and request_id = $2';
  await db.exec('set role service_role');
  assert.deepEqual((await db.query('select public.claim_passenger_sos_dispatch($1, $2, 2) as claim', [owner, request])).rows, [{ claim: 'claimed' }]);
  assert.equal((await db.query("update public.passenger_sos_dispatches set status = 'complete', accepted_count = 1 where user_id = $1 and request_id = $2", [owner, request])).affectedRows, 1);
  assert.deepEqual((await db.query(status, [owner, request])).rows, [{ status: 'complete', accepted_count: 1, recipient_count: 2 }]);
  await assert.rejects(db.exec('select created_at from public.passenger_sos_dispatches'), { code: '42501' });
  await assert.rejects(db.exec('update public.passenger_sos_dispatches set recipient_count = 0'), { code: '42501' });
  await assert.rejects(db.exec('delete from public.passenger_sos_dispatches'), { code: '42501' });
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query(status, [owner, request]), { code: '42501' });
    await assert.rejects(db.exec("update public.passenger_sos_dispatches set status = 'complete'"), { code: '42501' });
  }
  console.log('Emergency dispatch grants passed.');
} finally {
  await db.close();
}
