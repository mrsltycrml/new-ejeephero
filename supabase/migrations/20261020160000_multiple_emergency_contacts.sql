-- Keep existing emergency contact rows while allowing multiple recipients per user.
alter table public.emergency_contacts
  drop constraint if exists emergency_contacts_user_id_key;

create unique index if not exists emergency_contacts_user_phone_key
  on public.emergency_contacts(user_id, phone_number);
