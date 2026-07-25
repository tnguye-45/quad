-- quad — rate-limit an append-only write ledger, not live rows
-- (closes the delete-and-repost bypass in 0036)
--
-- 0036 counts rows that CURRENTLY EXIST:
--
--   select count(*) from public.gigs
--    where poster_id = auth.uid() and posted_at > now() - interval '1 hour';
--
-- but every one of the five governed tables also has a delete-own RLS policy
-- — gigs (0002:72), hangouts (0002:94), voices (0005:97), comments (0019),
-- messages (0021) — so the number the limiter reads is entirely under the
-- attacker's control.
--
-- Failure scenario: post a gig → trg_gigs_push (0012) fires notify_new_post →
-- send-new-post-push delivers the attacker-controlled title to EVERY
-- registered device on campus → delete the gig → the count drops back to zero
-- → repeat. The push is already delivered; deleting the row cannot unsend it.
-- The loop is unbounded. This is exactly the "one hostile student with a
-- script could blast the whole campus" scenario 0036's own header says it
-- prevents, and as written it does not.
--
-- Fix: meter an append-only ledger the client has no privilege to touch.
-- public.content_write_log gets one row per governed insert, written by the
-- same SECURITY DEFINER trigger that does the check, and the count reads the
-- ledger instead of the content table. Deleting your gig no longer un-spends
-- the quota, because the quota was never stored in the gig.
--
-- Rejected alternatives:
--   * Revoke the delete-own policies. Students legitimately delete their own
--     posts, and 0021's message delete is a shipped feature. Punishing every
--     honest user to close a limiter hole is the wrong trade.
--   * Soft-delete (deleted_at) across all five tables. Five schema changes,
--     five RLS rewrites, and every feed view and count from 0027 onward would
--     have to learn to filter — an enormous blast radius for a limiter fix,
--     and it also keeps deleted content on disk, which the privacy policy
--     does not promise.
--   * A bucketed counter table keyed (author, kind, hour_start), swept by
--     pg_cron. Fewer rows, but fixed hour buckets let a burst straddle a
--     boundary and land 2× the limit inside a 60-second span, and it adds a
--     scheduled-job dependency. A row-per-write ledger keeps the window truly
--     rolling and needs no cron.
--
-- NOT affected, so nobody "fixes" it later: reports_resolve_target's 20/hr
-- limit (0030, kept in 0033) counts public.reports, and reports has NO client
-- delete policy — a reporter cannot delete their own report rows, so that
-- count is already append-only in practice. Leave it counting reports.
--
-- Client-visible breakage: none. Same errcode 54000, same message shape, same
-- limits (gigs 5 · hangouts 5 · voices 10 · comments 60 · messages 120), same
-- service-role escape hatch. One deploy-time note: the ledger starts empty, so
-- at the instant this migration runs every author's window resets — worst case
-- someone who already posted in the preceding hour gets one extra hour's
-- allowance, once. Not worth a backfill.

-- ─────────────── content_write_log ───────────────
-- Deliberately no FK on author_id. The ledger is a two-hour rolling window,
-- not history: rows age out long before an account-deletion cascade would
-- matter, and keeping it FK-free means the delete-account Edge Function does
-- not need to learn about this table.
create table if not exists public.content_write_log (
  id         bigint generated always as identity primary key,
  author_id  uuid not null,
  kind       text not null,
  created_at timestamptz not null default now()
);

-- Covers the only query there is: count by (author, kind) over a recent
-- window. created_at desc so the window scan starts at the newest row.
create index if not exists content_write_log_author_kind_created_idx
  on public.content_write_log (author_id, kind, created_at desc);

alter table public.content_write_log enable row level security;

-- RLS enabled with NO policies: nothing but the definer trigger below ever
-- touches this table, and a client that could read it would learn how close
-- another user is to their limit. Supabase's default privileges auto-grant DML
-- on new objects in public, so strip them explicitly — same belt-and-braces as
-- feed_events in 0028, so RLS is not the only barrier.
revoke insert, update, delete, select on public.content_write_log
  from public, anon, authenticated;

-- ─────────────── the limiter, now reading the ledger ───────────────
-- Same signature and same tg_argv[0] limit as 0036, so the five existing
-- rate_limit_* triggers keep working untouched (create or replace preserves
-- the function OID the triggers point at).
create or replace function public.enforce_content_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit  int  := tg_argv[0]::int;
  v_author uuid := auth.uid();
  v_count  int;
  v_id     bigint;
begin
  if v_author is null then
    -- Definer functions and service-role writes (seeds, moderation) are not
    -- subject to the limit — unchanged from 0036. They also write no ledger
    -- row, so seeding cannot spend a real user's quota.
    return new;
  end if;

  -- Anything not on the governed list passes through unmetered.
  if tg_table_name not in ('gigs', 'hangouts', 'voices', 'comments', 'messages') then
    return new;
  end if;

  select count(*) into v_count
    from public.content_write_log
   where author_id  = v_author
     and kind       = tg_table_name
     and created_at > now() - interval '1 hour';

  if v_count >= v_limit then
    raise exception 'rate limit: too many % in the last hour', tg_table_name
      using errcode = '54000';
  end if;

  -- Spend the quota. This runs inside the caller's transaction, so an insert
  -- that is later rejected (CHECK constraint, another BEFORE trigger, an
  -- application rollback) takes its ledger row down with it — a failed post
  -- costs nothing, same as under 0036.
  insert into public.content_write_log (author_id, kind)
  values (v_author, tg_table_name)
  returning id into v_id;

  -- Amortized pruning, in the style of emit_feed_event's sweep in 0028: the
  -- ledger is a rolling window, not history, so every ~1000th write drops
  -- everything older than 2× the window. Twice the window, not exactly the
  -- window, so a long-running transaction's now() can never prune a row the
  -- limiter still needs to see.
  if v_id % 1000 = 0 then
    delete from public.content_write_log
     where created_at < now() - interval '2 hours';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_content_rate_limit() from public;
