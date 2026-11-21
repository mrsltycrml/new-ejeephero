-- Installation leaves Route 1 unselected. Only an approved supervisor activates a pair.
-- supervisor_activate_route1(p_variant text, p_expected_variant text, p_outbound jsonb,
--   p_inbound jsonb, p_source_url text) -> void. Both lines are ordered Point[] arrays.
-- Outbound runs from MRT Buendia or One Ayala to Mandaluyong City Hall; inbound returns.
-- First activation expects NULL. Exact replay succeeds. A stale choice raises 40001;
-- a changing activation with an open shift on either direction raises 55000.
-- supervisor_save_stop and supervisor_create_catalog_item(kind='stop') accept
-- expected_route1_variant, passenger_use and passenger_use_source_url in p_data.
-- Explicit JSON null is the expected variant before selection, and revokes passenger_use.

alter table public.routes add column route1_variant text, add column route1_activated_at timestamptz,
  add constraint route1_selection check (
    (route1_variant is null and route1_activated_at is null) or
    (id in ('550e8400-e29b-41d4-a716-446655440000','550e8400-e29b-41d4-a716-446655440100')
      and route1_variant is not null and route1_variant in ('buendia_2022','one_ayala_2026') and route1_activated_at is not null)
  );
alter table public.terminals add column passenger_use text, add column passenger_use_verified_at timestamptz,
  add column passenger_use_source_url text,
  add constraint terminal_passenger_use_evidence check (
    (passenger_use is null and passenger_use_verified_at is null and passenger_use_source_url is null) or
    (passenger_use is not null and passenger_use in ('board','alight','both') and passenger_use_verified_at is not null
      and passenger_use_source_url is not null and passenger_use_source_url ~ '^https://[^/[:space:]?#]+[^[:space:]]*$')
  );
revoke insert, update, delete on public.routes, public.terminals from public, anon, authenticated;

-- Bind evidence to this activation, even if the same variant is selected again later.
alter table public.passenger_fare_matrices add column route1_activated_at timestamptz;
alter table public.passenger_route_segments add column route1_activated_at timestamptz;
create function public.bind_route1_fare_evidence() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if new.route_id not in ('550e8400-e29b-41d4-a716-446655440000','550e8400-e29b-41d4-a716-446655440100') then
    new.route1_activated_at := null;
  elsif tg_op = 'UPDATE' and (new.route_id,new.verified_at) is not distinct from (old.route_id,old.verified_at) then
    new.route1_activated_at := old.route1_activated_at;
  else
    select r.route1_activated_at into new.route1_activated_at from public.routes r where r.id=new.route_id for share;
  end if;
  return new;
end $$;
revoke all on function public.bind_route1_fare_evidence() from public, anon, authenticated;
create trigger bind_route1_fare before insert or update on public.passenger_fare_matrices
  for each row execute function public.bind_route1_fare_evidence();
create trigger bind_route1_segment before insert or update on public.passenger_route_segments
  for each row execute function public.bind_route1_fare_evidence();
create policy current_route1_fare on public.passenger_fare_matrices as restrictive for select to anon, authenticated
using (exists(select 1 from public.routes r where r.id=route_id and (r.route1_activated_at is null
  or (r.route1_activated_at=passenger_fare_matrices.route1_activated_at and verified_at >= r.route1_activated_at))));
create policy current_route1_segment on public.passenger_route_segments as restrictive for select to anon, authenticated
using (exists(select 1 from public.routes r where r.id=route_id and (r.route1_activated_at is null
  or (r.route1_activated_at=passenger_route_segments.route1_activated_at and verified_at >= r.route1_activated_at
    and exists(select 1 from public.terminals a, public.terminals b where a.id=from_stop_id and b.id=to_stop_id
      and a.location_verified_at>=r.route1_activated_at and b.location_verified_at>=r.route1_activated_at)))));

create function public.guard_route1_attestation() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op='INSERT' and new.route1_variant is null and new.geometry_verified_at is null then return new; end if;
  if tg_op='UPDATE' and (new.route1_variant,new.route1_activated_at,new.coordinates,new.geometry_source_url,new.geometry_verified_at)
    is not distinct from (old.route1_variant,old.route1_activated_at,old.coordinates,old.geometry_source_url,old.geometry_verified_at)
    then return new; end if;
  perform public.require_catalog_supervisor();
  return new;
end $$;
revoke all on function public.guard_route1_attestation() from public, anon, authenticated;
create trigger routes_guard_route1_attestation before insert or update on public.routes for each row
  when (new.id in ('550e8400-e29b-41d4-a716-446655440000','550e8400-e29b-41d4-a716-446655440100'))
  execute function public.guard_route1_attestation();

alter function public.publish_esakay_route_line(uuid,jsonb,text) rename to catalog_publish_route_line;
revoke all on function public.catalog_publish_route_line(uuid,jsonb,text) from public, anon, authenticated;
create function public.publish_esakay_route_line(p_route_id uuid,p_coordinates jsonb,p_source_url text)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  active_variant text;
begin
  perform public.require_catalog_supervisor();
  if p_route_id in ('550e8400-e29b-41d4-a716-446655440000','550e8400-e29b-41d4-a716-446655440100') then
    select route1_variant into active_variant from public.routes where id=p_route_id for update;
    if active_variant is not null then raise exception 'Choose the Route 1 variant and publish both directions together.' using errcode='22023'; end if;
  end if;
  perform public.catalog_publish_route_line(p_route_id,p_coordinates,p_source_url);
end $$;

create function public.supervisor_activate_route1(p_variant text,p_expected_variant text,p_outbound jsonb,p_inbound jsonb,p_source_url text)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  outbound_id constant uuid := '550e8400-e29b-41d4-a716-446655440000';
  inbound_id constant uuid := '550e8400-e29b-41d4-a716-446655440100';
  outbound public.routes%rowtype;
  inbound public.routes%rowtype;
  endpoint text;
  outbound_name text;
  inbound_name text;
  activated_at timestamptz;
  changed_path boolean;
begin
  perform public.require_catalog_supervisor();
  if p_variant is null or p_variant not in ('buendia_2022','one_ayala_2026')
     or p_expected_variant not in ('buendia_2022','one_ayala_2026') then
    raise exception 'Choose a known Route 1 variant.' using errcode='22023';
  end if;
  if p_source_url is null or length(p_source_url)>1000 or p_source_url !~ '^https://[^/[:space:]?#]+[^[:space:]]*$' then
    raise exception 'Supply an HTTPS source for both Route 1 directions.' using errcode='22023';
  end if;
  endpoint := case p_variant when 'buendia_2022' then 'MRT Buendia' else 'One Ayala' end;
  outbound_name := 'Route 1: ' || endpoint || ' → Mandaluyong City Hall';
  inbound_name := 'Route 1: Mandaluyong City Hall → ' || endpoint;

  -- The shift-start trigger takes FOR SHARE on the same rows. Lock outbound first even if inbound is absent.
  select * into outbound from public.routes where id=outbound_id for update;
  if not found then raise exception 'The existing outbound Route 1 record is missing.' using errcode='22023'; end if;
  select * into inbound from public.routes where id=inbound_id for update;
  if (inbound.id is not null and inbound.route1_variant is null)
     or inbound.route1_variant is distinct from outbound.route1_variant then
    raise exception 'Route 1 records disagree or the return route ID is already in use. Review the pair.' using errcode='40001';
  end if;
  if outbound.route1_variant=p_variant and outbound.coordinates=p_outbound and inbound.coordinates=p_inbound
    and outbound.geometry_source_url=p_source_url and inbound.geometry_source_url=p_source_url
    and outbound.geometry_verified_at is not null and inbound.geometry_verified_at is not null
    and outbound.name=outbound_name and inbound.name=inbound_name
    and not (outbound.is_archived or inbound.is_archived or outbound.is_coming_soon or inbound.is_coming_soon) then
    return;
  end if;
  if outbound.route1_variant is distinct from p_expected_variant then
    raise exception 'Route 1 changed. Refresh both directions before activating.' using errcode='40001';
  end if;
  if exists(select 1 from public.vehicles where route_id in (outbound_id,inbound_id) and is_active) then
    raise exception 'End the active Route 1 shifts before changing either direction.' using errcode='55000';
  end if;
  changed_path := outbound.route1_variant is distinct from p_variant
    or outbound.coordinates is distinct from p_outbound or inbound.coordinates is distinct from p_inbound;
  activated_at := case when changed_path then greatest(clock_timestamp(),outbound.route1_activated_at + interval '1 microsecond')
    else outbound.route1_activated_at end;
  if inbound.id is null then
    insert into public.routes(id,name,description,color_code,operating_hours,base_fare,per_km_rate,base_distance_km,fare_source_url,fare_effective_date)
    values (inbound_id,inbound_name,'',outbound.color_code,'',null,null,null,null,null);
  end if;
  update public.routes set name=case id when outbound_id then outbound_name else inbound_name end,
    is_archived=false,is_coming_soon=false,route1_variant=p_variant,route1_activated_at=activated_at
    where id in (outbound_id,inbound_id);
  perform public.catalog_publish_route_line(outbound_id,p_outbound,p_source_url);
  perform public.catalog_publish_route_line(inbound_id,p_inbound,p_source_url);
  if changed_path then
    update public.routes set catalog_changed_at=activated_at, base_fare=null,per_km_rate=null,base_distance_km=null,
      fare_source_url=null,fare_effective_date=null,r2_geometry_url=null where id in (outbound_id,inbound_id);
    update public.terminals set passenger_use=null,passenger_use_source_url=null,passenger_use_verified_at=null,
      location_verified_at=null,location_source_url=null,location_changed_at=activated_at,
      stop_details_verified_at=null,stop_details_source_url=null,landmark_photo_source_url=null,
      regular_fare=null,student_fare=null,elderly_fare=null,disabled_fare=null,is_well_lit=false,cctv_monitored=false
      where route_id in (outbound_id,inbound_id);
  end if;
end $$;

-- An older writer can move, rename, retire or unverify a pin without knowing the new columns.
-- A supervisor must submit a separate attestation for the resulting pin in the same transaction.
create function public.guard_passenger_use() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  -- Old imports may change coordinates without re-verifying them. Such a pin must be surveyed again.
  if tg_op='UPDATE' and (new.route_id,new.latitude,new.longitude) is distinct from (old.route_id,old.latitude,old.longitude)
    and new.location_verified_at is not distinct from old.location_verified_at then
    new.location_verified_at := null;
    new.location_source_url := null;
    new.location_changed_at := clock_timestamp();
  end if;
  if new.route_id in ('550e8400-e29b-41d4-a716-446655440000','550e8400-e29b-41d4-a716-446655440100')
    and new.location_verified_at is not null and (tg_op='INSERT' or
      (new.location_source_url,new.location_verified_at) is distinct from (old.location_source_url,old.location_verified_at)) then
    perform public.require_catalog_supervisor();
  end if;
  if tg_op='UPDATE' and
    (new.route_id,new.name,new.latitude,new.longitude,new.geofence_radius_meters,new.location_source_url,new.location_verified_at,
     new.is_active,new.is_sample,new.deleted_at,new.boarding_side,new.travel_direction,new.entrance_instructions)
    is distinct from
    (old.route_id,old.name,old.latitude,old.longitude,old.geofence_radius_meters,old.location_source_url,old.location_verified_at,
     old.is_active,old.is_sample,old.deleted_at,old.boarding_side,old.travel_direction,old.entrance_instructions) then
    new.passenger_use := null;
    new.passenger_use_source_url := null;
    new.passenger_use_verified_at := null;
    return new;
  end if;
  if tg_op='UPDATE' and (new.passenger_use,new.passenger_use_source_url,new.passenger_use_verified_at)
    is not distinct from (old.passenger_use,old.passenger_use_source_url,old.passenger_use_verified_at) then return new; end if;
  if new.passenger_use is not null or new.passenger_use_source_url is not null or new.passenger_use_verified_at is not null
    or (tg_op='UPDATE' and old.passenger_use is not null) then perform public.require_catalog_supervisor(); end if;
  if new.passenger_use is null then
    new.passenger_use_source_url := null;
    new.passenger_use_verified_at := null;
    return new;
  end if;
  if new.passenger_use not in ('board','alight','both') or new.passenger_use_source_url is null
    or length(new.passenger_use_source_url)>1000 or new.passenger_use_source_url !~ '^https://[^/[:space:]?#]+[^[:space:]]*$'
    or new.is_active is false or new.is_sample or new.deleted_at is not null
    or new.latitude is null or new.latitude not between -90 and 90 or new.longitude is null or new.longitude not between -180 and 180
    or new.location_verified_at is null or new.location_verified_at>clock_timestamp()
    or new.location_source_url is null or new.location_source_url !~ '^https://[^/[:space:]?#]+[^[:space:]]*$'
    or not exists(select 1 from public.routes r where r.id=new.route_id and not r.is_archived
      and (r.id not in ('550e8400-e29b-41d4-a716-446655440000','550e8400-e29b-41d4-a716-446655440100')
        or r.route1_activated_at <= new.location_verified_at)) then
    raise exception 'Approval requires a current verified pin, a passenger use and an HTTPS permission source.' using errcode='22023';
  end if;
  new.passenger_use_verified_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.guard_passenger_use() from public, anon, authenticated;
create trigger terminals_guard_passenger_use before insert or update on public.terminals
  for each row execute function public.guard_passenger_use();

create function public.check_expected_route1(p_route_id uuid,p_data jsonb) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  actual text;
begin
  if p_route_id in ('550e8400-e29b-41d4-a716-446655440000','550e8400-e29b-41d4-a716-446655440100') then
    select r.route1_variant into actual from public.routes r where r.id=p_route_id for update;
    if not found or (p_data ? 'expected_route1_variant') is not true
      or p_data->>'expected_route1_variant' is distinct from actual then
      raise exception 'Refresh Route 1 before saving a stop. Its expected variant is missing or out of date.' using errcode='40001';
    end if;
  elsif p_data->>'expected_route1_variant' is not null then
    raise exception 'This stop does not belong to Route 1.' using errcode='22023';
  end if;
end $$;
revoke all on function public.check_expected_route1(uuid,jsonb) from public, anon, authenticated;

alter function public.supervisor_save_stop(uuid,uuid,jsonb) rename to catalog_save_stop_fields;
revoke all on function public.catalog_save_stop_fields(uuid,uuid,jsonb) from public, anon, authenticated;
create function public.supervisor_save_stop(p_route_id uuid,p_stop_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  fields jsonb;
  use_value text := p_data->>'passenger_use';
  source_url text := p_data->>'passenger_use_source_url';
begin
  perform public.require_catalog_supervisor();
  perform public.check_expected_route1(p_route_id,p_data);
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Supply editable stop fields.' using errcode='22023'; end if;
  if (p_data ? 'passenger_use_source_url' and not (p_data ? 'passenger_use'))
    or (source_url is not null and (length(source_url)>1000 or source_url !~ '^https://[^/[:space:]?#]+[^[:space:]]*$'))
    or (use_value is not null and (use_value not in ('board','alight','both') or source_url is null)) then
    raise exception 'Supply board, alight or both with an HTTPS permission source, or null to revoke.' using errcode='22023';
  end if;
  fields := p_data - array['passenger_use','passenger_use_source_url','expected_route1_variant'];
  if fields <> '{}' or p_stop_id is null or not (p_data ? 'passenger_use') then
    p_stop_id := public.catalog_save_stop_fields(p_route_id,p_stop_id,fields);
  end if;
  if p_data ? 'passenger_use' then
    perform 1 from public.routes where id=p_route_id and not is_archived for update;
    if not found then raise exception 'Route unavailable.' using errcode='22023'; end if;
    update public.terminals set passenger_use=use_value,passenger_use_source_url=case when use_value is not null then source_url end
    where id=p_stop_id and route_id=p_route_id and is_active is not false and not coalesce(is_sample,false) and deleted_at is null;
    if not found then raise exception 'Stop unavailable on this route.' using errcode='22023'; end if;
  end if;
  return p_stop_id;
end $$;

-- Check the variant even on a receipt replay; the old response may describe a previous service.
alter function public.supervisor_create_catalog_item(uuid,text,uuid,jsonb) rename to catalog_create_item_with_receipt;
revoke all on function public.catalog_create_item_with_receipt(uuid,text,uuid,jsonb) from public, anon, authenticated;
create function public.supervisor_create_catalog_item(p_request_id uuid,p_kind text,p_route_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform public.require_catalog_supervisor();
  if p_kind='stop' then perform public.check_expected_route1(p_route_id,p_data); end if;
  return public.catalog_create_item_with_receipt(p_request_id,p_kind,p_route_id,p_data);
end $$;

revoke all on function public.supervisor_activate_route1(text,text,jsonb,jsonb,text), public.publish_esakay_route_line(uuid,jsonb,text),
  public.supervisor_save_stop(uuid,uuid,jsonb), public.supervisor_create_catalog_item(uuid,text,uuid,jsonb) from public, anon;
grant execute on function public.supervisor_activate_route1(text,text,jsonb,jsonb,text), public.publish_esakay_route_line(uuid,jsonb,text),
  public.supervisor_save_stop(uuid,uuid,jsonb), public.supervisor_create_catalog_item(uuid,text,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
