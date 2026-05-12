-- quad — Phase 2: align schema with app conventions
--
-- - Adds `anonymous` to gigs and hangouts so posts can hide author identity
--   from the public feed while still being attributed to the user for "Your
--   posts" history.
-- - Adds `when_label` to hangouts and relaxes `starts_at` to nullable. The app
--   currently stores a free-form "Tonight · 8:00 PM" string rather than a real
--   timestamp; this column captures that.
-- - Expands the gigs category check to match the UI's enum (title-case).

-- ─────────────────────── gigs ───────────────────────
alter table public.gigs
  add column if not exists anonymous boolean not null default false;

-- Replace the lowercase category constraint with the app's title-case enum.
alter table public.gigs
  drop constraint if exists gigs_category_check;
alter table public.gigs
  add constraint gigs_category_check
  check (category in ('Tutoring', 'Moving', 'Rideshare', 'Pets', 'Creative', 'Errands'));

-- Relax description to allow empty string. The app validates min length
-- client-side and we want to be lenient about exact whitespace.
alter table public.gigs
  alter column description drop not null;

-- ─────────────────────── hangouts ───────────────────────
alter table public.hangouts
  add column if not exists anonymous boolean not null default false;

alter table public.hangouts
  add column if not exists when_label text;

-- Make starts_at optional so posts that only carry a "when_label" string can
-- still be inserted. The app picks a date later if needed.
alter table public.hangouts
  alter column starts_at drop not null;
