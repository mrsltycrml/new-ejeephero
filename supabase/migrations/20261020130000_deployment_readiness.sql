-- Deployment schema for EjeepHero operational and safety data.
-- Review and apply to Supabase before shipping a production build.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'passenger',
  status text not null default 'pending',
  is_admin boolean not null default false,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
create or replace function public.handle_ejeephero_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles(id,email,role,status,full_name)
  values(new.id,new.email,case when new.raw_user_meta_data->>'role' = 'driver' then 'driver' else 'passenger' end,'pending',coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict(id) do nothing;
  return new;
end $$;
-- Replace the legacy profile trigger so a new signup does not hit a duplicate profile insert.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created_ejeephero on auth.users;
create trigger on_auth_user_created_ejeephero after insert on auth.users
for each row execute function public.handle_ejeephero_new_user();
insert into public.profiles(id,email,role,status,full_name)
select id,email,case when raw_user_meta_data->>'role' = 'driver' then 'driver' else 'passenger' end,'approved',coalesce(raw_user_meta_data->>'full_name','')
from auth.users on conflict(id) do nothing;

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(), name text not null, description text not null default '',
  color_code text not null default '#C41E3A', operating_hours text not null default '',
  base_fare numeric(8,2) not null default 14 check (base_fare >= 0),
  per_km_rate numeric(8,2) not null default 1.5 check (per_km_rate >= 0),
  base_distance_km numeric(6,2) not null default 4, fare_effective_date date, fare_source_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.terminals (
  id uuid primary key default gen_random_uuid(), route_id uuid not null references public.routes(id) on delete cascade,
  name text not null, latitude double precision not null, longitude double precision not null,
  sequence_order integer not null, regular_fare numeric(8,2) not null default 0,
  student_fare numeric(8,2) not null default 0, elderly_fare numeric(8,2) not null default 0,
  disabled_fare numeric(8,2) not null default 0, is_esakay_hub boolean not null default false,
  is_well_lit boolean not null default false, cctv_monitored boolean not null default false,
  geofence_radius_meters integer not null default 45 check(geofence_radius_meters between 5 and 500),
  unique(route_id, sequence_order)
);

alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists role text not null default 'passenger';
alter table public.profiles add column if not exists status text not null default 'pending';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('passenger','driver'));
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check(status in ('pending','approved','rejected','suspended'));

create or replace function public.is_ejeephero_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) $$;
create or replace function public.ejeephero_profile_flags_unchanged(next_role text, next_status text, next_admin boolean)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = next_role and p.status = next_status and p.is_admin = next_admin) $$;

create or replace function public.ejeephero_distance_meters(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable strict
as $$ select 6371000 * 2 * atan2(
  sqrt(power(sin(radians(lat2-lat1)/2),2) + cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2)),
  sqrt(1 - (power(sin(radians(lat2-lat1)/2),2) + cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2)))
) $$;

alter table public.routes add column if not exists base_distance_km numeric(6,2) not null default 4;
alter table public.routes add column if not exists fare_effective_date date;
alter table public.routes add column if not exists fare_source_url text;
alter table public.terminals add column if not exists is_esakay_hub boolean not null default false;
alter table public.terminals add column if not exists is_well_lit boolean not null default false;
alter table public.terminals add column if not exists cctv_monitored boolean not null default false;
alter table public.terminals add column if not exists geofence_radius_meters integer not null default 45;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.profiles(id) on delete cascade,
  route_id uuid not null references public.routes(id), body_number text, plate_number text,
  passenger_count integer not null default 0, max_capacity integer not null default 22,
  is_active boolean not null default false, created_at timestamptz not null default now(), ended_at timestamptz
);
alter table public.vehicles add column if not exists body_number text;
alter table public.vehicles add column if not exists plate_number text;
alter table public.vehicles add column if not exists passenger_count integer not null default 0;
alter table public.vehicles add column if not exists max_capacity integer not null default 22;
alter table public.vehicles add column if not exists ended_at timestamptz;
create table if not exists public.vehicle_positions (
  id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  latitude double precision not null, longitude double precision not null,
  speed double precision not null default 0, heading double precision not null default 0,
  timestamp timestamptz not null default now()
);
alter table public.vehicle_positions add column if not exists timestamp timestamptz not null default now();
create index if not exists vehicle_positions_vehicle_time_idx on public.vehicle_positions(vehicle_id, timestamp desc);

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id) on delete cascade,
  contact_name text not null, phone_number text not null,
  preset_message text not null default 'EMERGENCY! I need help. Please check on me.',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.sos_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null, longitude double precision not null, gps_accuracy_meters double precision,
  vehicle_id uuid references public.vehicles(id) on delete set null, vehicle_plate text, vehicle_body_number text,
  created_at timestamptz not null default now()
);
create table if not exists public.road_speed_limits (
  id uuid primary key default gen_random_uuid(), label text not null,
  center_latitude double precision not null, center_longitude double precision not null,
  radius_meters integer not null default 100 check(radius_meters between 10 and 2000),
  max_speed_kph numeric(5,1) not null check(max_speed_kph between 5 and 120), source_url text not null,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.speed_events (
  id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  speed_limit_id uuid not null references public.road_speed_limits(id), latitude double precision not null,
  longitude double precision not null, speed_kph numeric(5,1) not null, limit_kph numeric(5,1) not null,
  score_deduction numeric(5,1) not null default 1, created_at timestamptz not null default now()
);
create table if not exists public.trip_violations (
  id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade, route_id uuid not null references public.routes(id),
  reason text not null, last_latitude double precision, last_longitude double precision,
  final_terminal_id uuid references public.terminals(id) on delete set null,
  status text not null default 'pending_review' check(status in ('pending_review','confirmed','dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null, reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists speed_events_driver_time_idx on public.speed_events(driver_id, created_at desc);
create index if not exists trip_violations_driver_time_idx on public.trip_violations(driver_id, created_at desc);

-- Only a supervisor-confirmed third route violation suspends a driver.
create or replace function public.suspend_after_confirmed_trip_violations()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    new.reviewed_at := now(); new.reviewed_by := auth.uid();
    if (select count(*) from public.trip_violations where driver_id = new.driver_id and status = 'confirmed') >= 2 then
      update public.profiles set status = 'suspended' where id = new.driver_id and status = 'approved';
    end if;
  elsif new.status = 'dismissed' and old.status is distinct from 'dismissed' then
    new.reviewed_at := now(); new.reviewed_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trip_violations_apply_confirmed_penalty on public.trip_violations;
create trigger trip_violations_apply_confirmed_penalty before update of status on public.trip_violations
for each row execute function public.suspend_after_confirmed_trip_violations();

create or replace function public.flag_incomplete_driver_route()
returns trigger language plpgsql security definer set search_path = public
as $$ declare final_stop public.terminals%rowtype; last_pos public.vehicle_positions%rowtype; distance_m double precision;
begin
  if old.is_active is true and new.is_active is false then
    select * into final_stop from public.terminals where route_id = new.route_id order by sequence_order desc limit 1;
    select * into last_pos from public.vehicle_positions where vehicle_id = new.id order by timestamp desc limit 1;
    if final_stop.id is not null then
      if last_pos.id is null then
        insert into public.trip_violations(vehicle_id,driver_id,route_id,reason,final_terminal_id)
        values(new.id,new.driver_id,new.route_id,'No GPS trail at shift end; supervisor review required.',final_stop.id);
      else
        distance_m := public.ejeephero_distance_meters(last_pos.latitude,last_pos.longitude,final_stop.latitude,final_stop.longitude);
        if distance_m > 150 then
          insert into public.trip_violations(vehicle_id,driver_id,route_id,reason,last_latitude,last_longitude,final_terminal_id)
          values(new.id,new.driver_id,new.route_id,format('Shift ended about %s m from the route endpoint; supervisor review required.',round(distance_m)),last_pos.latitude,last_pos.longitude,final_stop.id);
        end if;
      end if;
    end if;
    new.ended_at := now();
  end if;
  return new;
end $$;
drop trigger if exists vehicles_flag_incomplete_route on public.vehicles;
create trigger vehicles_flag_incomplete_route before update of is_active on public.vehicles
for each row execute function public.flag_incomplete_driver_route();

create or replace function public.detect_speeding_position()
returns trigger language plpgsql security definer set search_path = public
as $$ declare v public.vehicles%rowtype; lim public.road_speed_limits%rowtype; d double precision;
begin
  select * into v from public.vehicles where id = new.vehicle_id and is_active = true;
  if v.id is null then return new; end if;
  for lim in select * from public.road_speed_limits where is_active loop
    d := public.ejeephero_distance_meters(new.latitude,new.longitude,lim.center_latitude,lim.center_longitude);
    if d <= lim.radius_meters and new.speed > lim.max_speed_kph + 2 then
      if not exists(select 1 from public.speed_events e where e.vehicle_id = new.vehicle_id and e.speed_limit_id = lim.id and e.created_at > now() - interval '2 minutes') then
        insert into public.speed_events(vehicle_id,driver_id,speed_limit_id,latitude,longitude,speed_kph,limit_kph,score_deduction)
        values(new.vehicle_id,v.driver_id,lim.id,new.latitude,new.longitude,new.speed,lim.max_speed_kph,least(10,greatest(1,ceil((new.speed-lim.max_speed_kph)/5))));
      end if;
      exit;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists vehicle_positions_detect_speeding on public.vehicle_positions;
create trigger vehicle_positions_detect_speeding after insert on public.vehicle_positions
for each row execute function public.detect_speeding_position();

-- Profiles use a definer function to avoid recursive administrator policies.
alter table public.profiles enable row level security;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Users can update own name" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated using(id = auth.uid() or public.is_ejeephero_admin());
create policy profiles_update_self_name on public.profiles for update to authenticated using(id = auth.uid()) with check(
  id = auth.uid() and public.ejeephero_profile_flags_unchanged(role, status, is_admin)
);
create policy profiles_admin_update on public.profiles for update to authenticated using(public.is_ejeephero_admin()) with check(public.is_ejeephero_admin());

alter table public.routes enable row level security;
drop policy if exists routes_read_authenticated on public.routes;
create policy routes_read_authenticated on public.routes for select to authenticated using(true);
drop policy if exists routes_admin_write on public.routes;
create policy routes_admin_write on public.routes for all to authenticated using(public.is_ejeephero_admin()) with check(public.is_ejeephero_admin());
alter table public.terminals enable row level security;
drop policy if exists terminals_read_authenticated on public.terminals;
create policy terminals_read_authenticated on public.terminals for select to authenticated using(true);
drop policy if exists terminals_admin_write on public.terminals;
create policy terminals_admin_write on public.terminals for all to authenticated using(public.is_ejeephero_admin()) with check(public.is_ejeephero_admin());

alter table public.vehicles enable row level security;
drop policy if exists vehicles_read_approved on public.vehicles;
create policy vehicles_read_approved on public.vehicles for select to authenticated using(public.is_ejeephero_admin() or driver_id = auth.uid() or exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved'));
drop policy if exists vehicles_driver_insert on public.vehicles;
create policy vehicles_driver_insert on public.vehicles for insert to authenticated with check(driver_id = auth.uid() and exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'driver' and p.status = 'approved'));
drop policy if exists vehicles_driver_update on public.vehicles;
create policy vehicles_driver_update on public.vehicles for update to authenticated using(driver_id = auth.uid() or public.is_ejeephero_admin()) with check(driver_id = auth.uid() or public.is_ejeephero_admin());
alter table public.vehicle_positions enable row level security;
drop policy if exists positions_read_approved on public.vehicle_positions;
create policy positions_read_approved on public.vehicle_positions for select to authenticated using(public.is_ejeephero_admin() or exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved'));
drop policy if exists positions_insert_own_vehicle on public.vehicle_positions;
create policy positions_insert_own_vehicle on public.vehicle_positions for insert to authenticated with check(exists(select 1 from public.vehicles v where v.id = vehicle_id and v.driver_id = auth.uid() and v.is_active));

alter table public.emergency_contacts enable row level security;
drop policy if exists emergency_contacts_owner_all on public.emergency_contacts;
create policy emergency_contacts_owner_all on public.emergency_contacts for all to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
alter table public.sos_events enable row level security;
drop policy if exists sos_events_owner_or_admin_read on public.sos_events;
create policy sos_events_owner_or_admin_read on public.sos_events for select to authenticated using(user_id = auth.uid() or public.is_ejeephero_admin());
drop policy if exists sos_events_owner_insert on public.sos_events;
create policy sos_events_owner_insert on public.sos_events for insert to authenticated with check(user_id = auth.uid());
alter table public.road_speed_limits enable row level security;
drop policy if exists road_speed_limits_read_approved on public.road_speed_limits;
create policy road_speed_limits_read_approved on public.road_speed_limits for select to authenticated using(public.is_ejeephero_admin() or exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved'));
drop policy if exists road_speed_limits_admin_write on public.road_speed_limits;
create policy road_speed_limits_admin_write on public.road_speed_limits for all to authenticated using(public.is_ejeephero_admin()) with check(public.is_ejeephero_admin());
alter table public.speed_events enable row level security;
drop policy if exists speed_events_admin_read on public.speed_events;
create policy speed_events_admin_read on public.speed_events for select to authenticated using(public.is_ejeephero_admin());
alter table public.trip_violations enable row level security;
drop policy if exists trip_violations_admin_read on public.trip_violations;
create policy trip_violations_admin_read on public.trip_violations for select to authenticated using(public.is_ejeephero_admin());
drop policy if exists trip_violations_admin_update on public.trip_violations;
create policy trip_violations_admin_update on public.trip_violations for update to authenticated using(public.is_ejeephero_admin()) with check(public.is_ejeephero_admin());

do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'speed_events') then
      alter publication supabase_realtime add table public.speed_events;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_violations') then
      alter publication supabase_realtime add table public.trip_violations;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vehicle_positions') then
      alter publication supabase_realtime add table public.vehicle_positions;
    end if;
  end if;
end $$;
