-- quad — realtime without identity: swap content tables for feed_events
-- (companion to 0027; closes the realtime half of C1)
--
-- The supabase_realtime publication carried voices / gigs / hangouts /
-- comments / hangout_attendees as FULL ROWS, so every INSERT and UPDATE event
-- delivered author_id (and for attendees, the anonymous host's self-RSVP) to
-- every subscribed client — bypassing all the masking in 0027. Column
-- filtering inside Realtime payloads is not something we can verify or pin
-- from a migration, so we do not rely on it.
--
-- Replacement: a skinny feed_events table is the only feed-change signal.
-- Triggers on the content tables append one row per change (kind + op +
-- target id, never author columns); clients subscribe to INSERT on
-- feed_events and refetch the affected row through the 0027 views — the same
-- RLS-gated-refetch pattern 0022 established for comments. Messages and
-- conversation_members stay in the publication unchanged: they are not
-- anonymous surfaces and their events are already RLS-scoped to members.

-- ─────────────── feed_events ───────────────
create table public.feed_events (
  id                  bigint generated always as identity primary key,
  kind                text not null check (kind in ('gig', 'hangout', 'voice', 'comment')),
  op                  text not null check (op in ('insert', 'update', 'delete')),
  target_id           uuid not null,
  -- For kind = 'comment': the parent post, so thread screens can use a
  -- server-side realtime filter (comment_target_id=eq.<uuid>).
  comment_target_type text,
  comment_target_id   uuid,
  created_at          timestamptz not null default now()
);

create index feed_events_created_at_idx on public.feed_events (created_at);

alter table public.feed_events enable row level security;

-- Readable signal for every signed-in user; contains no identity.
create policy "feed_events: read for authenticated"
  on public.feed_events for select
  to authenticated
  using (true);

-- Writes happen only via the definer trigger below. Default privileges
-- auto-grant DML to client roles; strip it so RLS isn't the only barrier.
revoke insert, update, delete on public.feed_events from public, anon, authenticated;

-- ─────────────── emit trigger ───────────────
create or replace function public.emit_feed_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := tg_argv[0];
  v_id   bigint;
begin
  -- Branch on TG_OP with IF, never CASE-over-NEW/OLD: in a DELETE trigger NEW
  -- is unassigned and even a not-taken reference can raise in plpgsql.
  if v_kind = 'hangout_attendee' then
    -- RSVP changes surface as an update of the parent hangout (going_count).
    if tg_op = 'DELETE' then
      insert into public.feed_events (kind, op, target_id)
      values ('hangout', 'update', old.hangout_id)
      returning id into v_id;
    else
      insert into public.feed_events (kind, op, target_id)
      values ('hangout', 'update', new.hangout_id)
      returning id into v_id;
    end if;
  elsif v_kind = 'comment' then
    if tg_op = 'DELETE' then
      insert into public.feed_events (kind, op, target_id, comment_target_type, comment_target_id)
      values ('comment', 'delete', old.id, old.target_type, old.target_id)
      returning id into v_id;
    else
      insert into public.feed_events (kind, op, target_id, comment_target_type, comment_target_id)
      values ('comment', lower(tg_op), new.id, new.target_type, new.target_id)
      returning id into v_id;
    end if;
  else
    if tg_op = 'DELETE' then
      insert into public.feed_events (kind, op, target_id)
      values (v_kind, 'delete', old.id)
      returning id into v_id;
    else
      insert into public.feed_events (kind, op, target_id)
      values (v_kind, lower(tg_op), new.id)
      returning id into v_id;
    end if;
  end if;

  -- Amortized pruning: events are an ephemeral signal, not history. Every
  -- ~1000th event sweeps anything older than 3 days.
  if v_id % 1000 = 0 then
    delete from public.feed_events where created_at < now() - interval '3 days';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.emit_feed_event() from public;

-- voices
drop trigger if exists voices_feed_event_ins_del on public.voices;
create trigger voices_feed_event_ins_del
  after insert or delete on public.voices
  for each row execute function public.emit_feed_event('voice');
drop trigger if exists voices_feed_event_upd on public.voices;
create trigger voices_feed_event_upd
  after update on public.voices
  for each row
  when (old.* is distinct from new.*)
  execute function public.emit_feed_event('voice');

-- gigs
drop trigger if exists gigs_feed_event_ins_del on public.gigs;
create trigger gigs_feed_event_ins_del
  after insert or delete on public.gigs
  for each row execute function public.emit_feed_event('gig');
drop trigger if exists gigs_feed_event_upd on public.gigs;
create trigger gigs_feed_event_upd
  after update on public.gigs
  for each row
  when (old.* is distinct from new.*)
  execute function public.emit_feed_event('gig');

-- hangouts
drop trigger if exists hangouts_feed_event_ins_del on public.hangouts;
create trigger hangouts_feed_event_ins_del
  after insert or delete on public.hangouts
  for each row execute function public.emit_feed_event('hangout');
drop trigger if exists hangouts_feed_event_upd on public.hangouts;
create trigger hangouts_feed_event_upd
  after update on public.hangouts
  for each row
  when (old.* is distinct from new.*)
  execute function public.emit_feed_event('hangout');

-- comments (immutable — no update path)
drop trigger if exists comments_feed_event on public.comments;
create trigger comments_feed_event
  after insert or delete on public.comments
  for each row execute function public.emit_feed_event('comment');

-- hangout_attendees → parent hangout 'update' (live going_count)
drop trigger if exists hangout_attendees_feed_event on public.hangout_attendees;
create trigger hangout_attendees_feed_event
  after insert or delete on public.hangout_attendees
  for each row execute function public.emit_feed_event('hangout_attendee');

-- ─────────────── publication swap ───────────────
-- undefined_object = "table is not part of the publication"; tolerated so
-- re-runs and fresh projects both work.
do $$ begin
  alter publication supabase_realtime drop table public.voices;
exception when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.gigs;
exception when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.hangouts;
exception when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.comments;
exception when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.hangout_attendees;
exception when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.feed_events;
exception when duplicate_object then null; end $$;
