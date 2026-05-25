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
