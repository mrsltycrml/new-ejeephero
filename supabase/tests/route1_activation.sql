-- Run in the isolated supervisor_catalog.mjs fixture.
begin;
create function pg_temp.r1_check(ok boolean, scenario text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Failed: %',scenario; end if;
end $$;
create function pg_temp.r1_reject(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlstate=expected then return; end if; raise; end;
  raise exception 'Expected % for %',expected,statement;
end $$;
create temp table pair as select
  '550e8400-e29b-41d4-a716-446655440000'::uuid as outbound,'550e8400-e29b-41d4-a716-446655440100'::uuid as inbound,
  gen_random_uuid() as supervisor,gen_random_uuid() as driver,gen_random_uuid() as request_id,
  '[{"latitude":14.55,"longitude":121.03},{"latitude":14.58,"longitude":121.04}]'::jsonb as forward_line,
  '[{"latitude":14.58,"longitude":121.04},{"latitude":14.56,"longitude":121.02}]'::jsonb as return_line,
  'https://example.invalid/route1'::text as source, null::uuid as a,null::uuid as b,null::uuid as c,
  null::timestamptz as activated,null::timestamptz as verified;
grant select,update on pair to authenticated;
insert into profiles(id,role,status,is_admin) select supervisor,'supervisor','approved',false from pair
union all select driver,'driver','approved',false from pair;
create function pg_temp.activate(variant text,expected text) returns void language sql as $$
  select public.supervisor_activate_route1(variant,expected,forward_line,return_line,source) from pair;
$$;
select pg_temp.r1_check(not exists(select from routes join pair on id=inbound)
  and exists(select from routes join pair on id=outbound where name='Existing Route 1' and route1_variant is null
    and geometry_verified_at is null and route1_activated_at is null),'migration activated or modified the pair');
select pg_temp.r1_check(not has_function_privilege('anon','supervisor_activate_route1(text,text,jsonb,jsonb,text)','EXECUTE')
  and not has_function_privilege('authenticated','catalog_save_stop_fields(uuid,uuid,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','catalog_publish_route_line(uuid,jsonb,text)','EXECUTE')
  and not has_function_privilege('authenticated','catalog_create_item_with_receipt(uuid,text,uuid,jsonb)','EXECUTE'),
  'exposed a privileged entry point');
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from pair;
set local role authenticated;
select pg_temp.r1_reject('select pg_temp.activate(''buendia_2022'',null)','42501');
select pg_temp.r1_reject('update routes set route1_variant=''buendia_2022''','42501');
select pg_temp.r1_reject('update terminals set passenger_use=''both''','42501');
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from pair;
select pg_temp.r1_reject('select pg_temp.activate(''unsupported'',null)','22023');
select pg_temp.r1_reject('select supervisor_activate_route1(''buendia_2022'',null,forward_line,return_line,''http://invalid'') from pair','22023');
select pg_temp.r1_reject('select supervisor_activate_route1(''buendia_2022'',null,forward_line,''[]'',source) from pair','22023');
select pg_temp.r1_check(not exists(select from routes join pair on id=inbound) and
  exists(select from routes join pair on id=outbound where route1_variant is null and geometry_verified_at is null),
  'invalid return geometry partially activated the pair');
update pair set a=supervisor_save_stop(outbound,null,'{"name":"Legacy pin","latitude":14.55,"longitude":121.03,
  "location_source_url":"https://example.invalid/pin","expected_route1_variant":null}');
select pg_temp.r1_reject('select supervisor_save_stop(outbound,a,''{"expected_route1_variant":null,"passenger_use":"board","passenger_use_source_url":"https://example.invalid/use"}'') from pair','22023');
reset role;
savepoint reserved_id;
insert into routes(id,name) select inbound,'Different service' from pair;
select pg_temp.r1_reject('select pg_temp.activate(''buendia_2022'',null)','40001');
rollback to reserved_id;
insert into passenger_fare_matrices(route_id,effective_from,source_url,verified_at,brackets)
select outbound,current_date,source,now() + interval '1 day','[]' from pair;
set local role authenticated;
select pg_temp.activate('buendia_2022',null);
select pg_temp.r1_check((select count(*) from routes where id in (outbound,inbound) and route1_variant='buendia_2022'
  and not is_archived and not is_coming_soon and geometry_verified_at is not null and geometry_source_url=source
  and case id when outbound then coordinates=forward_line and name='Route 1: MRT Buendia → Mandaluyong City Hall'
                     else coordinates=return_line and name='Route 1: Mandaluyong City Hall → MRT Buendia' end)=2,
  'directional names, state or verified geometry') from pair;
select pg_temp.r1_check(exists(select from terminals join pair on id=a where passenger_use is null and location_verified_at is null)
  and not exists(select from passenger_fare_matrices join pair on route_id=outbound), 'old pin or future-dated prior fare survived activation');
select pg_temp.r1_reject('select supervisor_save_stop(outbound,a,''{"name":"No variant"}'') from pair','40001');
select pg_temp.r1_reject('select supervisor_save_stop(outbound,a,''{"expected_route1_variant":"one_ayala_2026","name":"Stale"}'') from pair','40001');
select pg_temp.r1_reject('select supervisor_save_stop(outbound,a,''{"expected_route1_variant":"buendia_2022","passenger_use":"both","passenger_use_source_url":"https://example.invalid/use"}'') from pair','22023');
select supervisor_save_stop(outbound,a,'{"expected_route1_variant":"buendia_2022","location_source_url":"https://example.invalid/pin",
  "passenger_use":"board","passenger_use_source_url":"https://example.invalid/use"}') from pair;
select pg_temp.r1_reject('select supervisor_save_stop(outbound,a,''{"expected_route1_variant":"buendia_2022","passenger_use":"alight"}'') from pair','22023');
select pg_temp.r1_reject('select supervisor_save_stop(outbound,a,''{"expected_route1_variant":"buendia_2022","passenger_use":"alight","passenger_use_source_url":"http://example.invalid"}'') from pair','22023');
select pg_temp.r1_reject('select supervisor_save_stop(outbound,a,''{"expected_route1_variant":"buendia_2022","passenger_use_verified_at":"2020"}'') from pair','22023');
update pair set b=supervisor_save_stop(outbound,null,'{"expected_route1_variant":"buendia_2022","name":"Exit","latitude":14.58,"longitude":121.04,
  "location_source_url":"https://example.invalid/pin","passenger_use":"alight","passenger_use_source_url":"https://example.invalid/use"}');
update pair set c=supervisor_create_catalog_item(request_id,'stop',inbound,'{"expected_route1_variant":"buendia_2022","name":"Return",
  "latitude":14.58,"longitude":121.04,"location_source_url":"https://example.invalid/pin","passenger_use":"both","passenger_use_source_url":"https://example.invalid/use"}');
select pg_temp.r1_check((select count(*) from terminals where route_id in (outbound,inbound)
  and passenger_use=case id when a then 'board' when b then 'alight' when c then 'both' end
  and passenger_use_verified_at is not null and passenger_use_source_url='https://example.invalid/use')=3, 'directional passenger attestations') from pair;
update pair p set activated=r.route1_activated_at, verified=r.geometry_verified_at from routes r where r.id=p.outbound;
select pg_temp.activate('buendia_2022',null);
select pg_temp.r1_check(activated=route1_activated_at and verified=geometry_verified_at
  and exists(select from terminals where id=a and passenger_use='board'),'exact replay refreshed or revoked evidence') from pair join routes on id=outbound;
select pg_temp.r1_reject('select supervisor_activate_route1(''buendia_2022'',null,return_line,forward_line,source) from pair','40001');
select pg_temp.r1_reject('select publish_esakay_route_line(outbound,forward_line,source) from pair','22023');
select supervisor_save_stop(outbound,a,'{"expected_route1_variant":"buendia_2022","passenger_use":null,"passenger_use_source_url":"https://example.invalid/withdrawal"}') from pair;
select pg_temp.r1_check(passenger_use is null and passenger_use_source_url is null and passenger_use_verified_at is null,
  'explicit revocation left evidence') from terminals join pair on id=a;
select supervisor_save_stop(outbound,a,'{"expected_route1_variant":"buendia_2022","passenger_use":"both","passenger_use_source_url":"https://example.invalid/use"}') from pair;
reset role;
-- A table writer with a non-supervisor identity still cannot mint or withdraw attestations.
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from pair;
select pg_temp.r1_reject('update terminals set passenger_use=''alight'' where id=(select a from pair)','42501');
select pg_temp.r1_reject('update terminals set passenger_use=null where id=(select a from pair)','42501');
select pg_temp.r1_reject('update routes set geometry_verified_at=clock_timestamp() where id=(select outbound from pair)','42501');
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from pair;
-- Simulate a trusted legacy import that moves a pin and knows nothing about passenger_use.
update terminals set latitude=14.551 where id=(select a from pair);
select pg_temp.r1_check(passenger_use is null and passenger_use_verified_at is null and passenger_use_source_url is null and location_verified_at is null,
  'legacy move carried permission to a different curb') from terminals join pair on id=a;
update passenger_fare_matrices set verified_at=clock_timestamp() where route_id=(select outbound from pair);
insert into passenger_route_segments(route_id,from_stop_id,to_stop_id,distance_meters,source_url,verified_at)
select outbound,a,b,1200,source,clock_timestamp() from pair;
set local role authenticated;
select pg_temp.r1_check(not exists(select from passenger_route_segments join pair on route_id=outbound),'unverified moved pin exposed its segment');
select supervisor_save_stop(outbound,a,'{"expected_route1_variant":"buendia_2022","location_source_url":"https://example.invalid/resurvey"}') from pair;
reset role;
insert into vehicles(driver_id,route_id,is_active,body_number,plate_number)
select driver,inbound,true,'Catalog test unit','CAT-001' from pair;
set local role authenticated;
select pg_temp.activate('buendia_2022',null);
select pg_temp.r1_reject('select pg_temp.activate(''one_ayala_2026'',''buendia_2022'')','55000');
select pg_temp.r1_check(exists(select from passenger_route_segments join pair on route_id=outbound)
  and exists(select from passenger_fare_matrices join pair on route_id=outbound)
  and exists(select from terminals join pair on id=c where passenger_use='both'), 'current evidence hidden or shift block changed it');
reset role;
update vehicles set is_active=false where route_id=(select inbound from pair);
set local role authenticated;
select pg_temp.activate('one_ayala_2026','buendia_2022');
select pg_temp.r1_check((select count(*) from routes where id in (outbound,inbound) and route1_variant='one_ayala_2026'
  and name like '%One Ayala%' and base_fare is null and fare_source_url is null and base_distance_km is null)=2
  and not exists(select from terminals where route_id in (outbound,inbound) and (location_verified_at is not null or location_source_url is not null
    or passenger_use is not null or passenger_use_verified_at is not null or passenger_use_source_url is not null))
  and not exists(select from passenger_route_segments where route_id=outbound)
  and not exists(select from passenger_fare_matrices where route_id=outbound),'switch leaked old evidence') from pair;
select pg_temp.r1_reject('select supervisor_create_catalog_item(request_id,''stop'',inbound,''{"expected_route1_variant":"buendia_2022"}'') from pair','40001');
select pg_temp.activate('buendia_2022','one_ayala_2026');
select pg_temp.r1_check(not exists(select from passenger_fare_matrices join pair on route_id=outbound)
  and not exists(select from passenger_route_segments join pair on route_id=outbound), 'switching back revived an earlier fare or segment');
reset role;
select pg_temp.r1_check(exists(select from vehicles join pair on route_id=inbound where not is_active and ended_at is not null)
  and exists(select from passenger_fare_matrices join pair on route_id=outbound)
  and exists(select from passenger_route_segments join pair on route_id=outbound), 'activation destroyed historical rows');
rollback;
