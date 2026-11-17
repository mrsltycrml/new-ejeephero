-- Add evidence fields only. No route, fare, photo, accessibility or path is seeded.
alter table public.passenger_walk_links
  alter column accessible drop not null,
  alter column accessible drop default,
  add column if not exists coordinates jsonb,
  add column if not exists steps jsonb,
  add column if not exists accessibility_source_url text,
  add column if not exists accessibility_verified_at timestamptz;

alter table public.passenger_walk_links
  add constraint passenger_walk_coordinates_array check (coordinates is null or jsonb_typeof(coordinates) = 'array') not valid,
  add constraint passenger_walk_steps_array check (steps is null or jsonb_typeof(steps) = 'array') not valid,
  add constraint passenger_walk_accessibility_evidence check (
    (accessibility_source_url is null and accessibility_verified_at is null)
    or (accessibility_source_url ~ '^https://' and accessibility_verified_at is not null)
  ) not valid;
-- Legacy false values have no evidence and remain unknown to the application.
-- Only explicitly sourced accessibility is eligible for step-free suggestions.

alter table public.passenger_fare_matrices add column if not exists currency text;
alter table public.passenger_fare_matrices
  add constraint passenger_fare_currency check (currency is null or currency ~ '^[A-Z]{3}$') not valid;

alter table public.terminals
  add column if not exists boarding_side text,
  add column if not exists travel_direction text,
  add column if not exists entrance_instructions text,
  add column if not exists stop_details_source_url text,
  add column if not exists stop_details_verified_at timestamptz,
  add column if not exists landmark_photo_source_url text;
alter table public.terminals
  add constraint terminal_details_source_https check (stop_details_source_url is null or stop_details_source_url ~ '^https://') not valid,
  add constraint terminal_photo_source_https check (landmark_photo_source_url is null or landmark_photo_source_url ~ '^https://') not valid;

-- One counter row per account; never save coordinates, paths, or tokens.
create table public.passenger_walking_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  minute_start timestamptz not null,
  minute_count integer not null check (minute_count between 0 and 12),
  day_start timestamptz not null,
  day_count integer not null check (day_count between 0 and 120)
);
alter table public.passenger_walking_limits enable row level security;
revoke all on public.passenger_walking_limits from public, anon, authenticated;

create or replace function public.claim_walking_directions(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  current_minute timestamptz := date_trunc('minute', now());
  current_day timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  quota public.passenger_walking_limits%rowtype;
begin
  if not exists(select 1 from public.profiles where id = p_user_id and status = 'approved') then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('walking:' || p_user_id::text, 0));
  select * into quota from public.passenger_walking_limits where user_id = p_user_id;
  if not found then
    insert into public.passenger_walking_limits values(p_user_id, current_minute, 1, current_day, 1);
    return true;
  end if;
  if quota.minute_start < current_minute then quota.minute_count := 0; end if;
  if quota.day_start < current_day then quota.day_count := 0; end if;
  if quota.minute_count >= 12 or quota.day_count >= 120 then return false; end if;
  update public.passenger_walking_limits set
    minute_start = current_minute, minute_count = quota.minute_count + 1,
    day_start = current_day, day_count = quota.day_count + 1 where user_id = p_user_id;
  return true;
end;
$$;
revoke execute on function public.claim_walking_directions(uuid) from public, anon, authenticated;
grant execute on function public.claim_walking_directions(uuid) to service_role;
