-- Disposable fixture in supervisor_catalog.mjs. No live credentials required.
begin;
create function pg_temp.expect(ok boolean, scenario text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Failed: %', scenario; end if;
end $$;
create function pg_temp.reject(statement text, expected_state text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE % for %', expected_state, statement;
end $$;
create temp table probe (
  legacy uuid default '00000000-0000-4000-8000-000000000101', route uuid, a uuid, b uuid, c uuid,
  supervisor uuid default gen_random_uuid(), driver uuid default gen_random_uuid(), vehicle uuid default gen_random_uuid()
);
insert into probe default values;
insert into profiles(id,role,status,is_admin) select supervisor,'supervisor','approved',false from probe
union all select driver,'driver','approved',false from probe;
grant all on probe to authenticated;

select pg_temp.expect(array_agg(sequence_order order by sequence_order) = array[0,4], 'installation rewrote legacy order')
from terminals where route_id = (select legacy from probe);
select pg_temp.expect(base_distance_km = 4, 'legacy fare base distance lost') from routes where id=(select legacy from probe);
select pg_temp.expect(not has_function_privilege('anon',signature,'execute'), 'anon can execute ' || signature)
from unnest(array['supervisor_save_route(uuid,jsonb)','supervisor_save_stop(uuid,uuid,jsonb)',
  'supervisor_retire_route(uuid)','supervisor_retire_stop(uuid)']) f(signature);
select pg_temp.expect(not has_function_privilege('authenticated','catalog_order_stops(uuid,uuid,integer)','execute'),
  'ordering helper exposed');
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from probe;
set local role authenticated;
select pg_temp.reject('select supervisor_save_route(null,''{"name":"denied"}'')','42501');
select pg_temp.reject('select supervisor_save_stop(null,null,''{}'')','42501');
select pg_temp.reject('select supervisor_retire_route(null)','42501');
select pg_temp.reject('select supervisor_retire_stop(null)','42501');
select pg_temp.reject('update terminals set sequence_order=1','42501');

reset role;
update profiles set status='suspended' where id=(select supervisor from probe);
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from probe;
set local role authenticated;
select pg_temp.reject('select supervisor_retire_route(legacy) from probe','42501');
reset role;
update profiles set status='approved' where id=(select supervisor from probe);
set local role authenticated;
update probe set route = supervisor_save_route(null,'{"name":"New service","color_code":"#123ABC"}');
select pg_temp.expect(r.name = 'New service' and r.base_fare is null and r.per_km_rate is null and r.base_distance_km is null and
  r.fare_source_url is null and r.fare_effective_date is null and r.operating_hours = '' and r.geometry_verified_at is null,
  'new route inherited fare, timetable or geometry evidence') from routes r join probe on r.id=probe.route;
select supervisor_save_route(route,'{"description":"Eastbound","operating_hours":"06:00–18:00"}') from probe;
select pg_temp.expect(name = 'New service' and color_code = '#123ABC' and operating_hours = '06:00–18:00',
  'route patch discarded other fields') from routes join probe on id=route;
select pg_temp.reject('select supervisor_save_route(null,''{"name":"  "}'')','22023');
select pg_temp.reject('select supervisor_save_route(null,''{"name":"A","is_coming_soon":"false"}'')','22023');
select pg_temp.reject('select supervisor_save_route(legacy,''{"is_archived":true}'') from probe','22023');
select pg_temp.reject('select supervisor_save_stop(route,null,''{"name":"No evidence","latitude":14,"longitude":121}'') from probe','22023');
select pg_temp.reject('select supervisor_save_stop(route,null,''{"name":"Bad pin","latitude":91,"longitude":121,"location_source_url":"https://example.invalid"}'') from probe','22023');
select pg_temp.reject('select supervisor_save_stop(route,null,''{"name":"Bad source","latitude":14,"longitude":121,"location_source_url":"https://"}'') from probe','22023');

update probe set a = supervisor_save_stop(route,null,
  '{"name":"Alpha","latitude":14,"longitude":121,"location_source_url":"https://example.invalid/pins","landmark_desc":"Beside the library","boarding_side":"East","stop_details_source_url":"https://example.invalid/curb"}');
update probe set c = supervisor_save_stop(route,null,
  '{"name":"Charlie","latitude":14.02,"longitude":121,"location_source_url":"https://example.invalid/pins"}');
update probe set b = supervisor_save_stop(route,null,
  '{"name":"Bravo","latitude":14.01,"longitude":121,"sequence_order":2,"location_source_url":"https://example.invalid/pins"}');
select pg_temp.expect(array_agg(t.id order by t.sequence_order) = array[p.a,p.b,p.c], 'insertion between stops')
from probe p join terminals t on t.route_id=p.route group by p.a,p.b,p.c;
select pg_temp.expect(location_verified_at is not null and stop_details_verified_at is not null and landmark_desc='Beside the library' and not is_well_lit
  and not cctv_monitored and regular_fare is null and disabled_fare is null, 'verification and unsupported defaults')
from terminals join probe on id=a;
select pg_temp.reject('select supervisor_save_stop(legacy,a,''{"name":"wrong route"}'') from probe','22023');
select pg_temp.reject('select supervisor_save_stop(route,b,''{"sequence_order":4}'') from probe','22023');
select pg_temp.reject('select supervisor_save_stop(route,b,''{"sequence_order":0}'') from probe','22023');
select pg_temp.reject('select supervisor_save_stop(route,a,''{"latitude":15}'') from probe','22023');
select pg_temp.reject('select supervisor_save_stop(route,a,''{"location_verified_at":"2020-01-01"}'') from probe','22023');
select pg_temp.reject('select supervisor_save_stop(route,a,''{"boarding_side":"West"}'') from probe','22023');
select pg_temp.reject('select supervisor_save_stop(route,a,''{"landmark_desc":"Beside the exit"}'') from probe','22023');
select supervisor_save_stop(route,a,'{"landmark_desc":"Beside the library entrance","stop_details_source_url":"https://example.invalid/entrance"}') from probe;
select pg_temp.expect(landmark_desc='Beside the library entrance' and stop_details_source_url='https://example.invalid/entrance'
  and stop_details_verified_at is not null, 'sourced landmark edit lost') from terminals join probe on id=a;
select supervisor_save_stop(legacy,t.id,'{"sequence_order":1}') from probe join terminals t on t.route_id=legacy and t.name='Last';
select pg_temp.expect(array_agg(name order by sequence_order) = array['Last','First'] and
  array_agg(sequence_order order by sequence_order) = array[1,2], 'zero-based, sparse legacy reorder')
from terminals join probe on route_id=legacy;

reset role;
insert into passenger_route_segments(route_id,from_stop_id,to_stop_id,distance_meters,source_url,verified_at)
select route,a,b,1000,'https://example.invalid/road',now() from probe;
insert into passenger_walk_links(from_stop_id,to_stop_id,distance_meters,duration_seconds,source_url,verified_at)
select a,b,300,240,'https://example.invalid/walk',now() from probe;
insert into passenger_fare_matrices(route_id,effective_from,source_url,verified_at,brackets)
select route,current_date,'https://example.invalid/matrix',now(),'[]' from probe;
set local role authenticated;
select pg_temp.expect(exists(select from passenger_route_segments) and exists(select from passenger_walk_links), 'valid evidence hidden');
select supervisor_save_stop(route,b,'{"sequence_order":1}') from probe;
select pg_temp.expect(not exists(select from passenger_route_segments) and exists(select from passenger_walk_links), 'reversed ride edge still in fare graph');
select supervisor_save_stop(route,b,'{"sequence_order":2}') from probe;
select supervisor_save_stop(route,a,'{"latitude":14.001,"location_source_url":"https://example.invalid/resurvey"}') from probe;
select pg_temp.expect(not exists(select from passenger_route_segments) and not exists(select from passenger_walk_links),
  'old distances survived moved endpoint');
select pg_temp.expect(stop_details_verified_at is null and boarding_side is null and landmark_desc is null,
  'moved stop retained old details') from terminals join probe on id=a;
select supervisor_save_stop(route,a,'{"latitude":14.002,"location_source_url":"https://example.invalid/new-pin",
  "landmark_desc":"Courthouse entrance","stop_details_source_url":"https://example.invalid/courthouse"}') from probe;
select pg_temp.expect(landmark_desc='Courthouse entrance' and stop_details_source_url='https://example.invalid/courthouse'
  and stop_details_verified_at is not null, 'explicit landmark verification on move lost') from terminals join probe on id=a;
select supervisor_save_stop(route,a,'{"latitude":14.003,"location_source_url":"https://example.invalid/other-pin",
  "boarding_side":"North","stop_details_source_url":"https://example.invalid/north-side"}') from probe;
select pg_temp.expect(landmark_desc is null and boarding_side='North','unrelated detail edit reverified old landmark') from terminals join probe on id=a;
reset role;
update passenger_route_segments set verified_at=clock_timestamp();
update passenger_walk_links set verified_at=clock_timestamp();
set local role authenticated;
select pg_temp.expect(exists(select from passenger_route_segments) and exists(select from passenger_walk_links), 'reverified distances hidden');
select supervisor_retire_stop(b) from probe;
select supervisor_retire_stop(b) from probe;
select pg_temp.expect(not exists(select from passenger_route_segments) and not exists(select from passenger_walk_links)
  and not exists(select from terminals join probe on id=b), 'retired stop or its edges still visible');
select pg_temp.expect(array_agg(t.id order by t.sequence_order) = array[p.a,p.c] and max(t.sequence_order)=2, 'retirement resequencing')
from probe p join terminals t on t.route_id=p.route group by p.a,p.c;
select pg_temp.reject('select supervisor_save_stop(route,b,''{"name":"revive"}'') from probe','22023');
reset role;
select pg_temp.expect(not is_active and sequence_order=2, 'archived stop lost its historic position') from terminals join probe on id=b;
select pg_temp.expect(exists(select from passenger_route_segments) and exists(select from passenger_walk_links), 'edge history deleted');

-- Exercise the real end-shift trigger, including an inactive, unverified stop with the final active order.
update routes set geometry_verified_at=now()-interval '1 day', geometry_source_url='https://example.invalid/line',
  coordinates='[{"latitude":14.003,"longitude":121},{"latitude":14.02,"longitude":121}]',
  catalog_changed_at=now()-interval '1 day' where id=(select route from probe);
update terminals set location_verified_at=case when is_active then now()-interval '1 day' end where route_id=(select route from probe);
insert into terminals(route_id,name,latitude,longitude,sequence_order,is_sample,deleted_at)
select route,'Sample',14,121,1,true,null::timestamptz from probe
union all select route,'Previously deleted',14,121,2,false,now() from probe;
insert into vehicles(id,driver_id,route_id,is_active,created_at,body_number,plate_number)
select vehicle,driver,route,true,now()-interval '10 minutes','Catalog test unit','CAT-001' from probe;
insert into vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp,captured_at,accuracy)
select vehicle,14.003+n*0.001,121,15,now()-interval '5 minutes'+n*interval '15 seconds',now()-interval '5 minutes'+n*interval '15 seconds',5
from probe,generate_series(0,1) n;
update vehicles set is_active=false where id=(select vehicle from probe);
select pg_temp.expect(count(*)=1,'retired unverified stop suppressed or contaminated missed-stop review')
from trip_violations v join probe p on v.vehicle_id=p.vehicle where v.final_terminal_id=p.c and v.missed_stops=array['Charlie']
  and v.status='pending_review' and not v.auto_confirmed;
insert into vehicles(driver_id,route_id,is_active,created_at,body_number,plate_number)
select driver,route,true,now()-interval '5 minutes','Catalog test unit','CAT-001' from probe;
insert into vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp,captured_at,accuracy)
select v.id,14.003+n*0.001,121,15,now()-interval '4 minutes'+n*interval '15 seconds',now()-interval '4 minutes'+n*interval '15 seconds',5
from probe join vehicles v on v.driver_id=probe.driver and v.is_active cross join generate_series(0,1) n;
select supervisor_save_stop(route,c,'{"sequence_order":1}') from probe;
update vehicles set is_active=false where is_active;
select pg_temp.expect(count(*)=1,'mid-shift reordering retroactively generated a penalty') from trip_violations;

set local role authenticated;
-- Exercise the driver's actual RLS and fleet guard with a cached route ID.
create function pg_temp.start_shift() returns uuid language sql as $$
  insert into public.vehicles(driver_id,route_id,is_active,body_number,plate_number)
  select driver,route,true,'Catalog test unit','CAT-001' from probe returning id;
$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from probe;
update probe set vehicle=pg_temp.start_shift();
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from probe;
select supervisor_save_route(route,'{"is_coming_soon":true}') from probe;
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from probe;
update vehicles set passenger_count=1 where id=(select vehicle from probe);
update vehicles set is_active=false where id=(select vehicle from probe);
select pg_temp.expect(exists(select from vehicles join probe on id=vehicle where not is_active and ended_at is not null and passenger_count=1),
  'coming-soon route interrupted its existing shift');
select pg_temp.reject('select pg_temp.start_shift()','23514');
select pg_temp.reject('update vehicles set is_active=true where id=(select vehicle from probe)','23514');

select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from probe;
select supervisor_save_route(route,'{"is_coming_soon":false}') from probe;
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from probe;
update probe set vehicle=pg_temp.start_shift();
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from probe;
select supervisor_retire_route(route) from probe;
select supervisor_retire_route(route) from probe;
select pg_temp.expect(not exists(select from routes join probe on id=route) and not exists(select from terminals join probe on route_id=route)
  and not exists(select from passenger_fare_matrices), 'retired route still visible');
select pg_temp.reject('select supervisor_save_route(route,''{"name":"revive"}'') from probe','22023');
select pg_temp.reject('select supervisor_save_stop(route,c,''{"name":"revive"}'') from probe','22023');
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from probe;
update vehicles set passenger_count=2 where id=(select vehicle from probe);
update vehicles set is_active=false where id=(select vehicle from probe);
select pg_temp.expect(exists(select from vehicles join probe on id=vehicle where not is_active and ended_at is not null and passenger_count=2),
  'retired route interrupted its existing shift');
select pg_temp.reject('select pg_temp.start_shift()','23514');
select pg_temp.reject('update vehicles set is_active=true where id=(select vehicle from probe)','23514');
reset role;
select pg_temp.expect(exists(select from vehicles v join routes r on r.id=v.route_id and r.is_archived)
  and exists(select from trip_violations v join terminals t on t.id=v.final_terminal_id)
  and exists(select from passenger_fare_matrices), 'retirement lost trip or fare history');
rollback;
