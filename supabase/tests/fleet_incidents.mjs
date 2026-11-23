// node supabase/tests/fleet_incidents.mjs [installed @electric-sql/pglite path]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2] || '@electric-sql/pglite');
const migration = new URL('../migrations/20261123050000_fleet_incidents.sql', import.meta.url);
const db = new PGlite();
const passenger = '20000000-0000-4000-8000-000000000001';
const supervisor = '20000000-0000-4000-8000-000000000002';
const unit = '20000000-0000-4000-8000-000000000003';
const sample = '20000000-0000-4000-8000-000000000004';
const report = '20000000-0000-4000-8000-000000000005';
const second = '20000000-0000-4000-8000-000000000006';
const other = '20000000-0000-4000-8000-000000000007';
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.profiles (id uuid primary key);
    insert into public.profiles values ('${passenger}'), ('${supervisor}'), ('${other}');
    create table public.vehicles(id uuid primary key, is_active boolean, ended_at timestamptz, is_sample boolean,
      body_number text, plate_number text);
    insert into public.vehicles values ('${unit}', true, null, false, 'A12', 'TEST 012'),
      ('${sample}', true, null, true, 'sample', 'sample');
    create table public.sos_events (id uuid primary key, user_id uuid not null references public.profiles(id),
      latitude double precision not null, longitude double precision not null, gps_accuracy_meters double precision,
      vehicle_id uuid references public.vehicles(id), vehicle_plate text, vehicle_body_number text, created_at timestamptz not null default now());
    create function public.current_profile_id() returns uuid language sql stable as
      $$ select nullif(current_setting('fixture.user_id',true), '')::uuid $$;
    create function public.is_approved_esakay_user() returns boolean language sql stable as
      $$ select current_setting('fixture.approved', true) = 'yes' $$;
    create function public.is_ejeephero_admin() returns boolean language sql stable as
      $$ select public.is_approved_esakay_user() and public.current_profile_id() = '${supervisor}'::uuid $$;
    alter table public.sos_events enable row level security;
    grant select,insert on public.sos_events to authenticated;
    create policy sos_owner_read on public.sos_events for select to authenticated
      using(user_id=public.current_profile_id() or public.is_ejeephero_admin());
    create policy sos_owner_insert on public.sos_events for insert to authenticated
      with check(user_id=public.current_profile_id() and public.is_approved_esakay_user());
  `);
  await db.exec(readFileSync(migration, 'utf8'));
  const submit = async (id, kind, vehicle, capture = 'now()') => (await db.query(
    `select public.report_fleet_incident($1,$2,14.5,121.1,12,${capture},$3) as data`, [id, kind, vehicle])).rows[0].data;
  const inbox = async () => (await db.query('select public.get_fleet_incidents() as data')).rows[0].data;
  const advance = (id, status) => db.query('select public.advance_fleet_incident($1,$2)', [id, status]);
  await db.exec(`set role authenticated; set fixture.user_id='${passenger}';`);
  await assert.rejects(submit(report, 'accident', unit), { code: '42501' });
  await db.exec(`set fixture.approved='yes'`);
  await assert.rejects(submit(report, 'accident', unit, "now()-interval '5 minutes'"), { code: '22023' });
  await assert.rejects(submit(report, 'other', unit), { code: '22023' });
  assert.deepEqual(await submit(report, 'accident', unit), { id: report, vehicle_id: unit });
  assert.deepEqual(await submit(report, 'accident', unit, "now()-interval '5 minutes'"), { id: report, vehicle_id: unit });
  await assert.rejects(submit(report, 'breakdown', unit), { code: '22023' });
  assert.deepEqual(await submit(second, 'breakdown', sample), { id: second, vehicle_id: null });
  await assert.rejects(inbox(), { code: '42501' });
  await assert.rejects(advance(report, 'dispatched'), { code: '42501' });
  const { rows } = await db.query(`select has_table_privilege('authenticated','public.sos_events','INSERT') as direct_insert,
    has_function_privilege('anon','public.get_fleet_incidents()','EXECUTE') as anon_read`);
  assert.deepEqual(rows, [{ direct_insert: false, anon_read: false }]);

  await db.exec(`set fixture.user_id='${supervisor}';`);
  await assert.rejects(submit(report, 'accident', unit), { code: '22023' });
  const pending = await inbox();
  assert.equal(pending.length, 2);
  const saved = pending.find(item => item.id === report);
  assert.equal(saved.vehicle_body_number, 'A12');
  assert.equal(saved.vehicle_plate, 'TEST 012');
  assert.equal(saved.latitude, 14.5);
  assert.equal(saved.gps_accuracy_meters, 12);
  assert.equal(saved.status, 'open');
  await assert.rejects(advance(report, 'resolved'), { code: '40001' });
  await advance(report, 'acknowledged');
  await advance(report, 'acknowledged');
  await advance(report, 'dispatched');
  await advance(report, 'resolved');
  const resolved = (await inbox()).find(item => item.id === report);
  assert.equal(resolved.status, 'resolved');
  assert.equal((await db.query('select status_updated_by from sos_events where id=$1', [report])).rows[0].status_updated_by, supervisor);

  await db.exec(`set fixture.user_id='${other}';`);
  const requests = Array.from({ length: 6 }, (_, i) => `30000000-0000-4000-8000-00000000000${i}`);
  for (const id of requests.slice(0, 5)) {
    assert.deepEqual(await submit(id, 'accident', null), { id, vehicle_id: null });
  }
  await assert.rejects(submit(requests[5], 'accident', null), { code: '54000' });
  assert.deepEqual(await submit(requests[0], 'accident', null), { id: requests[0], vehicle_id: null });
  await db.exec(`set fixture.user_id='${passenger}';`);
  assert.deepEqual(await submit(requests[5], 'accident', null), { id: requests[5], vehicle_id: null });
  console.log('Fleet incident intake, authorization, idempotency, reporter limit and supervisor workflow passed.');
} finally { await db.close(); }
