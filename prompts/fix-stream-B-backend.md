# Stream B — Backend integrity & notifications (High + Medium)

You are a senior engineer fixing verified defects in **quad**, a Notre Dame campus app
(Expo Router + Supabase). Repo root: `C:\Users\nguye\OneDrive\Desktop\quad`.
Current branch: `fix/codebase-review-batch`. Do **not** commit or push.

Two other engineers are working in parallel on the same repo. **Stay inside your file
ownership list.** If a fix seems to require a file you don't own, stop and report it
instead of editing it.

## Files you own (nobody else will touch these)

- `supabase/migrations/0039_*.sql`, `0040_*.sql`, `0041_*.sql` — you own migration
  numbers **0039–0041**. Migration **0038 belongs to another engineer** — do not
  create it, do not renumber around it.
- `supabase/functions/**` (all four edge functions)
- `lib/notifications.ts`
- `app/settings/notifications.tsx`
- `app/settings/account.tsx`

Explicitly **not** yours: `lib/messaging.ts`, `lib/connections.ts`,
`lib/posts-store.tsx`, `lib/comments.ts`, `app/chat/**`, `app/hangout/**`,
`app/_layout.tsx`, `app/(tabs)/**`, `app/profile-setup.tsx`, `app/modal.tsx`,
`package.json`, `.github/**`, `scripts/**`, `legal/**`,
`supabase/CLIENT_CONTRACT.md`, migration 0038.

## Project conventions (match these)

- TypeScript strict. Path alias `@/*` → repo root.
- Migrations are append-only numbered SQL files. Every one opens with a long `--`
  header explaining **the hole being closed, the concrete failure scenario, the
  design choice and why the alternatives were rejected**, and any client-visible
  breakage. Read `0036_content_rate_limits.sql` and `0030_reports_hardening.sql`
  first — match that voice exactly.
- Edge functions are **zero-dependency Deno**: plain `fetch` + the Supabase runtime,
  no `@supabase/supabase-js`, deliberately, to keep cold starts small. Keep it that way.
- Every edge function is gated by `isAuthorizedCaller` — a constant-time compare of
  the bearer token against `SERVICE_ROLE_KEY`, because the public function URL is
  otherwise unauthenticated. Preserve that gate in anything you touch.
- Error-code contract (`supabase/CLIENT_CONTRACT.md` §3): rate limit → `54000`,
  blocked → `42501`, capacity → `23514`, not-found → `P0002`, not-auth → `28000`.
- CI gates you must leave green:
  `npx tsc --noEmit` · `npx eslint app lib components hooks constants scripts` ·
  `node scripts/check-contract.mjs`
  (note: `supabase/functions/**` is in the eslint ignore list, but the migrations and
  the client files you own are not).

---

## FIX 1 (HIGH) — The rate limit is bypassed by deleting your own rows, so campus-wide push blasts are still unlimited

**Where:** `supabase/migrations/0036_content_rate_limits.sql:36-53`

`enforce_content_rate_limit` counts rows that **currently exist**:

```sql
select count(*) into v_count from public.gigs
  where poster_id = auth.uid() and posted_at > now() - interval '1 hour';
```

Every one of the five governed tables has a delete-own RLS policy:
`gigs` (`0002_rls.sql:72`), `hangouts` (`0002_rls.sql:94`), `voices`
(`0005_voices.sql:97`), `comments` (`0019_comments_and_realtime.sql`), `messages`
(`0021_message_delete.sql`).

**Failure scenario.** Attacker posts a gig → the `trg_gigs_push` AFTER INSERT trigger
fires `notify_new_post` → `send-new-post-push` delivers the attacker-controlled gig
title to **every registered device on campus** → attacker deletes the gig → the count
drops back to zero → repeat. The push is already delivered; deleting the row cannot
unsend it. The loop is unbounded. This is exactly the "one hostile student with a
script could blast the whole campus" scenario that 0036's own header says it prevents,
and it does not.

**Fix — migration 0039.** Count an append-only ledger instead of live rows.

- New table `public.content_write_log (id bigint generated always as identity primary
  key, author_id uuid not null, kind text not null, created_at timestamptz not null
  default now())`, with an index on `(author_id, kind, created_at desc)`.
- RLS enabled with **no policies**, and `revoke insert, update, delete, select ... from
  public, anon, authenticated` — Supabase's default privileges auto-grant DML on new
  public objects, so the revoke matters (see 0028's `feed_events` for the same pattern
  and comment).
- `create or replace public.enforce_content_rate_limit()` so it counts the ledger for
  the caller and the current `tg_table_name`, then inserts its own ledger row before
  returning `new`. Keep the existing `auth.uid() is null → return new` escape hatch for
  definer/service-role writes (seeds, moderation), and keep errcode `54000`.
- Keep the same limits: gigs 5 · hangouts 5 · voices 10 · comments 60 · messages 120.
- Add amortized pruning of rows older than 2 hours, in the style of `emit_feed_event`'s
  `if v_id % 1000 = 0` sweep in 0028 — the ledger is a rolling window, not history.

Sanity-check while you're in there: `reports_resolve_target`'s 20/hr limit
(`0030`/`0033`) counts `public.reports`, which has **no** client delete policy, so it
is *not* affected. Say so in the header so nobody "fixes" it later.

---

## FIX 2 (MEDIUM) — The "New voices" notification toggle can never do anything

**Where:** `supabase/migrations/0019_comments_and_realtime.sql` (`trg_voices_push`) ·
`supabase/functions/send-new-post-push/index.ts:~281` ·
`app/settings/notifications.tsx:50-54`

0019 wires `trg_voices_push` on `public.voices` to `notify_new_post()`, which POSTs to
`send-new-post-push`. That function dispatches on `gigs` and `hangouts` only:

```ts
} else { return json(200, { skipped: true, reason: `unsupported table ${table}` }); }
```

**Failure scenario.** Every voice insert makes a `pg_net` HTTP round-trip that is
discarded, and the settings screen offers a switch — "New voices · High volume — off by
default" — that writes a `new_voices` column no code ever reads. A user who turns it on
gets nothing and has no way to find out.

**Fix — implement the `voices` branch** (the toggle is a promise already shipped in the
UI; deleting it is the weaker option, but say so in your report if you disagree).

- Add a `voices` case to the dispatch in `send-new-post-push/index.ts`:
  `prefColumn = 'new_voices'`, `kind = 'voice'`, `data = { kind: 'voice', voiceId: rec.id }`.
  `routeForPayload` in `lib/notifications.ts` already routes `kind: 'voice'` →
  `/voice/<id>` — verify that before you rely on it.
- **Critical:** the notification body must carry **no author identity**. A voice record
  has `author_id` and `anonymous`; the push must use only `body`/`topic`. Getting this
  wrong re-opens the anonymity hole that migrations 0027/0034/0037 exist to close.
  `resolveRecipients(authorId, prefColumn)` still needs `author_id` to exclude the
  author and apply the two-way block filter — that's server-side and fine — but nothing
  derived from it may reach the payload.
- Voices have `body`, not `title`. The existing guard `if (!rec || !rec.id || !rec.title)
  return json(400, …)` will reject every voice — restructure the validation per-table.
- Clip the body the way the gig/hangout path clips titles (180 chars).
- Update `supabase/functions/send-new-post-push/README.md` to match.

---

## FIX 3 (MEDIUM) — One push token per user: a second device silently steals notifications from the first

**Where:** `supabase/migrations/0009_push_tokens.sql:15` · `lib/notifications.ts:63-68`

`user_push_tokens` has `user_id` as its **primary key**, and `registerForPushToken`
upserts with `onConflict: 'user_id'`.

**Failure scenario.** A student installs quad on their iPhone, then their iPad. The
iPad's registration overwrites the iPhone's token row. Every push now goes to the iPad
only; from the phone it reads as "notifications are broken" with no diagnostic. Worse,
signing out on the iPad calls `clearPushToken(user_id)`, which deletes by `user_id` and
therefore kills **both** devices until the phone happens to re-register.

**Fix — migration 0040 plus the client and all three push functions:**

1. Migration: drop the `user_id` primary key, add `primary key (user_id,
   expo_push_token)`. The composite PK already indexes `user_id` as its leading column,
   so no extra index is needed — note that in the header so nobody adds a redundant one.
   Existing RLS policies are all `user_id = auth.uid()` and stay correct as-is.
2. `lib/notifications.ts`: `upsert(..., { onConflict: 'user_id,expo_push_token' })`, and
   `clearPushToken` must delete **only this device's token**, not every row for the
   user — it will need the current token, so resolve it (or thread it through) rather
   than widening the delete.
3. All three push functions (`send-message-push`, `send-new-post-push`,
   `send-new-comment-push`) have a `pgDeleteToken(userId)` helper that deletes by
   `user_id` on an Expo `DeviceNotRegistered` receipt. That now nukes a user's *other,
   healthy* devices. Scope the delete to `user_id=eq.<id>&expo_push_token=eq.<token>`
   and pass the token from the ticket loop (the `batch[i]` recipient object already
   carries it).
4. Recipient resolution now legitimately returns multiple rows per user. Verify the
   batching (`chunk(..., 100)`) and the positional ticket↔recipient alignment in
   `sendBatch` still hold — they should, but confirm rather than assume.
5. `supabase/functions/delete-account/index.ts` deletes `user_push_tokens?user_id=eq.…`,
   which is still correct for account deletion. Leave it.

---

## FIX 4 (MEDIUM) — Account deletion has no request timeout; the UI can hang forever

**Where:** `app/settings/account.tsx:48-54`

The `fetch` to `/functions/v1/delete-account` has no `AbortSignal`. The function itself
does a paginated storage sweep — up to 200 list+delete round-trips per bucket, across
two buckets, plus a by-reference sweep of `messages.image_url` — before it responds.

**Failure scenario.** Campus wifi drops mid-request. The promise never settles,
`setBusy(false)` never runs, the button stays disabled on "Deleting…", and the only
recovery is force-quitting the app — with no way to know whether the account was
actually deleted. Given `delete-account`'s own comment that the auth delete revokes the
caller's JWT so "a user can never re-invoke this function", silent ambiguity here is the
worst possible outcome.

**Fix:** add `signal: AbortSignal.timeout(60_000)` to the fetch, and on abort surface
copy that tells the user explicitly to reopen the app and check whether they are still
signed in — do not imply the delete failed, because it may well have succeeded. Keep the
existing `catch` behaviour for genuine network errors distinguishable from the timeout.

---

## Deliverable

1. All four fixes implemented in your owned files.
2. `npx tsc --noEmit`, `npx eslint app lib components hooks constants scripts`, and
   `node scripts/check-contract.mjs` all clean.
3. Migration headers carry the full rationale, in house style.
4. A short report: what changed, anything you could not verify statically (you cannot
   run migrations or invoke the edge functions — say what you'd want to test), and any
   fix that needed a file you don't own. In particular, note that the contract doc
   `supabase/CLIENT_CONTRACT.md` is owned by another engineer — write the notes another
   engineer would need to fold in, but don't edit it.

**Do not** run migrations against the live project, do not deploy functions, and do not
commit.
