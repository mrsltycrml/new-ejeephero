-- Hide retired roster entries without deleting identities or operational history.
alter table public.profiles add column if not exists supervisor_hidden boolean not null default false;
