set local lock_timeout = '5s';

alter table public.sos_events
  add column incident_type text check (incident_type in ('accident', 'breakdown')),
  add column captured_at timestamptz,
  add column status text not null default 'open' check (status in ('open', 'acknowledged', 'dispatched', 'resolved')),
  add column status_updated_at timestamptz not null default now(),
  add column status_updated_by uuid references public.profiles(id) on delete set null;

-- New incident rows can only enter through the validated RPC.
revoke insert, update, delete on public.sos_events from public, anon, authenticated;
drop policy if exists sos_owner_insert on public.sos_events;
create index sos_events_incident_state_time_idx
  on public.sos_events(status, status_updated_at desc) where incident_type is not null;
create index sos_events_incident_reporter_time_idx
  on public.sos_events(user_id, created_at desc) where incident_type is not null;

create function public.report_fleet_incident(p_request_id uuid, p_incident_type text,
  p_latitude double precision, p_longitude double precision, p_accuracy double precision,
  p_captured_at timestamptz, p_vehicle_id uuid default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  reporter uuid := public.current_profile_id();
  incident public.sos_events%rowtype;
  vehicle public.vehicles%rowtype;
begin
  if reporter is null or public.is_approved_esakay_user() is not true then
    raise exception 'Approved account required.' using errcode = '42501';
  end if;
  if p_request_id is null or p_incident_type is null or p_incident_type not in ('accident','breakdown') then
    raise exception 'Choose a valid incident type.' using errcode = '22023';
  end if;

  select * into incident from public.sos_events where id = p_request_id;
  if not found then
    -- Serialize new reports from one account and check again for a concurrent retry.
    perform pg_advisory_xact_lock(hashtextextended(reporter::text, 511));
    select * into incident from public.sos_events where id = p_request_id;
  end if;
  if incident.id is null then
    if (p_latitude between -90 and 90 and p_longitude between -180 and 180
      and p_captured_at between now() - interval '60 seconds' and now() + interval '5 seconds'
      and (p_accuracy is null or p_accuracy between 0 and 10000)) is not true then
      raise exception 'A fresh, valid GPS fix is required.' using errcode = '22023';
    end if;
    if (select count(*) from public.sos_events e where e.user_id = reporter and e.incident_type is not null
      and e.created_at >= now() - interval '1 minute') >= 5 then
      raise exception 'Too many recent incident reports. Call a hotline if you need immediate help.' using errcode = '54000';
    end if;
    if p_vehicle_id is not null then
      select * into vehicle from public.vehicles v where v.id = p_vehicle_id and v.is_active and v.ended_at is null
        and (to_jsonb(v)->>'is_sample') is distinct from 'true' and nullif(to_jsonb(v)->>'deleted_at', '') is null;
    end if;
    insert into public.sos_events(id, user_id, incident_type, latitude, longitude, gps_accuracy_meters,
      captured_at, vehicle_id, vehicle_body_number, vehicle_plate)
    values (p_request_id, reporter, p_incident_type, p_latitude, p_longitude, p_accuracy,
      p_captured_at, vehicle.id, vehicle.body_number, vehicle.plate_number)
    on conflict (id) do nothing returning * into incident;
    if not found then
      select * into incident from public.sos_events where id = p_request_id;
    end if;
  end if;
  if incident.user_id is distinct from reporter or incident.incident_type is distinct from p_incident_type then
    raise exception 'Could not submit this incident.' using errcode = '22023';
  end if;
  return jsonb_build_object('id', incident.id, 'vehicle_id', incident.vehicle_id);
end $$;

create function public.get_fleet_incidents() returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog, pg_temp as $$
begin
  if public.is_ejeephero_admin() is not true then
    raise exception 'Approved supervisor access required.' using errcode = '42501';
  end if;
  return (
    with recent_resolved as (
      select id from public.sos_events where incident_type is not null and status = 'resolved'
      order by status_updated_at desc, id limit 10
    ), inbox as (
      select id, incident_type, status, created_at, captured_at, status_updated_at, latitude, longitude,
        gps_accuracy_meters, vehicle_id, vehicle_body_number, vehicle_plate
      from public.sos_events where incident_type is not null
        and (status <> 'resolved' or id in (select id from recent_resolved))
    )
    select coalesce(jsonb_agg(inbox order by (status = 'resolved'), created_at, id), '[]'::jsonb) from inbox
  );
end $$;

create function public.advance_fleet_incident(p_id uuid, p_next_status text) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  previous text := case p_next_status when 'acknowledged' then 'open' when 'dispatched' then 'acknowledged'
    when 'resolved' then 'dispatched' end;
begin
  if public.is_ejeephero_admin() is not true then
    raise exception 'Approved supervisor access required.' using errcode = '42501';
  end if;
  if previous is null then raise exception 'Choose a valid incident action.' using errcode = '22023'; end if;
  update public.sos_events set status = p_next_status, status_updated_at = now(), status_updated_by = public.current_profile_id()
  where id = p_id and incident_type is not null and status = previous;
  if not found and not exists (select 1 from public.sos_events where id = p_id and incident_type is not null and status = p_next_status) then
    raise exception 'The incident changed. Refresh and try again.' using errcode = '40001';
  end if;
end $$;

revoke all on function public.report_fleet_incident(uuid,text,double precision,double precision,double precision,timestamptz,uuid),
  public.get_fleet_incidents(), public.advance_fleet_incident(uuid,text) from public, anon;
grant execute on function public.report_fleet_incident(uuid,text,double precision,double precision,double precision,timestamptz,uuid),
  public.get_fleet_incidents(), public.advance_fleet_incident(uuid,text) to authenticated;
notify pgrst, 'reload schema';
