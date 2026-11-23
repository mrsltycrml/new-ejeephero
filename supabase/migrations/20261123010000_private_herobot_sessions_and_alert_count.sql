set local lock_timeout = '5s';

create table public.herobot_botpress_sessions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  user_key text not null,
  conversation_id text not null
);
alter table public.herobot_botpress_sessions enable row level security;
revoke all on public.herobot_botpress_sessions from public, anon, authenticated, service_role;
grant select, insert on public.herobot_botpress_sessions to service_role;

-- Keys previously readable through profiles must not be reused. New chat
-- sessions are created on demand. Revoke the old keys with the provider separately.
alter table public.profiles
  drop column if exists botpress_user_key,
  drop column if exists botpress_conversation_id;

create index if not exists speed_events_alert_time_idx on public.speed_events(created_at);
create index if not exists trip_violations_alert_time_idx on public.trip_violations(created_at);

create function public.get_recent_admin_violation_count() returns bigint
language plpgsql stable security invoker set search_path = pg_catalog, pg_temp as $$
declare
  cutoff constant timestamptz := now() - interval '24 hours';
begin
  if public.is_ejeephero_admin() is not true then
    raise exception 'Approved supervisor access required.' using errcode = '42501';
  end if;
  return (select count(*) from public.speed_events e
    where e.created_at >= cutoff and (to_jsonb(e)->>'is_sample') is distinct from 'true')
    + (select count(*) from public.trip_violations v
    where v.created_at >= cutoff and v.status is distinct from 'dismissed'
      and (to_jsonb(v)->>'is_sample') is distinct from 'true');
end $$;
revoke all on function public.get_recent_admin_violation_count() from public, anon;
grant execute on function public.get_recent_admin_violation_count() to authenticated;

notify pgrst, 'reload schema';
