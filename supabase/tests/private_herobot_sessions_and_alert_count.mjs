// node supabase/tests/private_herobot_sessions_and_alert_count.mjs [installed @electric-sql/pglite path]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2] || '@electric-sql/pglite');
const migration = new URL('../migrations/20261123010000_private_herobot_sessions_and_alert_count.sql', import.meta.url);
const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create table public.profiles (id uuid primary key, botpress_user_key text, botpress_conversation_id text);
    insert into public.profiles values ('550e8400-e29b-41d4-a716-446655440000', 'legacy-fixture-key', 'legacy-fixture-conversation');
    create table public.speed_events (created_at timestamptz, is_sample boolean);
    create table public.trip_violations (created_at timestamptz, status text);
    create function public.is_ejeephero_admin() returns boolean language sql stable as
      $$ select current_setting('test.supervisor', true) = 'true' $$;
    grant select on public.profiles, public.speed_events, public.trip_violations to authenticated;
    insert into public.speed_events select now(), false from generate_series(1,1001);
    insert into public.speed_events values (now(), true), (now()-interval '25 hours', false);
    insert into public.trip_violations values (now(), 'confirmed'), (now(), 'dismissed'), (now()-interval '25 hours', 'confirmed');
  `);
  await db.exec(readFileSync(migration, 'utf8'));
  const { rows: profiles } = await db.query('select * from public.profiles');
  assert.deepEqual(profiles, [{ id: '550e8400-e29b-41d4-a716-446655440000' }]);
  const { rows: grants } = await db.query(`
    select has_table_privilege('anon','public.herobot_botpress_sessions','SELECT') as anon_read,
      has_table_privilege('authenticated','public.herobot_botpress_sessions','SELECT') as user_read,
      has_table_privilege('authenticated','public.herobot_botpress_sessions','INSERT') as user_insert,
      has_table_privilege('service_role','public.herobot_botpress_sessions','UPDATE') as service_update,
      has_function_privilege('anon','public.get_recent_admin_violation_count()','EXECUTE') as anon_count,
      relrowsecurity as rls
    from pg_class where oid = 'public.herobot_botpress_sessions'::regclass
  `);
  assert.deepEqual(grants, [{ anon_read: false, user_read: false, user_insert: false, service_update: false, anon_count: false, rls: true }]);
  await db.exec(`set role service_role;`);
  assert.deepEqual((await db.query('select * from public.herobot_botpress_sessions')).rows, []);
  await db.exec(`
    insert into public.herobot_botpress_sessions values ('550e8400-e29b-41d4-a716-446655440000', 'new-fixture-key', 'new-fixture-conversation');
  `);
  await db.exec(`insert into public.herobot_botpress_sessions values
    ('550e8400-e29b-41d4-a716-446655440000', 'unused-key', 'unused-conversation')
    on conflict (profile_id) do nothing;`);
  assert.deepEqual((await db.query('select user_key from public.herobot_botpress_sessions')).rows, [{ user_key: 'new-fixture-key' }]);
  await db.exec('set role authenticated;');
  await assert.rejects(db.query('select public.get_recent_admin_violation_count()'), { code: '42501' });
  await db.exec(`set test.supervisor = 'true';`);
  assert.equal(Number((await db.query('select public.get_recent_admin_violation_count() as count')).rows[0].count), 1002);
  console.log('Private HeroBot sessions and exact recent admin violation count passed.');
} finally {
  await db.close();
}
