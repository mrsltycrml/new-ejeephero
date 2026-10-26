-- Optional, source-attributed waiting-area photos for verified loading bays.
-- No stock/AI images or guessed stop locations are seeded.
alter table public.passenger_loading_zones
  add column if not exists photo_url text check (photo_url is null or photo_url ~ '^https://'),
  add column if not exists photo_source_url text check (photo_source_url is null or photo_source_url ~ '^https://'),
  add column if not exists photo_caption text,
  add column if not exists boarding_instructions text;
