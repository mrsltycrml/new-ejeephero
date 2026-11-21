create or replace function public.set_driver_hidden(target_id uuid, hidden boolean)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if public.is_ejeephero_admin() is not true then
    raise exception 'Only approved supervisors can update driver visibility.' using errcode = '42501';
  end if;

  if hidden then
    -- Serialize the off-duty check with guard_active_shift() starting a shift for this driver.
    perform pg_advisory_xact_lock(hashtextextended(target_id::text, 3));
    if exists (select 1 from public.vehicles where driver_id = target_id and is_active) then
      raise exception 'End this driver''s active shift before hiding their profile.' using errcode = '23514';
    end if;
  end if;

  update public.profiles set supervisor_hidden = hidden
  where id = target_id and role = 'driver';
end $$;

create or replace function public.admin_force_end_shift(target_vehicle_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if public.is_ejeephero_admin() is not true then
    raise exception 'Only approved supervisors can end active shifts.' using errcode = '42501';
  end if;

  update public.vehicles
  set is_active = false, passenger_count = 0, ended_at = coalesce(ended_at, now())
  where id = target_vehicle_id and is_active;
end $$;

revoke all on function public.set_driver_hidden(uuid, boolean), public.admin_force_end_shift(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_driver_hidden(uuid, boolean), public.admin_force_end_shift(uuid)
  to authenticated;

notify pgrst, 'reload schema';
