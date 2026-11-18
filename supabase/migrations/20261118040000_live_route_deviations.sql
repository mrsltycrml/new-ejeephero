alter table public.routes add column if not exists coordinates jsonb;

-- A GPS device can report a usable position without reporting speed.
drop policy if exists positions_driver_insert on public.vehicle_positions;
create policy positions_driver_insert on public.vehicle_positions for insert to authenticated with check(
  public.is_esakay_driver() and latitude between -90 and 90 and longitude between -180 and 180
  and ((captured_at is null and speed between 0 and 130 and timestamp between now()-interval '30 seconds' and now()+interval '10 seconds')
    or (captured_at = timestamp and captured_at between now()-interval '30 seconds' and now()+interval '5 seconds'
      and accuracy between 0 and 30 and (speed is null or speed between 0 and 130)))
  and exists(select 1 from public.vehicles v where v.id=vehicle_id and v.is_active and v.driver_id=public.current_profile_id())
);

create function public.valid_esakay_route_line(line jsonb) returns boolean
language plpgsql immutable strict set search_path = pg_catalog, pg_temp as $$
begin
  if jsonb_typeof(line) <> 'array' then return false; end if;
  if jsonb_array_length(line) not between 2 and 5000 then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(line) as p
    where case when jsonb_typeof(p->'latitude') = 'number' and jsonb_typeof(p->'longitude') = 'number'
      then (p->>'latitude')::numeric not between -90 and 90 or (p->>'longitude')::numeric not between -180 and 180
      else true end
  ) then return false; end if;
  return exists (
    select 1 from jsonb_array_elements(line) as p
    where (p->>'latitude')::numeric <> (line->0->>'latitude')::numeric
       or (p->>'longitude')::numeric <> (line->0->>'longitude')::numeric
  );
end $$;
revoke all on function public.valid_esakay_route_line(jsonb) from public, anon, authenticated;

create function public.publish_esakay_route_line(p_route_id uuid, p_coordinates jsonb, p_source_url text)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if public.is_ejeephero_admin() is distinct from true then
    raise exception 'Supervisor access required.' using errcode = '42501';
  end if;
  if p_coordinates is null or octet_length(p_coordinates::text) > 400000 or not public.valid_esakay_route_line(p_coordinates) then
    raise exception 'Supply 2 to 5,000 valid route points with at least two distinct positions.' using errcode = '22023';
  end if;
  if p_source_url is null or length(p_source_url) > 1000 or p_source_url !~ '^https://[^[:space:]]+$' then
    raise exception 'An HTTPS source link is required.' using errcode = '22023';
  end if;
  update public.routes r set coordinates = p_coordinates, geometry_source_url = p_source_url,
    geometry_verified_at = clock_timestamp()
  where r.id = p_route_id and not r.is_archived and not r.is_coming_soon
    and (to_jsonb(r)->>'is_sample') is distinct from 'true'
    and (to_jsonb(r)->>'is_active') is distinct from 'false'
    and (to_jsonb(r)->>'is_published') is distinct from 'false'
    and (to_jsonb(r)->>'deleted_at') is null
    and coalesce(to_jsonb(r)->>'status', 'published') in ('active', 'published');
  if not found then raise exception 'Active route unavailable.' using errcode = '22023'; end if;
end $$;
revoke all on function public.publish_esakay_route_line(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.publish_esakay_route_line(uuid, jsonb, text) to authenticated;

create table public.route_deviation_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  route_id uuid not null references public.routes(id),
  route_name text not null,
  unit_label text not null,
  geometry_verified_at timestamptz not null,
  captured_at timestamptz not null,
  distance_meters double precision not null check (distance_meters > 0),
  accuracy_meters double precision not null check (accuracy_meters between 0 and 30),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index route_deviation_one_open on public.route_deviation_events(vehicle_id) where closed_at is null;
create index route_deviation_driver_history on public.route_deviation_events(driver_id, created_at desc);
create index route_deviation_recent on public.route_deviation_events(created_at desc);
alter table public.route_deviation_events enable row level security;
revoke all on public.route_deviation_events from public, anon, authenticated;
grant select on public.route_deviation_events to authenticated;
create policy route_deviations_driver_or_supervisor on public.route_deviation_events for select to authenticated
using (public.is_ejeephero_admin() or (public.is_esakay_driver() and driver_id = public.current_profile_id()));

-- Project the route and fix onto metres at the fix latitude. These are local city routes.
create function public.esakay_route_line_distance(line jsonb, lat double precision, lon double precision)
returns double precision language sql immutable strict set search_path = pg_catalog, pg_temp as $$
  with vertices as (
    select point(((p->>'longitude')::double precision - lon) * 111194.93 * cos(radians(lat)),
                 ((p->>'latitude')::double precision - lat) * 111194.93) as position, ordinal
    from jsonb_array_elements(line) with ordinality as vertices(p, ordinal)
  ), edges as (
    select lag(position) over (order by ordinal) as previous, position from vertices
  )
  select min(point(0, 0) <-> lseg(previous, position)) from edges
  where previous is not null and not (previous ~= position);
$$;
revoke all on function public.esakay_route_line_distance(jsonb, double precision, double precision) from public, anon, authenticated;

create function public.check_esakay_route_deviation() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  corridor constant double precision := 75;
  shift public.vehicles%rowtype;
  route public.routes%rowtype;
  prior public.vehicle_positions%rowtype;
  previous_fix public.vehicle_positions%rowtype := new;
  distance double precision;
  samples integer := 1;
begin
  if new.captured_at is null or new.timestamp is distinct from new.captured_at
    or new.captured_at not between now()-interval '30 seconds' and now()+interval '5 seconds'
    or new.accuracy is null or new.accuracy not between 0 and 30
    or new.latitude not between -90 and 90 or new.longitude not between -180 and 180
    or (to_jsonb(new)->>'is_sample') = 'true' then return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.vehicle_id::text, 74));
  select * into shift from public.vehicles where id = new.vehicle_id and is_active for share;
  if not found or (to_jsonb(shift)->>'is_sample') = 'true' or (to_jsonb(shift)->>'deleted_at') is not null
    or new.captured_at < shift.created_at then return new;
  end if;
  -- Late and duplicate fixes cannot close or open an alert.
  if exists(select 1 from public.vehicle_positions p where p.vehicle_id = new.vehicle_id
    and p.id <> new.id and p.captured_at is not null and p.timestamp >= new.timestamp) then return new;
  end if;
  select r.* into route from public.routes r where r.id = shift.route_id and not r.is_archived and not r.is_coming_soon
    and (to_jsonb(r)->>'is_sample') is distinct from 'true'
    and (to_jsonb(r)->>'is_active') is distinct from 'false'
    and (to_jsonb(r)->>'is_published') is distinct from 'false'
    and (to_jsonb(r)->>'deleted_at') is null
    and coalesce(to_jsonb(r)->>'status', 'published') in ('active', 'published');
  if not found or route.geometry_verified_at is null or route.geometry_verified_at > least(now(), new.captured_at)
    or route.geometry_source_url is null or route.geometry_source_url !~ '^https://[^[:space:]]+$'
    or public.valid_esakay_route_line(route.coordinates) is distinct from true then return new;
  end if;
  distance := public.esakay_route_line_distance(route.coordinates, new.latitude, new.longitude);
  if distance is null then return new; end if;
  update public.route_deviation_events e set closed_at = new.captured_at
  where e.vehicle_id = new.vehicle_id and e.closed_at is null
    and (e.geometry_verified_at <> route.geometry_verified_at or distance + new.accuracy <= corridor);
  if distance - new.accuracy <= corridor or exists(select 1 from public.route_deviation_events e where e.vehicle_id = new.vehicle_id and e.closed_at is null) then
    return new;
  end if;
  for prior in
    select p.* from public.vehicle_positions p where p.vehicle_id = new.vehicle_id
      and p.timestamp < new.timestamp
      and p.timestamp >= greatest(now()-interval '30 seconds', new.timestamp-interval '30 seconds', shift.created_at, route.geometry_verified_at)
    order by p.timestamp desc limit 12
  loop
    if prior.captured_at is distinct from prior.timestamp or prior.accuracy is null or prior.accuracy not between 0 and 30
      or prior.latitude not between -90 and 90 or prior.longitude not between -180 and 180
      or (to_jsonb(prior)->>'is_sample') = 'true'
      or previous_fix.timestamp - prior.timestamp > interval '10 seconds'
      or previous_fix.timestamp <= prior.timestamp
      or public.ejeephero_distance_meters(prior.latitude, prior.longitude, previous_fix.latitude, previous_fix.longitude)
        > (130.0/3.6) * extract(epoch from previous_fix.timestamp - prior.timestamp) + prior.accuracy + previous_fix.accuracy
      or public.esakay_route_line_distance(route.coordinates, prior.latitude, prior.longitude) - prior.accuracy <= corridor
    then return new; end if;
    samples := samples + 1;
    if samples >= 3 and new.timestamp - prior.timestamp >= interval '12 seconds' then
      insert into public.route_deviation_events
        (vehicle_id, driver_id, route_id, route_name, unit_label, geometry_verified_at, captured_at, distance_meters, accuracy_meters)
      values (shift.id, shift.driver_id, route.id, route.name, coalesce(nullif(shift.body_number,''), nullif(shift.plate_number,''), 'Unit unavailable'),
        route.geometry_verified_at, new.captured_at, distance, new.accuracy)
      on conflict (vehicle_id) where closed_at is null do nothing;
      return new;
    end if;
    previous_fix := prior;
  end loop;
  return new;
end $$;
revoke all on function public.check_esakay_route_deviation() from public, anon, authenticated;
create trigger vehicle_positions_check_route_deviation after insert on public.vehicle_positions
for each row execute function public.check_esakay_route_deviation();

create function public.close_esakay_route_deviation_on_shift_end() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  update public.route_deviation_events set closed_at = now() where vehicle_id = new.id and closed_at is null;
  return new;
end $$;
revoke all on function public.close_esakay_route_deviation_on_shift_end() from public, anon, authenticated;
create trigger vehicles_close_route_deviation after update of is_active on public.vehicles
for each row when (old.is_active and not new.is_active) execute function public.close_esakay_route_deviation_on_shift_end();

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.route_deviation_events;
  end if;
end $$;
