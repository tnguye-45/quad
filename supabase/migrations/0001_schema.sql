-- quad — Phase 1 schema
-- Tables, FKs, indexes, CHECK constraints. RLS in 0002, triggers in 0003.

create extension if not exists "pgcrypto";

-- profiles ─ one row per auth.users, created via trigger on sign-up
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  initials        text,
  year            smallint check (year between 1 and 8),
  major           text,
  dorm            text,
  avatar_url      text,
  bio             text,
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- gigs ─ student-posted work requests
create table public.gigs (
  id              uuid primary key default gen_random_uuid(),
  poster_id       uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  description     text not null,
  category        text not null check (category in ('tutoring','moving','rides','dogs','errands','other')),
  payout_cents    integer not null check (payout_cents > 0),
  location_label  text,
  lat             double precision,
  lon             double precision,
  posted_at       timestamptz not null default now(),
  status          text not null default 'open' check (status in ('open','accepted','done','cancelled')),
  accepted_by     uuid references public.profiles(id) on delete set null,
  deadline_at     timestamptz
);

create index gigs_status_posted_at_idx on public.gigs (status, posted_at desc);
create index gigs_poster_id_idx        on public.gigs (poster_id);
create index gigs_category_idx         on public.gigs (category) where status = 'open';

-- hangouts ─ student-hosted casual gatherings
create table public.hangouts (
  id              uuid primary key default gen_random_uuid(),
  host_id         uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  vibe            text,
  location_label  text,
  lat             double precision,
  lon             double precision,
  starts_at       timestamptz not null,
  max_people      smallint not null default 20 check (max_people between 2 and 50),
  description     text,
  created_at      timestamptz not null default now()
);

create index hangouts_starts_at_idx on public.hangouts (starts_at);
create index hangouts_host_id_idx   on public.hangouts (host_id);

-- hangout_attendees ─ RSVPs
create table public.hangout_attendees (
  hangout_id      uuid not null references public.hangouts(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (hangout_id, user_id)
);

create index hangout_attendees_user_id_idx on public.hangout_attendees (user_id);

-- conversations ─ 1:1 (gig) or group (hangout) threads
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  gig_id          uuid references public.gigs(id) on delete cascade,
  hangout_id      uuid references public.hangouts(id) on delete cascade,
  created_at      timestamptz not null default now(),
  check ((gig_id is null) <> (hangout_id is null))  -- exactly one source
);

create index conversations_gig_id_idx     on public.conversations (gig_id);
create index conversations_hangout_id_idx on public.conversations (hangout_id);

-- conversation_members ─ who can read which conversation
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_id_idx on public.conversation_members (user_id);

-- messages ─ chat content
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null check (length(body) > 0 and length(body) <= 4000),
  sent_at         timestamptz not null default now()
);

create index messages_conversation_id_sent_at_idx on public.messages (conversation_id, sent_at desc);

-- reports ─ trust & safety
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  target_user_id  uuid references public.profiles(id) on delete set null,
  target_kind     text not null check (target_kind in ('user','gig','hangout','message')),
  target_id       uuid not null,
  reason          text,
  created_at      timestamptz not null default now()
);

create index reports_target_idx on public.reports (target_kind, target_id);
