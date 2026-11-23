-- Run only inside the disposable supervisor_catalog.mjs database.
begin;
create temp table compliance as select gen_random_uuid() as route, gen_random_uuid() as driver,
  (select supervisor from retry_probe limit 1) as supervisor;
create temp table runs as select scenario, gen_random_uuid() as shift, now()-interval '45 minutes' as started
  from unnest(array['repeat','stationary','gap','uncertain','force_end','speed']) as scenario;
grant select on compliance, runs to authenticated;
insert into profiles(id,role,status,is_admin) select driver,'driver','approved',false from compliance;
insert into routes(id,name,geometry_verified_at,geometry_source_url,coordinates)
  select route,'Measured test direction',now()-interval '1 day','https://example.invalid/line',
    '[{"latitude":14.55,"longitude":121.03},{"latitude":14.55,"longitude":121.05}]' from compliance;
insert into terminals(route_id,name,latitude,longitude,sequence_order,location_verified_at,location_source_url)
  select route, stop.name, 14.55, 121.03 + (stop.idx-1)*0.01, stop.idx, now()-interval '1 day','https://example.invalid/pin'
  from compliance, unnest(array['Origin','Middle','Destination']) with ordinality as stop(name,idx);

insert into vehicles(id,driver_id,route_id,is_active,created_at,body_number,plate_number)
  select shift,driver,route,true,started,'Catalog test unit','CAT-001' from runs,compliance where scenario='repeat';
with samples as (
  select i*15 as seconds, 14.55 as lat, 121.03+i*0.0005 as lng from generate_series(0,40) i
  union all select 600+i*15,14.55,121.05-i*0.0005 from generate_series(1,40) i
  union all select base+i*15,14.55+least(i,20-i)*0.0005,121.03
    from unnest(array[1200,1500]) base, generate_series(1,20) i
)
insert into vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp,captured_at,accuracy)
  select shift,lat,lng,15,started+seconds*interval '1 second',started+seconds*interval '1 second',5
  from runs,samples where scenario='repeat' order by seconds;
select set_config('request.jwt.claims',jsonb_build_object('sub',driver)::text,true) from compliance;
set local role authenticated;
update vehicles set is_active=false where id=(select shift from runs where scenario='repeat');
reset role;
select pg_temp.expect(count(*)=2 and bool_and(status='confirmed' and auto_confirmed and missed_stops=array['Middle','Destination']),
  'a full run masked a later return to origin, or deadheading counted as a trip')
  from trip_violations where vehicle_id=(select shift from runs where scenario='repeat');

insert into vehicles(id,driver_id,route_id,is_active,created_at,body_number,plate_number)
  select shift,driver,route,true,started,'Catalog test unit','CAT-001' from runs,compliance where scenario='stationary';
insert into vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp,captured_at,accuracy)
  select shift,14.55,121.03,0,now()-i*interval '15 seconds',now()-i*interval '15 seconds',5
  from runs,generate_series(0,20) i where scenario='stationary';
update vehicles set is_active=false where id=(select shift from runs where scenario='stationary');
select pg_temp.expect(not exists(select 1 from trip_violations where vehicle_id=(select shift from runs where scenario='stationary')),
  'a stationary shift was assessed as a departed trip');

insert into vehicles(id,driver_id,route_id,is_active,created_at,body_number,plate_number)
  select shift,driver,route,true,started,'Catalog test unit','CAT-001' from runs,compliance where scenario='gap';
insert into vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp,captured_at,accuracy)
  select shift,14.55+least(i,20-i)*0.0005,121.03,15,
    started+(i*15+case when i>=10 then 90 else 0 end)*interval '1 second',
    started+(i*15+case when i>=10 then 90 else 0 end)*interval '1 second',5
  from runs,generate_series(0,20) i where scenario='gap';
update vehicles set is_active=false where id=(select shift from runs where scenario='gap');
select pg_temp.expect(count(*)=1 and bool_and(status='pending_review' and not auto_confirmed),
  'a gap in a return trip was auto-confirmed')
  from trip_violations where vehicle_id=(select shift from runs where scenario='gap');

insert into vehicles(id,driver_id,route_id,is_active,created_at,body_number,plate_number)
  select shift,driver,route,true,started,'Catalog test unit','CAT-001' from runs,compliance where scenario='uncertain';
insert into vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp,captured_at,accuracy)
  select shift,case when i in (0,40) then 14.55 else 14.551 end,121.03+i*0.0005,15,
    started+i*interval '15 seconds',started+i*interval '15 seconds',5
  from runs,generate_series(0,40) i where scenario='uncertain';
update vehicles set is_active=false where id=(select shift from runs where scenario='uncertain');
select pg_temp.expect(count(*)=1 and bool_and(status='pending_review' and missed_stops=array['Middle']),
  'passing close to an unobserved stop was treated as proof it was skipped')
  from trip_violations where vehicle_id=(select shift from runs where scenario='uncertain');

insert into vehicles(id,driver_id,route_id,is_active,created_at,body_number,plate_number)
  select shift,driver,route,true,started,'Catalog test unit','CAT-001' from runs,compliance where scenario='force_end';
insert into vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp,captured_at,accuracy)
  select shift,14.55+i*0.0005,121.03,15,now()-(20-i)*interval '15 seconds',now()-(20-i)*interval '15 seconds',5
  from runs,generate_series(0,20) i where scenario='force_end';
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from compliance;
set local role authenticated;
select public.admin_force_end_shift(shift) from runs where scenario='force_end';
select public.admin_force_end_shift(shift) from runs where scenario='force_end';
reset role;
select pg_temp.expect(count(*)=1 and bool_and(status='pending_review' and not auto_confirmed),
  'ending a still-open trip bypassed review or duplicated a flag')
  from trip_violations where vehicle_id=(select shift from runs where scenario='force_end');

insert into vehicles(id,driver_id,route_id,is_active,created_at,body_number,plate_number)
  select shift,driver,route,true,started,'Catalog test unit','CAT-001' from runs,compliance where scenario='speed';
insert into vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp,captured_at,accuracy)
  select shift,14.55,121.03,26,now()-interval '20 seconds',null,null from runs where scenario='speed';
insert into vehicle_positions(vehicle_id,latitude,longitude,speed,timestamp,captured_at,accuracy)
  select shift,14.55+i*0.0001,121.03,24+i,now()-(2-i)*interval '5 seconds',now()-(2-i)*interval '5 seconds',5
  from runs,generate_series(0,2) i where scenario='speed' order by i;
select pg_temp.expect(count(*)=1 and bool_and(speed_kph=25 and limit_kph=20 and policy_type='operator_cap'),
  'measured speed event did not preserve the cap, consecutive reading rule, or cooldown')
  from speed_events where vehicle_id=(select shift from runs where scenario='speed');
rollback;
