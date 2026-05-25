-- quad — Phase 3: reports v2 (App Store 1.2 — UGC reporting requirement)
--
-- The 0001 `reports` table works for the dev seed, but the shape doesn't match
-- what we actually want to show reviewers:
--   * target_kind missing `voice` and `profile` (had `user` — renaming for
--     consistency with how the rest of the app talks about people: it's a
--     "profile" everywhere else).
--   * reason was free text; we need a constrained enum for triage.
--   * no `details` for the optional textarea.
--   * no `status` so the moderator queue has no notion of "open vs handled".
--
-- Since the table only contains throwaway dev data and we're pre-launch (per
-- the engineer brief), we drop and recreate cleanly. RLS policies from 0002
-- are reapplied here so nothing depends on cross-migration ordering.

-- Drop the old table; CASCADE the policies in 0002.
drop table if exists public.reports cascade;

-- ─────────────────────── reason / status enums ───────────────────────
-- Standalone enums so the queue UI can render dropdowns from pg_enum.
do $$ begin
  create type public.report_reason as enum ('spam', 'harassment', 'inappropriate', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_target_kind as enum ('gig', 'hangout', 'voice', 'message', 'profile');
exception when duplicate_object then null; end $$;

-- ─────────────────────── reports ───────────────────────
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  target_kind     public.report_target_kind not null,
  target_id       uuid not null,
  -- Convenience pointer to the offending user, when known. Filled in by the
  -- client (for `profile` targets it equals target_id; for content targets
  -- it's the author's id resolved at report time). Kept as `set null` on
  -- delete so deleting a user doesn't wipe their report history.
  target_user_id  uuid references public.profiles(id) on delete set null,
  reason          public.report_reason not null,
  details         text check (details is null or length(details) <= 1000),
  status          public.report_status not null default 'open',
  created_at      timestamptz not null default now()
);

create index reports_target_idx       on public.reports (target_kind, target_id);
create index reports_status_idx       on public.reports (status, created_at desc);
create index reports_reporter_idx     on public.reports (reporter_id);

alter table public.reports enable row level security;

-- Reporter can submit; reporter_id must equal auth.uid() (no impersonation).
drop policy if exists "reports: insert as self" on public.reports;
create policy "reports: insert as self"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Reporter can see their own reports (so the UI can show "you've already
-- reported this"). No one else can read reports via the client — the
-- moderator queue uses the service role.
drop policy if exists "reports: read own" on public.reports;
create policy "reports: read own"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid());

-- No update or delete from the client.
