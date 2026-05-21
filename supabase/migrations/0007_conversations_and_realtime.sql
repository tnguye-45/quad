-- quad — Phase 2.5: conversation RPCs + realtime publication
--
-- Why this exists:
--   * conversation_members has an RLS insert policy of (user_id = auth.uid()),
--     which means a user can only add THEMSELVES. So when a gig applicant
--     creates a conversation, the poster can never see it. Same for hangout
--     group chats. The fix is a SECURITY DEFINER RPC that performs the privileged
--     insert on behalf of the caller after validating intent.
--   * Realtime previously required toggling the supabase_realtime publication
--     in the dashboard. That's manual config drift. We do it in SQL instead so
--     the migration owns it.

-- ─────────────────────── start_gig_conversation ───────────────────────
-- Find or create a 1:1 conversation between the caller and the gig's poster,
-- and ensure both are members. Returns the conversation id.
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

-- ─────────────────────── join_hangout ───────────────────────
-- RSVP to a hangout: insert into hangout_attendees, find/create the group
-- conversation tied to the hangout, and ensure the caller is a member. Returns
-- the conversation id (the app navigates to it on long-press / explicit chat
-- open; the RSVP button itself doesn't need it).
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
    -- Seed the conversation with every existing attendee, including the host
    -- and the caller. on conflict do nothing keeps it idempotent.
    insert into public.conversation_members (conversation_id, user_id)
    select v_conv_id, a.user_id from public.hangout_attendees a
      where a.hangout_id = p_hangout_id
    union
    select v_conv_id, v_host
    on conflict do nothing;
  else
    -- Just add the caller.
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, v_me)
      on conflict do nothing;
  end if;

  return v_conv_id;
end;
$$;

revoke all on function public.join_hangout(uuid) from public;
grant execute on function public.join_hangout(uuid) to authenticated;

-- ─────────────────────── leave_hangout ───────────────────────
-- Remove the caller from hangout_attendees AND the group conversation.
-- Host cannot leave their own hangout (they'd have to cancel it).
create or replace function public.leave_hangout(p_hangout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_host    uuid;
  v_conv_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select host_id into v_host from public.hangouts where id = p_hangout_id;
  if v_host is null then
    raise exception 'hangout not found' using errcode = 'P0002';
  end if;

  if v_me = v_host then
    raise exception 'host cannot leave their own hangout' using errcode = '22023';
  end if;

  delete from public.hangout_attendees
   where hangout_id = p_hangout_id and user_id = v_me;

  select id into v_conv_id from public.conversations
   where hangout_id = p_hangout_id limit 1;
  if v_conv_id is not null then
    delete from public.conversation_members
     where conversation_id = v_conv_id and user_id = v_me;
  end if;
end;
$$;

revoke all on function public.leave_hangout(uuid) from public;
grant execute on function public.leave_hangout(uuid) to authenticated;

-- ─────────────────────── realtime publication ───────────────────────
-- The app subscribes to live inserts. Add the tables to the supabase_realtime
-- publication so postgres_changes events flow. Wrapped in DO blocks so re-runs
-- after the dashboard already toggled these don't blow up.
do $$ begin
  alter publication supabase_realtime add table public.gigs;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.hangouts;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.voices;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.hangout_attendees;
exception when duplicate_object then null; end $$;
