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
