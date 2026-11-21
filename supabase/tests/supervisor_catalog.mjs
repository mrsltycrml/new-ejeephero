// node supabase/tests/supervisor_catalog.mjs [installed @electric-sql/pglite path]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2] || '@electric-sql/pglite');
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const db = new PGlite();
try {
  const readiness = read('../migrations/20261020130000_deployment_readiness.sql');
  const security = read('../migrations/20261027150000_secure_clerk_data_access.sql');
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.jwt() returns jsonb language sql as
      $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create table public.profiles(id uuid primary key, clerk_id text, role text, status text, is_admin boolean);
  `);
  for (const table of ['routes','terminals','vehicles','vehicle_positions','trip_violations']) {
    const ddl = readiness.split('create table if not exists public.' + table + ' (')[1].split('\n);')[0];
    await db.exec('create table public.' + table + ' (' + ddl + '\n);');
  }
  await db.exec(readiness.match(/create or replace function public\.ejeephero_distance_meters\([\s\S]*?\$\$;/)[0]);
  for (const fn of ['current_profile_id','is_ejeephero_admin','is_approved_esakay_user','is_esakay_driver']) {
    await db.exec(security.match(new RegExp('create or replace function public\\.' + fn + '\\([\\s\\S]*?\\$\\$;'))[0]);
  }
  await db.exec(`
    alter table routes add column geometry_verified_at timestamptz, add column geometry_source_url text,
      add column r2_geometry_url text,
      add column is_archived boolean not null default false, add column is_coming_soon boolean not null default false,
      alter operating_hours set default '5:00 AM - 10:00 PM', alter fare_effective_date set default '2023-10-08',
      alter fare_source_url set default 'https://ltfrb.gov.ph/';
    alter table terminals add column location_verified_at timestamptz, add column location_source_url text,
      alter is_well_lit set default true, alter cctv_monitored set default true;
    alter table trip_violations add column body_number text, add column plate_number text,
      add column missed_stops text[] not null default '{}', add column auto_confirmed boolean not null default false,
      add column violation_type text not null default 'trip_cutting';
    alter table vehicle_positions add column accuracy double precision, add column captured_at timestamptz;
    alter table routes enable row level security;
    alter table terminals enable row level security;
    alter table vehicles enable row level security;
    create table fleet_registry_units(body_number text,plate_number text,deleted_at timestamptz);
    insert into fleet_registry_units values ('Catalog test unit','CAT-001',null);
    grant select on routes, terminals to authenticated, anon;
    create policy routes_reference on routes for select to anon,authenticated using(not is_archived);
    create policy terminals_reference on terminals for select to anon,authenticated
      using(exists(select 1 from routes where routes.id = terminals.route_id and not is_archived));
  `);
  // Install the existing shift RLS and fleet guard together with the new catalog trigger.
  await db.exec(security.slice(security.indexOf('grant select,insert on public.vehicles'),
    security.indexOf('grant select,insert on public.vehicle_positions')));
  const planning = read('../migrations/20261027130000_passenger_safety_and_fares.sql');
  await db.exec(planning.split('-- Emergency requests')[0]);
  await db.exec(read('../migrations/20261118030000_walking_directions.sql'));
  await db.exec(read('../migrations/20261118040000_live_route_deviations.sql'));
  await db.exec(read('../migrations/20261121010000_route_deviation_evidence_window.sql'));
  // The imported route starts at zero. Installing the migration must preserve those values and evidence.
  await db.exec(`
    insert into routes(id,name) values ('00000000-0000-4000-8000-000000000101','Legacy route');
    insert into terminals(route_id,name,latitude,longitude,sequence_order) values
      ('00000000-0000-4000-8000-000000000101','First',14,121,0),
      ('00000000-0000-4000-8000-000000000101','Last',14.01,121,4);
  `);
  await db.exec(read('../migrations/20261121020000_supervisor_catalog.sql'));
  await db.exec(`create trigger vehicles_flag_incomplete_route before update of is_active on vehicles
    for each row execute function public.flag_incomplete_driver_route()`);
  await db.exec(read('../migrations/20261121030000_idempotent_catalog_create.sql'));
  await db.exec(`insert into routes(id,name) values ('550e8400-e29b-41d4-a716-446655440000','Existing Route 1')`);
  await db.exec(read('../migrations/20261121040000_route1_activation.sql'));
  await db.exec(read('./supervisor_catalog.sql'));
  await db.exec(read('./idempotent_catalog_create.sql'));
  await db.exec(read('./route1_activation.sql'));
  console.log('Supervisor catalog, idempotent create and Route 1 SQL regressions passed in isolated PostgreSQL.');
} catch (error) {
  console.error(error.message, error.where || '', error.detail || '');
  process.exitCode = 1;
} finally {
  await db.close();
}
