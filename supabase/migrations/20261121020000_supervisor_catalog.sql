-- PostgREST contract. Pass null IDs to create and omit unchanged keys on edit.
-- supervisor_save_route(p_route_id uuid, p_data jsonb) -> uuid
--   name, description, color_code, operating_hours, is_coming_soon
-- supervisor_save_stop(p_route_id uuid, p_stop_id uuid, p_data jsonb) -> uuid
--   name, latitude, longitude, location_source_url, sequence_order (1-based position),
--   geofence_radius_meters, landmark_desc, boarding_side, travel_direction, entrance_instructions, stop_details_source_url
-- supervisor_retire_route(p_route_id uuid) -> void   (routes.is_archived)
-- supervisor_retire_stop(p_stop_id uuid) -> void     (terminals.is_active)
-- Use publish_esakay_route_line for separately verified route geometry.
--
-- Let a busy fleet transaction finish instead of blocking live writes for a migration.
set local lock_timeout = '5s';

alter table public.routes
  add column catalog_changed_at timestamptz,
  alter column base_fare drop not null,
  alter column base_distance_km drop not null,
  alter column per_km_rate drop not null;
alter table public.terminals
  add column if not exists is_active boolean not null default true,
  add column if not exists is_sample boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists landmark_desc text,
  add column location_changed_at timestamptz,
  alter column regular_fare drop not null,
  alter column student_fare drop not null,
  alter column elderly_fare drop not null,
  alter column disabled_fare drop not null;

-- A retired stop keeps its last order. Check uniqueness at the end of the
-- UPDATE so two active stops can exchange positions in a single statement.
alter table public.terminals drop constraint if exists terminals_route_id_sequence_order_key;
alter table public.terminals add constraint terminals_active_order
  exclude using btree (route_id with =, sequence_order with =)
  where (is_active is not false and deleted_at is null and not coalesce(is_sample,false)) deferrable initially immediate;

-- Even an older directory reader sees only current stops and usable edges.
create policy current_terminal on public.terminals as restrictive for select to anon, authenticated
using (is_active is not false and deleted_at is null and not coalesce(is_sample,false));
create policy current_ride_edge on public.passenger_route_segments as restrictive for select to anon, authenticated
using (exists (
  select 1 from public.terminals a, public.terminals b
  where a.id = from_stop_id and b.id = to_stop_id
    and a.route_id = passenger_route_segments.route_id and b.route_id = a.route_id
    and a.sequence_order < b.sequence_order
    and (a.location_changed_at is null or a.location_changed_at <= verified_at)
    and (b.location_changed_at is null or b.location_changed_at <= verified_at)
));
create policy current_walk_edge on public.passenger_walk_links as restrictive for select to anon, authenticated
using (exists (
  select 1 from public.terminals a, public.terminals b
  where a.id = from_stop_id and b.id = to_stop_id
    and (a.location_changed_at is null or a.location_changed_at <= verified_at)
    and (b.location_changed_at is null or b.location_changed_at <= verified_at)
));
create policy current_fare_route on public.passenger_fare_matrices as restrictive for select to anon, authenticated
using (exists (select 1 from public.routes r where r.id = route_id and not r.is_archived));

create function public.require_catalog_supervisor() returns void
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
begin
  if public.is_ejeephero_admin() is distinct from true then
    raise exception 'Approved supervisor access required.' using errcode = '42501';
  end if;
end $$;

create function public.supervisor_save_route(p_route_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  r public.routes%rowtype;
begin
  perform public.require_catalog_supervisor();
  if jsonb_typeof(p_data) is distinct from 'object' or p_data = '{}' or
    p_data - array['name','description','color_code','operating_hours','is_coming_soon'] <> '{}' then
    raise exception 'Supply editable route fields.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_data) e where jsonb_typeof(e.value) <>
    case when e.key = 'is_coming_soon' then 'boolean' else 'string' end) then
    raise exception 'Invalid route field type.' using errcode = '22023';
  end if;
  if p_route_id is not null then
    select * into r from public.routes where id = p_route_id and not is_archived for update;
    if not found then raise exception 'Route unavailable.' using errcode = '22023'; end if;
  end if;
  r := jsonb_populate_record(r, p_data);
  if nullif(btrim(r.name), '') is null
    or (p_data ? 'color_code' and r.color_code !~ '^#[[:xdigit:]]{6}$') then
    raise exception 'Supply a route name and a valid six-digit hex color.' using errcode = '22023';
  end if;
  if p_route_id is null then
    -- Live defaults include an old fare citation and schedule. Never attest to those on a new route.
    insert into public.routes(name,description,color_code,operating_hours,is_coming_soon,
      base_fare,per_km_rate,base_distance_km,fare_effective_date,fare_source_url)
    values (btrim(r.name),coalesce(r.description,''),coalesce(r.color_code,'#1F4E79'),
      coalesce(r.operating_hours,''),coalesce(r.is_coming_soon,false),null,null,null,null,null)
    returning id into p_route_id;
  else
    update public.routes set name = btrim(r.name), description = r.description, color_code = r.color_code,
      operating_hours = r.operating_hours, is_coming_soon = r.is_coming_soon where id = p_route_id;
  end if;
  return p_route_id;
end $$;

create function public.supervisor_retire_route(p_route_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform public.require_catalog_supervisor();
  update public.routes set is_archived = true where id = p_route_id;
  if not found then raise exception 'Route unavailable.' using errcode = '22023'; end if;
end $$;

-- The route row lock serializes all stop edits, including on a currently empty route.
create function public.catalog_order_stops(p_route_id uuid, p_stop_id uuid, p_position integer) returns boolean
language sql set search_path = pg_catalog, pg_temp as $$
  with others as (
    select t.id, row_number() over (order by t.sequence_order, t.id)::integer as rank
    from public.terminals t where t.route_id = p_route_id and t.is_active is not false
      and t.deleted_at is null and not coalesce(t.is_sample,false)
      and t.id is distinct from p_stop_id
  ), ordered as (
    select id, case when rank >= p_position then rank + 1 else rank end as position from others
    union all select p_stop_id, p_position where p_stop_id is not null
  ), changed as (
    update public.terminals t set sequence_order = o.position
    from ordered o where t.id = o.id and t.sequence_order is distinct from o.position returning t.id
  )
  select exists(select 1 from changed);
$$;

create function public.supervisor_save_stop(p_route_id uuid, p_stop_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  old_stop public.terminals%rowtype;
  s public.terminals%rowtype;
  moved boolean;
  details_edit boolean;
  order_edit boolean := p_stop_id is null or p_data ? 'sequence_order';
  position integer;
  last_position integer;
  changed_at timestamptz;
begin
  perform public.require_catalog_supervisor();
  if jsonb_typeof(p_data) is distinct from 'object' or p_data = '{}' or
    p_data - array['name','latitude','longitude','location_source_url','sequence_order','geofence_radius_meters',
      'landmark_desc','boarding_side','travel_direction','entrance_instructions','stop_details_source_url'] <> '{}' then
    raise exception 'Supply editable stop fields.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_data) e where
    case when e.key in ('latitude','longitude','sequence_order','geofence_radius_meters') then jsonb_typeof(e.value) <> 'number'
         when e.key in ('landmark_desc','boarding_side','travel_direction','entrance_instructions') then jsonb_typeof(e.value) not in ('string','null')
         else jsonb_typeof(e.value) <> 'string' end) then
    raise exception 'Invalid stop field type.' using errcode = '22023';
  end if;
  perform 1 from public.routes where id = p_route_id and not is_archived for update;
  if not found then raise exception 'Route unavailable.' using errcode = '22023'; end if;
  if p_stop_id is not null then
    select * into old_stop from public.terminals t where t.id = p_stop_id and t.route_id = p_route_id
      and t.is_active is not false and t.deleted_at is null and not coalesce(t.is_sample,false) for update;
    if not found then raise exception 'Stop unavailable on this route.' using errcode = '22023'; end if;
  end if;
  s := jsonb_populate_record(old_stop, p_data);
  moved := (s.latitude,s.longitude) is distinct from (old_stop.latitude,old_stop.longitude);
  details_edit := p_data ?| array['landmark_desc','boarding_side','travel_direction','entrance_instructions','stop_details_source_url'];
  changed_at := clock_timestamp();
  if nullif(btrim(s.name),'') is null or s.latitude is null or s.latitude not between -90 and 90
    or s.longitude is null or s.longitude not between -180 and 180
    or (p_data ? 'geofence_radius_meters' and s.geofence_radius_meters not between 5 and 500) then
    raise exception 'Supply a stop name, valid coordinates and a geofence between 5 and 500 metres.' using errcode = '22023';
  end if;
  if moved or p_data ? 'location_source_url' then
    if coalesce(p_data->>'location_source_url','') !~ '^https://[^/[:space:]?#]+[^[:space:]]*$' then
      raise exception 'Supply an HTTPS location source for this stop.' using errcode = '22023';
    end if;
    if moved or s.location_source_url is distinct from old_stop.location_source_url or s.location_verified_at is null then
      s.location_verified_at := changed_at;
    end if;
  end if;
  if moved then
    s.landmark_desc := p_data->>'landmark_desc';
    s.boarding_side := p_data->>'boarding_side';
    s.travel_direction := p_data->>'travel_direction';
    s.entrance_instructions := p_data->>'entrance_instructions';
  end if;
  if details_edit then
    if coalesce(p_data->>'stop_details_source_url','') !~ '^https://[^/[:space:]?#]+[^[:space:]]*$' then
      raise exception 'Supply an HTTPS source for these stop details.' using errcode = '22023';
    end if;
    s.stop_details_verified_at := changed_at;
  elsif moved then
    s.stop_details_verified_at := null;
    s.stop_details_source_url := null;
  end if;
  if order_edit then
    select count(*) + 1 into last_position from public.terminals t
    where t.route_id = p_route_id and t.is_active is not false and t.id is distinct from p_stop_id
      and t.deleted_at is null and not coalesce(t.is_sample,false);
    position := coalesce(s.sequence_order,last_position);
    if position not between 1 and last_position then
      raise exception 'Stop position must be between 1 and %.', last_position using errcode = '22023';
    end if;
  end if;
  if p_stop_id is null then
    perform public.catalog_order_stops(p_route_id,null,position);
    insert into public.terminals(route_id,name,latitude,longitude,sequence_order,is_active,location_source_url,location_verified_at,
      geofence_radius_meters,landmark_desc,boarding_side,travel_direction,entrance_instructions,stop_details_source_url,stop_details_verified_at,
      regular_fare,student_fare,elderly_fare,disabled_fare,is_well_lit,cctv_monitored)
    values (p_route_id,btrim(s.name),s.latitude,s.longitude,position,true,s.location_source_url,s.location_verified_at,
      coalesce(s.geofence_radius_meters,45),s.landmark_desc,s.boarding_side,s.travel_direction,s.entrance_instructions,s.stop_details_source_url,s.stop_details_verified_at,
      null,null,null,null,false,false) returning id into p_stop_id;
  else
    update public.terminals set name = btrim(s.name), latitude = s.latitude, longitude = s.longitude,
      location_source_url = s.location_source_url, location_verified_at = s.location_verified_at,
      location_changed_at = case when moved then changed_at else location_changed_at end,
      geofence_radius_meters = s.geofence_radius_meters, landmark_desc = s.landmark_desc, boarding_side = s.boarding_side,
      travel_direction = s.travel_direction, entrance_instructions = s.entrance_instructions,
      stop_details_source_url = s.stop_details_source_url, stop_details_verified_at = s.stop_details_verified_at,
      landmark_photo_source_url = case when moved then null else landmark_photo_source_url end,
      is_well_lit = s.is_well_lit and not moved, cctv_monitored = s.cctv_monitored and not moved
    where id = p_stop_id;
    if order_edit then order_edit := public.catalog_order_stops(p_route_id,p_stop_id,position); end if;
  end if;
  if order_edit or moved or s.geofence_radius_meters is distinct from old_stop.geofence_radius_meters
    or (s.location_verified_at is not null and old_stop.location_verified_at is null) then
    update public.routes set catalog_changed_at = changed_at where id = p_route_id;
  end if;
  return p_stop_id;
end $$;

create function public.supervisor_retire_stop(p_stop_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  route_key uuid;
begin
  perform public.require_catalog_supervisor();
  select r.id into route_key from public.terminals t join public.routes r on r.id = t.route_id
    where t.id = p_stop_id and not r.is_archived for update of r;
  if not found then raise exception 'Stop unavailable.' using errcode = '22023'; end if;
  update public.terminals set is_active = false where id = p_stop_id and is_active is not false;
  if found then
    perform public.catalog_order_stops(route_key,null,null);
    update public.routes set catalog_changed_at = clock_timestamp() where id = route_key;
  end if;
end $$;

revoke all on function public.require_catalog_supervisor(), public.catalog_order_stops(uuid,uuid,integer)
  from public, anon, authenticated;
revoke all on function public.supervisor_save_route(uuid,jsonb), public.supervisor_save_stop(uuid,uuid,jsonb),
  public.supervisor_retire_route(uuid), public.supervisor_retire_stop(uuid) from public, anon;
grant execute on function public.supervisor_save_route(uuid,jsonb), public.supervisor_save_stop(uuid,uuid,jsonb),
  public.supervisor_retire_route(uuid), public.supervisor_retire_stop(uuid) to authenticated;

create function public.guard_shift_route_available() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.is_active is true and old.route_id is not distinct from new.route_id then
    return new;
  end if;
  -- The shared row lock orders a start against a concurrent retirement or service-status change.
  perform 1 from public.routes where id = new.route_id and not is_archived and not is_coming_soon for share;
  if not found then
    raise exception 'Choose a route currently in service before starting a shift.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.guard_shift_route_available() from public, anon, authenticated;
create trigger vehicles_guard_shift_route before insert or update of route_id,is_active on public.vehicles
  for each row when (new.is_active is true) execute function public.guard_shift_route_available();

create or replace function public.flag_incomplete_driver_route()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  stops public.terminals[];
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
  -- A shift cannot establish a missed stop against a later assignment.
  perform 1 from public.routes r where r.id = new.route_id and not r.is_archived and not r.is_coming_soon
    and r.geometry_verified_at <= new.created_at and nullif(btrim(r.geometry_source_url),'') is not null
    and (r.catalog_changed_at is null or r.catalog_changed_at <= new.created_at) for share;
  if not found then return new; end if;
  select array_agg(t order by t.sequence_order, t.id) into stops from public.terminals t
  where t.route_id = new.route_id and t.is_active is not false and t.deleted_at is null and not coalesce(t.is_sample,false)
  having bool_and(t.location_verified_at is not null and t.location_verified_at <= new.created_at
    and nullif(btrim(t.location_source_url),'') is not null);
  if coalesce(cardinality(stops),0) < 2 then return new; end if;
  first_stop := stops[1];
  final_stop := stops[cardinality(stops)];
  select count(*), min(p.timestamp) into point_count, first_pos_time
  from public.vehicle_positions p where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at;
  select * into last_pos from public.vehicle_positions p
  where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at order by p.timestamp desc limit 1;
  select max(gap) into max_gap from (
    select p.timestamp - lag(p.timestamp) over (order by p.timestamp) as gap from public.vehicle_positions p
    where p.vehicle_id = new.id and p.timestamp between new.created_at and new.ended_at
  ) sampled;
  previous_visit := new.created_at - interval '1 second';
  foreach stop_row in array stops loop
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
revoke all on function public.flag_incomplete_driver_route() from public, anon, authenticated;
notify pgrst, 'reload schema';
