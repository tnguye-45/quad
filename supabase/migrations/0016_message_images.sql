-- quad — Phase 3: image attachments on messages
--
-- A message can now carry an image instead of (or in addition to) text. The
-- existing `body NOT NULL` + `length(body) > 0` constraint on messages
-- prevents image-only sends, so we relax it to allow either:
--   * non-empty body, or
--   * non-null image_url
-- The new image_url column is a public Supabase Storage URL pointing at the
-- `message-images` bucket (created in 0017). image_width / image_height are
-- captured at upload time so the chat UI can size the bubble correctly
-- before the image finishes downloading (no layout jump).

alter table public.messages
  add column if not exists image_url    text,
  add column if not exists image_width  integer,
  add column if not exists image_height integer;

-- Relax the body constraint. The original check forbids empty body; we now
-- allow empty body iff image_url is set. Drop the old constraint by name if
-- it exists (Postgres auto-names it messages_body_check), then add ours.
do $$
declare
  v_name text;
begin
  select conname into v_name
    from pg_constraint
   where conrelid = 'public.messages'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%length(body)%';
  if v_name is not null then
    execute format('alter table public.messages drop constraint %I', v_name);
  end if;
end $$;

-- Also drop the NOT NULL on body so image-only messages don't trip it.
alter table public.messages alter column body drop not null;

alter table public.messages
  add constraint messages_body_or_image_check check (
    (body is not null and length(body) > 0 and length(body) <= 4000)
    or image_url is not null
  );

-- Realtime + RLS already cover the new columns transparently; no policy edits
-- needed because reads gate on conversation membership, not specific columns.
