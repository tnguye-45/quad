-- quad — enforce blocks at the conversation trust boundary (fixes M2 write
-- side + M3)
--
-- 0013 made blocked users' MESSAGES invisible, but nothing stopped the writes:
--   * M3: start_gig_conversation ignored blocks, so a blocked user could
--     re-create (or re-join) the 1:1 thread with the person who blocked them —
--     the conversation kept reappearing in the blocker's inbox forever.
--   * M2 (write side): the messages INSERT policy only checked membership, so
--     a blocked user could keep posting into an existing shared conversation.
--     Combined with 0024 (which stopped counting their messages) the spam was
--     at least invisible, but the rows still landed and group threads carried
--     hidden messages.
--
-- Semantics chosen:
--   * 1:1 gig conversations: a block on EITHER side stops thread creation and
--     message sends entirely.
--   * Hangout group chats: joining the hangout of someone you're in a block
--     relationship with is refused (join_hangout), but sends into group
--     threads you're already in stay allowed — a third party's block must not
--     gag the whole room, and 0013's read filter already hides the blocked
--     pair from each other.
--
-- Error code contract (for the client): blocked operations raise with
-- errcode 42501 (insufficient_privilege) and a human-readable message.

-- ─────────────── start_gig_conversation: refuse across a block ───────────────
create or replace function public.start_gig_conversation(p_gig_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_poster    uuid;
  v_conv_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select poster_id into v_poster from public.gigs where id = p_gig_id;
  if v_poster is null then
    raise exception 'gig not found' using errcode = 'P0002';
  end if;

  if v_poster = v_me then
    raise exception 'cannot message yourself' using errcode = '22023';
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

-- ─────────────── join_hangout: refuse across a host block ───────────────
-- Body otherwise unchanged from 0007; the capacity check here is redundant
-- with the 0025 trigger but harmless.
create or replace function public.join_hangout(p_hangout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_host      uuid;
  v_max       int;
  v_count     int;
  v_conv_id   uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select host_id, max_people into v_host, v_max
    from public.hangouts where id = p_hangout_id;
  if v_host is null then
    raise exception 'hangout not found' using errcode = 'P0002';
  end if;

  if v_me <> v_host and public.is_blocked(v_host) then
    raise exception 'you cannot join this hangout' using errcode = '42501';
  end if;

  -- Capacity check; allow the host to always be in.
  if v_me <> v_host then
    select count(*) into v_count
      from public.hangout_attendees where hangout_id = p_hangout_id;
    if v_count >= v_max then
      raise exception 'hangout is full' using errcode = '23514';
    end if;
  end if;

  -- RSVP (idempotent).
  insert into public.hangout_attendees (hangout_id, user_id)
    values (p_hangout_id, v_me)
    on conflict do nothing;

  -- Find or create the group conversation tied to this hangout.
  select id into v_conv_id from public.conversations
    where hangout_id = p_hangout_id limit 1;

  if v_conv_id is null then
    insert into public.conversations (hangout_id) values (p_hangout_id)
      returning id into v_conv_id;
    insert into public.conversation_members (conversation_id, user_id)
    select v_conv_id, a.user_id from public.hangout_attendees a
      where a.hangout_id = p_hangout_id
    union
    select v_conv_id, v_host
    on conflict do nothing;
  else
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me)
      on conflict do nothing;
  end if;

  return v_conv_id;
end;
$$;

revoke all on function public.join_hangout(uuid) from public;
grant execute on function public.join_hangout(uuid) to authenticated;

-- ─────────────── messages: refuse 1:1 sends across a block ───────────────
-- Definer helper so the policy doesn't re-enter conversation_members RLS.
-- Membership plus: in a GIG (1:1) conversation, no other member may be in a
-- block relationship with the sender. Hangout group chats deliberately skip
-- the block test (see header).
create or replace function public.can_message_conversation(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = auth.uid()
  )
  and not exists (
    select 1
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = conv_id
      and c.gig_id is not null
      and cm.user_id <> auth.uid()
      and public.is_blocked(cm.user_id)
  );
$$;

revoke all on function public.can_message_conversation(uuid) from public;
grant execute on function public.can_message_conversation(uuid) to authenticated;

drop policy if exists "messages: send if member and self" on public.messages;
create policy "messages: send if member and self"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_message_conversation(conversation_id)
  );
