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
