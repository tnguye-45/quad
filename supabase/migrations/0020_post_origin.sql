-- quad — seeded-vs-organic tagging
-- The launch metric is "organic gigs claimed/day by a non-friend". Without a
-- way to tell seed posts from real ones, that number is unmeasurable forever.
-- Everything the app writes gets 'organic' via the default; seeding scripts
-- must set origin = 'seeded' explicitly.
--
-- Comments get the column too: seeded voices will carry seeded comments to
-- look alive, and untagged ones would contaminate any organic-engagement count.

alter table public.gigs
  add column origin text not null default 'organic'
  check (origin in ('organic', 'seeded'));

alter table public.hangouts
  add column origin text not null default 'organic'
  check (origin in ('organic', 'seeded'));

alter table public.voices
  add column origin text not null default 'organic'
  check (origin in ('organic', 'seeded'));

alter table public.comments
  add column origin text not null default 'organic'
  check (origin in ('organic', 'seeded'));

-- No indexes: analyst queries are offline/ad-hoc and the tables are tiny at
-- the scale where this matters.
