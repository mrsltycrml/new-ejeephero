-- Disposable database in supervisor_catalog.mjs, with the production shift and Route 2 triggers installed.
begin;
create temp table controls as select supervisor, gen_random_uuid() as driver, gen_random_uuid() as passenger,
  gen_random_uuid() as suspended, gen_random_uuid() as shift, gen_random_uuid() as ended, gen_random_uuid() as other_shift,
  '00000000-0000-4000-8000-000000000601'::uuid as previously_hidden,
  'a2000000-0000-0000-0000-000000000002'::uuid as route2 from retry_probe;
grant select on controls to authenticated;
select pg_temp.expect(exists(select from public.profiles p, controls c where p.id=c.previously_hidden and p.supervisor_hidden),
  'install reset a previously hidden driver');
insert into public.profiles(id,role,status,is_admin)
  select driver,'driver','approved',false from controls union all
  select passenger,'passenger','approved',false from controls union all
  select suspended,'supervisor','suspended',true from controls;
insert into public.routes(id,name) select route2,'Route 2' from controls;
insert into public.vehicles(id,driver_id,route_id,body_number,plate_number,is_active,passenger_count,ended_at)
  select ended,driver,route2,'Catalog test unit','CAT-001',false,4,now()-interval '20 days' from controls;
insert into public.vehicle_positions(vehicle_id,latitude,longitude,timestamp)
  select ended,14.5,121,now()-interval '21 days' from controls;
insert into public.vehicles(id,driver_id,route_id,body_number,plate_number,is_active,passenger_count)
  select shift,driver,route2,'Catalog test unit','CAT-001',true,5 from controls;
insert into public.fleet_registry_units(body_number,plate_number) values ('Other test unit','CAT-002');
insert into public.vehicles(id,driver_id,route_id,body_number,plate_number,is_active,passenger_count)
  select other_shift,previously_hidden,route2,'Other test unit','CAT-002',true,3 from controls;
insert into public.route_deviation_events(vehicle_id,driver_id,route_id,route_name,unit_label,
  geometry_verified_at,captured_at,distance_meters,accuracy_meters)
  select shift,driver,route2,'Route 2','Catalog test unit',now(),now(),200,5 from controls;
-- An existing shift must still be endable when its route is subsequently taken out of service.
update public.routes set is_coming_soon=true where id=(select route2 from controls);

select pg_temp.expect(has_function_privilege('authenticated',signature,'execute')
  and not has_function_privilege('anon',signature,'execute')
  and not has_function_privilege('service_role',signature,'execute')
  and not exists (select from pg_proc p, lateral aclexplode(p.proacl) a
    where p.oid=signature::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),
  'unexpected EXECUTE privilege on ' || signature)
from unnest(array['public.set_driver_hidden(uuid,boolean)','public.admin_force_end_shift(uuid)']) f(signature);

set local role authenticated;
do $$
declare caller uuid;
begin
  for caller in select id from controls, lateral unnest(array[driver,passenger,suspended,gen_random_uuid()]) u(id) loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',caller)::text,true);
    perform pg_temp.reject('select public.set_driver_hidden(driver,true) from controls','42501');
    perform pg_temp.reject('select public.admin_force_end_shift(shift) from controls','42501');
  end loop;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from controls;
select pg_temp.reject('select public.set_driver_hidden(driver,true) from controls','23514','active shift');
select public.set_driver_hidden(target_id=>passenger, hidden=>true) from controls;
select public.admin_force_end_shift(target_vehicle_id=>shift) from controls;
select public.admin_force_end_shift(target_vehicle_id=>shift) from controls;
select public.admin_force_end_shift(target_vehicle_id=>ended) from controls;
select public.set_driver_hidden(target_id=>driver, hidden=>true) from controls;
reset role;
select pg_temp.expect(exists(select from public.vehicles v, controls c where v.id=c.shift
  and not v.is_active and v.passenger_count=0 and v.ended_at=now()),'force-end did not close the active shift');
select pg_temp.expect(exists(select from public.vehicles v, controls c where v.id=c.other_shift
  and v.is_active and v.passenger_count=3 and v.ended_at is null),'force-end changed another active shift');
select pg_temp.expect(exists(select from public.route_deviation_events e, controls c where e.vehicle_id=c.shift
  and e.closed_at is not null),'force-end bypassed the route warning closure trigger');
select pg_temp.expect(exists(select from public.vehicles v, controls c where v.id=c.ended
  and not v.is_active and v.passenger_count=4 and v.ended_at=now()-interval '20 days')
  and exists(select from public.vehicle_positions p, controls c where p.vehicle_id=c.ended),
  'historical shift or telemetry changed');
select pg_temp.expect(exists(select from public.profiles p, controls c where p.id=c.driver and p.supervisor_hidden
  and p.role='driver' and p.status='approved' and not p.is_admin)
  and exists(select from public.profiles p, controls c where p.id=c.passenger and not p.supervisor_hidden),
  'hide modified identity, missed the driver, or hid a non-driver');

set local role authenticated;
select public.set_driver_hidden(target_id=>driver, hidden=>false) from controls;
select pg_temp.reject('select public.supervisor_save_route(null,''{"name":"Route 2: Replacement"}'')','23505','reserved');
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from controls;
select pg_temp.reject('update public.vehicles set is_active=true where id=(select shift from controls)','23514');
reset role;
select pg_temp.expect(exists(select from public.profiles p, controls c where p.id=c.driver and not p.supervisor_hidden),
  'restore did not make the driver visible');
select pg_temp.expect(exists(select from public.routes r, controls c where r.id=c.route2 and r.is_coming_soon and not r.is_archived),
  'Route 2 service state changed');
rollback;
