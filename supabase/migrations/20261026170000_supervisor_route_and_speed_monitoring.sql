-- Keep immutable vehicle details on each event, even if a later shift uses a new unit.
alter table public.trip_violations add column if not exists body_number text;
alter table public.trip_violations add column if not exists plate_number text;
alter table public.trip_violations add column if not exists missed_stops text[] not null default '{}';
alter table public.trip_violations add column if not exists auto_confirmed boolean not null default false;
alter table public.speed_events add column if not exists body_number text;
alter table public.speed_events add column if not exists plate_number text;
alter table public.speed_events add column if not exists zone_label text;
alter table public.speed_events add column if not exists zone_source_url text;
alter table public.speed_events alter column speed_limit_id drop not null;
alter table public.speed_events add column if not exists policy_type text not null default 'road_zone';
alter table public.speed_events drop constraint if exists speed_events_policy_type_check;
alter table public.speed_events add constraint speed_events_policy_type_check check (policy_type in ('operator_cap', 'road_zone'));
alter table public.road_speed_limits add column if not exists verified_at timestamptz;
alter table public.road_speed_limits add column if not exists verified_by uuid references public.profiles(id) on delete set null;
alter table public.routes add column if not exists geometry_verified_at timestamptz;
alter table public.routes add column if not exists geometry_source_url text;
alter table public.terminals add column if not exists location_verified_at timestamptz;
alter table public.terminals add column if not exists location_source_url text;
alter table public.routes drop constraint if exists routes_geometry_verification_source_check;
alter table public.routes add constraint routes_geometry_verification_source_check
  check (geometry_verified_at is null or nullif(trim(geometry_source_url), '') is not null);
alter table public.terminals drop constraint if exists terminals_location_verification_source_check;
alter table public.terminals add constraint terminals_location_verification_source_check
  check (location_verified_at is null or nullif(trim(location_source_url), '') is not null);

update public.trip_violations t set body_number = v.body_number, plate_number = v.plate_number
from public.vehicles v where t.vehicle_id = v.id and t.body_number is null;
update public.speed_events e set body_number = v.body_number, plate_number = v.plate_number
from public.vehicles v where e.vehicle_id = v.id and e.body_number is null;
update public.speed_events e set zone_label = l.label, zone_source_url = l.source_url
from public.road_speed_limits l where e.speed_limit_id = l.id and e.zone_label is null;

-- A general homepage does not establish a limit for a particular road.
update public.road_speed_limits set is_active = false, verified_at = null, verified_by = null
where trim(trailing '/' from lower(source_url)) in ('https://mmda.gov.ph', 'http://mmda.gov.ph');

-- Detect missing stops in their route order. Sparse or stale GPS is a review flag,
-- never an automatic conviction. An adequate trail that begins at the first stop
-- and misses later stops is automatically confirmed.
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
  -- No route-cutting penalty may rely on provisional route or stop coordinates.
  if not exists (select 1 from public.routes r where r.id = new.route_id and r.geometry_verified_at is not null and r.geometry_source_url is not null)
     or exists (select 1 from public.terminals t where t.route_id = new.route_id and (t.location_verified_at is null or t.location_source_url is null))
  then return new; end if;
  select * into first_stop from public.terminals where route_id = new.route_id order by sequence_order limit 1;
  select * into final_stop from public.terminals where route_id = new.route_id order by sequence_order desc limit 1;
  if first_stop.id is null or first_stop.id = final_stop.id then return new; end if;

  select count(*), min(p.timestamp) into point_count, first_pos_time
  from public.vehicle_positions p
  where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at;
  select * into last_pos from public.vehicle_positions p
  where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at
  order by p.timestamp desc limit 1;
  select max(gap) into max_gap from (
    select p.timestamp - lag(p.timestamp) over (order by p.timestamp) as gap
    from public.vehicle_positions p
    where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at
  ) sampled;

  previous_visit := new.created_at - interval '1 second';
  for stop_row in select * from public.terminals where route_id = new.route_id order by sequence_order loop
    select min(p.timestamp) into visited_at from public.vehicle_positions p
    where p.vehicle_id = new.id and p.timestamp > previous_visit
      and p.timestamp <= new.ended_at
      and public.ejeephero_distance_meters(p.latitude, p.longitude, stop_row.latitude, stop_row.longitude)
          <= greatest(stop_row.geofence_radius_meters, 100);
    if visited_at is null then
      missing := array_append(missing, stop_row.name);
    else
      previous_visit := visited_at;
    end if;
  end loop;
  if array_length(missing, 1) is null then return new; end if;

  trail_reliable := point_count >= 10
    and first_pos_time <= new.created_at + interval '2 minutes'
    and last_pos.timestamp >= new.ended_at - interval '2 minutes'
    and new.ended_at - new.created_at >= interval '3 minutes'
    and coalesce(max_gap, interval '1 day') <= interval '60 seconds'
    and not (first_stop.name = any(missing));

  insert into public.trip_violations
    (vehicle_id, driver_id, route_id, body_number, plate_number, reason, missed_stops,
     last_latitude, last_longitude, final_terminal_id, status, auto_confirmed, reviewed_at)
  values
    (new.id, new.driver_id, new.route_id, new.body_number, new.plate_number,
     case when trail_reliable then 'Route ended without visiting all assigned stops in order.'
          else 'Route may be incomplete; GPS coverage needs supervisor review.' end,
     missing, last_pos.latitude, last_pos.longitude, final_stop.id,
     case when trail_reliable then 'confirmed' else 'pending_review' end,
     trail_reliable, case when trail_reliable then now() else null end);
  return new;
end $$;

drop trigger if exists vehicles_flag_incomplete_route on public.vehicles;
create trigger vehicles_flag_incomplete_route before update of is_active on public.vehicles
for each row execute function public.flag_incomplete_driver_route();

-- The third confirmed trip-cutting violation suspends the driver's account,
-- whether the confirmation came from reliable telemetry or supervisor review.
create or replace function public.suspend_after_confirmed_trip_violations()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status <> 'confirmed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then return new; end if;
  if (select count(*) from public.trip_violations
      where driver_id = new.driver_id and status = 'confirmed') >= 3 then
    update public.profiles set status = 'suspended', is_approved = false
    where id = new.driver_id and status = 'approved';
  end if;
  return new;
end $$;
drop trigger if exists trip_violations_apply_confirmed_penalty on public.trip_violations;
create trigger trip_violations_apply_confirmed_penalty
after insert or update of status on public.trip_violations
for each row execute function public.suspend_after_confirmed_trip_violations();

create or replace function public.mark_manual_route_review()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if new.status is distinct from old.status and new.status in ('confirmed', 'dismissed') then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
    new.auto_confirmed := false;
  end if;
  return new;
end $$;
drop trigger if exists trip_violations_mark_manual_review on public.trip_violations;
create trigger trip_violations_mark_manual_review before update of status on public.trip_violations
for each row execute function public.mark_manual_route_review();

-- The operator-reported 20 km/h cap applies to every active eSAKAY route.
-- Two successive GPS samples must exceed 22 km/h, avoiding isolated spikes.
-- These are company safety records and do not assert a legal road citation.
create or replace function public.detect_speeding_position()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v public.vehicles%rowtype;
  prior public.vehicle_positions%rowtype;
begin
  if new.speed is null or new.speed < 0 or new.speed > 130 then return new; end if;
  select * into v from public.vehicles where id = new.vehicle_id and is_active = true;
  if v.id is null then return new; end if;
  if new.speed <= 22 then return new; end if;
  select * into prior from public.vehicle_positions p
  where p.vehicle_id = new.vehicle_id
    and p.timestamp < new.timestamp
    and p.timestamp >= new.timestamp - interval '60 seconds'
  order by p.timestamp desc limit 1;
  if prior.id is null or prior.speed <= 22 then return new; end if;
  if exists(select 1 from public.speed_events e where e.vehicle_id = new.vehicle_id
    and e.policy_type = 'operator_cap' and e.created_at > now() - interval '2 minutes') then return new; end if;
  insert into public.speed_events
    (vehicle_id, driver_id, route_id, speed_limit_id, latitude, longitude, speed_kph, speed_limit_kph, limit_kph,
     body_number, plate_number, zone_label, zone_source_url, policy_type, score_deduction)
  values
    (new.vehicle_id, v.driver_id, v.route_id, null,
     new.latitude, new.longitude, new.speed, 20, 20,
     v.body_number, v.plate_number, 'eSAKAY company speed cap', null,
     'operator_cap', least(10, greatest(1, ceil((new.speed - 20) / 5))));
  return new;
end $$;
drop trigger if exists vehicle_positions_detect_speeding on public.vehicle_positions;
create trigger vehicle_positions_detect_speeding after insert on public.vehicle_positions
for each row execute function public.detect_speeding_position();

-- Calculate report cards across the complete 30-day record set rather than a
-- limited client page. Only authenticated supervisors can read the result.
create or replace function public.get_driver_safety_report_cards()
returns table (
  driver_id uuid, driver_name text, driver_status text, speed_events_30d bigint,
  confirmed_route_cuts_30d bigint, confirmed_route_cuts_total bigint, score integer
)
language sql stable security definer set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), p.email, 'Driver') as driver_name, p.status,
    coalesce(s.event_count, 0), coalesce(t.recent_count, 0), coalesce(t.total_count, 0),
    greatest(0, round(100 - coalesce(s.deductions, 0) - coalesce(t.recent_count, 0) * 10))::integer as score
  from public.profiles p
  left join lateral (
    select count(*) as event_count, coalesce(sum(e.score_deduction), 0) as deductions
    from public.speed_events e where e.driver_id = p.id and e.created_at >= now() - interval '30 days'
  ) s on true
  left join lateral (
    select count(*) filter (where v.status = 'confirmed' and v.created_at >= now() - interval '30 days') as recent_count,
           count(*) filter (where v.status = 'confirmed') as total_count
    from public.trip_violations v where v.driver_id = p.id
  ) t on true
  where p.role = 'driver' and public.is_ejeephero_admin()
  order by score asc, driver_name asc;
$$;
revoke all on function public.get_driver_safety_report_cards() from public;
grant execute on function public.get_driver_safety_report_cards() to authenticated;
