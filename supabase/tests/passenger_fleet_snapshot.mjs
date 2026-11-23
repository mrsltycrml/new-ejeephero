// node supabase/tests/passenger_fleet_snapshot.mjs [installed @electric-sql/pglite path]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2] || '@electric-sql/pglite');
const migration = new URL('../migrations/20261123030000_passenger_fleet_snapshot.sql', import.meta.url);
const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create table public.routes (id text primary key, is_archived boolean, is_coming_soon boolean,
      is_sample boolean, is_active boolean, is_published boolean, deleted_at timestamptz, status text);
    create table public.terminals (id text primary key);
    create table public.vehicles (id text primary key, route_id text, is_active boolean, ended_at timestamptz,
      is_sample boolean, deleted_at timestamptz, body_number text, plate_number text, passenger_count integer,
      max_capacity integer, driver_id text, visible boolean default true);
    create table public.vehicle_positions (id text primary key, vehicle_id text, latitude double precision,
      longitude double precision, speed double precision, heading double precision, accuracy double precision,
      timestamp timestamptz, captured_at timestamptz, is_sample boolean, visible boolean default true);
    create function public.is_approved_esakay_user() returns boolean language sql stable as
      $$ select current_setting('test.approved', true) = 'true' $$;
    alter table public.vehicles enable row level security;
    create policy fixture_vehicle_visibility on public.vehicles for select to authenticated using (visible);
    alter table public.vehicle_positions enable row level security;
    create policy fixture_position_visibility on public.vehicle_positions for select to authenticated using (visible);
    insert into public.routes(id, is_archived, is_coming_soon, is_sample, is_active, is_published, status) values
      ('allowed', false, false, false, true, true, 'active'), ('empty', false, false, false, true, true, null),
      ('archived', true, false, false, true, true, null), ('soon', false, true, false, true, true, null),
      ('draft', false, false, false, true, true, 'draft'), ('sample-route', false, false, true, true, true, null),
      ('disabled', false, false, false, false, true, null), ('unpublished', false, false, false, true, false, null);
    insert into public.vehicles(id, route_id, is_active, driver_id) values
      ('busy','allowed',true,'private'), ('weak','allowed',true,'private'), ('ended','allowed',true,'private'),
      ('inactive','allowed',false,'private'), ('sample','allowed',true,'private'), ('deleted','allowed',true,'private'),
      ('foreign','allowed',true,'private'), ('hidden-position','allowed',true,'private'), ('retired','archived',true,'private');
    update public.vehicles set visible=false where id='foreign';
    update public.vehicles set ended_at=now() where id='ended';
    update public.vehicles set deleted_at=now() where id='deleted';
    update public.vehicles set is_sample=true where id='sample';
    insert into public.vehicle_positions(id,vehicle_id,latitude,longitude,timestamp,captured_at)
      select id,id,14,121,now()-interval '4 seconds',now()-interval '4 seconds' from public.vehicles;
    insert into public.vehicle_positions(id,vehicle_id,latitude,longitude,timestamp,captured_at)
      select 'repeat-'||i,'busy',13,121,now()-interval '10 seconds',now()-interval '10 seconds' from generate_series(1,1100) i;
    update public.vehicle_positions set latitude=15,speed=22,heading=120,accuracy=8 where id='busy';
    update public.vehicle_positions set visible=false where id='hidden-position';
    insert into public.vehicle_positions values
      ('invalid','busy',91,121,22,120,8,now(),now(),false,true),
      ('future','busy',14,121,22,120,8,now(),now()+interval '6 seconds',false,true),
      ('sample-fix','busy',14,121,22,120,8,now(),now(),true,true),
      ('legacy','busy',14,121,22,120,8,now(),null,false,true),
      ('stale','busy',14,121,22,120,8,now(),now()-interval '31 seconds',false,true);
  `);
  await db.exec(readFileSync(migration, 'utf8'));
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select public.get_passenger_fleet_snapshot()'), { code: '42501' });
  await db.exec(`set test.approved = 'true'`);
  const snapshot = async () => (await db.query('select public.get_passenger_fleet_snapshot() as snapshot')).rows[0].snapshot;
  const current = await snapshot();
  assert.deepEqual(current.route_ids, ['allowed','empty']);
  assert.deepEqual(current.vehicles.map(({ id, latitude, accuracy, speed }) => [id, latitude, accuracy, speed]),
    [['busy',15,8,22], ['weak',14,null,null]]);
  assert.equal('driver_id' in current.vehicles[0], false);
  await db.exec('reset role');
  await db.exec('begin; insert into public.terminals values (\'stop-a\'), (\'stop-b\'); rollback;');
  await db.exec('set role authenticated');
  assert.equal((await snapshot()).catalog_version, current.catalog_version);
  await db.exec('reset role');
  await db.exec("insert into public.terminals values ('stop-a'), ('stop-b'); update public.routes set is_archived=true where id='allowed';");
  const { rows: [grants] } = await db.query(`select
    has_table_privilege('authenticated','public.passenger_catalog_revision','UPDATE') as can_edit,
    has_function_privilege('anon','public.get_passenger_fleet_snapshot()','EXECUTE') as anon_snapshot`);
  assert.deepEqual(grants, { can_edit: false, anon_snapshot: false });
  await db.exec('set role authenticated');
  const next = await snapshot();
  assert.equal(BigInt(next.catalog_version), BigInt(current.catalog_version)+2n);
  assert.deepEqual(next.route_ids, ['empty']);
  assert.deepEqual(next.vehicles, []);
  console.log('Passenger fleet snapshot and transactional catalog revision passed.');
} finally { await db.close(); }
