---
description: Run a scoped deep audit of the quad codebase. Usage: /deep-audit <area> (e.g. "contract adherence", "security", "full")
---

Run a deep audit of this repository. Scope: $ARGUMENTS (if empty, run the full analysis across all areas).

You are analyzing, not implementing — do not modify files.

## Context you should trust

- quad: campus-only app for Notre Dame, gated to @nd.edu. Gigs / Hangouts / Voices + Map + Messages.
- Stack: Expo SDK 54, Expo Router 6, RN 0.81, React 19, TS, Supabase (Postgres + RLS, realtime, edge functions, storage). Web on GitHub Pages; no native builds yet.
- Constraints: one founder, ~5 hrs/week in semester, free-tier infra, $0 revenue by design. Failure modes: cold-start liquidity, trust incident, founder burnout. No enterprise-scale advice.

## Sources of truth — audit code against these, line by line

- `supabase/CLIENT_CONTRACT.md` — client↔DB contract (feed views only, no select('*') on base tables, no author embeds, no returning *, realtime on feed_events only, documented error codes 42501/23514/23505/54000/P0002, input limits)
- `supabase/migrations/` — actual RLS policies and grants (code wins over docs; flag stale docs)
- `business/CONTEXT.md` — known launch blockers; verify each is still true

## Areas (run those matching $ARGUMENTS, or all)

1. **architecture** — module boundaries, oversized files (posts-store.tsx, messaging.ts, chat/[id].tsx), dev-mode coupling, dead code. Where does the next feature hurt?
2. **contract adherence** — every client read/write/subscription vs CLIENT_CONTRACT.md. Flag every violation with file:line.
3. **security** — fresh-eyes RLS review across all migrations; anonymity leaks (any path to recover an anonymous author); auth gate bypasses; storage policies.
4. **correctness** — optimistic-update races, unread counts, RSVP capacity, pagination, session persistence web vs native.
5. **performance** — refetch-per-event cost on feed_events, context re-renders, free-tier Supabase limits.
6. **launch readiness** — verify blocker list in business/CONTEXT.md; code vs operational.
7. **tests** — minimal highest-payoff set given 5 hrs/week (contract test for base-table selects, RLS smoke tests).

## Output

Write the report to `.audits/<date>-<scope>.md`:

1. Executive summary (≤300 words, health grade, top 3 findings)
2. Findings by area: severity (Critical/High/Medium/Low), file:line, quoted evidence, why it matters for quad's failure modes, fix with effort in hours
3. One ranked action list (≤10, ordered by launch impact ÷ founder hours), single next action on top
4. Explicit non-findings

Ground every claim in a file path. Label estimates. No new features, no monetization, no rewrites.
