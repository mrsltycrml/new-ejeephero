-- Admin-managed fleet and driver roster. Trip records in public.vehicles and
-- authentication records in public.profiles remain separate from this registry.

create table if not exists public.fleet_registry_units (
  id uuid primary key default gen_random_uuid(),
  body_number text not null check (length(btrim(body_number)) between 1 and 40),
  plate_number text check (plate_number is null or length(btrim(plate_number)) <= 40),
  route_name text not null default 'MRT Buendia - Mandaluyong City Hall',
  assigned_driver text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.fleet_registry_drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  email text not null check (length(btrim(email)) between 3 and 254),
  assigned_unit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists fleet_registry_units_active_body_idx
  on public.fleet_registry_units (lower(btrim(body_number))) where deleted_at is null;
create unique index if not exists fleet_registry_units_active_plate_idx
  on public.fleet_registry_units (lower(btrim(plate_number)))
  where deleted_at is null and nullif(btrim(plate_number), '') is not null;
create unique index if not exists fleet_registry_drivers_active_email_idx
  on public.fleet_registry_drivers (lower(btrim(email))) where deleted_at is null;
create index if not exists fleet_registry_units_deleted_idx on public.fleet_registry_units (deleted_at desc);
create index if not exists fleet_registry_drivers_deleted_idx on public.fleet_registry_drivers (deleted_at desc);

create or replace function public.touch_fleet_registry_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fleet_registry_units_updated_at on public.fleet_registry_units;
create trigger fleet_registry_units_updated_at before update on public.fleet_registry_units
for each row execute function public.touch_fleet_registry_updated_at();
drop trigger if exists fleet_registry_drivers_updated_at on public.fleet_registry_drivers;
create trigger fleet_registry_drivers_updated_at before update on public.fleet_registry_drivers
for each row execute function public.touch_fleet_registry_updated_at();

alter table public.fleet_registry_units enable row level security;
alter table public.fleet_registry_drivers enable row level security;

revoke all on public.fleet_registry_units from anon, authenticated;
revoke all on public.fleet_registry_drivers from anon, authenticated;
grant select, insert, update on public.fleet_registry_units to authenticated;
grant select, insert, update on public.fleet_registry_drivers to authenticated;

drop policy if exists fleet_registry_units_admin_read on public.fleet_registry_units;
create policy fleet_registry_units_admin_read on public.fleet_registry_units
for select to authenticated using (public.is_ejeephero_admin());
drop policy if exists fleet_registry_units_admin_insert on public.fleet_registry_units;
create policy fleet_registry_units_admin_insert on public.fleet_registry_units
for insert to authenticated with check (public.is_ejeephero_admin() and deleted_at is null);
drop policy if exists fleet_registry_units_admin_update on public.fleet_registry_units;
create policy fleet_registry_units_admin_update on public.fleet_registry_units
for update to authenticated using (public.is_ejeephero_admin()) with check (public.is_ejeephero_admin());

drop policy if exists fleet_registry_drivers_admin_read on public.fleet_registry_drivers;
create policy fleet_registry_drivers_admin_read on public.fleet_registry_drivers
for select to authenticated using (public.is_ejeephero_admin());
drop policy if exists fleet_registry_drivers_admin_insert on public.fleet_registry_drivers;
create policy fleet_registry_drivers_admin_insert on public.fleet_registry_drivers
for insert to authenticated with check (public.is_ejeephero_admin() and deleted_at is null);
drop policy if exists fleet_registry_drivers_admin_update on public.fleet_registry_drivers;
create policy fleet_registry_drivers_admin_update on public.fleet_registry_drivers
for update to authenticated using (public.is_ejeephero_admin()) with check (public.is_ejeephero_admin());
