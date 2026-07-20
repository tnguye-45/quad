-- quad — storage buckets: size + MIME limits (fixes M4)
--
-- Both public buckets accepted any content-type at any size — the
-- content-type is client-set, so anyone with the anon key (it ships in the
-- web bundle) could PUT multi-gigabyte or arbitrary non-image files into a
-- public, CDN-served bucket. Supabase Storage enforces these limits
-- server-side at upload time.
--
-- Limits vs. actual client behavior (lib/message-images.ts, lib/avatars.ts):
-- both upload compressed JPEGs well under 2 MB; png/webp are allowed as
-- headroom for future formats. If an upload starts failing with 413 /
-- "invalid mime type", the client is out of contract, not the bucket.

update storage.buckets
   set file_size_limit    = 10485760,  -- 10 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'message-images';

update storage.buckets
   set file_size_limit    = 5242880,   -- 5 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'avatars';
