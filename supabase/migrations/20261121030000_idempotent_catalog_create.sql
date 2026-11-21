-- Use one request UUID per intended create. A retry uses the same kind, route and fields.
create table public.supervisor_catalog_create_requests (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  kind text not null check (kind in ('route','stop')),
  payload_hash bytea not null,
  item_id uuid not null,
  primary key (owner_id, request_id)
);
alter table public.supervisor_catalog_create_requests enable row level security;
revoke all on public.supervisor_catalog_create_requests from public, anon, authenticated;

create function public.supervisor_create_catalog_item(p_request_id uuid, p_kind text, p_route_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  supervisor_id uuid := public.current_profile_id();
  fingerprint bytea;
  previous public.supervisor_catalog_create_requests%rowtype;
  created_id uuid;
begin
  perform public.require_catalog_supervisor();
  if p_request_id is null then raise exception 'Supply a request UUID.' using errcode = '22023'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Supply the catalog fields as an object.' using errcode = '22023';
  end if;

  -- Accepted fields are scalars. JSONB orders keys; trim numeric scale so 14 and 14.00 replay alike.
  select sha256(convert_to(jsonb_build_array(p_route_id, jsonb_object_agg(key,
    case when jsonb_typeof(value) = 'number' then to_jsonb(trim_scale(value::numeric)) else value end))::text, 'UTF8'))
  into fingerprint from jsonb_each(p_data);

  perform pg_advisory_xact_lock(hashtextextended('catalog-create:' || supervisor_id::text || ':' || p_request_id::text, 0));
  select * into previous from public.supervisor_catalog_create_requests
    where owner_id = supervisor_id and request_id = p_request_id;
  if found then
    if previous.kind is distinct from p_kind or previous.payload_hash <> fingerprint then
      raise exception 'This request already created an item with different fields, route, or kind. Use a new request ID for a new item.'
        using errcode = '22023';
    end if;
    return previous.item_id;
  end if;

  if p_kind = 'route' and p_route_id is null then
    created_id := public.supervisor_save_route(null, p_data);
  elsif p_kind = 'stop' and p_route_id is not null then
    created_id := public.supervisor_save_stop(p_route_id, null, p_data);
  else
    raise exception 'Use kind route with a null route ID, or kind stop with its parent route ID.' using errcode = '22023';
  end if;
  insert into public.supervisor_catalog_create_requests(owner_id,request_id,kind,payload_hash,item_id)
    values (supervisor_id,p_request_id,p_kind,fingerprint,created_id);
  return created_id;
end $$;

revoke all on function public.supervisor_create_catalog_item(uuid,text,uuid,jsonb) from public, anon;
grant execute on function public.supervisor_create_catalog_item(uuid,text,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
