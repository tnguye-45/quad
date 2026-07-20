-- quad — length limits on gig/hangout text + payout cap (fixes H6)
--
-- Voices and comments were bounded from day one (0005: 4–400, 0019: 1–500)
-- but gigs and hangouts shipped with unbounded text columns — a 1 MB title is
-- a feed-wide DoS since every client downloads it on first paint. payout_cents
-- had no upper bound either (an 11-digit payout also overflows the client's
-- rendering).
--
-- All constraints are NOT VALID: they bind every NEW row immediately but skip
-- scanning existing rows, so this cannot brick a live database that already
-- contains seeded rows. After running against the live project, validate with:
--
--   alter table public.gigs     validate constraint gigs_title_len;
--   alter table public.gigs     validate constraint gigs_description_len;
--   alter table public.gigs     validate constraint gigs_location_len;
--   alter table public.gigs     validate constraint gigs_payout_max;
--   alter table public.hangouts validate constraint hangouts_title_len;
--   alter table public.hangouts validate constraint hangouts_vibe_len;
--   alter table public.hangouts validate constraint hangouts_location_len;
--   alter table public.hangouts validate constraint hangouts_when_len;
--   alter table public.hangouts validate constraint hangouts_description_len;
--
-- (a validate failure means a live row is out of bounds — trim it, re-run.)
-- Client inputs should mirror these as maxLength; see CLIENT_CONTRACT.md.

alter table public.gigs
  add constraint gigs_title_len
  check (char_length(title) between 3 and 120) not valid;

alter table public.gigs
  add constraint gigs_description_len
  check (description is null or char_length(description) <= 2000) not valid;

alter table public.gigs
  add constraint gigs_location_len
  check (location_label is null or char_length(location_label) <= 140) not valid;

-- $10,000 ceiling; campus gigs above this are typos or scams.
alter table public.gigs
  add constraint gigs_payout_max
  check (payout_cents <= 1000000) not valid;

alter table public.hangouts
  add constraint hangouts_title_len
  check (char_length(title) between 3 and 120) not valid;

alter table public.hangouts
  add constraint hangouts_vibe_len
  check (vibe is null or char_length(vibe) <= 60) not valid;

alter table public.hangouts
  add constraint hangouts_location_len
  check (location_label is null or char_length(location_label) <= 140) not valid;

alter table public.hangouts
  add constraint hangouts_when_len
  check (when_label is null or char_length(when_label) <= 80) not valid;

alter table public.hangouts
  add constraint hangouts_description_len
  check (description is null or char_length(description) <= 2000) not valid;
