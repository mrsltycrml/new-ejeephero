-- Isolated fixture. Use the committed supervisor and assertion functions from the idempotency suite.
begin;
insert into public.routes(id,name,is_coming_soon)
values ('a2000000-0000-0000-0000-000000000002','Route 2: Coming soon',true);
select pg_temp.expect(exists(select from pg_index where indexrelid='public.routes_current_name_key'::regclass
  and indisunique and indisvalid and indimmediate),'missing immediate unique index for competing name claims');
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from retry_probe;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',second_supervisor)::text,true) from retry_probe;
select pg_temp.reject('select supervisor_create_catalog_item(route_request,''route'',null,route_data) from retry_probe','23505');
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from retry_probe;
select supervisor_save_route(null,'{"name":"River Road"}');
select pg_temp.reject('select supervisor_save_route(null,jsonb_build_object(''name'',E'' \tRIVER\nROAD\r ''))','23505');
select pg_temp.reject('select supervisor_save_route(null,jsonb_build_object(''name'',U&''River\00A0\202FRoad''))','23505');
select pg_temp.reject('select supervisor_save_route(null,jsonb_build_object(''name'',E''\t\n''))','22023');
select pg_temp.reject('select supervisor_save_route(route,''{"name":" river   ROAD "}'') from retry_probe','23505');
select pg_temp.expect(exists(select from public.routes join retry_probe on id=route where name='Retry fixture'),
  'rejected edit changed the original');
select supervisor_save_route(route,'{"name":"Renamed fixture"}') from retry_probe;
select pg_temp.expect(supervisor_create_catalog_item(route_request,'route',null,route_data)=route,
  'committed create replay lost its UUID after a rename') from retry_probe;
select supervisor_save_route(id,'{"name":"River  ROAD","description":"Updated"}') from public.routes where name='River Road';
select pg_temp.expect(exists(select from public.routes where name='River  ROAD' and description='Updated'),'self edit or display spelling lost');
select supervisor_retire_route(id) from public.routes where name='River  ROAD';
select supervisor_save_route(null,'{"name":"River Road"}');
select pg_temp.reject('select supervisor_save_route(null,''{"name":"route 2"}'')','23505','reserved');
select pg_temp.reject('select supervisor_create_catalog_item(gen_random_uuid(),''route'',null,''{"name":" ROUTE2: City Hall"}'')','23505','reserved');
select pg_temp.reject('select supervisor_save_route(route,''{"name":"Route 2—Return"}'') from retry_probe','23505','reserved');
select supervisor_save_route(null,'{"name":"Route 20: East"}');
select supervisor_save_route(null,'{"name":"Route 2A"}');
select supervisor_save_route('a2000000-0000-0000-0000-000000000002','{"name":"Route 2: North → South","is_coming_soon":false}');
select supervisor_save_route(null,'{"name":"Route 2: South → North"}');
select pg_temp.reject('select supervisor_save_route(null,''{"name":"Route 2: SOUTH → NORTH"}'')','23505');
select supervisor_save_route('a2000000-0000-0000-0000-000000000002','{"is_coming_soon":true}');
select supervisor_retire_route('a2000000-0000-0000-0000-000000000002');
select supervisor_save_route(null,'{"name":"Route 2: Coming soon"}');
select pg_temp.reject('select supervisor_save_route(null,''{"name":"Route 1: MRT Buendia - Mandaluyong City Hall"}'')','23505');
select pg_temp.reject('select supervisor_save_route(null,''{"name":"Route 1: One Ayala → Mandaluyong City Hall"}'')','23505');
select pg_temp.reject('select supervisor_save_route(null,''{"name":"Route 1: Mandaluyong City Hall → MRT Buendia"}'')','23505');
reset role;
select pg_temp.expect((select count(*) from public.routes where public.catalog_route_name_key(name)='river road')=2
  and exists(select from public.routes where is_archived and name='River  ROAD'),'archived route identity lost');
rollback;

-- Keep the same approved identity for the harness's two independently submitted requests.
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,false) from retry_probe;
set role authenticated;
