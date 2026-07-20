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
