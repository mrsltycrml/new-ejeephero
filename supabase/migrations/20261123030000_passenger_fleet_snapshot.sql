set local lock_timeout = '5s';

create table public.passenger_catalog_revision (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 1
);
insert into public.passenger_catalog_revision default values;
alter table public.passenger_catalog_revision enable row level security;
revoke all on public.passenger_catalog_revision from public, anon, authenticated;
grant select on public.passenger_catalog_revision to authenticated;
create policy passenger_catalog_revision_read on public.passenger_catalog_revision
  for select to authenticated using (true);

create function public.bump_passenger_catalog_revision() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  update public.passenger_catalog_revision set revision = revision + 1 where singleton;
  return null;
end $$;
revoke all on function public.bump_passenger_catalog_revision() from public, anon, authenticated;
create trigger routes_passenger_catalog_revision
  after insert or update or delete or truncate on public.routes
  for each statement execute function public.bump_passenger_catalog_revision();
create trigger terminals_passenger_catalog_revision
  after insert or update or delete or truncate on public.terminals
  for each statement execute function public.bump_passenger_catalog_revision();

create function public.get_passenger_fleet_snapshot() returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog, pg_temp as $$
declare
  captured_since constant timestamptz := now() - interval '30 seconds';
  captured_until constant timestamptz := now() + interval '5 seconds';
begin
  if public.is_approved_esakay_user() is not true then
    raise exception 'Approved account required.' using errcode = '42501';
  end if;

  return (
    with enabled_routes as (
      select r.id from public.routes r
      cross join lateral (select to_jsonb(r) as fields) flags
      where r.is_archived is not true and r.is_coming_soon is not true
        and (fields->>'is_sample') is distinct from 'true'
        and (fields->>'is_active') is distinct from 'false'
        and (fields->>'is_published') is distinct from 'false'
        and nullif(fields->>'deleted_at', '') is null
        and coalesce(nullif(fields->>'status', ''), 'published') in ('active','published')
    ), fleet as (
      select v.id, v.route_id, v.body_number, v.plate_number, v.passenger_count, v.max_capacity,
        fix.latitude, fix.longitude, fix.speed, fix.heading, fix.accuracy, fix.captured_at as recorded_at
      from public.vehicles v
      join enabled_routes r on r.id = v.route_id
      join lateral (
        select p.latitude, p.longitude, p.speed, p.heading, p.accuracy, p.captured_at
        from public.vehicle_positions p
        where p.vehicle_id = v.id and p.timestamp >= captured_since
          and p.captured_at between captured_since and captured_until
          and p.latitude between -90 and 90 and p.longitude between -180 and 180
          and (to_jsonb(p)->>'is_sample') is distinct from 'true'
        order by p.captured_at desc, p.id
        limit 1
      ) fix on true
      where v.is_active and v.ended_at is null
        and (to_jsonb(v)->>'is_sample') is distinct from 'true'
        and nullif(to_jsonb(v)->>'deleted_at', '') is null
    )
    select jsonb_build_object(
      'catalog_version', (select revision::text from public.passenger_catalog_revision where singleton),
      'route_ids', coalesce((select jsonb_agg(id order by id) from enabled_routes), '[]'::jsonb),
      'vehicles', coalesce((select jsonb_agg(to_jsonb(fleet) order by id) from fleet), '[]'::jsonb)
    )
  );
end $$;
revoke all on function public.get_passenger_fleet_snapshot() from public, anon;
grant execute on function public.get_passenger_fleet_snapshot() to authenticated;

notify pgrst, 'reload schema';
