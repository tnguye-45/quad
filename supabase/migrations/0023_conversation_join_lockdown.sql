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
