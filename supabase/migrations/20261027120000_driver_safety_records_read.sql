-- Drivers can review only their own speed and route records.
-- Supervisor read policies from earlier migrations remain in place.
alter table public.speed_events enable row level security;
drop policy if exists speed_events_driver_read_own on public.speed_events;
create policy speed_events_driver_read_own on public.speed_events
  for select to authenticated using (driver_id = auth.uid());

alter table public.trip_violations enable row level security;
drop policy if exists trip_violations_driver_read_own on public.trip_violations;
create policy trip_violations_driver_read_own on public.trip_violations
  for select to authenticated using (driver_id = auth.uid());

-- Approved drivers need the active unit roster for shift selection.
alter table public.fleet_registry_units enable row level security;
drop policy if exists fleet_registry_units_driver_read_active on public.fleet_registry_units;
create policy fleet_registry_units_driver_read_active on public.fleet_registry_units
  for select to authenticated using (
    deleted_at is null and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'driver' and p.status = 'approved'
    )
  );

-- The client checks this before showing a grade, avoiding a misleading 100/100
-- while older deployments still hide all rows through RLS.
create or replace function public.driver_records_access_ready()
returns boolean language sql stable security invoker set search_path = public
as $$ select auth.uid() is not null $$;
revoke all on function public.driver_records_access_ready() from public;
grant execute on function public.driver_records_access_ready() to authenticated;
