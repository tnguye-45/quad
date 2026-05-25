-- quad — Phase 3: message-images storage bucket
--
-- Public bucket so any conversation member can render an inlined image
-- without needing a signed URL roundtrip. Writes / deletes are owner-only,
-- enforced by checking the first path segment against `auth.uid()` — same
-- pattern as the `avatars` bucket (see 0010_avatars_bucket.sql).
--
-- Path convention: `{userId}/{messageId-or-uuid}.jpg` — one image per row.
-- We don't bother with a server-side reference count: messages are immutable
-- in v1, so the upload path mirrors the message lifecycle 1:1.

insert into storage.buckets (id, name, public)
values ('message-images', 'message-images', true)
on conflict (id) do update set public = true;

drop policy if exists "message-images: public read" on storage.objects;
create policy "message-images: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'message-images');

drop policy if exists "message-images: owner insert" on storage.objects;
create policy "message-images: owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "message-images: owner update" on storage.objects;
create policy "message-images: owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "message-images: owner delete" on storage.objects;
create policy "message-images: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
