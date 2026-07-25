-- quad — reports: close the de-anonymization oracle (read-own leaked the
-- server-resolved author id)
--
-- 0030/0033's resolver trigger runs SECURITY DEFINER and stamps the REAL
-- author id into reports.target_user_id — including for anonymous voices,
-- gigs, hangouts, and comments. 0014's "reports: read own" SELECT policy then
-- let the reporter read their own row back. Net effect: report any anonymous
-- post → select your own report → target_user_id is the anonymous author's
-- uid → the public profiles directory turns that into a name. At the 20/hr
-- report rate limit that's ~480 de-anonymizations per day per account, which
-- defeats the entire 0027 masking architecture.
--
-- The client never SELECTs reports: app/report.tsx only inserts (with the
-- default return=minimal), and "already reported" rides the 23505 unique
-- violation from 0030's dedupe index, not a read-back. The moderator queue
-- uses the service role, which none of this touches. So the client read path
-- can simply cease to exist — fail closed.

drop policy if exists "reports: read own" on public.reports;

-- Belt and suspenders: even if a future migration adds a SELECT policy, the
-- table-level grant is gone until someone deliberately re-grants columns
-- (and they should exclude target_user_id when they do).
revoke select on public.reports from authenticated, anon;
