// node supabase/tests/route_deviation_window.mjs [path to an installed @electric-sql/pglite]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PGlite } = createRequire(import.meta.url)(process.argv[2] || '@electric-sql/pglite');
const db = new PGlite();
const sql = path => readFileSync(new URL(path, import.meta.url), 'utf8');
try {
  // Only the prerequisite relations and policy helpers needed to install the real triggers.
  await db.exec(`
    create role authenticated;
    create role anon;
    create table public.profiles (id uuid primary key);
    create table public.routes (id uuid primary key, name text, is_archived boolean default false,
      is_coming_soon boolean default false, geometry_verified_at timestamptz, geometry_source_url text);
    create table public.vehicles (id uuid primary key, driver_id uuid references profiles,
      route_id uuid references routes, body_number text, plate_number text, is_active boolean, created_at timestamptz);
    create table public.vehicle_positions (id uuid primary key default gen_random_uuid(), vehicle_id uuid references vehicles,
      latitude double precision not null, longitude double precision not null, speed double precision,
      timestamp timestamptz not null, captured_at timestamptz, accuracy double precision, is_sample boolean default false);
    create index on public.vehicle_positions(vehicle_id, timestamp desc);
    create function public.is_esakay_driver() returns boolean language sql as 'select false';
    create function public.is_ejeephero_admin() returns boolean language sql as 'select false';
    create function public.current_profile_id() returns uuid language sql as 'select null::uuid';
  `);
  const readiness = sql('../migrations/20261020130000_deployment_readiness.sql');
  await db.exec(readiness.match(/create or replace function public\.ejeephero_distance_meters\([\s\S]*?\$\$;/)[0]);
  await db.exec(sql('../migrations/20261118040000_live_route_deviations.sql'));
  await db.exec(sql('../migrations/20261121010000_route_deviation_evidence_window.sql'));
  await db.exec(sql('./route_deviation_window.sql'));
  console.log('Route deviation SQL regressions passed in isolated PGlite.');
} finally {
  await db.close();
}
