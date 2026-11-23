-- A shift can include several runs of its assigned direction. Evaluate each observed departure separately.
create or replace function public.flag_incomplete_driver_route()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  stops public.terminals[];
  origin public.terminals%rowtype;
  destination public.terminals%rowtype;
  stop_count integer;
  sample record;
  fix public.vehicle_positions%rowtype;
  previous public.vehicle_positions%rowtype;
  departed_at timestamptz;
  origin_seen boolean := false;
  at_origin boolean;
  origin_distance double precision;
  elapsed double precision;
  distance double precision;
  previous_distance double precision;
  reachable_distance double precision;
  max_meters_per_second constant double precision := 130.0 / 3.6;
  reliable boolean := true;
  samples integer;
  visited boolean[];
  may_have_visited boolean[];
  last_stop integer;
  next_stop integer;
  i integer;
  missing text[];
  proven_missing text[];
  confirmed boolean;
begin
  if old.is_active is not true or new.is_active is not false then return new; end if;
  new.ended_at := coalesce(new.ended_at, now());
  if to_jsonb(new)->>'is_sample' = 'true' then return new; end if;

  -- Never apply a route or stop catalog published after this shift started.
  perform 1 from public.routes r where r.id = new.route_id and not r.is_archived and not r.is_coming_soon
    and r.geometry_verified_at <= new.created_at and r.geometry_source_url ~ '^https://[^[:space:]]+$'
    and public.valid_esakay_route_line(r.coordinates)
    and (r.catalog_changed_at is null or r.catalog_changed_at <= new.created_at) for share;
  if not found then return new; end if;
  select array_agg(t order by t.sequence_order, t.id) into stops from public.terminals t
  where t.route_id = new.route_id and t.is_active is not false and t.deleted_at is null and not coalesce(t.is_sample,false)
  having bool_and(t.location_verified_at is not null and t.location_verified_at <= new.created_at
    and t.location_source_url is not null and t.location_source_url ~ '^https://[^[:space:]]+$'
    and t.geofence_radius_meters between 5 and 500 and t.latitude between -90 and 90 and t.longitude between -180 and 180);
  stop_count := coalesce(cardinality(stops), 0);
  if stop_count < 2 then return new; end if;
  origin := stops[1];
  destination := stops[stop_count];
  if public.ejeephero_distance_meters(origin.latitude, origin.longitude, destination.latitude, destination.longitude)
    <= origin.geofence_radius_meters + destination.geofence_radius_meters then return new; end if;

  -- The final sentinel records an unfinished departure for review without claiming a confirmed cut.
  for sample in
    select p as position, p.timestamp as observed_at, p.id as position_id from public.vehicle_positions p
      where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at
    union all select null::public.vehicle_positions, new.ended_at, null::uuid
    order by observed_at, position_id nulls last
  loop
    if sample.position_id is null then
      if departed_at is null then exit; end if;
    else
      fix := sample.position;
      if fix.captured_at is distinct from fix.timestamp or fix.accuracy is null or fix.accuracy not between 0 and 30
        or fix.latitude not between -90 and 90 or fix.longitude not between -180 and 180
        or to_jsonb(fix)->>'is_sample' = 'true' then
        reliable := false;
        continue;
      end if;
      origin_distance := public.ejeephero_distance_meters(origin.latitude, origin.longitude, fix.latitude, fix.longitude);
      at_origin := origin_distance + fix.accuracy <= origin.geofence_radius_meters;
      if departed_at is null and at_origin then
        origin_seen := true;
        previous := fix;
        reliable := true;
        continue;
      end if;
      if not origin_seen then continue; end if;

      elapsed := extract(epoch from fix.timestamp - previous.timestamp);
      reachable_distance := max_meters_per_second * elapsed;
      if elapsed <= 0 or public.ejeephero_distance_meters(previous.latitude, previous.longitude, fix.latitude, fix.longitude)
        > reachable_distance + previous.accuracy + fix.accuracy then
        reliable := false;
        continue;
      end if;
      reliable := reliable and elapsed <= 60;
      if departed_at is null then
        if origin_distance - fix.accuracy <= origin.geofence_radius_meters then
          previous := fix;
          continue;
        end if;
        departed_at := fix.timestamp;
        samples := 0;
        visited := array_fill(false, array[stop_count]);
        visited[1] := true;
        may_have_visited := array_fill(false, array[stop_count]);
        last_stop := 1;
      end if;

      next_stop := null;
      for i in 2..stop_count loop
        if visited[i] then continue; end if;
        distance := public.ejeephero_distance_meters(fix.latitude, fix.longitude, stops[i].latitude, stops[i].longitude);
        if next_stop is null and i > last_stop and not at_origin and distance + fix.accuracy <= stops[i].geofence_radius_meters then
          next_stop := i;
          visited[i] := true;
        elsif not may_have_visited[i] then
          -- Two fixes rule out an unobserved stop only when even the shortest detour was unreachable.
          previous_distance := public.ejeephero_distance_meters(previous.latitude, previous.longitude, stops[i].latitude, stops[i].longitude);
          may_have_visited[i] := greatest(0, previous_distance - previous.accuracy - stops[i].geofence_radius_meters)
            + greatest(0, distance - fix.accuracy - stops[i].geofence_radius_meters) <= reachable_distance;
        end if;
      end loop;
      last_stop := coalesce(next_stop, last_stop);
      samples := samples + 1;
      previous := fix;
      if not at_origin and last_stop <> stop_count then continue; end if;
    end if;

    select array_agg((stops[idx]).name order by idx),
      array_agg((stops[idx]).name order by idx) filter (where not may_have_visited[idx])
    into missing, proven_missing from generate_subscripts(visited, 1) idx where not visited[idx];
    if missing is not null then
      confirmed := sample.position_id is not null and reliable and samples >= 10
        and fix.timestamp - departed_at >= interval '3 minutes' and proven_missing is not null;
      insert into public.trip_violations(vehicle_id, driver_id, route_id, body_number, plate_number, reason,
        missed_stops, last_latitude, last_longitude, final_terminal_id, status, auto_confirmed, reviewed_at)
      values (new.id, new.driver_id, new.route_id, new.body_number, new.plate_number,
        format('Departure %s (Philippine time). %s', to_char(departed_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS'),
          case when confirmed then 'Trip ended without visiting all assigned stops in order.'
               else 'Trip may be incomplete. Review the available GPS trail.' end),
        case when confirmed then proven_missing else missing end, previous.latitude, previous.longitude, destination.id,
        case when confirmed then 'confirmed' else 'pending_review' end, confirmed, case when confirmed then now() end);
    end if;
    departed_at := null;
    origin_seen := at_origin;
    reliable := true;
  end loop;
  return new;
end $$;
