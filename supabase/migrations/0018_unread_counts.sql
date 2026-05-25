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
