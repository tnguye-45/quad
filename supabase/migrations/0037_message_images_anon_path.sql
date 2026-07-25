-- quad — message-images: stop leaking the uploader's uid in the object path
--
-- 0017's path convention was `{userId}/{stamp}-{rand}.jpg`, and the public
-- URL is stored verbatim in messages.image_url — readable by every member of
-- the conversation. For an ANONYMOUS hangout host that meant any group member
-- could read the host's real uid out of an image URL and resolve it against
-- the public profiles directory: a de-anonymization path the 0027/0034 work
-- didn't cover.
--
-- New convention (client change ships with this migration):
--   `{conversationId}/{stamp}-{rand}.jpg`
-- The conversation id is shared knowledge among members and identifies no
-- one. Upload rights change from "own folder" to "a conversation I belong
-- to", via the same is_conversation_member() helper the messages RLS uses.
--
-- Kept as-is, deliberately:
--   * public read (URLs are unguessable; a private bucket + signed URLs is a
--     larger change tracked for later),
--   * the owner-folder UPDATE/DELETE policies — they still govern legacy
--     `{uid}/...` objects and simply never match the new paths (messages are
--     immutable in v1; deletion happens via the delete-account function's
--     service role, which RLS doesn't bind).
--   * delete-account must now ALSO remove objects referenced by the user's
--     messages.image_url, not just the `{uid}/` prefix — shipped in the same
--     commit (supabase/functions/delete-account).

drop policy if exists "message-images: owner insert" on storage.objects;
create policy "message-images: member insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-images'
    -- Non-uuid first segments fail the cast loudly (fail closed).
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );
