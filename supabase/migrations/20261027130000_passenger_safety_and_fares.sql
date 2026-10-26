-- Source-backed passenger data. No guessed boarding zones, routes or fares are seeded.
create table if not exists public.passenger_loading_zones (
  id uuid primary key default gen_random_uuid(), name text not null,
  kind text not null check (kind in ('loading','no_loading')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_meters numeric not null check (radius_meters > 0 and radius_meters <= 500),
  source_url text not null check (source_url ~ '^https://'), verified_at timestamptz not null
);
create table if not exists public.passenger_route_segments (
  id uuid primary key default gen_random_uuid(), route_id uuid not null references public.routes(id),
  from_stop_id uuid not null references public.terminals(id), to_stop_id uuid not null references public.terminals(id),
  distance_meters numeric not null check (distance_meters > 0),
  source_url text not null check (source_url ~ '^https://'), verified_at timestamptz not null,
  check (from_stop_id <> to_stop_id), unique (route_id, from_stop_id, to_stop_id)
);
create table if not exists public.passenger_walk_links (
  id uuid primary key default gen_random_uuid(),
  from_stop_id uuid not null references public.terminals(id), to_stop_id uuid not null references public.terminals(id),
  distance_meters numeric not null check (distance_meters > 0), duration_seconds numeric not null check (duration_seconds > 0),
  accessible boolean not null default false,
  source_url text not null check (source_url ~ '^https://'), verified_at timestamptz not null,
  check (from_stop_id <> to_stop_id), unique (from_stop_id, to_stop_id)
);
create table if not exists public.passenger_fare_matrices (
  id uuid primary key default gen_random_uuid(), route_id uuid not null references public.routes(id),
  effective_from date not null, effective_to date,
  source_url text not null check (source_url ~ '^https://'), verified_at timestamptz not null,
  brackets jsonb not null check (jsonb_typeof(brackets) = 'array'),
  check (effective_to is null or effective_to >= effective_from), unique (route_id, effective_from)
);

do $$ declare target text; begin
  foreach target in array array['passenger_loading_zones','passenger_route_segments','passenger_walk_links','passenger_fare_matrices'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('drop policy if exists public_reference_read on public.%I', target);
    execute format('create policy public_reference_read on public.%I for select to anon, authenticated using (true)', target);
    execute format('grant select on public.%I to anon, authenticated', target);
    -- Only the trusted backend imports verified source data.
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', target);
  end loop;
end $$;

-- Emergency requests are claimed once. Only the authenticated edge service may call this.
create table if not exists public.passenger_sos_dispatches (
  request_id uuid primary key, user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), status text not null default 'sending',
  accepted_count integer not null default 0, recipient_count integer not null default 0
);
alter table public.passenger_sos_dispatches enable row level security;
revoke all on public.passenger_sos_dispatches from anon, authenticated;
create index if not exists passenger_sos_user_time on public.passenger_sos_dispatches(user_id, created_at desc);

create or replace function public.claim_passenger_sos_dispatch(p_user_id uuid, p_request_id uuid, p_recipient_count integer)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if exists(select 1 from passenger_sos_dispatches where request_id = p_request_id) then return 'duplicate'; end if;
  if exists(select 1 from passenger_sos_dispatches where user_id = p_user_id and created_at > now() - interval '30 seconds') then return 'cooldown'; end if;
  insert into passenger_sos_dispatches(request_id, user_id, recipient_count) values(p_request_id, p_user_id, p_recipient_count);
  return 'claimed';
end;
$$;
revoke execute on function public.claim_passenger_sos_dispatch(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_passenger_sos_dispatch(uuid,uuid,integer) to service_role;
revoke all on public.emergency_contacts, public.sos_events from anon;
