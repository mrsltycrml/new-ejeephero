-- The old single-contact constraint is gone; upsert needs this composite key.
create unique index if not exists emergency_contacts_user_phone_idx
on public.emergency_contacts(user_id,phone_number);

-- A bounded, per-user chatbot budget. Only the trusted chat function can claim.
create table if not exists public.chat_request_limits (
  user_id uuid not null references public.profiles(id),
  minute_bucket timestamptz not null,
  request_count integer not null default 1,
  primary key(user_id,minute_bucket)
);
alter table public.chat_request_limits enable row level security;
revoke all on public.chat_request_limits from public,anon,authenticated;
create or replace function public.claim_chat_request(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare requests integer;
begin
  insert into public.chat_request_limits(user_id,minute_bucket)
  values(p_user_id,date_trunc('minute',now()))
  on conflict(user_id,minute_bucket) do update set request_count=chat_request_limits.request_count+1
  returning request_count into requests;
  return requests<=12;
end $$;
revoke all on function public.claim_chat_request(uuid) from public,anon,authenticated;
grant execute on function public.claim_chat_request(uuid) to service_role;
