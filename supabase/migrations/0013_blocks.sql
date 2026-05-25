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
