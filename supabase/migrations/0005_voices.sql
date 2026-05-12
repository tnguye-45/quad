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
