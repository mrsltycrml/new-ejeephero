-- Extend the known variants without changing any selected route or its evidence.
alter table public.routes drop constraint route1_selection,
  add constraint route1_selection check (
    (route1_variant is null and route1_activated_at is null) or
    (id in ('550e8400-e29b-41d4-a716-446655440000','550e8400-e29b-41d4-a716-446655440100')
      and route1_variant is not null and route1_variant in ('buendia_2022','one_ayala_2026','buendia_roundtrip')
      and route1_activated_at is not null)
  );

create or replace function public.supervisor_activate_route1(p_variant text,p_expected_variant text,p_outbound jsonb,p_inbound jsonb,p_source_url text)
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
  if p_variant is null or p_variant not in ('buendia_2022','one_ayala_2026','buendia_roundtrip')
     or p_expected_variant not in ('buendia_2022','one_ayala_2026','buendia_roundtrip') then
    raise exception 'Choose a known Route 1 variant.' using errcode='22023';
  end if;
  if p_source_url is null or length(p_source_url)>1000 or p_source_url !~ '^https://[^/[:space:]?#]+[^[:space:]]*$' then
    raise exception 'Supply an HTTPS source for both Route 1 directions.' using errcode='22023';
  end if;
  endpoint := case when p_variant = 'one_ayala_2026' then 'One Ayala' else 'MRT Buendia' end;
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
