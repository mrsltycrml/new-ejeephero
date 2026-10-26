-- Read-only release assertions against the private pre-migration snapshot.
do $$
declare item record; old_count bigint; current_count bigint; missing_count bigint;
begin
  for item in select tablename from pg_tables where schemaname='esakay_backup_20261027' and tablename not in ('policies','functions') loop
    execute format('select count(*) from esakay_backup_20261027.%I',item.tablename) into old_count;
    execute format('select count(*) from public.%I',item.tablename) into current_count;
    if current_count < old_count then raise exception 'Row loss in %: % -> %',item.tablename,old_count,current_count; end if;
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name=item.tablename and column_name='id') then
      execute format('select count(*) from esakay_backup_20261027.%I b where not exists(select 1 from public.%I p where p.id=b.id)',item.tablename,item.tablename) into missing_count;
      if missing_count > 0 then raise exception 'Missing original identities in %',item.tablename; end if;
    end if;
  end loop;
  if exists(select 1 from pg_tables where schemaname='public' and not rowsecurity) then raise exception 'Public table without RLS'; end if;
  if has_table_privilege('anon','public.profiles','SELECT') or has_table_privilege('anon','public.vehicles','SELECT') then raise exception 'Anonymous private-data privilege'; end if;
  if exists(select 1 from esakay_backup_20261027.profiles b join public.profiles p on b.id=p.id where b.role is distinct from p.role or b.is_admin is distinct from p.is_admin) then raise exception 'Existing role changed'; end if;
end $$;
select 'PASS: all original row identities and counts preserved, existing roles unchanged, public RLS enabled, anonymous private data denied' as result,
  (select count(*) from public.vehicles v left join public.profiles p on v.driver_id=p.id where p.id is null) as preserved_unmatched_historical_driver_ids,
  (select count(*) from supabase_migrations.schema_migrations where version >= '20261026170000') as feature_migrations_applied;
