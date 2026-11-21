-- Match the UI's lowercase, trim and whitespace collapse, including pasted nonbreaking spaces.
create function public.catalog_route_name_key(route_name text) returns text
language sql immutable strict parallel safe set search_path = pg_catalog, pg_temp as $$
  select lower(btrim(regexp_replace(route_name,
    U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g')));
$$;
revoke all on function public.catalog_route_name_key(text) from public, anon, authenticated;

-- PostgreSQL arbitrates simultaneous inserts and renames, including across supervisors.
create unique index routes_current_name_key on public.routes(public.catalog_route_name_key(name))
  where not is_archived;

create function public.guard_catalog_route_name() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  name_key text := public.catalog_route_name_key(new.name);
  route2_id constant uuid := 'a2000000-0000-0000-0000-000000000002';
  route2_reserved boolean;
begin
  if tg_op='UPDATE' and not old.is_archived and name_key=public.catalog_route_name_key(old.name) then
    return new;
  end if;
  if name_key='' then raise exception 'Supply a route name.' using errcode='22023'; end if;
  if (new.id <> '550e8400-e29b-41d4-a716-446655440000' and name_key in
      ('route 1: mrt buendia - mandaluyong city hall','route 1: mrt buendia → mandaluyong city hall',
       'route 1: one ayala → mandaluyong city hall'))
    or (new.id <> '550e8400-e29b-41d4-a716-446655440100' and name_key in
      ('route 1: mandaluyong city hall → mrt buendia','route 1: mandaluyong city hall → one ayala')) then
    raise exception 'This direction belongs to Route 1. Open Route 1 review.' using errcode='23505';
  end if;
  if new.id <> route2_id and name_key ~ '^route ?2($|[ :()–—→-])' then
    select r.is_coming_soon and not r.is_archived into route2_reserved from public.routes r where r.id=route2_id for share;
    if route2_reserved then
      raise exception 'Route 2 is reserved. Open the existing coming-soon route.' using errcode='23505';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_catalog_route_name() from public, anon, authenticated;
create trigger routes_guard_catalog_name before insert or update of name,is_archived on public.routes
  for each row when (not new.is_archived) execute function public.guard_catalog_route_name();
