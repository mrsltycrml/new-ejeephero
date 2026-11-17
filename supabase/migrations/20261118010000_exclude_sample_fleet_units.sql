-- Preserve the existing RPC signature and permissions while excluding flagged source rows.
create or replace function public.get_available_fleet_units()
returns table(body_number text, plate_number text)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.body_number, u.plate_number
  from public.fleet_registry_units u
  where u.deleted_at is null
    and coalesce((to_jsonb(u)->>'is_sample')::boolean, false) = false
    and public.is_approved_esakay_user()
  order by u.body_number
$$;
