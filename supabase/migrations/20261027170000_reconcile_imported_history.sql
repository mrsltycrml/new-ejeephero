-- Baseline the imported legacy files against this already-running project.
-- These files predate the verified hardening release and must not be replayed:
-- several contain superseded policies or seed updates. This records coverage,
-- not a claim that the old SQL was executed under these local filenames.
do $$
begin
  if to_regclass('esakay_backup_20261027.profiles') is null
    or to_regprocedure('public.bootstrap_clerk_profile(text,text)') is null
    or not exists(select 1 from supabase_migrations.schema_migrations where version='20261027160000') then
    raise exception 'Imported history baseline requires the verified existing eSAKAY release and backup';
  end if;
end $$;
insert into supabase_migrations.schema_migrations(version,name,statements)
select version,'baseline_covered_by_20261027150000',array['-- Imported legacy migration covered by verified existing schema; intentionally not replayed.']
from unnest(array['20260601000000','20260602000000','20260603000000','20261020130000','20261020150000','20261020160000','20261025190000','20261025200000','20261025230000','20261026160000']) as version
on conflict(version) do nothing;
