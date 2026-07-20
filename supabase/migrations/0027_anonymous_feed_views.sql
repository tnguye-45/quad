-- quad — anonymity: identity columns become unreadable, feeds move to views
-- (fixes C1, DATABASE HALF — see CLIENT_CONTRACT.md for the client half)
--
-- The original hole: base tables expose author_id (and a joinable profiles row)
-- for EVERY row, so any authenticated client can read the real author of any
-- "anonymous" voice, comment, gig, or hangout — masking was only in the client
-- mapper. Serving feeds through masking views alone would NOT close it: the
-- attacker just keeps querying the base table. So this migration does both
-- halves of the trust boundary:
--
--   1) COLUMN-LEVEL LOCKDOWN. Revoke table-wide SELECT on voices / gigs /
--      hangouts / comments from client roles and re-grant only the columns
--      that carry no identity. After this, `select author_id from voices`
--      (and any `select *`) fails with "permission denied" for authenticated —
--      the identity column is structurally unreadable, not merely un-selected.
--      Named-column embeds the app relies on (e.g. conversations →
--      gigs(title, payout_cents, anonymous) in lib/messaging.ts) keep working.
--      RLS policies and triggers are NOT privilege-checked, so insert/update/
--      delete-own policies and the score/count/push triggers are unaffected.
--      NOTE: columns added to these tables later are NOT auto-granted — new
--      columns default to unreadable (fail closed). Grant them here-style when
--      they are safe.
--
--   2) DEFINER FEED VIEWS. The views below are the ONLY sanctioned read path
--      for feeds and detail screens. They are definer-style (no
--      security_invoker), owned by postgres, so they can read the locked-down
--      columns; they null author fields on rows that are anonymous and not the
--      caller's own, and fold in the two-way block filter (0013/0022 semantics)
--      which definer execution would otherwise bypass. security_barrier stops
--      the planner from leaking pre-masked values through user-supplied
--      predicates. Masking uses IS DISTINCT FROM so a NULL auth.uid() can
--      never fall through to the unmasked branch.
--
-- Realtime is handled in 0028 (these tables leave the publication; a skinny
-- feed_events table carries change signals with no identity payload).
--
-- Client-visible breakage (intentional, fail-closed — repoint per
-- CLIENT_CONTRACT.md):
--   * any `select('*')` or author-profile embed on these four tables
--   * insert/update with `.select(...)` returning * (use return=minimal, then
--     read back through the view)
--   * filtering by author column on the base table (filter the view instead;
--     masked rows have NULL author columns and drop out of author filters)

-- ─────────────── 1) column-level lockdown ───────────────

revoke select on public.voices   from authenticated, anon;
revoke select on public.gigs     from authenticated, anon;
revoke select on public.hangouts from authenticated, anon;
revoke select on public.comments from authenticated, anon;

grant select (id, anonymous, body, topic, posted_at, vote_score, comment_count, origin)
  on public.voices to authenticated;

grant select (id, anonymous, title, description, category, payout_cents,
              location_label, lat, lon, posted_at, status, accepted_by,
              deadline_at, comment_count, origin)
  on public.gigs to authenticated;

grant select (id, anonymous, title, vibe, location_label, lat, lon, starts_at,
              when_label, max_people, description, created_at, comment_count, origin)
  on public.hangouts to authenticated;

grant select (id, target_type, target_id, anonymous, body, created_at, origin)
  on public.comments to authenticated;

-- hangout_attendees: the earliest attendee row is the host's implicit
-- self-RSVP (lib/posts-store.tsx), so a public attendee list de-anonymizes an
-- anonymous host. The app only ever reads it for (a) going-counts — served by
-- hangouts_feed.going_count below — and (b) the caller's own RSVP state. Lock
-- the SELECT policy to own rows; capacity checks (0025) and going_count run as
-- definer and still see everything.
drop policy if exists "hangout_attendees: read for authenticated" on public.hangout_attendees;
create policy "hangout_attendees: read own"
  on public.hangout_attendees for select
  to authenticated
  using (user_id = auth.uid());

-- ─────────────── 2) definer feed views ───────────────
-- drop-then-create (not or-replace): an earlier draft of this file created
-- these views with security_invoker = true, and CREATE OR REPLACE would keep
-- that reloption — silently breaking the definer read path.

drop view if exists public.voices_feed;
drop view if exists public.gigs_feed;
drop view if exists public.hangouts_feed;
drop view if exists public.comments_feed;

-- voices_feed
create view public.voices_feed
with (security_barrier = true) as
select
  v.id,
  v.anonymous,
  v.body,
  v.topic,
  v.posted_at,
  v.vote_score,
  v.comment_count,
  v.origin,
  case when v.anonymous and v.author_id is distinct from auth.uid() then null else v.author_id    end as author_id,
  case when v.anonymous and v.author_id is distinct from auth.uid() then null else p.display_name end as author_display_name,
  case when v.anonymous and v.author_id is distinct from auth.uid() then null else p.initials     end as author_initials,
  case when v.anonymous and v.author_id is distinct from auth.uid() then null else p.avatar_url   end as author_avatar_url
from public.voices v
join public.profiles p on p.id = v.author_id
where v.author_id = auth.uid() or not public.is_blocked(v.author_id);

-- gigs_feed
create view public.gigs_feed
with (security_barrier = true) as
select
  g.id,
  g.anonymous,
  g.title,
  g.description,
  g.category,
  g.payout_cents,
  g.location_label,
  g.lat,
  g.lon,
  g.posted_at,
  g.status,
  g.accepted_by,
  g.deadline_at,
  g.comment_count,
  g.origin,
  case when g.anonymous and g.poster_id is distinct from auth.uid() then null else g.poster_id    end as poster_id,
  case when g.anonymous and g.poster_id is distinct from auth.uid() then null else p.display_name end as poster_display_name,
  case when g.anonymous and g.poster_id is distinct from auth.uid() then null else p.initials     end as poster_initials,
  case when g.anonymous and g.poster_id is distinct from auth.uid() then null else p.avatar_url   end as poster_avatar_url
from public.gigs g
join public.profiles p on p.id = g.poster_id
where g.poster_id = auth.uid() or not public.is_blocked(g.poster_id);

-- hangouts_feed
create view public.hangouts_feed
with (security_barrier = true) as
select
  h.id,
  h.anonymous,
  h.title,
  h.vibe,
  h.location_label,
  h.lat,
  h.lon,
  h.starts_at,
  h.when_label,
  h.max_people,
  h.description,
  h.created_at,
  h.comment_count,
  h.origin,
  (select count(*)::int from public.hangout_attendees a where a.hangout_id = h.id) as going_count,
  case when h.anonymous and h.host_id is distinct from auth.uid() then null else h.host_id      end as host_id,
  case when h.anonymous and h.host_id is distinct from auth.uid() then null else p.display_name end as host_display_name,
  case when h.anonymous and h.host_id is distinct from auth.uid() then null else p.initials     end as host_initials,
  case when h.anonymous and h.host_id is distinct from auth.uid() then null else p.avatar_url   end as host_avatar_url
from public.hangouts h
join public.profiles p on p.id = h.host_id
where h.host_id = auth.uid() or not public.is_blocked(h.host_id);

-- comments_feed
create view public.comments_feed
with (security_barrier = true) as
select
  c.id,
  c.target_type,
  c.target_id,
  c.anonymous,
  c.body,
  c.created_at,
  c.origin,
  case when c.anonymous and c.author_id is distinct from auth.uid() then null else c.author_id    end as author_id,
  case when c.anonymous and c.author_id is distinct from auth.uid() then null else p.display_name end as author_display_name,
  case when c.anonymous and c.author_id is distinct from auth.uid() then null else p.initials     end as author_initials,
  case when c.anonymous and c.author_id is distinct from auth.uid() then null else p.avatar_url   end as author_avatar_url
from public.comments c
join public.profiles p on p.id = c.author_id
where c.author_id = auth.uid() or not public.is_blocked(c.author_id);

-- Grants: authenticated only. The explicit revokes matter — Supabase's default
-- privileges auto-grant new objects in public to anon as well, and an anon
-- read of a definer view would bypass base-table RLS entirely.
revoke all on public.voices_feed   from public, anon;
revoke all on public.gigs_feed     from public, anon;
revoke all on public.hangouts_feed from public, anon;
revoke all on public.comments_feed from public, anon;

grant select on public.voices_feed   to authenticated;
grant select on public.gigs_feed     to authenticated;
grant select on public.hangouts_feed to authenticated;
grant select on public.comments_feed to authenticated;
