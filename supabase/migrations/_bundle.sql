-- ═══════════════════════════════════════════════════════════════════════════
-- quad — GENERATED migration bundle. DO NOT EDIT BY HAND.
-- Regenerate with: node supabase/scripts/generate-bundle.mjs
-- Contains, in order: 0001, 0002, 0003, 0004, 0005, 0006, 0007, 0008, 0009, 0010, 0011, 0012, 0013, 0014, 0015, 0016, 0017, 0018, 0019, 0020, 0021, 0022, 0023, 0024, 0025, 0026, 0027, 0028, 0029, 0030, 0031, 0032, 0033, 0034, 0035, 0036, 0037
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════ 0001_schema.sql ═══════════════

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

-- ═══════════════ 0002_rls.sql ═══════════════

-- quad — Phase 1 RLS policies
-- Principle: read your own data + publicly-readable feeds, write only as yourself.
-- Conversations/messages use a SECURITY DEFINER helper to avoid recursive RLS on conversation_members.

alter table public.profiles             enable row level security;
alter table public.gigs                  enable row level security;
alter table public.hangouts              enable row level security;
alter table public.hangout_attendees     enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_members  enable row level security;
alter table public.messages              enable row level security;
alter table public.reports               enable row level security;

-- Helper: is the calling user a member of this conversation?
-- SECURITY DEFINER bypasses RLS on conversation_members during the lookup,
-- which is required because we'll reference this from conversation_members's
-- own policies and from messages.
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- ─────────────────────── profiles ───────────────────────
-- Any signed-in user can read any profile (public student directory).
create policy "profiles: read for authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Users can update only their own profile row.
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Insert is normally handled by the on-signup trigger (0003); allow self-insert
-- as a fallback so re-creating a missing row works.
create policy "profiles: insert own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- ─────────────────────── gigs ───────────────────────
create policy "gigs: read for authenticated"
  on public.gigs for select
  to authenticated
  using (true);

create policy "gigs: insert own"
  on public.gigs for insert
  to authenticated
  with check (poster_id = auth.uid());

create policy "gigs: update by poster"
  on public.gigs for update
  to authenticated
  using (poster_id = auth.uid())
  with check (poster_id = auth.uid());

create policy "gigs: delete by poster"
  on public.gigs for delete
  to authenticated
  using (poster_id = auth.uid());

-- ─────────────────────── hangouts ───────────────────────
create policy "hangouts: read for authenticated"
  on public.hangouts for select
  to authenticated
  using (true);

create policy "hangouts: insert own"
  on public.hangouts for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "hangouts: update by host"
  on public.hangouts for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "hangouts: delete by host"
  on public.hangouts for delete
  to authenticated
  using (host_id = auth.uid());

-- ─────────────────────── hangout_attendees ───────────────────────
create policy "hangout_attendees: read for authenticated"
  on public.hangout_attendees for select
  to authenticated
  using (true);

create policy "hangout_attendees: rsvp self"
  on public.hangout_attendees for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "hangout_attendees: leave self"
  on public.hangout_attendees for delete
  to authenticated
  using (user_id = auth.uid());

-- ─────────────────────── conversations ───────────────────────
-- A user can read a conversation iff they are a member of it.
create policy "conversations: read if member"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_member(id));

-- Inserts happen via server-side logic (Edge Function later) or by users that
-- will immediately add themselves as a member. Allow authenticated inserts.
create policy "conversations: insert by authenticated"
  on public.conversations for insert
  to authenticated
  with check (true);

-- ─────────────────────── conversation_members ───────────────────────
-- A user can see their own membership row, and rows for conversations they're in.
create policy "conversation_members: read if in conversation"
  on public.conversation_members for select
  to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id));

-- A user can add themselves to a conversation (e.g., RSVP'ing to a hangout).
create policy "conversation_members: join self"
  on public.conversation_members for insert
  to authenticated
  with check (user_id = auth.uid());

-- A user can update only their own membership (e.g., last_read_at).
create policy "conversation_members: update own"
  on public.conversation_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A user can leave (delete their own membership row).
create policy "conversation_members: leave self"
  on public.conversation_members for delete
  to authenticated
  using (user_id = auth.uid());

-- ─────────────────────── messages ───────────────────────
create policy "messages: read if member"
  on public.messages for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "messages: send if member and self"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- No update/delete on messages for v1 — message history is immutable.

-- ─────────────────────── reports ───────────────────────
create policy "reports: insert as self"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Reporter can see their own submitted reports (no one else).
create policy "reports: read own"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid());

-- ═══════════════ 0003_triggers.sql ═══════════════

-- quad — Phase 1 triggers
-- 1. Auto-create a stub profiles row whenever a new auth.users row is created.
-- 2. Keep profiles.updated_at fresh on every update.

-- ─────────────── 1. profile auto-creation ───────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, verified_at)
  values (
    new.id,
    case when new.email_confirmed_at is not null then new.email_confirmed_at else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: when a user confirms their email, stamp verified_at.
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and (old.email_confirmed_at is null or old.email_confirmed_at <> new.email_confirmed_at) then
    update public.profiles
       set verified_at = new.email_confirmed_at
     where id = new.id and verified_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update on auth.users
  for each row execute function public.handle_user_confirmed();

-- ─────────────── 2. profiles.updated_at ───────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ═══════════════ 0004_profile_links.sql ═══════════════

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

-- ═══════════════ 0005_voices.sql ═══════════════

-- quad — Phase 2: voices (anonymous opinion feed)
-- Adds a `voices` table for the anonymous campus chatter feed, plus a
-- `voice_votes` table that records each user's up/down vote so totals can be
-- recomputed and a user can change their mind without double-counting.
--
-- Note: posts are still kept locally in the client during Phase 1.5; this
-- migration prepares the backend so the app can switch over without a schema
-- change.

create table public.voices (
  id              uuid primary key default gen_random_uuid(),
  -- Author is *always* recorded so the user can see their own posts in
  -- history, but the `anonymous` flag controls what other students see.
  author_id       uuid not null references public.profiles(id) on delete cascade,
  anonymous       boolean not null default true,
  body            text not null check (length(body) between 4 and 400),
  topic           text not null check (
    topic in ('Dining', 'Dorm', 'Class', 'Campus', 'Sports', 'Random')
  ),
  posted_at       timestamptz not null default now(),
  -- Cached vote total so the feed doesn't have to aggregate on every query.
  -- Kept in sync by the trigger below; do not write to it directly.
  vote_score      integer not null default 0
);

create index voices_posted_at_idx  on public.voices (posted_at desc);
create index voices_topic_idx      on public.voices (topic, posted_at desc);
create index voices_author_id_idx  on public.voices (author_id);

-- Per-user vote ledger. One row per (voice, user); +1 or -1.
create table public.voice_votes (
  voice_id        uuid not null references public.voices(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  value           smallint not null check (value in (-1, 1)),
  created_at      timestamptz not null default now(),
  primary key (voice_id, user_id)
);

create index voice_votes_user_id_idx on public.voice_votes (user_id);

-- Recompute vote_score whenever the ledger changes. Cheap because it's keyed
-- on a single voice_id and the index covers it.
create or replace function public.recompute_voice_score(target_voice uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.voices
     set vote_score = coalesce(
       (select sum(value)::int from public.voice_votes where voice_id = target_voice),
       0
     )
   where id = target_voice;
$$;

create or replace function public.voice_votes_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_voice_score(old.voice_id);
    return old;
  end if;
  perform public.recompute_voice_score(new.voice_id);
  return new;
end;
$$;

drop trigger if exists voice_votes_sync on public.voice_votes;
create trigger voice_votes_sync
  after insert or update or delete on public.voice_votes
  for each row execute function public.voice_votes_after_change();

-- ─────────────────────── RLS ───────────────────────
alter table public.voices       enable row level security;
alter table public.voice_votes  enable row level security;

-- Anyone authenticated can read the feed. The app is responsible for hiding
-- author_id when anonymous = true; the column itself is exposed so authors can
-- see their own history.
create policy "voices: read for authenticated"
  on public.voices for select
  to authenticated
  using (true);

create policy "voices: insert own"
  on public.voices for insert
  to authenticated
  with check (author_id = auth.uid());

-- Authors can delete their own voices. No updates — voices are immutable once
-- posted (matches the existing messages policy in 0002).
create policy "voices: delete own"
  on public.voices for delete
  to authenticated
  using (author_id = auth.uid());

-- Votes: everyone can see aggregate vote_score via the parent row, but the
-- ledger itself is only readable by the voter (so others can't see how someone
-- specifically voted).
create policy "voice_votes: read own"
  on public.voice_votes for select
  to authenticated
  using (user_id = auth.uid());

create policy "voice_votes: insert own"
  on public.voice_votes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "voice_votes: update own"
  on public.voice_votes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "voice_votes: delete own"
  on public.voice_votes for delete
  to authenticated
  using (user_id = auth.uid());

-- ═══════════════ 0006_app_alignment.sql ═══════════════

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

-- ═══════════════ 0007_conversations_and_realtime.sql ═══════════════

-- quad — Phase 2.5: conversation RPCs + realtime publication
--
-- Why this exists:
--   * conversation_members has an RLS insert policy of (user_id = auth.uid()),
--     which means a user can only add THEMSELVES. So when a gig applicant
--     creates a conversation, the poster can never see it. Same for hangout
--     group chats. The fix is a SECURITY DEFINER RPC that performs the privileged
--     insert on behalf of the caller after validating intent.
--   * Realtime previously required toggling the supabase_realtime publication
--     in the dashboard. That's manual config drift. We do it in SQL instead so
--     the migration owns it.

-- ─────────────────────── start_gig_conversation ───────────────────────
-- Find or create a 1:1 conversation between the caller and the gig's poster,
-- and ensure both are members. Returns the conversation id.
create or replace function public.start_gig_conversation(p_gig_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_poster    uuid;
  v_conv_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select poster_id into v_poster from public.gigs where id = p_gig_id;
  if v_poster is null then
    raise exception 'gig not found' using errcode = 'P0002';
  end if;

  if v_poster = v_me then
    raise exception 'cannot message yourself' using errcode = '22023';
  end if;

  -- Reuse an existing 1:1 thread between exactly these two for this gig.
  select c.id into v_conv_id
    from public.conversations c
    join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = v_me
    join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = v_poster
   where c.gig_id = p_gig_id
   limit 1;

  if v_conv_id is null then
    insert into public.conversations (gig_id) values (p_gig_id)
      returning id into v_conv_id;
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me), (v_conv_id, v_poster)
      on conflict do nothing;
  else
    -- Defensive: heal a half-membered conversation (shouldn't happen).
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me), (v_conv_id, v_poster)
      on conflict do nothing;
  end if;

  return v_conv_id;
end;
$$;

revoke all on function public.start_gig_conversation(uuid) from public;
grant execute on function public.start_gig_conversation(uuid) to authenticated;

-- ─────────────────────── join_hangout ───────────────────────
-- RSVP to a hangout: insert into hangout_attendees, find/create the group
-- conversation tied to the hangout, and ensure the caller is a member. Returns
-- the conversation id (the app navigates to it on long-press / explicit chat
-- open; the RSVP button itself doesn't need it).
create or replace function public.join_hangout(p_hangout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_host      uuid;
  v_max       int;
  v_count     int;
  v_conv_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select host_id, max_people into v_host, v_max
    from public.hangouts where id = p_hangout_id;
  if v_host is null then
    raise exception 'hangout not found' using errcode = 'P0002';
  end if;

  -- Capacity check; allow the host to always be in.
  if v_me <> v_host then
    select count(*) into v_count
      from public.hangout_attendees where hangout_id = p_hangout_id;
    if v_count >= v_max then
      raise exception 'hangout is full' using errcode = '23514';
    end if;
  end if;

  -- RSVP (idempotent).
  insert into public.hangout_attendees (hangout_id, user_id)
    values (p_hangout_id, v_me)
    on conflict do nothing;

  -- Find or create the group conversation tied to this hangout.
  select id into v_conv_id from public.conversations
    where hangout_id = p_hangout_id limit 1;

  if v_conv_id is null then
    insert into public.conversations (hangout_id) values (p_hangout_id)
      returning id into v_conv_id;
    -- Seed the conversation with every existing attendee, including the host
    -- and the caller. on conflict do nothing keeps it idempotent.
    insert into public.conversation_members (conversation_id, user_id)
    select v_conv_id, a.user_id from public.hangout_attendees a
      where a.hangout_id = p_hangout_id
    union
    select v_conv_id, v_host
    on conflict do nothing;
  else
    -- Just add the caller.
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me)
      on conflict do nothing;
  end if;

  return v_conv_id;
end;
$$;

revoke all on function public.join_hangout(uuid) from public;
grant execute on function public.join_hangout(uuid) to authenticated;

-- ─────────────────────── leave_hangout ───────────────────────
-- Remove the caller from hangout_attendees AND the group conversation.
-- Host cannot leave their own hangout (they'd have to cancel it).
create or replace function public.leave_hangout(p_hangout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_host    uuid;
  v_conv_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select host_id into v_host from public.hangouts where id = p_hangout_id;
  if v_host is null then
    raise exception 'hangout not found' using errcode = 'P0002';
  end if;

  if v_me = v_host then
    raise exception 'host cannot leave their own hangout' using errcode = '22023';
  end if;

  delete from public.hangout_attendees
   where hangout_id = p_hangout_id and user_id = v_me;

  select id into v_conv_id from public.conversations
   where hangout_id = p_hangout_id limit 1;
  if v_conv_id is not null then
    delete from public.conversation_members
     where conversation_id = v_conv_id and user_id = v_me;
  end if;
end;
$$;

revoke all on function public.leave_hangout(uuid) from public;
grant execute on function public.leave_hangout(uuid) to authenticated;

-- ─────────────────────── realtime publication ───────────────────────
-- The app subscribes to live inserts. Add the tables to the supabase_realtime
-- publication so postgres_changes events flow. Wrapped in DO blocks so re-runs
-- after the dashboard already toggled these don't blow up.
do $$ begin
  alter publication supabase_realtime add table public.gigs;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.hangouts;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.voices;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.hangout_attendees;
exception when duplicate_object then null; end $$;

-- ═══════════════ 0008_voice_vote_rpc.sql ═══════════════

-- quad — Phase 2.5: atomic voice vote RPC
--
-- Why this exists:
--   * The client previously called supabase.from('voice_votes').delete() OR
--     .upsert() to register a vote change. On rapid up→down taps that issued
--     two independent requests — a DELETE followed by an UPSERT — which can
--     reorder server-side and leave the row in the wrong final state (or fail
--     the upsert because the delete from the next click already ran). The
--     trigger recomputes vote_score per row change, so a reorder can also
--     leave the cached score out of sync until the next refresh.
--   * One RPC, one transaction, one trigger fire — no reorder possible.

create or replace function public.set_voice_vote(p_voice_id uuid, p_value smallint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_value not in (-1, 0, 1) then
    raise exception 'value must be -1, 0, or 1' using errcode = '22023';
  end if;

  if p_value = 0 then
    delete from public.voice_votes
     where voice_id = p_voice_id and user_id = v_me;
  else
    insert into public.voice_votes (voice_id, user_id, value)
    values (p_voice_id, v_me, p_value)
    on conflict (voice_id, user_id) do update
      set value = excluded.value;
  end if;
end;
$$;

grant execute on function public.set_voice_vote(uuid, smallint) to authenticated;

-- ═══════════════ 0009_push_tokens.sql ═══════════════

-- quad — Phase 2.5: push notification tokens
--
-- Stores each user's Expo push token in a separate table so it can be
-- protected by stricter RLS than the rest of the profile.
--
-- Tokens look like `ExponentPushToken[xxxxxxx]` and can be used by anyone
-- holding them to send pushes via Expo's API. Keeping them out of the
-- public `profiles` SELECT policy avoids leaking them to other authenticated
-- users in the campus directory.
--
-- The server-side sender (Edge Function / DB trigger) will read tokens using
-- the service role key, bypassing RLS — only the device owner can read or
-- write their own token via the anon/auth role.

create table if not exists public.user_push_tokens (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  expo_push_token text not null,
  updated_at  timestamptz not null default now()
);

alter table public.user_push_tokens enable row level security;

drop policy if exists "push_tokens: read own" on public.user_push_tokens;
create policy "push_tokens: read own"
  on public.user_push_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens: insert own" on public.user_push_tokens;
create policy "push_tokens: insert own"
  on public.user_push_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_tokens: update own" on public.user_push_tokens;
create policy "push_tokens: update own"
  on public.user_push_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens: delete own" on public.user_push_tokens;
create policy "push_tokens: delete own"
  on public.user_push_tokens for delete
  to authenticated
  using (user_id = auth.uid());

-- ═══════════════ 0010_avatars_bucket.sql ═══════════════

-- quad — Phase 2.5: avatars storage bucket
--
-- Public bucket so any signed-in user can fetch any avatar (the campus
-- directory is intentionally readable by all authenticated users). Writes
-- and deletes are owner-only, enforced via the first path segment matching
-- the uploader's auth.uid().
--
-- Path convention: `{userId}/avatar.<ext>` — one canonical avatar per user.
-- profiles.avatar_url already exists (migration 0001) and stores the public
-- URL returned by Supabase Storage.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars: owner insert" on storage.objects;
create policy "avatars: owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: owner update" on storage.objects;
create policy "avatars: owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: owner delete" on storage.objects;
create policy "avatars: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ═══════════════ 0011_message_push_trigger.sql ═══════════════

-- quad — Phase 2.5: trigger that fans out push notifications on new messages
--
-- Mechanism choice: pg_net + an AFTER INSERT row trigger (not
-- supabase.functions.invoke, not the dashboard "Database Webhooks" UI).
-- Reasoning:
--   * pg_net is enabled by default on every Supabase project and exposes
--     net.http_post, which is exactly the async fire-and-forget primitive we
--     need: the message INSERT commits immediately and the push send happens
--     in the background worker.
--   * supabase.functions.invoke() from SQL needs the supabase_functions
--     extension and Vault-managed secrets — extra moving parts for a feature
--     that's just "POST JSON to a URL".
--   * Dashboard webhooks would work too, but pinning the wiring in a
--     migration keeps config in source control (no dashboard drift).
--
-- Required one-time setup before this migration is useful (run from the SQL
-- editor as the postgres role):
--
--   alter database postgres
--     set app.settings.edge_function_url = 'https://<project-ref>.supabase.co/functions/v1/send-message-push';
--   alter database postgres
--     set app.settings.service_role_key = '<service-role-jwt>';
--
-- Both values come from the Supabase dashboard (Settings → API). The
-- service role key never leaves the database — pg_net forwards it in the
-- Authorization header so the Edge Function can authenticate the call.
--
-- The trigger swallows errors (`exception when others then ...`) because a
-- failed push must never block a chat message from being sent.

-- Make sure pg_net is available. It's enabled by default on Supabase, but
-- safe to ask for it explicitly so this migration is portable.
create extension if not exists pg_net with schema extensions;

-- ─────────────────────── notify_new_message ───────────────────────
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url   text := current_setting('app.settings.edge_function_url', true);
  v_key   text := current_setting('app.settings.service_role_key', true);
  v_body  jsonb;
begin
  if v_url is null or v_url = '' then
    -- Not configured yet — silently no-op so chat still works in dev/local.
    return new;
  end if;

  -- Mirror the Supabase Database Webhook payload shape so the same Edge
  -- Function can be triggered from the dashboard too (handy for re-tests).
  v_body := jsonb_build_object(
    'type',   'INSERT',
    'table',  'messages',
    'schema', 'public',
    'record', to_jsonb(new),
    'old_record', null
  );

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'content-type',   'application/json',
        'authorization',  'Bearer ' || coalesce(v_key, '')
      ),
      body    := v_body
    );
  exception when others then
    raise warning 'notify_new_message: net.http_post failed: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_new_message() from public;

-- ─────────────────────── trigger wiring ───────────────────────
drop trigger if exists trg_messages_push on public.messages;
create trigger trg_messages_push
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- ═══════════════ 0012_new_post_push_triggers.sql ═══════════════

-- quad — Phase 2.6: fan-out push notifications on new gigs and hangouts
--
-- Mirrors the mechanism choice from 0011 (pg_net + AFTER INSERT row trigger).
-- One shared trigger function `notify_new_post()` is reused across the two
-- tables; it forwards a Supabase-Database-Webhook-shaped payload to the
-- send-new-post-push Edge Function, which dispatches on payload.table.
--
-- One-time setup (already required by 0011 — listed again so this migration
-- is self-documenting):
--
--   alter database postgres
--     set app.settings.new_post_push_url = 'https://<project-ref>.supabase.co/functions/v1/send-new-post-push';
--   alter database postgres
--     set app.settings.service_role_key  = '<service-role-jwt>';
--
-- Note the URL setting is distinct from app.settings.edge_function_url (which
-- 0011 uses for send-message-push) so each function can be re-pointed
-- independently — useful if one is ever moved or paused without touching the
-- other.
--
-- As with 0011 the trigger swallows errors so a failed push cannot block the
-- underlying INSERT into gigs/hangouts.

create extension if not exists pg_net with schema extensions;

-- ─────────────────────── notify_new_post ───────────────────────
create or replace function public.notify_new_post()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url   text := current_setting('app.settings.new_post_push_url', true);
  v_key   text := current_setting('app.settings.service_role_key', true);
  v_body  jsonb;
begin
  if v_url is null or v_url = '' then
    -- Not configured yet — silently no-op so post creation still works in dev.
    return new;
  end if;

  v_body := jsonb_build_object(
    'type',   'INSERT',
    'table',  tg_table_name,
    'schema', tg_table_schema,
    'record', to_jsonb(new),
    'old_record', null
  );

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'content-type',   'application/json',
        'authorization',  'Bearer ' || coalesce(v_key, '')
      ),
      body    := v_body
    );
  exception when others then
    raise warning 'notify_new_post(%): net.http_post failed: %', tg_table_name, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_new_post() from public;

-- ─────────────────────── trigger wiring ───────────────────────
drop trigger if exists trg_gigs_push on public.gigs;
create trigger trg_gigs_push
  after insert on public.gigs
  for each row execute function public.notify_new_post();

drop trigger if exists trg_hangouts_push on public.hangouts;
create trigger trg_hangouts_push
  after insert on public.hangouts
  for each row execute function public.notify_new_post();

-- ═══════════════ 0013_blocks.sql ═══════════════

-- quad — Phase 3: user blocks (App Store 1.2 — UGC blocking requirement)
--
-- Design choice: we filter blocked content at the RLS layer rather than via
-- views. Reasoning:
--   * The app already does direct `from('gigs')`, `from('hangouts')`,
--     `from('voices')`, `from('messages')` reads (and realtime subscribes to
--     those exact tables). Introducing views would require either renaming
--     the realtime sources or maintaining parallel read paths. Both are
--     bigger changes than just tightening RLS.
--   * RLS filters are evaluated by the planner with the relevant indexes; the
--     `NOT EXISTS` subquery on a (blocker_id, blocked_id)-indexed table is cheap.
--   * Postgres RLS policies for SELECT are combined with OR within a role.
--     The existing "read for authenticated" policies are `using (true)`, so
--     adding a stricter policy alongside them would change nothing. We DROP
--     and RECREATE those policies so the block filter is the only gate.
--
-- Block semantics: two-way mute.
--   * If A blocks B, A no longer sees B's gigs/hangouts/voices/messages.
--   * Symmetrically, B no longer sees A's content. This prevents harassment
--     workarounds where the blocked user can still respond.
--
-- The `is_blocked` helper is SECURITY DEFINER so it can read user_blocks
-- regardless of whose row we're querying.

-- ─────────────────────── user_blocks ───────────────────────
create table public.user_blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- Users only see their own outgoing blocks. They never see who has blocked
-- them (we use is_blocked() with SECURITY DEFINER for the filter).
create policy "user_blocks: read own"
  on public.user_blocks for select
  to authenticated
  using (blocker_id = auth.uid());

create policy "user_blocks: insert own"
  on public.user_blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

create policy "user_blocks: delete own"
  on public.user_blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

-- ─────────────────────── is_blocked helper ───────────────────────
-- Returns true if either (a) the calling user blocked the target, or
-- (b) the target blocked the calling user. Either side opting out of the
-- relationship is enough to hide content from the caller.
create or replace function public.is_blocked(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = auth.uid() and blocked_id = target_user_id)
       or (blocker_id = target_user_id and blocked_id = auth.uid())
  );
$$;

revoke all on function public.is_blocked(uuid) from public;
grant execute on function public.is_blocked(uuid) to authenticated;

-- ─────────────────────── re-gate feed reads ───────────────────────
-- gigs: was `using (true)`. Now hides posts whose poster is on either side
-- of a block with the caller.
drop policy if exists "gigs: read for authenticated" on public.gigs;
create policy "gigs: read for authenticated"
  on public.gigs for select
  to authenticated
  using (
    poster_id = auth.uid()
    or not public.is_blocked(poster_id)
  );

drop policy if exists "hangouts: read for authenticated" on public.hangouts;
create policy "hangouts: read for authenticated"
  on public.hangouts for select
  to authenticated
  using (
    host_id = auth.uid()
    or not public.is_blocked(host_id)
  );

drop policy if exists "voices: read for authenticated" on public.voices;
create policy "voices: read for authenticated"
  on public.voices for select
  to authenticated
  using (
    author_id = auth.uid()
    or not public.is_blocked(author_id)
  );

-- messages: even within a shared conversation, hide messages sent by users
-- who are blocked. Important for hangout group chats — a member you block
-- shouldn't be visible to you even though you're both still in the room.
drop policy if exists "messages: read if member" on public.messages;
create policy "messages: read if member"
  on public.messages for select
  to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and (sender_id = auth.uid() or not public.is_blocked(sender_id))
  );

-- hangout_attendees: do NOT filter — the count needs to stay accurate for
-- capacity checks. The UI just won't render the blocked user's avatar.

-- profiles: do NOT filter — the directory is intentionally public to all
-- authenticated users (per 0002), and a blocked user's profile being
-- viewable doesn't enable harassment. The app-level UI should still hide
-- their content from feeds via the above.

-- ═══════════════ 0014_reports_v2.sql ═══════════════

-- quad — Phase 3: reports v2 (App Store 1.2 — UGC reporting requirement)
--
-- The 0001 `reports` table works for the dev seed, but the shape doesn't match
-- what we actually want to show reviewers:
--   * target_kind missing `voice` and `profile` (had `user` — renaming for
--     consistency with how the rest of the app talks about people: it's a
--     "profile" everywhere else).
--   * reason was free text; we need a constrained enum for triage.
--   * no `details` for the optional textarea.
--   * no `status` so the moderator queue has no notion of "open vs handled".
--
-- Since the table only contains throwaway dev data and we're pre-launch (per
-- the engineer brief), we drop and recreate cleanly. RLS policies from 0002
-- are reapplied here so nothing depends on cross-migration ordering.

-- Drop the old table; CASCADE the policies in 0002.
drop table if exists public.reports cascade;

-- ─────────────────────── reason / status enums ───────────────────────
-- Standalone enums so the queue UI can render dropdowns from pg_enum.
do $$ begin
  create type public.report_reason as enum ('spam', 'harassment', 'inappropriate', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_target_kind as enum ('gig', 'hangout', 'voice', 'message', 'profile');
exception when duplicate_object then null; end $$;

-- ─────────────────────── reports ───────────────────────
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  target_kind     public.report_target_kind not null,
  target_id       uuid not null,
  -- Convenience pointer to the offending user, when known. Filled in by the
  -- client (for `profile` targets it equals target_id; for content targets
  -- it's the author's id resolved at report time). Kept as `set null` on
  -- delete so deleting a user doesn't wipe their report history.
  target_user_id  uuid references public.profiles(id) on delete set null,
  reason          public.report_reason not null,
  details         text check (details is null or length(details) <= 1000),
  status          public.report_status not null default 'open',
  created_at      timestamptz not null default now()
);

create index reports_target_idx       on public.reports (target_kind, target_id);
create index reports_status_idx       on public.reports (status, created_at desc);
create index reports_reporter_idx     on public.reports (reporter_id);

alter table public.reports enable row level security;

-- Reporter can submit; reporter_id must equal auth.uid() (no impersonation).
drop policy if exists "reports: insert as self" on public.reports;
create policy "reports: insert as self"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Reporter can see their own reports (so the UI can show "you've already
-- reported this"). No one else can read reports via the client — the
-- moderator queue uses the service role.
drop policy if exists "reports: read own" on public.reports;
create policy "reports: read own"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid());

-- No update or delete from the client.

-- ═══════════════ 0015_notification_prefs.sql ═══════════════

-- quad — Phase 3: per-user notification preferences
--
-- The push fan-out functions (`send-message-push`, `send-new-post-push`) read
-- this table to decide whether to skip a recipient. Missing-row semantics:
-- defaults are opt-in for messages/gigs/hangouts and opt-out for voices.
-- Voices is opt-out because the feed is high-volume — pushing on every new
-- anonymous opinion would melt the device.
--
-- A row is upserted from the client whenever the user toggles a preference;
-- new users get the defaults applied implicitly by the COALESCE in the
-- function's lookup.

create table public.notification_prefs (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  messages      boolean not null default true,
  new_gigs      boolean not null default true,
  new_hangouts  boolean not null default true,
  new_voices    boolean not null default false,
  updated_at    timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists "notification_prefs: read own" on public.notification_prefs;
create policy "notification_prefs: read own"
  on public.notification_prefs for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_prefs: insert own" on public.notification_prefs;
create policy "notification_prefs: insert own"
  on public.notification_prefs for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_prefs: update own" on public.notification_prefs;
create policy "notification_prefs: update own"
  on public.notification_prefs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notification_prefs: delete own" on public.notification_prefs;
create policy "notification_prefs: delete own"
  on public.notification_prefs for delete
  to authenticated
  using (user_id = auth.uid());

-- ═══════════════ 0016_message_images.sql ═══════════════

-- quad — Phase 3: image attachments on messages
--
-- A message can now carry an image instead of (or in addition to) text. The
-- existing `body NOT NULL` + `length(body) > 0` constraint on messages
-- prevents image-only sends, so we relax it to allow either:
--   * non-empty body, or
--   * non-null image_url
-- The new image_url column is a public Supabase Storage URL pointing at the
-- `message-images` bucket (created in 0017). image_width / image_height are
-- captured at upload time so the chat UI can size the bubble correctly
-- before the image finishes downloading (no layout jump).

alter table public.messages
  add column if not exists image_url    text,
  add column if not exists image_width  integer,
  add column if not exists image_height integer;

-- Relax the body constraint. The original check forbids empty body; we now
-- allow empty body iff image_url is set. Drop the old constraint by name if
-- it exists (Postgres auto-names it messages_body_check), then add ours.
do $$
declare
  v_name text;
begin
  select conname into v_name
    from pg_constraint
   where conrelid = 'public.messages'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%length(body)%';
  if v_name is not null then
    execute format('alter table public.messages drop constraint %I', v_name);
  end if;
end $$;

-- Also drop the NOT NULL on body so image-only messages don't trip it.
alter table public.messages alter column body drop not null;

alter table public.messages
  add constraint messages_body_or_image_check check (
    (body is not null and length(body) > 0 and length(body) <= 4000)
    or image_url is not null
  );

-- Realtime + RLS already cover the new columns transparently; no policy edits
-- needed because reads gate on conversation membership, not specific columns.

-- ═══════════════ 0017_message_images_bucket.sql ═══════════════

-- quad — Phase 3: message-images storage bucket
--
-- Public bucket so any conversation member can render an inlined image
-- without needing a signed URL roundtrip. Writes / deletes are owner-only,
-- enforced by checking the first path segment against `auth.uid()` — same
-- pattern as the `avatars` bucket (see 0010_avatars_bucket.sql).
--
-- Path convention: `{userId}/{messageId-or-uuid}.jpg` — one image per row.
-- We don't bother with a server-side reference count: messages are immutable
-- in v1, so the upload path mirrors the message lifecycle 1:1.

insert into storage.buckets (id, name, public)
values ('message-images', 'message-images', true)
on conflict (id) do update set public = true;

drop policy if exists "message-images: public read" on storage.objects;
create policy "message-images: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'message-images');

drop policy if exists "message-images: owner insert" on storage.objects;
create policy "message-images: owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "message-images: owner update" on storage.objects;
create policy "message-images: owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "message-images: owner delete" on storage.objects;
create policy "message-images: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ═══════════════ 0018_unread_counts.sql ═══════════════

-- quad — Phase 3: unread message counts + conversation_members realtime
--
-- Two things bundled here because both serve the DM-state UX:
--
--   1) Add conversation_members to the supabase_realtime publication so
--      UPDATE events on last_read_at fan out to subscribed clients. This is
--      what powers the live "Read" indicator in chat (see lib/messaging.ts
--      thread channel UPDATE handler).
--
--   2) Expose `unread_counts_for_user(p_user_id uuid)` as a SECURITY DEFINER
--      function that returns one row per conversation the user is a member
--      of with the count of messages sent *after* that user's last_read_at
--      by someone else. The Messages tab + tab-bar badge call this and
--      total it across rows to decide whether to render an accent dot.
--
-- We expose this as a function (not a view) for two reasons:
--   - It depends on `auth.uid()` indirectly (we pass it explicitly), so a
--     view would either need to be defined as security_invoker (slower with
--     RLS recursion on conversation_members) or hit a wall against
--     anonymous role access.
--   - Functions can be granted to authenticated only, which keeps the
--     surface tighter than a public view.

-- ─────────────────────── realtime publication ───────────────────────
do $$ begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null; end $$;

-- ─────────────────────── unread_counts_for_user ───────────────────────
create or replace function public.unread_counts_for_user(p_user_id uuid)
returns table (conversation_id uuid, unread int)
language sql
security definer
stable
set search_path = public
as $$
  select
    cm.conversation_id,
    count(m.*)::int as unread
  from public.conversation_members cm
  left join public.messages m
    on m.conversation_id = cm.conversation_id
   and m.sent_at > cm.last_read_at
   and m.sender_id <> cm.user_id
  where cm.user_id = p_user_id
  group by cm.conversation_id;
$$;

revoke all on function public.unread_counts_for_user(uuid) from public;
grant execute on function public.unread_counts_for_user(uuid) to authenticated;

-- ═══════════════ 0019_comments_and_realtime.sql ═══════════════

-- quad — Phase 3: comments + voice push fan-out + realtime
--
-- Adds a single `comments` table that attaches to gigs / hangouts / voices
-- via a (target_type, target_id) discriminator, instead of three separate
-- tables. Trades a little type-system rigor for one query path, one realtime
-- channel pattern, and one push trigger.
--
-- Also wires the voices table into the existing notify_new_post() trigger
-- (0012 only covered gigs and hangouts) and adds a notify_new_comment()
-- trigger that pings the target's owner.
--
-- One-time setup the trigger needs (same DB GUC mechanism as 0011 / 0012):
--
--   alter database postgres
--     set app.settings.new_comment_push_url
--       = 'https://<project-ref>.supabase.co/functions/v1/send-new-comment-push';
--
-- (service_role_key is already set from 0011.)

create extension if not exists pg_net with schema extensions;

-- ─────────────────────── comments table ───────────────────────
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('gig', 'hangout', 'voice')),
  target_id    uuid not null,
  author_id    uuid not null references public.profiles(id) on delete cascade,
  anonymous    boolean not null default false,
  body         text not null check (length(body) between 1 and 500),
  created_at   timestamptz not null default now()
);

-- Hot path: load all comments for one target in chronological order.
create index comments_target_idx on public.comments (target_type, target_id, created_at);
-- Author history (for "my posts" expansion + soft-moderation lookups).
create index comments_author_idx on public.comments (author_id);

-- ─────────────────────── comment_count caches ───────────────────────
-- Mirror the vote_score pattern from 0005 — denormalized counter on the
-- parent row so feeds don't have to aggregate on every fetch.
alter table public.gigs     add column if not exists comment_count integer not null default 0;
alter table public.hangouts add column if not exists comment_count integer not null default 0;
alter table public.voices   add column if not exists comment_count integer not null default 0;

create or replace function public.recompute_comment_count(
  p_target_type text,
  p_target_id   uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*)::int into v_count
    from public.comments
   where target_type = p_target_type and target_id = p_target_id;
  if p_target_type = 'gig' then
    update public.gigs     set comment_count = v_count where id = p_target_id;
  elsif p_target_type = 'hangout' then
    update public.hangouts set comment_count = v_count where id = p_target_id;
  elsif p_target_type = 'voice' then
    update public.voices   set comment_count = v_count where id = p_target_id;
  end if;
end;
$$;

create or replace function public.comments_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_comment_count(old.target_type, old.target_id);
    return old;
  end if;
  perform public.recompute_comment_count(new.target_type, new.target_id);
  return new;
end;
$$;

drop trigger if exists comments_sync on public.comments;
create trigger comments_sync
  after insert or delete on public.comments
  for each row execute function public.comments_after_change();

-- ─────────────────────── RLS ───────────────────────
alter table public.comments enable row level security;

-- Anyone authenticated can read the thread. Client is responsible for hiding
-- author_id when anonymous = true — column is exposed so authors see history.
create policy "comments: read for authenticated"
  on public.comments for select
  to authenticated
  using (true);

create policy "comments: insert own"
  on public.comments for insert
  to authenticated
  with check (author_id = auth.uid());

-- Authors can delete their own comments. No updates — immutable like voices.
create policy "comments: delete own"
  on public.comments for delete
  to authenticated
  using (author_id = auth.uid());

-- ─────────────────────── voice push fan-out ───────────────────────
-- 0012 already defined notify_new_post() and wired it to gigs + hangouts.
-- Add voices to the same fan-out so a new anonymous voice pings the campus.
drop trigger if exists trg_voices_push on public.voices;
create trigger trg_voices_push
  after insert on public.voices
  for each row execute function public.notify_new_post();

-- ─────────────────────── comment push fan-out ───────────────────────
-- Ping the owner of the parent post (and not the commenter themselves) when
-- a new comment lands. The Edge Function resolves the owner; this trigger
-- just forwards the row payload.
create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url   text := current_setting('app.settings.new_comment_push_url', true);
  v_key   text := current_setting('app.settings.service_role_key', true);
  v_body  jsonb;
begin
  if v_url is null or v_url = '' then
    return new;
  end if;

  v_body := jsonb_build_object(
    'type',   'INSERT',
    'table',  'comments',
    'schema', 'public',
    'record', to_jsonb(new),
    'old_record', null
  );

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'content-type',   'application/json',
        'authorization',  'Bearer ' || coalesce(v_key, '')
      ),
      body    := v_body
    );
  exception when others then
    raise warning 'notify_new_comment: net.http_post failed: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_new_comment() from public;

drop trigger if exists trg_comments_push on public.comments;
create trigger trg_comments_push
  after insert on public.comments
  for each row execute function public.notify_new_comment();

-- ─────────────────────── realtime publication ───────────────────────
do $$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null; end $$;

-- ═══════════════ 0020_post_origin.sql ═══════════════

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

-- ═══════════════ 0021_message_delete.sql ═══════════════

-- quad — allow senders to delete their own messages
--
-- 0002 declared message history immutable for v1. The app now supports
-- select-to-delete in chat, so senders may hard-delete their own rows.
-- Members' last_read_at and unread counts self-correct: unread_counts_for_user
-- counts live rows, so deleting a message can only lower counts.
--
-- Note: deleting a message with an image leaves the storage object behind
-- (message-images bucket). Acceptable orphan at current scale; a cleanup job
-- can reap unreferenced objects later.

create policy "messages: delete own"
  on public.messages for delete
  to authenticated
  using (sender_id = auth.uid());

-- ═══════════════ 0022_comments_block_filter.sql ═══════════════

-- quad — apply the two-way block to comments
--
-- 0013 re-gated gigs / hangouts / voices / messages so a blocked user's content
-- disappears for both sides of the block, but comments (added in 0019) shipped
-- with `using (true)` and were never brought under the same filter. That left a
-- harassment hole: if A blocks B, B can still comment on A's gig/hangout/voice
-- and A keeps seeing it. This closes that gap using the same is_blocked() helper
-- (SECURITY DEFINER, defined in 0013), mirroring the voices policy exactly.
--
-- Authors still see their own comments (author_id = auth.uid()) so "my history"
-- and optimistic inserts keep working.

drop policy if exists "comments: read for authenticated" on public.comments;
create policy "comments: read for authenticated"
  on public.comments for select
  to authenticated
  using (
    author_id = auth.uid()
    or not public.is_blocked(author_id)
  );

-- ═══════════════ 0023_conversation_join_lockdown.sql ═══════════════

-- quad — lock down conversation membership joins (fixes C2, launch-blocker)
--
-- 0007's SECURITY DEFINER RPCs (start_gig_conversation / join_hangout) are the
-- ONLY intended way to add someone to a conversation. But 0002's raw INSERT
-- policy "conversation_members: join self" (with check user_id = auth.uid())
-- let ANY authenticated user insert THEMSELVES into ANY conversation_id and,
-- since membership is the sole gate for reading messages, read that private
-- thread's entire history and post into it. Conversation IDs are enumerable
-- (they leak via app payloads, and 0018's unread RPC before 0024 handed them
-- out for any user), so this was directly exploitable, not just theoretical.
--
-- The RPCs run as SECURITY DEFINER (owner = postgres, which bypasses RLS since
-- these tables don't FORCE row level security), so revoking the direct-insert
-- policy does NOT break them. Verified the client never inserts membership rows
-- directly: it only SELECTs, DELETEs its own row (leave/block), and calls the
-- RPCs. If you ever add FORCE RLS to these tables, add a narrow definer-only
-- insert policy at the same time.
drop policy if exists "conversation_members: join self" on public.conversation_members;

-- Same attack surface: 0002 let any authenticated user INSERT arbitrary
-- conversation rows (with check true). Conversation creation also happens only
-- inside the definer RPCs. A stray bare conversation row was unreadable without
-- membership, but it's needless surface — remove the direct-insert path too.
drop policy if exists "conversations: insert by authenticated" on public.conversations;

-- Leaves in place (unchanged, still correct):
--   * conversation_members SELECT (read if in conversation)
--   * conversation_members UPDATE own (last_read_at)
--   * conversation_members DELETE own (leave / block removes the thread)
--   * conversations SELECT (read if member)

-- ═══════════════ 0024_unread_counts_auth_and_blocks.sql ═══════════════

-- quad — unread counts: use the caller's identity, and skip blocked senders
--
-- Fixes M1 and M2.
--
-- M1 (security): 0018's unread_counts_for_user(p_user_id) is SECURITY DEFINER
-- and granted to `authenticated`, but filtered on `cm.user_id = p_user_id` with
-- no check that p_user_id is the caller. Any authenticated student could pass
-- another student's profile id (the directory is public) and read that user's
-- conversation UUIDs + per-conversation unread counts — a metadata leak that
-- also fed the conversation-join exploit closed in 0023.
--
-- M2: messages from a blocked user are hidden by the messages SELECT policy
-- (0013) but were still counted here, so a blocked sender produced a phantom
-- unread badge that pointed at a conversation showing nothing new.
--
-- The p_user_id argument is RETAINED so the existing client call site
-- (lib/messaging.ts) keeps working unchanged, but it is now IGNORED: counts are
-- always computed for auth.uid(). is_blocked() reads auth.uid() internally
-- (from the request JWT, which is set even inside a definer function), so it
-- correctly evaluates the block relationship for the caller.
create or replace function public.unread_counts_for_user(p_user_id uuid)
returns table (conversation_id uuid, unread int)
language sql
security definer
stable
set search_path = public
as $$
  select
    cm.conversation_id,
    count(m.*)::int as unread
  from public.conversation_members cm
  left join public.messages m
    on m.conversation_id = cm.conversation_id
   and m.sent_at > cm.last_read_at
   and m.sender_id <> cm.user_id
   and not public.is_blocked(m.sender_id)
  where cm.user_id = auth.uid()
  group by cm.conversation_id;
$$;

revoke all on function public.unread_counts_for_user(uuid) from public;
grant execute on function public.unread_counts_for_user(uuid) to authenticated;

-- ═══════════════ 0025_hangout_capacity.sql ═══════════════

-- quad — enforce hangout capacity atomically (fixes H2)
--
-- Two holes in one: (a) 0002's "hangout_attendees: rsvp self" policy lets the
-- client insert attendee rows directly, skipping join_hangout's capacity check
-- entirely; and (b) join_hangout itself did a non-atomic count-then-insert, so
-- two concurrent RSVPs to the last open slot both pass the check and both
-- insert (TOCTOU).
--
-- A BEFORE INSERT trigger closes both. It runs on EVERY insert path — the
-- join_hangout RPC, the host's implicit self-RSVP on hangout creation
-- (lib/posts-store.tsx), and any raw client insert — and serializes concurrent
-- RSVPs per hangout with a transaction-scoped advisory lock so count-then-allow
-- is atomic. join_hangout's own check is now redundant but harmless.
--
-- The direct-insert policy is intentionally KEPT so the host self-RSVP path
-- keeps working; the trigger, not the policy, is what enforces capacity.
create or replace function public.enforce_hangout_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host  uuid;
  v_max   int;
  v_count int;
begin
  select host_id, max_people into v_host, v_max
    from public.hangouts where id = new.hangout_id;
  if v_host is null then
    raise exception 'hangout not found' using errcode = 'P0002';
  end if;

  -- The host is always in their own hangout, regardless of capacity.
  if new.user_id = v_host then
    return new;
  end if;

  -- A re-RSVP by an existing attendee (the insert no-ops via ON CONFLICT) must
  -- not trip the capacity check when the hangout is already full.
  if exists (
    select 1 from public.hangout_attendees
     where hangout_id = new.hangout_id and user_id = new.user_id
  ) then
    return new;
  end if;

  -- Serialize concurrent RSVPs to this hangout so count-then-allow is atomic.
  -- Transaction-scoped: released automatically at commit/rollback.
  perform pg_advisory_xact_lock(hashtext('hangout_capacity:' || new.hangout_id::text));

  select count(*) into v_count
    from public.hangout_attendees where hangout_id = new.hangout_id;
  if v_count >= v_max then
    raise exception 'hangout is full' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists hangout_attendees_capacity on public.hangout_attendees;
create trigger hangout_attendees_capacity
  before insert on public.hangout_attendees
  for each row execute function public.enforce_hangout_capacity();

-- ═══════════════ 0026_email_domain_gate.sql ═══════════════

-- quad — server-side @nd.edu signup gate (fixes H1; this IS founder-queue item #3)
--
-- The "students only" restriction lived only in client JS (lib/auth-context.tsx).
-- Anyone with the public anon key (shipped in the web bundle) could call
-- POST /auth/v1/signup with any email and get a full account that RLS treats
-- like any student. This enforces the domain gate in the database.
--
-- A small allowlist table + a BEFORE INSERT trigger on auth.users rejects any
-- signup whose email domain isn't approved. Seeded with nd.edu. To allow a test
-- domain in a non-prod project (mirroring EXPO_PUBLIC_TEST_EMAIL_DOMAINS on the
-- client), insert another row, e.g.:
--   insert into public.allowed_email_domains values ('gmail.com');
--
-- NOTE: This complements — does not replace — the Supabase dashboard
-- "Authentication → Allowed email domains" setting. Set that too; belt and
-- suspenders. This trigger also gates admin/dashboard-created users, which is
-- intended (only approved domains). All quad signups are email/password, so
-- there's no OAuth path to special-case.
create table if not exists public.allowed_email_domains (
  domain text primary key
);

insert into public.allowed_email_domains (domain) values ('nd.edu')
  on conflict (domain) do nothing;

-- Lock the list down: RLS on, no policies → no anon/authenticated access at all.
-- The trigger below reads it as SECURITY DEFINER; service_role manages it.
alter table public.allowed_email_domains enable row level security;

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  if v_domain = '' then
    raise exception 'a valid email address is required' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.allowed_email_domains where domain = v_domain
  ) then
    raise exception 'signups are restricted to approved campus email domains'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_domain_check on auth.users;
create trigger on_auth_user_domain_check
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

-- Gate email CHANGES too, or the insert check is trivially bypassed: sign up
-- with a valid nd.edu address, then updateUser({ email: 'me@gmail.com' }) and
-- keep the account. GoTrue applies a confirmed email change as an UPDATE on
-- auth.users, so a BEFORE UPDATE OF email trigger catches it regardless of
-- which confirmation flow (single or double confirm) is configured.
drop trigger if exists on_auth_user_domain_check_update on auth.users;
create trigger on_auth_user_domain_check_update
  before update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.enforce_email_domain();

-- ═══════════════ 0027_anonymous_feed_views.sql ═══════════════

-- quad — anonymity: identity columns become unreadable, feeds move to views
-- (fixes C1, DATABASE HALF — see CLIENT_CONTRACT.md for the client half)
--
-- The original hole: base tables expose author_id (and a joinable profiles row)
-- for EVERY row, so any authenticated client can read the real author of any
-- "anonymous" voice, comment, gig, or hangout — masking was only in the client
-- mapper. Serving feeds through masking views alone would NOT close it: the
-- attacker just keeps querying the base table. So this migration does both
-- halves of the trust boundary:
--
--   1) COLUMN-LEVEL LOCKDOWN. Revoke table-wide SELECT on voices / gigs /
--      hangouts / comments from client roles and re-grant only the columns
--      that carry no identity. After this, `select author_id from voices`
--      (and any `select *`) fails with "permission denied" for authenticated —
--      the identity column is structurally unreadable, not merely un-selected.
--      Named-column embeds the app relies on (e.g. conversations →
--      gigs(title, payout_cents, anonymous) in lib/messaging.ts) keep working.
--      RLS policies and triggers are NOT privilege-checked, so insert/update/
--      delete-own policies and the score/count/push triggers are unaffected.
--      NOTE: columns added to these tables later are NOT auto-granted — new
--      columns default to unreadable (fail closed). Grant them here-style when
--      they are safe.
--
--   2) DEFINER FEED VIEWS. The views below are the ONLY sanctioned read path
--      for feeds and detail screens. They are definer-style (no
--      security_invoker), owned by postgres, so they can read the locked-down
--      columns; they null author fields on rows that are anonymous and not the
--      caller's own, and fold in the two-way block filter (0013/0022 semantics)
--      which definer execution would otherwise bypass. security_barrier stops
--      the planner from leaking pre-masked values through user-supplied
--      predicates. Masking uses IS DISTINCT FROM so a NULL auth.uid() can
--      never fall through to the unmasked branch.
--
-- Realtime is handled in 0028 (these tables leave the publication; a skinny
-- feed_events table carries change signals with no identity payload).
--
-- Client-visible breakage (intentional, fail-closed — repoint per
-- CLIENT_CONTRACT.md):
--   * any `select('*')` or author-profile embed on these four tables
--   * insert/update with `.select(...)` returning * (use return=minimal, then
--     read back through the view)
--   * filtering by author column on the base table (filter the view instead;
--     masked rows have NULL author columns and drop out of author filters)

-- ─────────────── 1) column-level lockdown ───────────────

revoke select on public.voices   from authenticated, anon;
revoke select on public.gigs     from authenticated, anon;
revoke select on public.hangouts from authenticated, anon;
revoke select on public.comments from authenticated, anon;

grant select (id, anonymous, body, topic, posted_at, vote_score, comment_count, origin)
  on public.voices to authenticated;

grant select (id, anonymous, title, description, category, payout_cents,
              location_label, lat, lon, posted_at, status, accepted_by,
              deadline_at, comment_count, origin)
  on public.gigs to authenticated;

grant select (id, anonymous, title, vibe, location_label, lat, lon, starts_at,
              when_label, max_people, description, created_at, comment_count, origin)
  on public.hangouts to authenticated;

grant select (id, target_type, target_id, anonymous, body, created_at, origin)
  on public.comments to authenticated;

-- hangout_attendees: the earliest attendee row is the host's implicit
-- self-RSVP (lib/posts-store.tsx), so a public attendee list de-anonymizes an
-- anonymous host. The app only ever reads it for (a) going-counts — served by
-- hangouts_feed.going_count below — and (b) the caller's own RSVP state. Lock
-- the SELECT policy to own rows; capacity checks (0025) and going_count run as
-- definer and still see everything.
drop policy if exists "hangout_attendees: read for authenticated" on public.hangout_attendees;
create policy "hangout_attendees: read own"
  on public.hangout_attendees for select
  to authenticated
  using (user_id = auth.uid());

-- ─────────────── 2) definer feed views ───────────────
-- drop-then-create (not or-replace): an earlier draft of this file created
-- these views with security_invoker = true, and CREATE OR REPLACE would keep
-- that reloption — silently breaking the definer read path.

drop view if exists public.voices_feed;
drop view if exists public.gigs_feed;
drop view if exists public.hangouts_feed;
drop view if exists public.comments_feed;

-- voices_feed
create view public.voices_feed
with (security_barrier = true) as
select
  v.id,
  v.anonymous,
  v.body,
  v.topic,
  v.posted_at,
  v.vote_score,
  v.comment_count,
  v.origin,
  case when v.anonymous and v.author_id is distinct from auth.uid() then null else v.author_id    end as author_id,
  case when v.anonymous and v.author_id is distinct from auth.uid() then null else p.display_name end as author_display_name,
  case when v.anonymous and v.author_id is distinct from auth.uid() then null else p.initials     end as author_initials,
  case when v.anonymous and v.author_id is distinct from auth.uid() then null else p.avatar_url   end as author_avatar_url
from public.voices v
join public.profiles p on p.id = v.author_id
where v.author_id = auth.uid() or not public.is_blocked(v.author_id);

-- gigs_feed
create view public.gigs_feed
with (security_barrier = true) as
select
  g.id,
  g.anonymous,
  g.title,
  g.description,
  g.category,
  g.payout_cents,
  g.location_label,
  g.lat,
  g.lon,
  g.posted_at,
  g.status,
  g.accepted_by,
  g.deadline_at,
  g.comment_count,
  g.origin,
  case when g.anonymous and g.poster_id is distinct from auth.uid() then null else g.poster_id    end as poster_id,
  case when g.anonymous and g.poster_id is distinct from auth.uid() then null else p.display_name end as poster_display_name,
  case when g.anonymous and g.poster_id is distinct from auth.uid() then null else p.initials     end as poster_initials,
  case when g.anonymous and g.poster_id is distinct from auth.uid() then null else p.avatar_url   end as poster_avatar_url
from public.gigs g
join public.profiles p on p.id = g.poster_id
where g.poster_id = auth.uid() or not public.is_blocked(g.poster_id);

-- hangouts_feed
create view public.hangouts_feed
with (security_barrier = true) as
select
  h.id,
  h.anonymous,
  h.title,
  h.vibe,
  h.location_label,
  h.lat,
  h.lon,
  h.starts_at,
  h.when_label,
  h.max_people,
  h.description,
  h.created_at,
  h.comment_count,
  h.origin,
  (select count(*)::int from public.hangout_attendees a where a.hangout_id = h.id) as going_count,
  case when h.anonymous and h.host_id is distinct from auth.uid() then null else h.host_id      end as host_id,
  case when h.anonymous and h.host_id is distinct from auth.uid() then null else p.display_name end as host_display_name,
  case when h.anonymous and h.host_id is distinct from auth.uid() then null else p.initials     end as host_initials,
  case when h.anonymous and h.host_id is distinct from auth.uid() then null else p.avatar_url   end as host_avatar_url
from public.hangouts h
join public.profiles p on p.id = h.host_id
where h.host_id = auth.uid() or not public.is_blocked(h.host_id);

-- comments_feed
create view public.comments_feed
with (security_barrier = true) as
select
  c.id,
  c.target_type,
  c.target_id,
  c.anonymous,
  c.body,
  c.created_at,
  c.origin,
  case when c.anonymous and c.author_id is distinct from auth.uid() then null else c.author_id    end as author_id,
  case when c.anonymous and c.author_id is distinct from auth.uid() then null else p.display_name end as author_display_name,
  case when c.anonymous and c.author_id is distinct from auth.uid() then null else p.initials     end as author_initials,
  case when c.anonymous and c.author_id is distinct from auth.uid() then null else p.avatar_url   end as author_avatar_url
from public.comments c
join public.profiles p on p.id = c.author_id
where c.author_id = auth.uid() or not public.is_blocked(c.author_id);

-- Grants: authenticated only. The explicit revokes matter — Supabase's default
-- privileges auto-grant new objects in public to anon as well, and an anon
-- read of a definer view would bypass base-table RLS entirely.
revoke all on public.voices_feed   from public, anon;
revoke all on public.gigs_feed     from public, anon;
revoke all on public.hangouts_feed from public, anon;
revoke all on public.comments_feed from public, anon;

grant select on public.voices_feed   to authenticated;
grant select on public.gigs_feed     to authenticated;
grant select on public.hangouts_feed to authenticated;
grant select on public.comments_feed to authenticated;

-- ═══════════════ 0028_realtime_feed_events.sql ═══════════════

-- quad — realtime without identity: swap content tables for feed_events
-- (companion to 0027; closes the realtime half of C1)
--
-- The supabase_realtime publication carried voices / gigs / hangouts /
-- comments / hangout_attendees as FULL ROWS, so every INSERT and UPDATE event
-- delivered author_id (and for attendees, the anonymous host's self-RSVP) to
-- every subscribed client — bypassing all the masking in 0027. Column
-- filtering inside Realtime payloads is not something we can verify or pin
-- from a migration, so we do not rely on it.
--
-- Replacement: a skinny feed_events table is the only feed-change signal.
-- Triggers on the content tables append one row per change (kind + op +
-- target id, never author columns); clients subscribe to INSERT on
-- feed_events and refetch the affected row through the 0027 views — the same
-- RLS-gated-refetch pattern 0022 established for comments. Messages and
-- conversation_members stay in the publication unchanged: they are not
-- anonymous surfaces and their events are already RLS-scoped to members.

-- ─────────────── feed_events ───────────────
create table public.feed_events (
  id                  bigint generated always as identity primary key,
  kind                text not null check (kind in ('gig', 'hangout', 'voice', 'comment')),
  op                  text not null check (op in ('insert', 'update', 'delete')),
  target_id           uuid not null,
  -- For kind = 'comment': the parent post, so thread screens can use a
  -- server-side realtime filter (comment_target_id=eq.<uuid>).
  comment_target_type text,
  comment_target_id   uuid,
  created_at          timestamptz not null default now()
);

create index feed_events_created_at_idx on public.feed_events (created_at);

alter table public.feed_events enable row level security;

-- Readable signal for every signed-in user; contains no identity.
create policy "feed_events: read for authenticated"
  on public.feed_events for select
  to authenticated
  using (true);

-- Writes happen only via the definer trigger below. Default privileges
-- auto-grant DML to client roles; strip it so RLS isn't the only barrier.
revoke insert, update, delete on public.feed_events from public, anon, authenticated;

-- ─────────────── emit trigger ───────────────
create or replace function public.emit_feed_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := tg_argv[0];
  v_id   bigint;
begin
  -- Branch on TG_OP with IF, never CASE-over-NEW/OLD: in a DELETE trigger NEW
  -- is unassigned and even a not-taken reference can raise in plpgsql.
  if v_kind = 'hangout_attendee' then
    -- RSVP changes surface as an update of the parent hangout (going_count).
    if tg_op = 'DELETE' then
      insert into public.feed_events (kind, op, target_id)
      values ('hangout', 'update', old.hangout_id)
      returning id into v_id;
    else
      insert into public.feed_events (kind, op, target_id)
      values ('hangout', 'update', new.hangout_id)
      returning id into v_id;
    end if;
  elsif v_kind = 'comment' then
    if tg_op = 'DELETE' then
      insert into public.feed_events (kind, op, target_id, comment_target_type, comment_target_id)
      values ('comment', 'delete', old.id, old.target_type, old.target_id)
      returning id into v_id;
    else
      insert into public.feed_events (kind, op, target_id, comment_target_type, comment_target_id)
      values ('comment', lower(tg_op), new.id, new.target_type, new.target_id)
      returning id into v_id;
    end if;
  else
    if tg_op = 'DELETE' then
      insert into public.feed_events (kind, op, target_id)
      values (v_kind, 'delete', old.id)
      returning id into v_id;
    else
      insert into public.feed_events (kind, op, target_id)
      values (v_kind, lower(tg_op), new.id)
      returning id into v_id;
    end if;
  end if;

  -- Amortized pruning: events are an ephemeral signal, not history. Every
  -- ~1000th event sweeps anything older than 3 days.
  if v_id % 1000 = 0 then
    delete from public.feed_events where created_at < now() - interval '3 days';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.emit_feed_event() from public;

-- voices
drop trigger if exists voices_feed_event_ins_del on public.voices;
create trigger voices_feed_event_ins_del
  after insert or delete on public.voices
  for each row execute function public.emit_feed_event('voice');
drop trigger if exists voices_feed_event_upd on public.voices;
create trigger voices_feed_event_upd
  after update on public.voices
  for each row
  when (old.* is distinct from new.*)
  execute function public.emit_feed_event('voice');

-- gigs
drop trigger if exists gigs_feed_event_ins_del on public.gigs;
create trigger gigs_feed_event_ins_del
  after insert or delete on public.gigs
  for each row execute function public.emit_feed_event('gig');
drop trigger if exists gigs_feed_event_upd on public.gigs;
create trigger gigs_feed_event_upd
  after update on public.gigs
  for each row
  when (old.* is distinct from new.*)
  execute function public.emit_feed_event('gig');

-- hangouts
drop trigger if exists hangouts_feed_event_ins_del on public.hangouts;
create trigger hangouts_feed_event_ins_del
  after insert or delete on public.hangouts
  for each row execute function public.emit_feed_event('hangout');
drop trigger if exists hangouts_feed_event_upd on public.hangouts;
create trigger hangouts_feed_event_upd
  after update on public.hangouts
  for each row
  when (old.* is distinct from new.*)
  execute function public.emit_feed_event('hangout');

-- comments (immutable — no update path)
drop trigger if exists comments_feed_event on public.comments;
create trigger comments_feed_event
  after insert or delete on public.comments
  for each row execute function public.emit_feed_event('comment');

-- hangout_attendees → parent hangout 'update' (live going_count)
drop trigger if exists hangout_attendees_feed_event on public.hangout_attendees;
create trigger hangout_attendees_feed_event
  after insert or delete on public.hangout_attendees
  for each row execute function public.emit_feed_event('hangout_attendee');

-- ─────────────── publication swap ───────────────
-- undefined_object = "table is not part of the publication"; tolerated so
-- re-runs and fresh projects both work.
do $$ begin
  alter publication supabase_realtime drop table public.voices;
exception when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.gigs;
exception when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.hangouts;
exception when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.comments;
exception when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.hangout_attendees;
exception when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.feed_events;
exception when duplicate_object then null; end $$;

-- ═══════════════ 0029_conversation_block_enforcement.sql ═══════════════

-- quad — enforce blocks at the conversation trust boundary (fixes M2 write
-- side + M3)
--
-- 0013 made blocked users' MESSAGES invisible, but nothing stopped the writes:
--   * M3: start_gig_conversation ignored blocks, so a blocked user could
--     re-create (or re-join) the 1:1 thread with the person who blocked them —
--     the conversation kept reappearing in the blocker's inbox forever.
--   * M2 (write side): the messages INSERT policy only checked membership, so
--     a blocked user could keep posting into an existing shared conversation.
--     Combined with 0024 (which stopped counting their messages) the spam was
--     at least invisible, but the rows still landed and group threads carried
--     hidden messages.
--
-- Semantics chosen:
--   * 1:1 gig conversations: a block on EITHER side stops thread creation and
--     message sends entirely.
--   * Hangout group chats: joining the hangout of someone you're in a block
--     relationship with is refused (join_hangout), but sends into group
--     threads you're already in stay allowed — a third party's block must not
--     gag the whole room, and 0013's read filter already hides the blocked
--     pair from each other.
--
-- Error code contract (for the client): blocked operations raise with
-- errcode 42501 (insufficient_privilege) and a human-readable message.

-- ─────────────── start_gig_conversation: refuse across a block ───────────────
create or replace function public.start_gig_conversation(p_gig_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_poster    uuid;
  v_conv_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select poster_id into v_poster from public.gigs where id = p_gig_id;
  if v_poster is null then
    raise exception 'gig not found' using errcode = 'P0002';
  end if;

  if v_poster = v_me then
    raise exception 'cannot message yourself' using errcode = '22023';
  end if;

  -- Either side of a block relationship kills the thread before it starts.
  if public.is_blocked(v_poster) then
    raise exception 'you cannot message this user' using errcode = '42501';
  end if;

  -- Reuse an existing 1:1 thread between exactly these two for this gig.
  select c.id into v_conv_id
    from public.conversations c
    join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = v_me
    join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = v_poster
   where c.gig_id = p_gig_id
   limit 1;

  if v_conv_id is null then
    insert into public.conversations (gig_id) values (p_gig_id)
      returning id into v_conv_id;
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me), (v_conv_id, v_poster)
      on conflict do nothing;
  else
    -- Defensive: heal a half-membered conversation (shouldn't happen).
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me), (v_conv_id, v_poster)
      on conflict do nothing;
  end if;

  return v_conv_id;
end;
$$;

revoke all on function public.start_gig_conversation(uuid) from public;
grant execute on function public.start_gig_conversation(uuid) to authenticated;

-- ─────────────── join_hangout: refuse across a host block ───────────────
-- Body otherwise unchanged from 0007; the capacity check here is redundant
-- with the 0025 trigger but harmless.
create or replace function public.join_hangout(p_hangout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_host      uuid;
  v_max       int;
  v_count     int;
  v_conv_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select host_id, max_people into v_host, v_max
    from public.hangouts where id = p_hangout_id;
  if v_host is null then
    raise exception 'hangout not found' using errcode = 'P0002';
  end if;

  if v_me <> v_host and public.is_blocked(v_host) then
    raise exception 'you cannot join this hangout' using errcode = '42501';
  end if;

  -- Capacity check; allow the host to always be in.
  if v_me <> v_host then
    select count(*) into v_count
      from public.hangout_attendees where hangout_id = p_hangout_id;
    if v_count >= v_max then
      raise exception 'hangout is full' using errcode = '23514';
    end if;
  end if;

  -- RSVP (idempotent).
  insert into public.hangout_attendees (hangout_id, user_id)
    values (p_hangout_id, v_me)
    on conflict do nothing;

  -- Find or create the group conversation tied to this hangout.
  select id into v_conv_id from public.conversations
    where hangout_id = p_hangout_id limit 1;

  if v_conv_id is null then
    insert into public.conversations (hangout_id) values (p_hangout_id)
      returning id into v_conv_id;
    insert into public.conversation_members (conversation_id, user_id)
    select v_conv_id, a.user_id from public.hangout_attendees a
      where a.hangout_id = p_hangout_id
    union
    select v_conv_id, v_host
    on conflict do nothing;
  else
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me)
      on conflict do nothing;
  end if;

  return v_conv_id;
end;
$$;

revoke all on function public.join_hangout(uuid) from public;
grant execute on function public.join_hangout(uuid) to authenticated;

-- ─────────────── messages: refuse 1:1 sends across a block ───────────────
-- Definer helper so the policy doesn't re-enter conversation_members RLS.
-- Membership plus: in a GIG (1:1) conversation, no other member may be in a
-- block relationship with the sender. Hangout group chats deliberately skip
-- the block test (see header).
create or replace function public.can_message_conversation(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = auth.uid()
  )
  and not exists (
    select 1
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = conv_id
      and c.gig_id is not null
      and cm.user_id <> auth.uid()
      and public.is_blocked(cm.user_id)
  );
$$;

revoke all on function public.can_message_conversation(uuid) from public;
grant execute on function public.can_message_conversation(uuid) to authenticated;

drop policy if exists "messages: send if member and self" on public.messages;
create policy "messages: send if member and self"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_message_conversation(conversation_id)
  );

-- ═══════════════ 0030_reports_hardening.sql ═══════════════

-- quad — reports: server-resolved target, dedupe, rate limit (fixes M6)
--
-- 0014 let the CLIENT fill target_user_id, so a report could be pointed at
-- anyone regardless of who actually authored the reported content — poisoning
-- the moderation queue against an innocent user. There was also no uniqueness
-- or rate limit, so one student could file unlimited duplicate reports and
-- manufacture "10 reports against X" out of thin air.
--
--   1) A BEFORE INSERT trigger resolves target_user_id from
--      (target_kind, target_id) server-side and OVERWRITES whatever the
--      client sent. Unresolvable target → the insert is rejected.
--   2) unique(reporter_id, target_kind, target_id) — one report per person
--      per thing. Client contract: a duplicate insert now fails with 23505;
--      treat it as "already reported" (the read-own policy already lets the
--      client check first).
--   3) Rate limit: max 20 reports per reporter per hour, enforced in the same
--      trigger (definer, so it sees all the reporter's rows).

create or replace function public.reports_resolve_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if (select count(*) from public.reports
       where reporter_id = new.reporter_id
         and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many reports; please try again later'
      using errcode = '54000';
  end if;

  if new.target_kind = 'gig' then
    select poster_id into v_author from public.gigs     where id = new.target_id;
  elsif new.target_kind = 'hangout' then
    select host_id   into v_author from public.hangouts where id = new.target_id;
  elsif new.target_kind = 'voice' then
    select author_id into v_author from public.voices   where id = new.target_id;
  elsif new.target_kind = 'message' then
    select sender_id into v_author from public.messages where id = new.target_id;
  elsif new.target_kind = 'profile' then
    select id        into v_author from public.profiles where id = new.target_id;
  end if;

  if v_author is null then
    raise exception 'report target not found' using errcode = 'P0002';
  end if;

  -- Never trust the client's value.
  new.target_user_id := v_author;
  return new;
end;
$$;

revoke all on function public.reports_resolve_target() from public;

drop trigger if exists reports_resolve_target on public.reports;
create trigger reports_resolve_target
  before insert on public.reports
  for each row execute function public.reports_resolve_target();

-- Dedupe any existing duplicates (keep the earliest), then enforce uniqueness.
delete from public.reports a
using public.reports b
where a.reporter_id = b.reporter_id
  and a.target_kind = b.target_kind
  and a.target_id   = b.target_id
  and (a.created_at > b.created_at
       or (a.created_at = b.created_at and a.id > b.id));

create unique index if not exists reports_reporter_target_uniq
  on public.reports (reporter_id, target_kind, target_id);

-- ═══════════════ 0031_storage_bucket_limits.sql ═══════════════

-- quad — storage buckets: size + MIME limits (fixes M4)
--
-- Both public buckets accepted any content-type at any size — the
-- content-type is client-set, so anyone with the anon key (it ships in the
-- web bundle) could PUT multi-gigabyte or arbitrary non-image files into a
-- public, CDN-served bucket. Supabase Storage enforces these limits
-- server-side at upload time.
--
-- Limits vs. actual client behavior (lib/message-images.ts, lib/avatars.ts):
-- both upload compressed JPEGs well under 2 MB; png/webp are allowed as
-- headroom for future formats. If an upload starts failing with 413 /
-- "invalid mime type", the client is out of contract, not the bucket.

update storage.buckets
   set file_size_limit    = 10485760,  -- 10 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'message-images';

update storage.buckets
   set file_size_limit    = 5242880,   -- 5 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'avatars';

-- ═══════════════ 0032_content_length_limits.sql ═══════════════

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

-- ═══════════════ 0033_membership_lock_and_comment_reports.sql ═══════════════

-- quad — lock conversation membership rewrites (fixes C1) + report comments
-- (fixes H4)
--
-- C1: the "conversation_members: update own" policy (0002) only pins
-- user_id = auth.uid() in USING/WITH CHECK; it never pins conversation_id.
-- Row-level policies cannot restrict WHICH COLUMNS change, so a member could
-- PATCH their own row's conversation_id to any other thread's uuid — USING
-- matches their old row, WITH CHECK still sees user_id = me, so it passes —
-- and thereby read (and, post-0029, send into) a conversation they were never
-- invited to. This re-opened via UPDATE the membership-forgery hole 0023 shut
-- for INSERT. Fix at the privilege layer instead of the policy layer: a
-- column-level UPDATE grant makes last_read_at the ONLY updatable column, so
-- the PK columns can no longer be rewritten by anyone. The row-scoping policy
-- from 0002 still applies on top.
revoke update on public.conversation_members from authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

-- H4: reports had no `comment` target kind, so the client filed a reported
-- comment against its PARENT POST and attached the comment author as
-- target_user_id — which 0030's trigger then OVERWRITES with the parent post's
-- author ("never trust the client"). Net effect: reporting a harassing comment
-- pinned the report on the innocent post owner and recorded nothing about which
-- comment was reported. Add a first-class `comment` kind resolved server-side.
alter type public.report_target_kind add value if not exists 'comment';

-- Re-create the resolver with a comments branch. Body otherwise identical to
-- 0030 (rate limit + server-authoritative target_user_id).
create or replace function public.reports_resolve_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if (select count(*) from public.reports
       where reporter_id = new.reporter_id
         and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many reports; please try again later'
      using errcode = '54000';
  end if;

  if new.target_kind = 'gig' then
    select poster_id into v_author from public.gigs     where id = new.target_id;
  elsif new.target_kind = 'hangout' then
    select host_id   into v_author from public.hangouts where id = new.target_id;
  elsif new.target_kind = 'voice' then
    select author_id into v_author from public.voices   where id = new.target_id;
  elsif new.target_kind = 'comment' then
    select author_id into v_author from public.comments where id = new.target_id;
  elsif new.target_kind = 'message' then
    select sender_id into v_author from public.messages where id = new.target_id;
  elsif new.target_kind = 'profile' then
    select id        into v_author from public.profiles where id = new.target_id;
  end if;

  if v_author is null then
    raise exception 'report target not found' using errcode = 'P0002';
  end if;

  -- Never trust the client's value.
  new.target_user_id := v_author;
  return new;
end;
$$;

revoke all on function public.reports_resolve_target() from public;

-- ═══════════════ 0034_anon_dm_lockdown_read_rpc_profile_limits.sql ═══════════════

-- quad — server-enforce "no DMing anonymous gig posters" (H1), server-clock
-- read receipts (M3), and profile length limits (M8).
--
-- H1: the feed masks an anonymous gig's poster_id (0027), but any authenticated
-- user could still call start_gig_conversation(anon_gig) — which seeds the
-- poster as a readable conversation_members row — and join it to profiles to
-- recover the poster's real identity: a one-RPC, no-consent mass de-anonymizer.
-- The CLIENT already forbids messaging anonymous posters (app/gig/[id].tsx:
-- `canMessage = !isOwn && !gig.anonymous && …`); this makes the server enforce
-- the same rule instead of trusting the UI. (Anonymous hangouts still form a
-- group chat with the host — attendees are meeting them in person — so the
-- client masks the host's identity in that chat rather than blocking the join.)
create or replace function public.start_gig_conversation(p_gig_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_poster    uuid;
  v_anon      boolean;
  v_conv_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select poster_id, anonymous into v_poster, v_anon
    from public.gigs where id = p_gig_id;
  if v_poster is null then
    raise exception 'gig not found' using errcode = 'P0002';
  end if;

  if v_poster = v_me then
    raise exception 'cannot message yourself' using errcode = '22023';
  end if;

  -- Anonymous posters are unreachable by DM — messaging them would leak the
  -- identity the anonymous flag exists to protect.
  if v_anon then
    raise exception 'this poster cannot be messaged' using errcode = '42501';
  end if;

  -- Either side of a block relationship kills the thread before it starts.
  if public.is_blocked(v_poster) then
    raise exception 'you cannot message this user' using errcode = '42501';
  end if;

  -- Reuse an existing 1:1 thread between exactly these two for this gig.
  select c.id into v_conv_id
    from public.conversations c
    join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = v_me
    join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = v_poster
   where c.gig_id = p_gig_id
   limit 1;

  if v_conv_id is null then
    insert into public.conversations (gig_id) values (p_gig_id)
      returning id into v_conv_id;
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me), (v_conv_id, v_poster)
      on conflict do nothing;
  else
    -- Defensive: heal a half-membered conversation (shouldn't happen).
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me), (v_conv_id, v_poster)
      on conflict do nothing;
  end if;

  return v_conv_id;
end;
$$;

revoke all on function public.start_gig_conversation(uuid) from public;
grant execute on function public.start_gig_conversation(uuid) to authenticated;

-- M3: mark-as-read used the CLIENT clock (new Date().toISOString()) written to
-- last_read_at, then compared against server-generated sent_at. A device clock
-- skewed slow leaves a thread stuck "unread" forever; skewed fast marks unseen
-- messages read. Stamp last_read_at with the SERVER clock via a definer RPC so
-- it's always on the same timeline as sent_at. (Definer also sidesteps the
-- column-level UPDATE grant from 0033 — though it only writes last_read_at.)
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_members
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = auth.uid();
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- M8: profiles shipped with unbounded text columns (only bio was capped, and
-- only client-side). display_name is joined into every feed/comment/message
-- row via the 0027 views, so a 1 MB name is a feed-wide DoS — the same class
-- 0032 fixed for gigs/hangouts. Mirror those limits here, and cap the links
-- array so it can't grow without bound. NOT VALID binds new/updated rows
-- immediately while skipping a scan of existing rows (see 0032 for the
-- validate-after-deploy step).
alter table public.profiles
  add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) <= 60) not valid;

alter table public.profiles
  add constraint profiles_initials_len
  check (initials is null or char_length(initials) <= 8) not valid;

alter table public.profiles
  add constraint profiles_major_len
  check (major is null or char_length(major) <= 80) not valid;

alter table public.profiles
  add constraint profiles_dorm_len
  check (dorm is null or char_length(dorm) <= 80) not valid;

alter table public.profiles
  add constraint profiles_bio_len
  check (bio is null or char_length(bio) <= 240) not valid;

alter table public.profiles
  add constraint profiles_links_count
  check (jsonb_array_length(links) <= 10) not valid;

-- ═══════════════ 0035_reports_read_lockdown.sql ═══════════════

-- quad — reports: close the de-anonymization oracle (read-own leaked the
-- server-resolved author id)
--
-- 0030/0033's resolver trigger runs SECURITY DEFINER and stamps the REAL
-- author id into reports.target_user_id — including for anonymous voices,
-- gigs, hangouts, and comments. 0014's "reports: read own" SELECT policy then
-- let the reporter read their own row back. Net effect: report any anonymous
-- post → select your own report → target_user_id is the anonymous author's
-- uid → the public profiles directory turns that into a name. At the 20/hr
-- report rate limit that's ~480 de-anonymizations per day per account, which
-- defeats the entire 0027 masking architecture.
--
-- The client never SELECTs reports: app/report.tsx only inserts (with the
-- default return=minimal), and "already reported" rides the 23505 unique
-- violation from 0030's dedupe index, not a read-back. The moderator queue
-- uses the service role, which none of this touches. So the client read path
-- can simply cease to exist — fail closed.

drop policy if exists "reports: read own" on public.reports;

-- Belt and suspenders: even if a future migration adds a SELECT policy, the
-- table-level grant is gone until someone deliberately re-grants columns
-- (and they should exclude target_user_id when they do).
revoke select on public.reports from authenticated, anon;

-- ═══════════════ 0036_content_rate_limits.sql ═══════════════

-- quad — per-author insert rate limits on content tables
--
-- Until now the only rate limit anywhere was reports (0030, 20/hr). Every
-- gig/hangout insert fires notify_new_post → a push to EVERY registered
-- device, with the (attacker-controlled) title as the body. With the anon key
-- public by design, one hostile student with a script could blast the whole
-- campus and flood every feed — a week-one trust killer at a school this
-- small. 0032/0033 capped row SIZE; nothing capped row COUNT.
--
-- One BEFORE INSERT trigger, shared across the five content tables, counting
-- the caller's own rows in the last hour. SECURITY DEFINER because the
-- authenticated role can no longer SELECT the author columns on these tables
-- (0027 column lockdown), so an invoker-rights count would itself be denied.
-- Errcode 54000 to match the reports limiter — clients already map it.
--
-- Limits (per author, per rolling hour) — generous multiples of any honest
-- usage at launch scale:
--   gigs 5 · hangouts 5 · voices 10 · comments 60 · messages 120

create or replace function public.enforce_content_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := tg_argv[0]::int;
  v_count int;
begin
  if auth.uid() is null then
    -- Definer functions and service-role writes (seeds, moderation) are not
    -- subject to the limit.
    return new;
  end if;

  if tg_table_name = 'gigs' then
    select count(*) into v_count from public.gigs
      where poster_id = auth.uid() and posted_at > now() - interval '1 hour';
  elsif tg_table_name = 'hangouts' then
    select count(*) into v_count from public.hangouts
      where host_id = auth.uid() and created_at > now() - interval '1 hour';
  elsif tg_table_name = 'voices' then
    select count(*) into v_count from public.voices
      where author_id = auth.uid() and posted_at > now() - interval '1 hour';
  elsif tg_table_name = 'comments' then
    select count(*) into v_count from public.comments
      where author_id = auth.uid() and created_at > now() - interval '1 hour';
  elsif tg_table_name = 'messages' then
    select count(*) into v_count from public.messages
      where sender_id = auth.uid() and sent_at > now() - interval '1 hour';
  else
    return new;
  end if;

  if v_count >= v_limit then
    raise exception 'rate limit: too many % in the last hour', tg_table_name
      using errcode = '54000';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_content_rate_limit() from public;

drop trigger if exists rate_limit_gigs on public.gigs;
create trigger rate_limit_gigs
  before insert on public.gigs
  for each row execute function public.enforce_content_rate_limit('5');

drop trigger if exists rate_limit_hangouts on public.hangouts;
create trigger rate_limit_hangouts
  before insert on public.hangouts
  for each row execute function public.enforce_content_rate_limit('5');

drop trigger if exists rate_limit_voices on public.voices;
create trigger rate_limit_voices
  before insert on public.voices
  for each row execute function public.enforce_content_rate_limit('10');

drop trigger if exists rate_limit_comments on public.comments;
create trigger rate_limit_comments
  before insert on public.comments
  for each row execute function public.enforce_content_rate_limit('60');

drop trigger if exists rate_limit_messages on public.messages;
create trigger rate_limit_messages
  before insert on public.messages
  for each row execute function public.enforce_content_rate_limit('120');

-- ═══════════════ 0037_message_images_anon_path.sql ═══════════════

-- quad — message-images: stop leaking the uploader's uid in the object path
--
-- 0017's path convention was `{userId}/{stamp}-{rand}.jpg`, and the public
-- URL is stored verbatim in messages.image_url — readable by every member of
-- the conversation. For an ANONYMOUS hangout host that meant any group member
-- could read the host's real uid out of an image URL and resolve it against
-- the public profiles directory: a de-anonymization path the 0027/0034 work
-- didn't cover.
--
-- New convention (client change ships with this migration):
--   `{conversationId}/{stamp}-{rand}.jpg`
-- The conversation id is shared knowledge among members and identifies no
-- one. Upload rights change from "own folder" to "a conversation I belong
-- to", via the same is_conversation_member() helper the messages RLS uses.
--
-- Kept as-is, deliberately:
--   * public read (URLs are unguessable; a private bucket + signed URLs is a
--     larger change tracked for later),
--   * the owner-folder UPDATE/DELETE policies — they still govern legacy
--     `{uid}/...` objects and simply never match the new paths (messages are
--     immutable in v1; deletion happens via the delete-account function's
--     service role, which RLS doesn't bind).
--   * delete-account must now ALSO remove objects referenced by the user's
--     messages.image_url, not just the `{uid}/` prefix — shipped in the same
--     commit (supabase/functions/delete-account).

drop policy if exists "message-images: owner insert" on storage.objects;
create policy "message-images: member insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-images'
    -- Non-uuid first segments fail the cast loudly (fail closed).
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );
