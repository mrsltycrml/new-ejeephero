-- Local migration only. Legacy receipt timestamps cannot establish capture time.
alter table public.vehicle_positions add column if not exists captured_at timestamptz;
alter table public.vehicle_positions add column if not exists accuracy double precision;
alter table public.vehicle_positions alter column speed drop not null;
alter table public.vehicle_positions alter column speed drop default;
alter table public.vehicle_positions alter column heading drop not null;
alter table public.vehicle_positions alter column heading drop default;
comment on column public.vehicle_positions.captured_at is 'Device measurement time; NULL for legacy rows of unknown capture time. Never backfill from timestamp.';
comment on column public.vehicle_positions.accuracy is 'Reported horizontal uncertainty in meters; NULL means unknown.';
comment on column public.vehicle_positions.speed is 'Measured speed in km/h; NULL means unknown.';

-- NOT VALID preserves historical rows while validating new writes.
alter table public.vehicle_positions add constraint measured_position_values_check check (
  latitude between -90 and 90 and longitude between -180 and 180
  and (accuracy is null or accuracy between 0 and 100000)
  and (speed is null or speed between 0 and 130)
  and (heading is null or (heading >= 0 and heading < 360))
) not valid;

create or replace function public.detect_speeding_position()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v public.vehicles%rowtype;
  prior public.vehicle_positions%rowtype;
begin
  if new.speed is null or new.speed <= 22 or new.speed > 130
     or new.captured_at is null or new.captured_at < now() - interval '30 seconds' or new.captured_at > now() + interval '5 seconds'
     or new.timestamp is distinct from new.captured_at
     or new.accuracy is null or new.accuracy < 0 or new.accuracy > 30
     or new.latitude not between -90 and 90 or new.longitude not between -180 and 180
     or coalesce((to_jsonb(new)->>'is_sample')::boolean, false)
  then return new; end if;
  select * into v from public.vehicles where id = new.vehicle_id and is_active = true;
  if v.id is null or coalesce((to_jsonb(v)->>'is_sample')::boolean, false) then return new; end if;
  -- Inspect the actual prior reading, including an unknown speed, rather than skip it.
  select * into prior from public.vehicle_positions p
  where p.vehicle_id = new.vehicle_id and p.id <> new.id
    and p.timestamp < new.timestamp and p.timestamp >= new.timestamp - interval '60 seconds'
  order by p.timestamp desc limit 1;
  if prior.id is null or prior.speed is null or prior.speed <= 22 or prior.speed > 130
     or prior.captured_at is null or prior.captured_at < now() - interval '30 seconds'
     or prior.timestamp is distinct from prior.captured_at
     or prior.accuracy is null or prior.accuracy < 0 or prior.accuracy > 30
     or prior.latitude not between -90 and 90 or prior.longitude not between -180 and 180
     or coalesce((to_jsonb(prior)->>'is_sample')::boolean, false)
  then return new; end if;
  if public.ejeephero_distance_meters(prior.latitude, prior.longitude, new.latitude, new.longitude)
     > (130.0 / 3.6) * extract(epoch from new.captured_at - prior.captured_at) + prior.accuracy + new.accuracy
  then return new; end if;
  if exists(select 1 from public.speed_events e where e.vehicle_id = new.vehicle_id
    and e.policy_type = 'operator_cap' and e.created_at > now() - interval '2 minutes') then return new; end if;
  insert into public.speed_events
    (vehicle_id, driver_id, route_id, speed_limit_id, latitude, longitude, speed_kph, speed_limit_kph, limit_kph,
     body_number, plate_number, zone_label, zone_source_url, policy_type, score_deduction)
  values
    (new.vehicle_id, v.driver_id, v.route_id, null, new.latitude, new.longitude, new.speed, 20, 20,
     v.body_number, v.plate_number, 'eSAKAY company speed cap', null,
     'operator_cap', least(10, greatest(1, ceil((new.speed - 20) / 5))));
  return new;
end $$;

-- Route-cut penalties also require a complete measured trail. Poor/legacy GPS
-- can still produce a review flag, but cannot automatically convict a driver.
create or replace function public.flag_incomplete_driver_route()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  first_stop public.terminals%rowtype;
  final_stop public.terminals%rowtype;
  stop_row public.terminals%rowtype;
  last_pos public.vehicle_positions%rowtype;
  first_pos_time timestamptz;
  visited_at timestamptz;
  previous_visit timestamptz;
  point_count integer;
  max_gap interval;
  missing text[] := '{}';
  trail_reliable boolean;
begin
  if old.is_active is not true or new.is_active is not false then return new; end if;
  new.ended_at := coalesce(new.ended_at, now());
  if not exists (select 1 from public.routes r where r.id = new.route_id and r.geometry_verified_at is not null and nullif(trim(r.geometry_source_url), '') is not null)
     or exists (select 1 from public.terminals t where t.route_id = new.route_id and (t.location_verified_at is null or nullif(trim(t.location_source_url), '') is null))
  then return new; end if;
  select * into first_stop from public.terminals where route_id = new.route_id order by sequence_order limit 1;
  select * into final_stop from public.terminals where route_id = new.route_id order by sequence_order desc limit 1;
  if first_stop.id is null or first_stop.id = final_stop.id then return new; end if;
  select count(*), min(p.timestamp) into point_count, first_pos_time
  from public.vehicle_positions p where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at;
  select * into last_pos from public.vehicle_positions p
  where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at order by p.timestamp desc limit 1;
  select max(gap) into max_gap from (
    select p.timestamp - lag(p.timestamp) over (order by p.timestamp) as gap from public.vehicle_positions p
    where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at
  ) sampled;
  previous_visit := new.created_at - interval '1 second';
  for stop_row in select * from public.terminals where route_id = new.route_id order by sequence_order loop
    select min(p.timestamp) into visited_at from public.vehicle_positions p
    where p.vehicle_id = new.id and p.timestamp > previous_visit and p.timestamp <= new.ended_at
      and public.ejeephero_distance_meters(p.latitude, p.longitude, stop_row.latitude, stop_row.longitude) <= greatest(stop_row.geofence_radius_meters, 100);
    if visited_at is null then missing := array_append(missing, stop_row.name);
    else previous_visit := visited_at; end if;
  end loop;
  if array_length(missing, 1) is null then return new; end if;
  trail_reliable := point_count >= 10
    and first_pos_time <= new.created_at + interval '2 minutes'
    and last_pos.timestamp >= new.ended_at - interval '2 minutes'
    and new.ended_at - new.created_at >= interval '3 minutes'
    and coalesce(max_gap, interval '1 day') <= interval '60 seconds'
    and not (first_stop.name = any(missing))
    and not exists (
      select 1 from public.vehicle_positions p where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at
        and (p.captured_at is null or p.timestamp is distinct from p.captured_at
          or p.accuracy is null or p.accuracy < 0 or p.accuracy > 30
          or p.latitude not between -90 and 90 or p.longitude not between -180 and 180
          or coalesce((to_jsonb(p)->>'is_sample')::boolean, false))
    )
    and not exists (
      select 1 from (
        select p.*, lag(p.latitude) over w as prior_lat, lag(p.longitude) over w as prior_lon,
          lag(p.accuracy) over w as prior_accuracy, lag(p.captured_at) over w as prior_time
        from public.vehicle_positions p where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at
        window w as (order by p.captured_at)
      ) trail where prior_time is not null and public.ejeephero_distance_meters(prior_lat, prior_lon, latitude, longitude)
        > (130.0 / 3.6) * extract(epoch from captured_at - prior_time) + prior_accuracy + accuracy
    );
  insert into public.trip_violations
    (vehicle_id, driver_id, route_id, body_number, plate_number, reason, missed_stops,
     last_latitude, last_longitude, final_terminal_id, status, auto_confirmed, reviewed_at)
  values
    (new.id, new.driver_id, new.route_id, new.body_number, new.plate_number,
     case when trail_reliable then 'Route ended without visiting all assigned stops in order.' else 'Route may be incomplete; GPS coverage needs supervisor review.' end,
     missing, last_pos.latitude, last_pos.longitude, final_stop.id,
     case when trail_reliable then 'confirmed' else 'pending_review' end, trail_reliable, case when trail_reliable then now() else null end);
  return new;
end $$;
