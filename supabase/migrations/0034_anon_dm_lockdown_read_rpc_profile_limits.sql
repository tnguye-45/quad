-- quad — server-enforce "no DMing anonymous gig posters" (H1), server-clock
-- read receipts (M3), and profile length limits (M8).
--
-- H1: the feed masks an anonymous gig's poster_id (0027), but any authenticated
-- user could still call start_gig_conversation(anon_gig) — which seeds the
-- poster as a readable conversation_members row — and join it to profiles to
-- recover the poster's real identity: a one-RPC, no-consent mass de-anonymizer.
-- The CLIENT already forbids messaging anonymous posters (app/gig/[id].tsx:
-- `canMessage = !isOwn && !gig.anonymous && …`); this makes the server enforce
-- the same rule instead of trusting the UI. (Anonymous hangouts still form a
-- group chat with the host — attendees are meeting them in person — so the
-- client masks the host's identity in that chat rather than blocking the join.)
create or replace function public.start_gig_conversation(p_gig_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_poster    uuid;
  v_anon      boolean;
  v_conv_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select poster_id, anonymous into v_poster, v_anon
    from public.gigs where id = p_gig_id;
  if v_poster is null then
    raise exception 'gig not found' using errcode = 'P0002';
  end if;

  if v_poster = v_me then
    raise exception 'cannot message yourself' using errcode = '22023';
  end if;

  -- Anonymous posters are unreachable by DM — messaging them would leak the
  -- identity the anonymous flag exists to protect.
  if v_anon then
    raise exception 'this poster cannot be messaged' using errcode = '42501';
  end if;

  -- Either side of a block relationship kills the thread before it starts.
  if public.is_blocked(v_poster) then
    raise exception 'you cannot message this user' using errcode = '42501';
  end if;

  -- Reuse an existing 1:1 thread between exactly these two for this gig.
  select c.id into v_conv_id
    from public.conversations c
    join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = v_me
    join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = v_poster
   where c.gig_id = p_gig_id
   limit 1;

  if v_conv_id is null then
    insert into public.conversations (gig_id) values (p_gig_id)
      returning id into v_conv_id;
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me), (v_conv_id, v_poster)
      on conflict do nothing;
  else
    -- Defensive: heal a half-membered conversation (shouldn't happen).
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me), (v_conv_id, v_poster)
      on conflict do nothing;
  end if;

  return v_conv_id;
end;
$$;

revoke all on function public.start_gig_conversation(uuid) from public;
grant execute on function public.start_gig_conversation(uuid) to authenticated;

-- M3: mark-as-read used the CLIENT clock (new Date().toISOString()) written to
-- last_read_at, then compared against server-generated sent_at. A device clock
-- skewed slow leaves a thread stuck "unread" forever; skewed fast marks unseen
-- messages read. Stamp last_read_at with the SERVER clock via a definer RPC so
-- it's always on the same timeline as sent_at. (Definer also sidesteps the
-- column-level UPDATE grant from 0033 — though it only writes last_read_at.)
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_members
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = auth.uid();
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- M8: profiles shipped with unbounded text columns (only bio was capped, and
-- only client-side). display_name is joined into every feed/comment/message
-- row via the 0027 views, so a 1 MB name is a feed-wide DoS — the same class
-- 0032 fixed for gigs/hangouts. Mirror those limits here, and cap the links
-- array so it can't grow without bound. NOT VALID binds new/updated rows
-- immediately while skipping a scan of existing rows (see 0032 for the
-- validate-after-deploy step).
alter table public.profiles
  add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) <= 60) not valid;

alter table public.profiles
  add constraint profiles_initials_len
  check (initials is null or char_length(initials) <= 8) not valid;

alter table public.profiles
  add constraint profiles_major_len
  check (major is null or char_length(major) <= 80) not valid;

alter table public.profiles
  add constraint profiles_dorm_len
  check (dorm is null or char_length(dorm) <= 80) not valid;

alter table public.profiles
  add constraint profiles_bio_len
  check (bio is null or char_length(bio) <= 240) not valid;

alter table public.profiles
  add constraint profiles_links_count
  check (jsonb_array_length(links) <= 10) not valid;
