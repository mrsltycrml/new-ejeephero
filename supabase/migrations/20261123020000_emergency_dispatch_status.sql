-- Only the Edge function may query or finish a claimed dispatch. The claim RPC still owns inserts.
revoke all on table public.passenger_sos_dispatches from public, anon, authenticated, service_role;
grant select (request_id, user_id, status, accepted_count, recipient_count)
  on table public.passenger_sos_dispatches to service_role;
grant update (status, accepted_count)
  on table public.passenger_sos_dispatches to service_role;
