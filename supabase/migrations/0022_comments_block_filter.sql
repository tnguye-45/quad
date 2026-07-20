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
