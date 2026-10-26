import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Explicitly reconcile the deployed legacy schema. Never blindly replay old
// seed files. Imported filenames are explicitly baselined only by the guarded
// history reconciliation migration after the verified release is installed.
const root = path.resolve(import.meta.dirname, '..');
const migrations = [
  '20261026170000_supervisor_route_and_speed_monitoring.sql',
  '20261027100000_operator_reported_service_plan.sql',
  '20261027110000_admin_fleet_registry.sql',
  '20261027120000_driver_safety_records_read.sql',
  '20261027130000_passenger_safety_and_fares.sql',
  '20261027140000_loading_stop_photos.sql',
  '20261027150000_secure_clerk_data_access.sql',
  '20261027160000_contact_integrity_and_chat_limits.sql',
  '20261027170000_reconcile_imported_history.sql',
];
const backup = `
begin;
set local lock_timeout='10s';
do $$ begin
  if exists(select 1 from public.profiles where concat(full_name,' ',email) ~* 'juana[ _-]*beauty')
  then raise exception 'Tenant guard failed. Stop this release.'; end if;
end $$;
create schema if not exists esakay_backup_20261027;
revoke all on schema esakay_backup_20261027 from public,anon,authenticated;
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('create table if not exists esakay_backup_20261027.%I as table public.%I',t.tablename,t.tablename);
  end loop;
end $$;
create table if not exists esakay_backup_20261027.policies as select * from pg_policies where schemaname='public';
create table if not exists esakay_backup_20261027.functions as
select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
revoke all on all tables in schema esakay_backup_20261027 from public,anon,authenticated;
-- This helper was absent from the deployed legacy baseline. The final
-- security migration replaces it with the Clerk-aware implementation.
create or replace function public.is_ejeephero_admin() returns boolean
language sql stable security definer set search_path=public,pg_temp as
$$ select coalesce((select is_admin from public.profiles where id=auth.uid() and status='approved'),false) $$;
-- Legacy deployed schema used a different name for review-pending cuts.
alter table public.trip_violations drop constraint if exists trip_violations_status_check;
alter table public.trip_violations add constraint trip_violations_status_check check(status in('flagged','pending_review','confirmed','dismissed'));
alter table public.trip_violations alter column latitude drop not null;
alter table public.trip_violations alter column longitude drop not null;
alter table public.trip_violations alter column latitude drop default;
alter table public.trip_violations alter column longitude drop default;
`;
let sql = backup;
for (const file of migrations) {
  const source = fs.readFileSync(path.join(root,'supabase','migrations',file),'utf8');
  const version = file.slice(0,14);
  const name = file.slice(15,-4);
  const hash = crypto.createHash('sha256').update(source).digest('hex');
  sql += `\n-- ${file} sha256:${hash}\n${source}\n`;
  sql += `insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array['Applied by reviewed eSAKAY release; sha256:${hash}']) on conflict(version) do nothing;\n`;
}
sql += '\ncommit;\nselect \'eSAKAY migrations committed\' as result;\n';
fs.mkdirSync(path.join(root,'.release'),{recursive:true});
fs.writeFileSync(path.join(root,'.release','database-release.sql'),sql);
console.log(`Prepared ${migrations.length} reviewed migrations in one transaction with private database snapshots.`);
