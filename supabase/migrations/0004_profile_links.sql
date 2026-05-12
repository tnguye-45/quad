-- quad — Phase 1.5: profile links
-- Add `links` jsonb column for personal/social URLs. Stored as an array of
-- { label: string, url: string } objects. Validated at the app layer for v1.

alter table public.profiles
  add column if not exists links jsonb not null default '[]'::jsonb;

-- Optional sanity check: ensure the value is always a JSON array.
alter table public.profiles
  drop constraint if exists profiles_links_is_array;
alter table public.profiles
  add constraint profiles_links_is_array
  check (jsonb_typeof(links) = 'array');
