-- quad — enforce hangout capacity atomically (fixes H2)
--
-- Two holes in one: (a) 0002's "hangout_attendees: rsvp self" policy lets the
-- client insert attendee rows directly, skipping join_hangout's capacity check
-- entirely; and (b) join_hangout itself did a non-atomic count-then-insert, so
-- two concurrent RSVPs to the last open slot both pass the check and both
-- insert (TOCTOU).
--
-- A BEFORE INSERT trigger closes both. It runs on EVERY insert path — the
-- join_hangout RPC, the host's implicit self-RSVP on hangout creation
-- (lib/posts-store.tsx), and any raw client insert — and serializes concurrent
-- RSVPs per hangout with a transaction-scoped advisory lock so count-then-allow
-- is atomic. join_hangout's own check is now redundant but harmless.
--
-- The direct-insert policy is intentionally KEPT so the host self-RSVP path
-- keeps working; the trigger, not the policy, is what enforces capacity.
create or replace function public.enforce_hangout_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host  uuid;
  v_max   int;
  v_count int;
begin
  select host_id, max_people into v_host, v_max
    from public.hangouts where id = new.hangout_id;
  if v_host is null then
    raise exception 'hangout not found' using errcode = 'P0002';
  end if;

  -- The host is always in their own hangout, regardless of capacity.
  if new.user_id = v_host then
    return new;
  end if;

  -- A re-RSVP by an existing attendee (the insert no-ops via ON CONFLICT) must
  -- not trip the capacity check when the hangout is already full.
  if exists (
    select 1 from public.hangout_attendees
     where hangout_id = new.hangout_id and user_id = new.user_id
  ) then
    return new;
  end if;

  -- Serialize concurrent RSVPs to this hangout so count-then-allow is atomic.
  -- Transaction-scoped: released automatically at commit/rollback.
  perform pg_advisory_xact_lock(hashtext('hangout_capacity:' || new.hangout_id::text));

  select count(*) into v_count
    from public.hangout_attendees where hangout_id = new.hangout_id;
  if v_count >= v_max then
    raise exception 'hangout is full' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists hangout_attendees_capacity on public.hangout_attendees;
create trigger hangout_attendees_capacity
  before insert on public.hangout_attendees
  for each row execute function public.enforce_hangout_capacity();
