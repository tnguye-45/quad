-- quad — anonymous hangouts lose the group chat (closes the last de-anonymization
-- path), plus two hangout-join defects the same function has to fix.
--
-- ─────────────── 1) the hole ───────────────
--
-- 0027 masks host_id in hangouts_feed, 0034 refuses DMs to anonymous gig posters,
-- 0037 took the uploader's uid out of message-image paths. conversation_members was
-- never brought under any of it. Its SELECT policy (0002) is
--
--   using (user_id = auth.uid() or public.is_conversation_member(conversation_id))
--
-- and profiles is `using (true)` for every authenticated user. So any member of a
-- hangout's group chat can read every other member's real uid and resolve it to a
-- name — including the host who chose to be anonymous.
--
-- This is not a theoretical read. The shipping UI does it: app/connections.tsx
-- (the "Obsidian map") builds its ego graph from conversation_members of the
-- caller's own conversations, so an anonymous host lands on their attendee's map as
-- a ring-1 node labelled "hung out", captioned with display name, major, dorm and
-- bio. lib/messaging.ts's hydrateOtherReads puts the same uid in otherReads[0], and
-- app/chat/[id].tsx hands it straight to the block/report menu — while the chat
-- header dutifully renders "Anonymous". Alice hosts anonymously, Bob RSVPs, the
-- group chat has exactly two members, and the other member is the host. With the
-- anon key (public by design) it is one query, no UI required.
--
-- Same class as the hole 0034 called "a one-RPC, no-consent mass de-anonymizer",
-- reached through hangouts instead of gigs.
--
-- ─────────────── 2) the fix, and the two designs rejected ───────────────
--
-- CHOSEN: mirror 0034's rule. An anonymous hangout does not get a group conversation
-- at all. RSVP still works — the attendee row is still inserted, capacity is still
-- enforced, hangouts_feed.going_count still increments — but join_hangout returns
-- NULL for the conversation id and creates no membership row. The identity never
-- enters a readable table, so there is nothing to mask.
--
-- REJECTED — masking conversation_members behind a definer view. Column-level
-- revoke cannot work here: the client legitimately filters on user_id = auth.uid()
-- to read its own last_read_at and to delete its own membership row on block/leave,
-- and Postgres requires SELECT privilege on any column named in a WHERE clause. The
-- alternative — tightening the RLS policy to own-rows-only and serving partners
-- through a view — drops other members' UPDATE events out of the supabase_realtime
-- publication, which silently kills read receipts for EVERY conversation, not just
-- anonymous ones. Trading a working feature for every user against a leak affecting
-- one is the wrong trade.
--
-- REJECTED — removing the anonymous option from hangouts entirely. Bigger product
-- change than the defect requires, and it throws away a legitimate use (posting a
-- hangout you'd rather not have your name on in the feed).
--
-- THE COST, stated plainly: attendees of an anonymous hangout have no group chat to
-- coordinate in. That is a real feature loss and it is the price of the anonymity
-- promise. If that trade is later judged wrong, the honest move is to drop the
-- anonymous flag for hangouts — NOT to reinstate the chat and re-open this hole.
--
-- ─────────────── 3) pre-existing data ───────────────
--
-- Conversations tied to anonymous hangouts may already exist. This migration does
-- NOT delete them: writing destructive DDL against rows nobody has inspected is how
-- you lose real chat history to a security patch. They must be reviewed by hand:
--
--   select c.id, c.hangout_id, count(m.user_id) as members
--     from public.conversations c
--     join public.hangouts h on h.id = c.hangout_id and h.anonymous
--     left join public.conversation_members m on m.conversation_id = c.id
--    group by c.id, c.hangout_id;
--
-- Anything that returns is a live leak — delete those conversations deliberately,
-- after confirming what they contain. The client ships defense-in-depth for legacy
-- rows in the same commit (lib/connections.ts drops anonymous-hangout groups from
-- the orbit graph; app/chat/[id].tsx withholds a masked partner's uid from the
-- block/report menu), so the app cannot surface them even before the cleanup runs.
--
-- ─────────────── 4) client-visible breakage (intentional) ───────────────
--
--   * join_hangout returns NULL for an anonymous hangout. A null conversation id is
--     now a SUCCESS value, not a failure — callers that treated it as "couldn't join
--     the group chat" must stop. Fixed in app/hangout/[id].tsx in this commit.
--   * hangout_attendees can no longer be deleted directly (see §7); leave_hangout is
--     the only path.

-- ─────────────── 5) join_hangout ───────────────
-- Body carries three changes over 0029: the anonymous short-circuit above, the
-- existing-attendee capacity exemption below, and hoisting the attendee insert above
-- the conversation work so the anonymous path still RSVPs.
create or replace function public.join_hangout(p_hangout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_host     uuid;
  v_max      int;
  v_anon     boolean;
  v_count    int;
  v_already  boolean;
  v_conv_id  uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select host_id, max_people, anonymous
    into v_host, v_max, v_anon
    from public.hangouts where id = p_hangout_id;
  if v_host is null then
    raise exception 'hangout not found' using errcode = 'P0002';
  end if;

  if v_me <> v_host and public.is_blocked(v_host) then
    raise exception 'you cannot join this hangout' using errcode = '42501';
  end if;

  v_already := exists (
    select 1 from public.hangout_attendees
     where hangout_id = p_hangout_id and user_id = v_me
  );

  -- Capacity. The host is always in their own hangout, and an attendee who is
  -- ALREADY in must not be turned away from it — they re-enter this function every
  -- time the app needs the conversation id after a cold start. 0029 checked capacity
  -- unconditionally and raised 23514 before ever reaching the idempotent insert, so
  -- the moment a hangout filled up its existing attendees were permanently locked
  -- out of their own group chat with "Couldn't open the group chat. Try again." —
  -- and retrying never helped. The 0025 BEFORE INSERT trigger already exempts
  -- existing attendees for exactly this reason; this check was pre-empting it.
  if v_me <> v_host and not v_already then
    select count(*) into v_count
      from public.hangout_attendees where hangout_id = p_hangout_id;
    if v_count >= v_max then
      raise exception 'hangout is full' using errcode = '23514';
    end if;
  end if;

  -- RSVP (idempotent). Runs for anonymous hangouts too — the attendee list and the
  -- going_count are not the leak; the readable membership row is.
  insert into public.hangout_attendees (hangout_id, user_id)
    values (p_hangout_id, v_me)
    on conflict do nothing;

  -- Anonymous host: stop here. No conversation, no membership row, no uid for a
  -- co-member to read back. See the header for why masking was not the answer.
  if v_anon then
    return null;
  end if;

  select id into v_conv_id from public.conversations
    where hangout_id = p_hangout_id limit 1;

  if v_conv_id is null then
    insert into public.conversations (hangout_id) values (p_hangout_id)
      returning id into v_conv_id;
    -- Seed with every existing attendee plus the host; on conflict keeps it idempotent.
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

-- ─────────────── 6) hangout_conversation_id ───────────────
-- Opening a chat is a read. It was being served by calling join_hangout purely for
-- its return value — a mutation used as a lookup, which is what made the capacity
-- bug above fatal instead of merely wrong. Definer so it can see conversations the
-- caller is a member of without re-entering conversation_members RLS; returns NULL
-- (not an error) when there is no conversation or the caller isn't in it, so an
-- anonymous hangout and a not-yet-joined one look the same to the client.
create or replace function public.hangout_conversation_id(p_hangout_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select c.id
    from public.conversations c
    join public.conversation_members m
      on m.conversation_id = c.id and m.user_id = auth.uid()
   where c.hangout_id = p_hangout_id
   limit 1;
$$;

revoke all on function public.hangout_conversation_id(uuid) from public;
grant execute on function public.hangout_conversation_id(uuid) to authenticated;

-- ─────────────── 7) hangout_attendees: leave via the RPC only ───────────────
-- 0002's "leave self" policy let a client delete its own attendee row directly.
-- leave_hangout (definer) removes the attendee row AND the conversation_members
-- row; the raw delete removes only the former, so a hostile client could drop off
-- the attendee list while staying in the hangout's group chat — reading it forever
-- with no RSVP to show for it. Verified the shipping client never deletes this table
-- directly (it only selects its own rows and inserts the host's implicit self-RSVP),
-- so removing the policy costs nothing.
--
-- The INSERT policy is deliberately KEPT — 0025's header explains that the host's
-- self-RSVP in lib/posts-store.tsx writes through it, and that the capacity trigger,
-- not the policy, is what enforces the limit.
drop policy if exists "hangout_attendees: leave self" on public.hangout_attendees;
