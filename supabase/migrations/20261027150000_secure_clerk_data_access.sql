-- Reconcile legacy anonymous policies with verified Clerk/Supabase identities.
-- Run after the fleet registry and supervisor migrations. No user rows are deleted.
create or replace function public.current_profile_id()
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare subject text := auth.jwt()->>'sub'; identity uuid;
begin
  if auth.jwt()->>'iss' = 'https://first-doe-4400.clerk.accounts.dev' then
    if coalesce(auth.jwt()->>'email_verified','false') <> 'true' then return null; end if;
    select id into identity from public.profiles where clerk_id = subject;
    return identity;
  end if;
  if subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return subject::uuid;
  end if;
  return null;
end $$;
revoke all on function public.current_profile_id() from public, anon;
grant execute on function public.current_profile_id() to authenticated;

create or replace function public.is_ejeephero_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.profiles where id=public.current_profile_id()
    and status='approved' and (is_admin or role in ('admin','supervisor')))
$$;
create or replace function public.check_is_admin(user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select user_id=public.current_profile_id() and public.is_ejeephero_admin()
$$;
create or replace function public.is_approved_esakay_user()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.profiles where id=public.current_profile_id() and status='approved')
$$;
create or replace function public.is_esakay_driver()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.profiles where id=public.current_profile_id() and status='approved' and role='driver')
$$;
revoke all on function public.is_ejeephero_admin(), public.check_is_admin(uuid), public.is_approved_esakay_user(), public.is_esakay_driver() from public, anon;
grant execute on function public.is_ejeephero_admin(), public.check_is_admin(uuid), public.is_approved_esakay_user(), public.is_esakay_driver() to authenticated;

-- The invoker trigger allows trusted database functions to maintain status while
-- direct clients can edit only their display name, never identity/access flags.
create or replace function public.enforce_profile_immutability()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if current_user not in ('postgres','supabase_admin','service_role') and (
    new.id is distinct from old.id or new.clerk_id is distinct from old.clerk_id
    or new.email is distinct from old.email or new.role is distinct from old.role
    or new.status is distinct from old.status or new.is_admin is distinct from old.is_admin
    or new.is_approved is distinct from old.is_approved
  ) then raise exception 'Account identity and permissions can only be changed by the trusted account service.' using errcode='42501'; end if;
  if new.status is distinct from old.status then new.is_approved := new.status='approved'; end if;
  return new;
end $$;
drop trigger if exists on_profile_immutable_fields on public.profiles;
drop trigger if exists check_profile_update on public.profiles;
create trigger check_profile_update before update on public.profiles
for each row execute function public.enforce_profile_immutability();

create or replace function public.bootstrap_clerk_profile(requested_role text default 'passenger', display_name text default '')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  claims jsonb := auth.jwt(); subject text := claims->>'sub';
  verified_email text := lower(btrim(claims->>'email'));
  account public.profiles%rowtype; matching integer;
begin
  if claims->>'iss' is distinct from 'https://first-doe-4400.clerk.accounts.dev'
    or subject is null or subject !~ '^user_[A-Za-z0-9]+$'
    or coalesce(claims->>'email_verified','false') <> 'true'
    or verified_email is null or verified_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  then raise exception 'Verify your email address with Clerk, then sign in again.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(subject, 0));
  perform pg_advisory_xact_lock(hashtextextended(verified_email, 1));
  select * into account from public.profiles where clerk_id=subject for update;
  if account.id is null then
    select count(*) into matching from public.profiles where lower(email)=verified_email and clerk_id is null;
    if matching > 1 then raise exception 'More than one legacy account matches. Contact the administrator.'; end if;
    select * into account from public.profiles where lower(email)=verified_email and clerk_id is null for update;
    if account.id is not null then
      update public.profiles set clerk_id=subject where id=account.id returning * into account;
    else
      insert into public.profiles(id,clerk_id,email,role,status,is_approved,is_admin,full_name)
      values(gen_random_uuid(),subject,verified_email,case when requested_role='driver' then 'driver' else 'passenger' end,
        'approved',true,false,left(btrim(display_name),120)) returning * into account;
    end if;
  end if;
  return jsonb_build_object('id',account.id,'role',account.role,'status',account.status,
    'is_admin',account.is_admin,'full_name',account.full_name);
end $$;
revoke all on function public.bootstrap_clerk_profile(text,text) from public, anon;
grant execute on function public.bootstrap_clerk_profile(text,text) to authenticated;

-- Legacy Supabase accounts activate only after email confirmation.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.profiles(id,email,role,status,is_approved,is_admin,full_name)
  values(new.id,new.email,case when new.raw_user_meta_data->>'role'='driver' then 'driver' else 'passenger' end,
    case when new.email_confirmed_at is not null then 'approved' else 'pending' end,
    new.email_confirmed_at is not null,false,left(coalesce(new.raw_user_meta_data->>'full_name',''),120))
  on conflict(id) do nothing;
  return new;
end $$;
create or replace function public.activate_verified_legacy_account()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set status='approved',is_approved=true where id=new.id and status='pending' and role in ('driver','passenger');
  end if;
  return new;
end $$;
drop trigger if exists on_auth_email_verified on auth.users;
create trigger on_auth_email_verified after update of email_confirmed_at on auth.users
for each row execute function public.activate_verified_legacy_account();

-- Remove the obsolete trigger that silently destroyed trip evidence.
drop trigger if exists vehicles_prune_old_telemetry on public.vehicles;
alter table public.emergency_contacts drop constraint if exists emergency_contacts_user_id_key;
create index if not exists emergency_contacts_user_idx on public.emergency_contacts(user_id);
create or replace function public.limit_emergency_contacts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,2));
  if (select count(*) from public.emergency_contacts where user_id=new.user_id and id<>new.id)>=5 then
    raise exception 'You can save up to five emergency contacts.';
  end if;
  return new;
end $$;
drop trigger if exists emergency_contacts_limit on public.emergency_contacts;
create trigger emergency_contacts_limit before insert or update of user_id on public.emergency_contacts
for each row execute function public.limit_emergency_contacts();

-- Preserve the historical route, but remove the duplicate discontinued service
-- from all current role lists. No terminal or trip rows are removed.
alter table public.routes add column if not exists is_archived boolean not null default false;
update public.routes set is_archived=true where id='a1000000-0000-0000-0000-000000000001';
update public.routes set name='Route 2: Coming soon',operating_hours='Coming soon',is_coming_soon=true
where id='a2000000-0000-0000-0000-000000000002';

-- Bring recorded units into the shared roster without rewriting trip history.
insert into public.fleet_registry_units(body_number,plate_number,route_name)
select distinct on (lower(btrim(coalesce(nullif(v.body_number,''),v.plate_number))))
  coalesce(nullif(v.body_number,''),v.plate_number),v.plate_number,coalesce(r.name,'MRT Buendia - Mandaluyong City Hall')
from public.vehicles v left join public.routes r on r.id=v.route_id
where nullif(btrim(coalesce(nullif(v.body_number,''),v.plate_number)),'') is not null
  and not exists(select 1 from public.fleet_registry_units u where
    lower(btrim(u.body_number))=lower(btrim(coalesce(nullif(v.body_number,''),v.plate_number)))
    or (v.plate_number is not null and lower(btrim(u.plate_number))=lower(btrim(v.plate_number))))
order by lower(btrim(coalesce(nullif(v.body_number,''),v.plate_number))),v.created_at desc;

-- Drop every legacy policy for these known application tables; permissive
-- policies OR together, so leaving one old "true" policy bypasses the new rules.
do $$ declare p record; tab text;
begin
  for tab in select unnest(array['profiles','vehicles','vehicle_positions','routes','terminals','trips','ratings',
    'anomalies','announcements','weather_cache','emergency_contacts','sos_events','speed_events','trip_violations',
    'road_speed_limits','fare_history','fleet_registry_units','fleet_registry_drivers',
    'passenger_loading_zones','passenger_route_segments','passenger_walk_links','passenger_fare_matrices','passenger_sos_dispatches']) loop
    if to_regclass('public.'||tab) is null then continue; end if;
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from anon, authenticated',tab);
    for p in select policyname from pg_policies where schemaname='public' and tablename=tab loop
      execute format('drop policy %I on public.%I',p.policyname,tab);
    end loop;
  end loop;
end $$;

grant select on public.profiles to authenticated;
grant update(full_name) on public.profiles to authenticated;
create policy profiles_self_or_ops on public.profiles for select to authenticated
using(id=public.current_profile_id() or public.is_ejeephero_admin());
create policy profiles_name_self on public.profiles for update to authenticated
using(id=public.current_profile_id()) with check(id=public.current_profile_id());

grant select on public.routes,public.terminals,public.announcements,public.weather_cache,public.road_speed_limits,public.fare_history,
  public.passenger_loading_zones,public.passenger_route_segments,public.passenger_walk_links,public.passenger_fare_matrices to anon,authenticated;
create policy routes_reference on public.routes for select to anon,authenticated using(not is_archived);
create policy terminals_reference on public.terminals for select to anon,authenticated
using(exists(select 1 from public.routes r where r.id=route_id and not r.is_archived));
do $$ declare tab text;
begin
  for tab in select unnest(array['announcements','weather_cache','road_speed_limits','fare_history',
    'passenger_loading_zones','passenger_route_segments','passenger_walk_links','passenger_fare_matrices']) loop
    execute format('create policy reference_read on public.%I for select to anon,authenticated using(true)',tab);
  end loop;
end $$;

grant select,insert on public.vehicles to authenticated;
grant update(is_active,passenger_count,ended_at) on public.vehicles to authenticated;
create policy vehicles_read on public.vehicles for select to authenticated using(
  public.is_ejeephero_admin() or driver_id=public.current_profile_id() or (is_active and public.is_approved_esakay_user()));
create policy vehicles_driver_insert on public.vehicles for insert to authenticated with check(
  public.is_esakay_driver() and driver_id=public.current_profile_id() and exists(select 1 from public.routes r where r.id=route_id and not r.is_coming_soon));
create policy vehicles_driver_update on public.vehicles for update to authenticated
using(driver_id=public.current_profile_id() and public.is_esakay_driver())
with check(driver_id=public.current_profile_id() and public.is_esakay_driver());
create policy vehicles_ops_update on public.vehicles for update to authenticated using(public.is_ejeephero_admin()) with check(public.is_ejeephero_admin());

-- Serialize starts so two devices cannot claim the same driver or unit at once.
create or replace function public.guard_active_shift()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not coalesce(new.is_active,false) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.driver_id::text,3));
  perform pg_advisory_xact_lock(hashtextextended(upper(btrim(new.body_number)),4));
  if exists(select 1 from public.vehicles v where v.id<>new.id and v.is_active
    and (v.driver_id=new.driver_id or upper(btrim(v.body_number))=upper(btrim(new.body_number)))) then
    raise exception 'This driver or unit already has an active shift.';
  end if;
  if not exists(select 1 from public.fleet_registry_units u where u.deleted_at is null
    and upper(btrim(u.body_number))=upper(btrim(new.body_number))
    and upper(btrim(u.plate_number))=upper(btrim(new.plate_number))) then
    raise exception 'Choose an active registered unit.';
  end if;
  return new;
end $$;
drop trigger if exists vehicles_guard_active_shift on public.vehicles;
create trigger vehicles_guard_active_shift before insert or update of is_active on public.vehicles
for each row execute function public.guard_active_shift();

grant select,insert on public.vehicle_positions to authenticated;
create policy positions_read on public.vehicle_positions for select to authenticated using(
  public.is_ejeephero_admin() or exists(select 1 from public.vehicles v where v.id=vehicle_id and (
    v.driver_id=public.current_profile_id() or (v.is_active and timestamp>=now()-interval '2 minutes' and public.is_approved_esakay_user()))));
create policy positions_driver_insert on public.vehicle_positions for insert to authenticated with check(
  public.is_esakay_driver() and latitude between -90 and 90 and longitude between -180 and 180
  and speed between 0 and 130 and timestamp between now()-interval '30 seconds' and now()+interval '10 seconds'
  and exists(select 1 from public.vehicles v where v.id=vehicle_id and v.is_active and v.driver_id=public.current_profile_id()));

grant select on public.speed_events,public.trip_violations to authenticated;
grant update(status,notes) on public.trip_violations to authenticated;
create policy speed_own_or_ops on public.speed_events for select to authenticated
using(driver_id=public.current_profile_id() or public.is_ejeephero_admin());
create policy cuts_own_or_ops on public.trip_violations for select to authenticated
using(driver_id=public.current_profile_id() or public.is_ejeephero_admin());
create policy cuts_ops_review on public.trip_violations for update to authenticated
using(public.is_ejeephero_admin()) with check(public.is_ejeephero_admin());

grant select,insert,update on public.trips to authenticated;
create policy trips_owner on public.trips for all to authenticated using(passenger_id=public.current_profile_id()) with check(passenger_id=public.current_profile_id() and public.is_approved_esakay_user());
grant select,insert on public.ratings to authenticated;
create policy ratings_owner on public.ratings for select to authenticated using(passenger_id=public.current_profile_id() or driver_id=public.current_profile_id() or public.is_ejeephero_admin());
create policy ratings_insert on public.ratings for insert to authenticated with check(passenger_id=public.current_profile_id()
  and exists(select 1 from public.trips t where t.id=trip_id and t.passenger_id=public.current_profile_id() and t.status='completed'));
grant select,insert on public.anomalies to authenticated;
create policy anomalies_read on public.anomalies for select to authenticated using(public.is_ejeephero_admin() or exists(select 1 from public.vehicles v where v.id=vehicle_id and v.driver_id=public.current_profile_id()));
create policy anomalies_insert on public.anomalies for insert to authenticated with check(public.is_esakay_driver() and exists(select 1 from public.vehicles v where v.id=vehicle_id and v.driver_id=public.current_profile_id() and v.is_active));
grant select,insert on public.sos_events to authenticated;
create policy sos_owner_read on public.sos_events for select to authenticated using(user_id=public.current_profile_id() or public.is_ejeephero_admin());
create policy sos_owner_insert on public.sos_events for insert to authenticated with check(user_id=public.current_profile_id() and public.is_approved_esakay_user());

-- Contacts are also accessed by the existing verified edge service. Browser
-- access has the same ownership rule; no anonymous contact access is granted.
grant select,insert,update,delete on public.emergency_contacts to authenticated;
create policy contacts_owner on public.emergency_contacts for all to authenticated
using(user_id=public.current_profile_id()) with check(user_id=public.current_profile_id() and public.is_approved_esakay_user());
grant select,insert,update on public.fleet_registry_units,public.fleet_registry_drivers to authenticated;
create policy units_ops on public.fleet_registry_units for all to authenticated using(public.is_ejeephero_admin()) with check(public.is_ejeephero_admin());
create policy drivers_ops on public.fleet_registry_drivers for all to authenticated using(public.is_ejeephero_admin()) with check(public.is_ejeephero_admin());
create or replace function public.get_available_fleet_units()
returns table(body_number text,plate_number text) language sql stable security definer set search_path=public,pg_temp as $$
  select u.body_number,u.plate_number from public.fleet_registry_units u where u.deleted_at is null
    and public.is_approved_esakay_user() order by u.body_number
$$;
revoke all on function public.get_available_fleet_units() from public,anon;
grant execute on function public.get_available_fleet_units() to authenticated;
create or replace function public.driver_records_access_ready()
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$ select public.is_esakay_driver() $$;
revoke all on function public.driver_records_access_ready() from public,anon;
grant execute on function public.driver_records_access_ready() to authenticated;

create or replace function public.mark_manual_route_review()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status is distinct from old.status and new.status in ('confirmed','dismissed') then
    new.reviewed_at:=now(); new.reviewed_by:=public.current_profile_id(); new.auto_confirmed:=false;
  end if;
  return new;
end $$;

-- Trigger functions are never callable as exposed client RPCs.
do $$ declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prorettype in('trigger'::regtype,'event_trigger'::regtype) loop
    execute format('revoke execute on function %s from public,anon,authenticated',fn.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
