# Stream A — Anonymity & hangouts (Critical + High)

You are a senior engineer fixing verified defects in **quad**, a Notre Dame campus app
(Expo Router + Supabase). Repo root: `C:\Users\nguye\OneDrive\Desktop\quad`.
Current branch: `fix/codebase-review-batch`. Do **not** commit or push.

Two other engineers are working in parallel on the same repo. **Stay inside your file
ownership list.** If a fix seems to require a file you don't own, stop and report it
instead of editing it.

## Files you own (nobody else will touch these)

- `supabase/migrations/0038_*.sql` — you own migration number **0038 only**
- `supabase/CLIENT_CONTRACT.md`
- `lib/messaging.ts`
- `lib/connections.ts`
- `app/chat/[id].tsx`
- `app/hangout/[id].tsx`

Explicitly **not** yours: `supabase/functions/**`, `lib/notifications.ts`,
`lib/posts-store.tsx`, `lib/comments.ts`, `app/_layout.tsx`, `app/(tabs)/**`,
`app/profile-setup.tsx`, `app/settings/**`, `app/modal.tsx`, `package.json`,
`.github/**`, `scripts/**`, `legal/**`, migrations 0039+.

## Project conventions (match these)

- TypeScript strict. Path alias `@/*` → repo root.
- Migrations are append-only numbered SQL files. Every one opens with a long `--`
  header explaining **the hole being closed, the concrete failure scenario, the
  design choice and why the alternatives were rejected**, and any client-visible
  breakage. Read `0034_anon_dm_lockdown_read_rpc_profile_limits.sql` and
  `0027_anonymous_feed_views.sql` first — match that voice exactly.
- Client code carries dense explanatory comments about *why*, not *what*. Match the
  surrounding density; don't add narration to obvious lines.
- Error-code contract (see `CLIENT_CONTRACT.md` §3): blocked → `42501`,
  capacity → `23514`, not-found → `P0002`, rate limit → `54000`, not-auth → `28000`.
- CI gates you must leave green:
  `npx tsc --noEmit` · `npx eslint app lib components hooks constants scripts` ·
  `node scripts/check-contract.mjs`
- **Never** read the locked base tables (`gigs`, `hangouts`, `voices`, `comments`)
  with `.from(t).select(...)` — table-wide SELECT is revoked for clients and only
  granted column-by-column excluding identity columns. Use the `*_feed` views.
  `scripts/check-contract.mjs` fails CI if you slip.

---

## FIX 1 (CRITICAL) — Anonymous hangout hosts are de-anonymized by name in the app's own UI

**Where:** `lib/connections.ts:249-272` · `lib/messaging.ts:571-590` ·
`supabase/migrations/0002_rls.sql:131-134`

**The hole.** Migration 0027 masks `host_id` in `hangouts_feed`, 0034 blocks
anonymous gig DMs, 0037 removed the uid from image paths — but `conversation_members`
was never brought under masking. Its SELECT policy is
`using (user_id = auth.uid() or public.is_conversation_member(conversation_id))`, and
`profiles` is `using (true)` for every authenticated user. So any member of a
hangout's group chat can read every other member's real uid and resolve it to a name.

**Failure scenario (no exploit required — the shipping UI does it).** Alice hosts a
hangout anonymously. Bob RSVPs. `join_hangout` creates the group conversation with
exactly two members. Bob opens Connections → `fetchOrbitSources` reads
`conversation_members` for that conversation, pushes Alice's uid into `hangoutGroups`,
fetches her profile, and `buildOrbitGraph` renders her as a ring-1 node labelled
**"hung out"** with her display name, major, dorm and bio. Separately, `useThread`'s
`hydrateOtherReads` puts the same uid in `otherReads[0].userId`, which
`app/chat/[id].tsx` hands to `ChatHeaderMenu` as the block/report target — while the
chat header says "Anonymous". With the raw anon key it is a one-line query.

This is the same class migration 0034 called "a one-RPC, no-consent mass
de-anonymizer", reached via hangouts instead of gigs.

**Decided approach — implement this one.** Mirror 0034's rule: **an anonymous hangout
does not get a group conversation at all.** RSVP still works (the attendee row is
still inserted, capacity still enforced, `going_count` still increments) but
`join_hangout` returns `NULL` for the conversation id and creates no membership row.

Rationale, and why the alternatives were rejected — put this in the migration header:

- Masking `conversation_members` behind a definer view was considered and rejected:
  the client legitimately filters on `user_id = auth.uid()` for `last_read_at` reads,
  leave-conversation deletes and read receipts, so column-level revoke can't work;
  and tightening the RLS policy to own-rows-only would drop other members' UPDATE
  events out of the realtime publication, silently killing read receipts for
  *everyone*, not just anonymous hangouts.
- Removing the anonymous option from hangouts entirely was considered and rejected as
  a bigger product change than the defect requires.
- The remaining cost is real and should be stated plainly in the header: attendees of
  an anonymous hangout cannot coordinate in a group chat.

**Do NOT write a destructive backfill.** Pre-existing conversations tied to anonymous
hangouts may exist. Do not `DELETE` them in the migration — you cannot see that data.
Instead: note in the migration header that they must be reviewed manually, and add the
client-side guards below so legacy rows cannot leak through the app.

**Work items:**

1. **`supabase/migrations/0038_*.sql`** — `create or replace` `join_hangout` so that
   when the target hangout has `anonymous = true`, it inserts the attendee row and
   returns `NULL` without creating or joining a conversation. Keep every existing
   behaviour: the not-authenticated `28000` raise, the `P0002` not-found raise, the
   block-vs-host `42501` raise, and the capacity `23514` raise (but see FIX 2 —
   you are rewriting this function once, fold both changes into the same body).
2. **`lib/connections.ts`** — `fetchOrbitSources` must not build a `hangoutGroups`
   entry from a conversation whose hangout is anonymous. You already fetch
   `conversations(id, gig_id, hangout_id)`; look the hangout ids up through
   `hangouts_feed` (which exposes `anonymous`, and `host_id` that is NULL for someone
   else's anonymous hangout) and skip those groups. Defense in depth for legacy rows.
3. **`lib/messaging.ts`** — `useThread` should expose a `partnerIsMasked: boolean`
   (it already computes `partnerIsAnon` internally at ~line 649). Return it.
4. **`app/chat/[id].tsx`** — when `partnerIsMasked` is true, pass `otherUserId=""`
   and `otherUserName={undefined}` to `ChatHeaderMenu`, and set `targetKind`/`targetId`
   to the hangout rather than the profile, so a masked host's uid never reaches the
   report params or the block insert. (`ChatHeaderMenu` already hides the Block item
   when `otherUserId` is empty — you don't need to edit that component.)
5. **`app/hangout/[id].tsx`** — a `null` conversation id is now an expected outcome,
   not an error. Today `onJoin` falls through to
   `setJoinErr("Couldn't join the group chat. Try again.")` and `openGroupChat` says
   `"Couldn't open the group chat. Try again."`. For an anonymous hangout, RSVP should
   report success and the "Open group chat" affordance should be replaced with a short
   line explaining that anonymous hangouts have no group chat.

**Verification you must do before reporting done:** trace every caller of
`joinHangout` and `rsvpHangout` and confirm none of them treats a null conversation id
as failure. There are call sites in `app/hangout/[id].tsx` **and**
`app/(tabs)/explore.tsx` (`onQuickJoin`) — `explore.tsx` is **not** your file, so if it
needs a change, report it rather than editing it.

---

## FIX 2 (HIGH) — Attendees of a full hangout are permanently locked out of its group chat

**Where:** `supabase/migrations/0029_conversation_block_enforcement.sql:127-133` ·
`app/hangout/[id].tsx:184-198`

`join_hangout`'s capacity check has no exemption for someone who is *already* an
attendee — it raises before ever reaching the idempotent insert:

```sql
if v_me <> v_host then
  select count(*) into v_count from public.hangout_attendees where hangout_id = p_hangout_id;
  if v_count >= v_max then raise exception 'hangout is full' using errcode = '23514';
```

The 0025 BEFORE INSERT trigger *does* exempt existing attendees
(`if exists (...) then return new`), but the RPC never gets that far.

**Failure scenario.** Bob RSVPs to a 20-person hangout early. It fills. Bob reopens the
app in a new session, so the screen's `convId` state is null; `myRsvps` says he's
joined, so the button reads "Open group chat"; `openGroupChat` calls `joinHangout`
purely to resolve the conversation id → `23514` → `jr.ok === false` → `cid` null →
"Couldn't open the group chat. Try again." Permanently, for every attendee of every
full hangout. Retrying never helps. The bug only appears once hangouts are popular.

**Fix:**

1. In your 0038 `join_hangout` rewrite, skip the capacity check when the caller is
   already an attendee, mirroring the 0025 trigger's exemption:
   ```sql
   if v_me <> v_host
      and not exists (select 1 from public.hangout_attendees
                       where hangout_id = p_hangout_id and user_id = v_me) then
     -- capacity check here
   end if;
   ```
2. Stop overloading a mutation as a lookup. Add a read-only definer RPC in 0038 —
   `hangout_conversation_id(p_hangout_id uuid) returns uuid` — that returns the
   existing conversation id for a hangout **only if the caller is a member**, and
   `NULL` otherwise. `revoke all ... from public; grant execute ... to authenticated`,
   matching the style of the other RPCs.
3. `lib/messaging.ts` — export a thin wrapper for it.
4. `app/hangout/[id].tsx` — `openGroupChat` calls the new lookup, never `joinHangout`.

---

## FIX 3 (MEDIUM) — The chat error banner discards every typed error

**Where:** `app/chat/[id].tsx:506-513`

`useThread`'s `send` carefully maps `42501` → "You can no longer message this person."
and `54000` → "You're sending messages too quickly — try again in a bit."
(`lib/messaging.ts:879-892`). The only consumer throws all of it away:

```tsx
{error ? (<View style={[styles.errorBar, …]}>…<ThemedText …>
  couldn&apos;t send — check your connection
</ThemedText></View>) : null}
```

**Failure scenario.** Alice blocks Bob. Bob sends a message, gets `42501`, and is told
his *connection* is bad. He retries forever. Same for the rate limit. The same banner
also renders when the thread *load* failed, where "couldn't send" is simply wrong.

**Fix:** render `{error}`. The strings in `messaging.ts` are already user-facing copy.
Check whether the `useThread` load path (`setError(msg)` in the catch at ~line 685)
puts a raw Postgres string into that state — if it can, give it friendly copy there
too rather than leaking DB text to students.

---

## FIX 4 (LOW) — `orLiteral` strips `"` but not `\`

**Where:** `lib/connections.ts:85-87`

```ts
function orLiteral(value: string): string { return `"${value.replace(/"/g, "")}"`; }
```

A dorm or major ending in a backslash escapes the closing quote of the PostgREST
`.or()` literal. It's self-scoped (your own profile, filtering a table that is already
world-readable to authenticated users), so the impact is a broken query rather than a
leak — but escape or strip the backslash too.

---

## FIX 5 (LOW) — `hangout_attendees` direct-delete bypasses `leave_hangout`

**Where:** `supabase/migrations/0002_rls.sql:110-113`

The `"hangout_attendees: leave self"` policy lets a client delete its own attendee row
directly. `leave_hangout` (definer) removes the attendee row **and** the
`conversation_members` row; the raw delete removes only the former. A hostile client
can therefore leave the attendee list while remaining in the hangout's group chat.
Unreachable from the shipping client today (it only calls the RPC), which is why this
is Low.

In 0038, close it: drop the direct-delete policy so `leave_hangout` is the only path.
Before you do, grep `app/`, `lib/` and `components/` to confirm nothing deletes
`hangout_attendees` directly — the host self-RSVP **insert** in `lib/posts-store.tsx`
must keep working (0025's header explains why that insert policy is deliberately
kept), so only touch the DELETE policy.

---

## Deliverable

1. All five fixes implemented in your owned files.
2. `npx tsc --noEmit`, `npx eslint app lib components hooks constants scripts`, and
   `node scripts/check-contract.mjs` all clean.
3. `supabase/CLIENT_CONTRACT.md` updated with a new `## 11` section covering: the
   anonymous-hangout-no-group-chat rule and the null conversation id it returns, the
   new `hangout_conversation_id` RPC, and the removed `hangout_attendees` delete path.
4. A short report: what changed, anything you could not verify statically, and any fix
   that needed a file you don't own.

**Do not** run migrations against the live project, and do not commit.
