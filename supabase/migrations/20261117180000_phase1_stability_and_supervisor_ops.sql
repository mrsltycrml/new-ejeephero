-- Phase 1 stability & supervisor ops:
-- 1. Partial index for active shift queries & timestamp cleanup index.
-- 2. Safe 14-day retention trigger for ended shifts (never deletes active/recent trip evidence).
-- 3. Admin-only RPCs for hiding retired drivers (`supervisor_hidden`) and ending stuck shifts.
-- 4. Drop unused `get_driver_safety_report_cards` RPC (scoring unified in client helper).

create index if not exists vehicles_active_idx
  on public.vehicles (is_active, created_at desc) where is_active = true;

create index if not exists vehicle_positions_time_idx
  on public.vehicle_positions ("timestamp" desc);

create or replace function public.prune_ended_telemetry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.vehicle_positions p
  where p."timestamp" < now() - interval '14 days'
    and exists (
      select 1 from public.vehicles v
      where v.id = p.vehicle_id
        and v.is_active = false
        and v.ended_at < now() - interval '14 days'
    );
  return null;
end $$;

drop trigger if exists vehicles_prune_ended_telemetry on public.vehicles;
create trigger vehicles_prune_ended_telemetry
  after insert on public.vehicles
  for each statement execute function public.prune_ended_telemetry();

revoke all on function public.prune_ended_telemetry() from public, anon, authenticated;

create or replace function public.set_driver_hidden(target_id uuid, hidden boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_ejeephero_admin() then
    raise exception 'Only approved supervisors can update driver visibility.' using errcode = '42501';
  end if;
  update public.profiles
  set supervisor_hidden = hidden
  where id = target_id and role = 'driver';
end $$;

revoke all on function public.set_driver_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_driver_hidden(uuid, boolean) to authenticated;

create or replace function public.admin_force_end_shift(target_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_ejeephero_admin() then
    raise exception 'Only approved supervisors can end active shifts.' using errcode = '42501';
  end if;
  update public.vehicles
  set is_active = false, passenger_count = 0, ended_at = coalesce(ended_at, now())
  where id = target_vehicle_id and is_active = true;
end $$;

revoke all on function public.admin_force_end_shift(uuid) from public, anon;
grant execute on function public.admin_force_end_shift(uuid) to authenticated;

drop function if exists public.get_driver_safety_report_cards();

notify pgrst, 'reload schema';
