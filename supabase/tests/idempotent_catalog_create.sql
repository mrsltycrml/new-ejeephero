-- Disposable database only. Commit the original creates before replaying their RPC requests.
begin;
create temp table retry_probe as select gen_random_uuid() as supervisor, gen_random_uuid() as second_supervisor,
  gen_random_uuid() as route_request, gen_random_uuid() as stop_request, gen_random_uuid() as failed_request,
  null::uuid as route, null::uuid as stop, null::uuid as second_route,
  '{"name":"Retry fixture","is_coming_soon":true}'::jsonb as route_data,
  '{"name":"Bay","latitude":14.00,"longitude":121,"location_source_url":"https://example.invalid/bay"}'::jsonb as stop_data;
insert into public.profiles(id,role,status,is_admin)
  select supervisor,'supervisor','approved',false from retry_probe union all
  select second_supervisor,'admin','approved',true from retry_probe;
grant select, update on retry_probe to authenticated;
create function pg_temp.expect(ok boolean, scenario text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Failed: %', scenario; end if;
end $$;
create function pg_temp.reject(statement text, expected_state text, message_fragment text default '') returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state and strpos(sqlerrm,message_fragment) > 0 then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE % for %', expected_state, statement;
end $$;
select pg_temp.expect(not has_function_privilege('anon','public.supervisor_create_catalog_item(uuid,text,uuid,jsonb)','execute'),
  'anonymous callers can execute create');
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from retry_probe;
set local role authenticated;
select pg_temp.reject('select * from public.supervisor_catalog_create_requests','42501');
select pg_temp.reject('insert into public.supervisor_catalog_create_requests default values','42501');
update retry_probe set route=public.supervisor_create_catalog_item(route_request,'route',null,route_data);
update retry_probe set stop=public.supervisor_create_catalog_item(stop_request,'stop',route,stop_data);
commit;

begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from retry_probe;
set local role authenticated;
select pg_temp.expect(public.supervisor_create_catalog_item(route_request,'route',null,'{"is_coming_soon":true,"name":"Retry fixture"}')=route,
  'route replay returned another UUID') from retry_probe;
select pg_temp.expect(public.supervisor_create_catalog_item(stop_request,'stop',route,stop_data || '{"latitude":14}')=stop,
  'stop replay returned another UUID') from retry_probe;
select pg_temp.reject('select public.supervisor_create_catalog_item(route_request,''route'',null,route_data || ''{"name":"Different"}'') from retry_probe',
  '22023','Use a new request ID');
select pg_temp.reject('select public.supervisor_create_catalog_item(stop_request,''stop'',gen_random_uuid(),stop_data) from retry_probe',
  '22023','Use a new request ID');
select pg_temp.reject('select public.supervisor_create_catalog_item(route_request,''stop'',route,stop_data) from retry_probe',
  '22023','Use a new request ID');
select pg_temp.reject('select public.supervisor_create_catalog_item(null,''route'',null,route_data) from retry_probe','22023');
select pg_temp.reject('select public.supervisor_create_catalog_item(failed_request,''stop'',null,stop_data) from retry_probe','22023');
select pg_temp.reject('select public.supervisor_create_catalog_item(failed_request,''route'',route,route_data) from retry_probe','22023');
select pg_temp.reject('select public.supervisor_create_catalog_item(failed_request,''stop'',route,stop_data - ''location_source_url'') from retry_probe',
  '22023','location source');
select pg_temp.expect((select count(*) from public.routes where name='Retry fixture')=1
  and (select count(*) from public.terminals where route_id=p.route)=1, 'retry duplicated a catalog row') from retry_probe p;
reset role;
select pg_temp.expect((select count(*) from public.supervisor_catalog_create_requests where owner_id=p.supervisor)=2,
  'rejected request created a receipt') from retry_probe p;

-- The same owner and key are authorized again on every replay.
update public.profiles set status='suspended' where id=(select supervisor from retry_probe);
set local role authenticated;
select pg_temp.reject('select public.supervisor_create_catalog_item(route_request,''route'',null,route_data) from retry_probe','42501');
select set_config('request.jwt.claims',jsonb_build_object('sub',second_supervisor)::text,true) from retry_probe;
update retry_probe set second_route=public.supervisor_create_catalog_item(route_request,'route',null,route_data || '{"name":"Second supervisor route"}');
select pg_temp.expect(second_route <> route,'request ID collided across supervisors') from retry_probe;
reset role;
update public.profiles set status='approved' where id=(select supervisor from retry_probe);
select set_config('request.jwt.claims',jsonb_build_object('sub',supervisor)::text,true) from retry_probe;
set local role authenticated;
savepoint before_create;
select public.supervisor_create_catalog_item(failed_request,'route',null,'{"name":"Rolled back"}') from retry_probe;
rollback to before_create;
select public.supervisor_create_catalog_item(failed_request,'route',null,'{"name":"Corrected"}') from retry_probe;
select pg_temp.expect(not exists(select from public.routes where name='Rolled back')
  and (select count(*) from public.routes where name='Corrected')=1, 'rollback retained the create or reserved its key');
select public.supervisor_retire_route(route) from retry_probe;
select pg_temp.expect(public.supervisor_create_catalog_item(stop_request,'stop',route,stop_data)=stop,
  'lost-response replay failed after route retirement') from retry_probe;
rollback;
