# Stream C — Client correctness, quality & the missing test suite (High + Medium + Low)

You are a senior engineer fixing verified defects in **quad**, a Notre Dame campus app
(Expo Router + Supabase). Repo root: `C:\Users\nguye\OneDrive\Desktop\quad`.
Current branch: `fix/codebase-review-batch`. Do **not** commit or push.

Two other engineers are working in parallel on the same repo. **Stay inside your file
ownership list.** If a fix seems to require a file you don't own, stop and report it
instead of editing it.

## Files you own (nobody else will touch these)

- `package.json`, and any new test config (`jest.config.js` / equivalent)
- `.github/workflows/**`
- `scripts/**`
- Any **new** test files you create
- `app/_layout.tsx`
- `app/(tabs)/index.tsx`, `app/(tabs)/map.tsx`
- `app/profile-setup.tsx`
- `app/modal.tsx`
- `lib/posts-store.tsx`
- `lib/comments.ts`
- `legal/**`

Explicitly **not** yours: `supabase/**` (all migrations, all edge functions, the
contract doc), `lib/messaging.ts`, `lib/connections.ts`, `lib/notifications.ts`,
`app/chat/**`, `app/hangout/**`, `app/settings/**`, `app/(tabs)/explore.tsx`,
`app/(tabs)/voices.tsx`, `app/(tabs)/messages.tsx`, `components/**`.

## Project conventions (match these)

- TypeScript strict. Path alias `@/*` → repo root. Expo SDK 54, React 19, RN 0.81.
- Client code carries dense explanatory comments about *why*, not *what* — usually a
  short paragraph above a non-obvious block naming the failure it prevents. Match the
  surrounding density; don't narrate obvious lines.
- Design language is deliberate: modern minimalist — hairline separators, monochrome,
  type-driven hierarchy, no card chrome or pill backgrounds. Don't introduce new visual
  furniture.
- CI gates you must leave green (and extend, see FIX 1):
  `npx tsc --noEmit` · `npx eslint app lib components hooks constants scripts` ·
  `node scripts/check-contract.mjs`
- **Never** read the locked base tables (`gigs`, `hangouts`, `voices`, `comments`) with
  `.from(t).select(...)` — table-wide SELECT is revoked for clients and re-granted
  column-by-column excluding identity columns, so a base-table read fails the *whole*
  request with `42501` at runtime. Use the `*_feed` views.
  `scripts/check-contract.mjs` fails CI if you slip. This matters directly for FIX 3.

---

## FIX 1 (HIGH) — There are no automated tests anywhere in the repository

**Where:** `package.json` — no test script, no runner in `devDependencies`.
`git ls-files` matches nothing for test/spec/jest/vitest.

CI runs `tsc --noEmit`, `eslint`, and a contract grep — all valuable, none of which
execute a single line of application logic.

**Failure scenario.** Every finding in the review that produced these prompts is one a
modest suite would have caught. A refactor of `posts-store`'s vote-serialization loop or
its `fetchGenRef` staleness guards currently has nothing behind it but manual QA.

**Fix:**

1. Add `jest-expo` + `@types/jest` (or vitest with an RN preset — `jest-expo` is the
   path of least resistance for Expo SDK 54) and a `"test"` script. Note: `npm install`
   is required here; that's expected for this stream and only this stream.
2. Add a `Test` step to **both** `.github/workflows/checks.yml` and
   `.github/workflows/deploy.yml`. The two files intentionally duplicate their check
   list rather than using `workflow_call` — there's a comment explaining why ("so a
   broken build can never deploy even if the other workflow changes"). Respect that and
   update both.
3. Cover the pure logic, which is where the value is per unit of effort:
   - `lib/profile-links.ts` — `detectPlatform` (exact host, subdomain, junk input),
     and the `paymentUrlFromHandle` ↔ `paymentHandleFromUrl` round-trip for both
     platforms, including the `@`/`$` sigil handling and the validation rejections.
   - `lib/posts-store.tsx` — `dollarsToCents`, `centsToPayout`, `timeAgo`,
     `keysetOlderThan` (the quoting matters — a `+` or `:` in a timestamp must not
     break the PostgREST filter), `hangoutIsLive` around the 2-hour grace boundary,
     and the `*FromFeed` mappers' null-masking behaviour.
   - `lib/connections.ts` — `buildOrbitGraph` only (ring assignment, blocked-id
     exclusion, peer-edge dedup, the `MAX_DORM_CLIQUE` cutoff). **Another engineer is
     changing `fetchOrbitSources` in this file** — do not touch the file itself, only
     write a new test file against the exported pure builder.
   - `lib/notifications.ts` — `routeForPayload` only, same caveat: another engineer owns
     that file and is changing the token functions, not this one.
4. Write tests that assert real behaviour. No `expect(true).toBe(true)`, no snapshots of
   whole components, no sleeps, no dependence on the wall clock — `timeAgo` and
   `hangoutIsLive` read `Date.now()`, so inject or fake it rather than asserting against
   real time.

---

## FIX 2 (MEDIUM) — Cold-start notification routing re-fires on every token refresh

**Where:** `app/_layout.tsx:103-116`

```tsx
useEffect(() => {
  if (loading || !session || !profile?.display_name) return;
  …
  getColdStartRoute().then((route) => { if (!cancelled && route) router.replace(route as never); });
}, [loading, session, profile?.display_name, router]);
```

`Notifications.getLastNotificationResponseAsync()` returns the most recent response for
the app's whole lifetime, not only the one that launched it. `session` is in the
dependency array, and `lib/auth-context.tsx`'s `onAuthStateChange` calls
`setSession(newSession)` with a **fresh object** on `TOKEN_REFRESHED`, roughly hourly.

**Failure scenario.** A user taps a message notification, reads the chat, navigates to
Gigs, and browses. An hour later gotrue refreshes the token → new session object →
effect re-runs → `getColdStartRoute` still returns that same stale `/chat/<id>` →
`router.replace` drops them back into the old chat mid-scroll. It also fires whenever
`profile.display_name` changes, e.g. immediately after profile setup.

**Fix:** run the cold-start lookup at most once per app launch — a `useRef` latch set
before the async call. Leave the live `subscribeToNotificationTaps` subscription exactly
as it is; that one is correct and must keep re-subscribing.

---

## FIX 3 (MEDIUM) — Filtering or searching gigs silently disables pagination and prints a false "no results"

**Where:** `app/(tabs)/index.tsx:217-221`, and the `visible`/`isEmpty` computation at
`:46-60`

```tsx
onEndReached={() => { if (selected === 'All' && hasMore.gigs) { void loadMore('gigs'); } }}
```

Category and search are client-side filters over whatever pages happen to be loaded, but
`loadMore` only runs on the unfiltered tab.

**Failure scenario.** 60 gigs exist; 5 are Tutoring, all older than the newest 20. The
user taps "Tutoring" → the list is empty → scrolling loads nothing → `isEmpty` renders
**"No tutoring gigs in the feed yet."** That statement is false, and it is exactly the
message that convinces a new user the category is dead.

**Fix — prefer the server-side version.** Push the category filter (and ideally the
search) into the `gigs_feed` query in `lib/posts-store.tsx` with per-filter keyset
cursors, so `loadMore` keeps working under a filter. The existing cursor machinery
(`cursorRef`, `keysetOlderThan`, the `fetchGenRef` generation guard) is the pattern to
extend — read it carefully first; the generation counter exists so a refresh landing
mid-`loadMore` discards the stale page, and a per-filter cursor must not break that.

If you judge the server-side filter too large a change to land safely in this pass, the
acceptable fallback is: keep paginating while a filter is active, and change the empty
copy so it stops asserting something it cannot know (e.g. "No tutoring gigs in what's
loaded yet"). State clearly in your report which option you took and why.

While you are in these two files, also fix two Lows:

- **`app/(tabs)/index.tsx:82`** — `subtitle={\`notre dame · ${gigs.length} open\`}`
  counts *loaded rows*, and `gigs_feed` has no `status = 'open'` filter, so accepted and
  cancelled gigs are counted as open. Either filter on status or stop calling it "open".
- **`lib/posts-store.tsx:232-240`** — `dollarsToCents` / `centsToPayout` silently
  normalize money: `"$30/hr"` is stored as `3000` and re-rendered as `"$30"`, and cents
  round away. Acceptable for whole-dollar campus gigs, but the round-trip is lossy and
  undocumented. Make the contract explicit (validate/reject rather than silently
  mangle, or document it at the type level) — your call, but be deliberate.
  `Number("1.5.5")` is `NaN`, which currently floors to 1 cent; that path should not
  produce a silent $0.01 gig.

---

## FIX 4 (MEDIUM) — The profile-setup sync effect resurrects fields the user just cleared

**Where:** `app/profile-setup.tsx:89-101`

```tsx
setBio((cur) => cur || profile.bio || '');
setDorm((cur) => cur || profile.dorm || '');
```

`||` treats a deliberately-emptied field as "unset".

**Failure scenario.** The user opens Edit profile, clears their bio, then taps their
avatar to change it. `uploadAvatar` succeeds and calls `refreshProfile()` → the
`profile` object identity changes → this effect runs → `cur` is `''` → the old bio is
restored. The user saves believing the bio is gone, and it silently comes back. Same for
dorm, major and display name.

**Fix:** hydrate once from the first non-null profile (a `hydratedRef` latch), rather
than merging on every `profile` change. Per-field dirty tracking also works if you
prefer it. Make sure the first-run case still populates correctly when `profile` arrives
*after* mount — that's why the effect exists.

---

## FIX 5 (MEDIUM) — Legal text is duplicated in two sources of truth with no drift check

**Where:** `legal/index.ts:11` vs `legal/privacy.md` / `legal/tos.md`

I diffed them: **they are byte-identical today apart from line endings** — there is no
drift yet, and you should not "fix" content. The defect is structural.
`legal/README.md` names the `.md` files "the document of record", while the app renders
the inlined template literals in `legal/index.ts`, and nothing enforces the relationship.

**Failure scenario.** Counsel edits `privacy.md` before launch, nobody updates
`index.ts`, and the app keeps rendering un-reviewed text — including at the sign-up
consent gate in `app/(auth)/sign-up.tsx`, where the student is agreeing to it.
`app/legal.tsx` additionally points at GitHub blob URLs as the App Store "Privacy policy
URL", a third surface that can disagree with the other two.

**Fix:** add `scripts/check-legal-sync.mjs` — a newline-normalized string compare of
each exported constant against its `.md` file, exiting non-zero with a clear message on
mismatch — and wire it into both workflows next to `check-contract.mjs`. Five lines of
logic; match `check-contract.mjs`'s header-comment style, which explains *why* the check
exists rather than what it does.

While in `legal/`, fix one Low: the privacy policy claims *"If you tag a post with a
location, we store the coarse lat/lon."* No client path ever writes `lat`/`lon` —
the columns exist in `0001_schema.sql` and are never populated. It over-claims
collection, which is the harmless direction, but the policy should describe what the
code actually does. Fix the text in **both** `legal/privacy.md` and `legal/index.ts`
(your sync check will then confirm they match).

---

## FIX 6 (LOW) — `openLink` has no scheme allowlist

**Where:** `app/modal.tsx:22-35`

```ts
function normalizeUrl(raw: string): string {
  return raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;
}
```

Anything already matching `^https?://` passes through untouched, and profile `links`
have no DB-level URL constraint — a crafted client can store an arbitrary scheme on its
own profile. Today these are only ever rendered on the owner's *own* profile, so it is
self-XSS at worst, which is why this is Low. Allowlist `http`/`https` (parse with `URL`
and check `protocol`) before this gets surfaced on other people's profiles.

---

## FIX 7 (LOW) — Map pin coordinates are fabricated

**Where:** `app/(tabs)/map.tsx:44-59`

`geocode()` matches a hardcoded landmark list; anything else gets a hash-derived jitter
within roughly ±200m of campus centre and is then drawn as a precise pin. The `gigs.lat`
/ `gigs.lon` columns exist and are never written.

Either label these pins as approximate in the UI, or don't plot posts whose location
didn't match a landmark. Don't present invented coordinates as real ones.

---

## FIX 8 (LOW) — `comments.remove` doesn't reconcile a silent RLS no-op

**Where:** `lib/comments.ts:209-220`

The optimistic removal is only rolled back when PostgREST returns an `error`. A DELETE
that RLS filters to zero rows returns 204 with no error, so the comment stays gone from
the local list until the next refetch. Reachable in practice only via a race (e.g. the
row already removed by moderation), hence Low. Either request the deleted rows back and
reconcile on an empty result, or refetch unconditionally after a delete.

---

## Deliverable

1. All eight fixes implemented in your owned files.
2. `npx tsc --noEmit`, `npx eslint app lib components hooks constants scripts`,
   `node scripts/check-contract.mjs`, your new `check-legal-sync.mjs`, and the new test
   suite all pass locally.
3. Both CI workflows updated with the new Test and legal-sync steps.
4. A short report: what changed, which option you took for FIX 3 and why, the test
   coverage you added and the notable gaps you deliberately left, and any fix that
   needed a file you don't own.

**Do not** commit.
