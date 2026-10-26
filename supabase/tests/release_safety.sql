-- Execute as postgres. All fixtures and side effects are rolled back.
begin;
create temporary table release_probe(profile_id uuid,vehicle_id uuid);
insert into release_probe values(gen_random_uuid(),gen_random_uuid());
insert into public.profiles(id,email,full_name,role,status,is_approved,is_admin)
select profile_id,'release-probe@example.invalid','Release transaction probe','driver','approved',true,false from release_probe;
grant select on release_probe to authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',profile_id,'role','authenticated','iss','https://neifadvftploburrtfmb.supabase.co/auth/v1')::text,true) from release_probe;
set local role authenticated;
insert into public.vehicles(id,driver_id,route_id,body_number,plate_number,is_active)
select p.vehicle_id,p.profile_id,'550e8400-e29b-41d4-a716-446655440000',u.body_number,u.plate_number,true
from release_probe p cross join lateral(select body_number,plate_number from public.get_available_fleet_units() limit 1) u;
insert into public.vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp)
select vehicle_id,14.56,121.03,24,now()-interval '10 seconds' from release_probe;
insert into public.vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp)
select vehicle_id,14.5601,121.0301,25,now() from release_probe;
do $$ begin
  if (select count(*) from public.speed_events where vehicle_id=(select vehicle_id from release_probe))<>1 then
    raise exception 'Expected one deduplicated speed event from two consecutive readings';
  end if;
  if not exists(select 1 from public.speed_events where vehicle_id=(select vehicle_id from release_probe)
    and limit_kph=20 and speed_limit_kph=20 and body_number is not null and plate_number is not null) then
    raise exception 'Speed event lost its configured cap or unit identity';
  end if;
end $$;
update public.vehicles set is_active=false,ended_at=now() where id=(select vehicle_id from release_probe);
do $$ begin
  if exists(select 1 from public.trip_violations where vehicle_id=(select vehicle_id from release_probe)) then
    raise exception 'Provisional geometry must not generate trip-cutting accusations';
  end if;
end $$;
reset role;
insert into public.trip_violations(driver_id,vehicle_id,route_id,reason,status)
select profile_id,vehicle_id,'550e8400-e29b-41d4-a716-446655440000','Release transaction probe','confirmed' from release_probe;
insert into public.trip_violations(driver_id,vehicle_id,route_id,reason,status)
select profile_id,vehicle_id,'550e8400-e29b-41d4-a716-446655440000','Release transaction probe','confirmed' from release_probe;
do $$ begin
  if (select status from public.profiles where id=(select profile_id from release_probe))<>'approved' then
    raise exception 'Driver was suspended before the third confirmed cut';
  end if;
end $$;
insert into public.trip_violations(driver_id,vehicle_id,route_id,reason,status)
select profile_id,vehicle_id,'550e8400-e29b-41d4-a716-446655440000','Release transaction probe','confirmed' from release_probe;
do $$ begin
  if not exists(select 1 from public.profiles where id=(select profile_id from release_probe) and status='suspended' and not is_approved) then
    raise exception 'Third confirmed cut must suspend the driver';
  end if;
end $$;
insert into public.emergency_contacts(user_id,contact_name,phone_number)
select p.profile_id,'Release transaction probe','+63900000000'||n::text from release_probe p cross join generate_series(1,5) n;
do $$ begin
  begin
    insert into public.emergency_contacts(user_id,contact_name,phone_number)
    select profile_id,'Release transaction probe','+639000000006' from release_probe;
    raise exception 'The sixth emergency contact was unexpectedly accepted' using errcode='23514';
  exception when raise_exception then
    if sqlerrm not like '%five emergency contacts%' then raise; end if;
  end;
end $$;
rollback;
select 'PASS: speed detection, preserved unit identity, provisional-route guard, third-cut suspension, five-contact limit; all fixtures rolled back' as result;
