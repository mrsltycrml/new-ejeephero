create or replace function public.check_esakay_route_deviation() returns trigger
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
  -- The arrival freshness check applies to the new fix. Walk consecutive fixes in its capture-time window.
  for prior in
    select p.* from public.vehicle_positions p where p.vehicle_id = new.vehicle_id
      and p.timestamp < new.timestamp
      and p.timestamp >= greatest(new.timestamp-interval '30 seconds', shift.created_at, route.geometry_verified_at)
    order by p.timestamp desc
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
