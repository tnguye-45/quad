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
