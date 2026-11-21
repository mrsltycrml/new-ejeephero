-- Exercise the signed-in driver's normal upload path on one already-open shift.
begin;
create temp table position_probe as select supervisor, gen_random_uuid() as driver, gen_random_uuid() as route,
  gen_random_uuid() as shift from retry_probe;
grant select on position_probe to authenticated;
insert into public.profiles(id,role,status,is_admin) select driver,'driver','approved',false from position_probe;
insert into public.routes(id,name) select route,'Position upload test' from position_probe;

create function pg_temp.upload_position(measured boolean) returns void language sql security invoker as $$
  insert into public.vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp,captured_at,accuracy)
  select shift,14.55,121.03,0,now(),case when measured then now() end,case when measured then 5 end
  from position_probe;
$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from position_probe;
set local role authenticated;
insert into public.vehicles(id,driver_id,route_id,is_active,body_number,plate_number)
select shift,driver,route,true,'Catalog test unit','CAT-001' from position_probe;
select pg_temp.upload_position(true);

select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from position_probe;
select public.supervisor_save_route(route,'{"is_coming_soon":true}') from position_probe;
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from position_probe;
select pg_temp.reject('select pg_temp.upload_position(true)','42501');
select pg_temp.reject('select pg_temp.upload_position(false)','42501');

select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from position_probe;
select public.supervisor_save_route(route,'{"is_coming_soon":false}') from position_probe;
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from position_probe;
select pg_temp.upload_position(false);
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from position_probe;
select public.supervisor_retire_route(route) from position_probe;
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from position_probe;
select pg_temp.reject('select pg_temp.upload_position(true)','42501');
update public.vehicles set is_active=false where id=(select shift from position_probe);

select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from position_probe;
select pg_temp.expect(count(*)=2 and count(captured_at)=1,'supervisor cannot read exactly the two accepted positions')
from public.vehicle_positions where vehicle_id=(select shift from position_probe);
select pg_temp.expect(exists(select from public.vehicles where id=(select shift from position_probe)
  and not is_active and ended_at is not null),'driver could not end the retired-route shift');
rollback;
