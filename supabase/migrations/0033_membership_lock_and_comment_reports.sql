-- quad — lock conversation membership rewrites (fixes C1) + report comments
-- (fixes H4)
--
-- C1: the "conversation_members: update own" policy (0002) only pins
-- user_id = auth.uid() in USING/WITH CHECK; it never pins conversation_id.
-- Row-level policies cannot restrict WHICH COLUMNS change, so a member could
-- PATCH their own row's conversation_id to any other thread's uuid — USING
-- matches their old row, WITH CHECK still sees user_id = me, so it passes —
-- and thereby read (and, post-0029, send into) a conversation they were never
-- invited to. This re-opened via UPDATE the membership-forgery hole 0023 shut
-- for INSERT. Fix at the privilege layer instead of the policy layer: a
-- column-level UPDATE grant makes last_read_at the ONLY updatable column, so
-- the PK columns can no longer be rewritten by anyone. The row-scoping policy
-- from 0002 still applies on top.
revoke update on public.conversation_members from authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

-- H4: reports had no `comment` target kind, so the client filed a reported
-- comment against its PARENT POST and attached the comment author as
-- target_user_id — which 0030's trigger then OVERWRITES with the parent post's
-- author ("never trust the client"). Net effect: reporting a harassing comment
-- pinned the report on the innocent post owner and recorded nothing about which
-- comment was reported. Add a first-class `comment` kind resolved server-side.
alter type public.report_target_kind add value if not exists 'comment';

-- Re-create the resolver with a comments branch. Body otherwise identical to
-- 0030 (rate limit + server-authoritative target_user_id).
create or replace function public.reports_resolve_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if (select count(*) from public.reports
       where reporter_id = new.reporter_id
         and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many reports; please try again later'
      using errcode = '54000';
  end if;

  if new.target_kind = 'gig' then
    select poster_id into v_author from public.gigs     where id = new.target_id;
  elsif new.target_kind = 'hangout' then
    select host_id   into v_author from public.hangouts where id = new.target_id;
  elsif new.target_kind = 'voice' then
    select author_id into v_author from public.voices   where id = new.target_id;
  elsif new.target_kind = 'comment' then
    select author_id into v_author from public.comments where id = new.target_id;
  elsif new.target_kind = 'message' then
    select sender_id into v_author from public.messages where id = new.target_id;
  elsif new.target_kind = 'profile' then
    select id        into v_author from public.profiles where id = new.target_id;
  end if;

  if v_author is null then
    raise exception 'report target not found' using errcode = 'P0002';
  end if;

  -- Never trust the client's value.
  new.target_user_id := v_author;
  return new;
end;
$$;

revoke all on function public.reports_resolve_target() from public;
