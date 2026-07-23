# Client contract — DB security migrations 0023–0037 (updated 2026-07-23)

What the client sessions (feeds/messaging session and auth/shell session) must
know about the database after the security pass. Written by the DB session;
source of truth is the migrations themselves. §§1–9 describe 0023–0032; §10
covers the 0033–0037 additions.

## 1. Feed reads MUST use the new views — base tables are locked down

`voices`, `gigs`, `hangouts`, `comments`: table-wide SELECT was revoked for
clients and re-granted **column by column, excluding identity columns**
(`author_id` / `poster_id` / `host_id`). Consequences, all fail-closed and
loud:

- `select('*')` on these tables now errors with `permission denied` (42501).
- Author-profile embeds (`poster:profiles!gigs_poster_id_fkey(...)` etc.) error.
- Filtering by author column on the base table (`.eq('poster_id', me)`) errors.
- `insert(...).select(GIG_SELECT)` / any `returning *` errors. Insert with the
  default `return=minimal` (no `.select()`), then read back through the view
  (or keep the optimistic local object).

Read instead from the views (SELECT granted to `authenticated`; keyset
pagination and `.or(...)` filters work identically):

| view | columns |
|---|---|
| `voices_feed` | id, anonymous, body, topic, posted_at, vote_score, comment_count, origin, **author_id, author_display_name, author_initials, author_avatar_url** |
| `gigs_feed` | id, anonymous, title, description, category, payout_cents, location_label, lat, lon, posted_at, status, accepted_by, deadline_at, comment_count, origin, **poster_id, poster_display_name, poster_initials, poster_avatar_url** |
| `hangouts_feed` | id, anonymous, title, vibe, location_label, lat, lon, starts_at, when_label, max_people, description, created_at, comment_count, origin, **going_count**, **host_id, host_display_name, host_initials, host_avatar_url** |
| `comments_feed` | id, target_type, target_id, anonymous, body, created_at, origin, **author_id, author_display_name, author_initials, author_avatar_url** |

Semantics:

- Bold author columns are **NULL when the row is anonymous and not yours**;
  your own rows always carry your identity (so "my posts" works: filter
  `.eq('author_id', me)` / `poster_id` / `host_id` on the *view* — masked rows
  of other people fall out of the filter naturally).
- The two-way block filter is built in — no client-side block filtering needed
  for feeds.
- `hangouts_feed.going_count` replaces the `hangout_attendees(count)` embed.
- The mappers should read the flat `author_display_name`-style columns instead
  of the nested `author.display_name` embed shape.
- Writes (insert / update-own / delete-own) stay on the **base tables**,
  unchanged, minus the returning-* caveat above.

`hangout_attendees` SELECT is now **own rows only** (the attendee list leaked
anonymous hosts via the implicit self-RSVP). Joined-state = query your own
rows; counts = `going_count`.

## 2. Realtime: content-table subscriptions are DEAD — subscribe to `feed_events`

`voices`, `gigs`, `hangouts`, `comments`, `hangout_attendees` were **removed
from the `supabase_realtime` publication** (their full-row payloads leaked
`author_id` on every insert/update). Existing `postgres_changes` subscriptions
on those tables will simply never fire — repoint them.

New signal table `feed_events` (INSERT events only matter):

```ts
// row shape
{ id: number, kind: 'gig'|'hangout'|'voice'|'comment',
  op: 'insert'|'update'|'delete', target_id: uuid,
  comment_target_type: string|null, comment_target_id: uuid|null,
  created_at: string }
```

- One subscription covers all feeds:
  `.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_events' }, ...)`
  → on event, refetch the affected row from the matching `*_feed` view
  (same RLS-gated-refetch pattern 0022 used for comments). Never render from
  the event payload.
- RSVP joins/leaves arrive as `kind: 'hangout', op: 'update'` on the parent
  hangout (refetch → fresh `going_count`).
- Comment threads can filter server-side:
  `filter: 'comment_target_id=eq.<postId>'`.
- `messages` and `conversation_members` subscriptions are **unchanged**.
- Events are pruned after ~3 days; treat them as signal, not history.

## 3. RPC / write error codes to handle

| code | where | meaning / UX |
|---|---|---|
| `42501` | `start_gig_conversation` | "you cannot message this user" (block, either direction) |
| `42501` | `join_hangout` | "you cannot join this hangout" (block vs host) |
| `42501` | `messages` insert | send into a 1:1 gig thread across a block (group chats unaffected) |
| `23514` | `join_hangout` / any `hangout_attendees` insert | "hangout is full" — capacity now also enforced by trigger on **direct inserts**, atomically |
| `23505` | `reports` insert | duplicate — you already reported this thing; treat as success |
| `54000` | `reports` insert | rate limit (20/hour) |
| `P0002` | several RPCs, `reports` insert | target row not found |

## 4. Reports

`target_user_id` is now resolved **server-side** from `(target_kind,
target_id)` and the client's value is overwritten — the client can stop
computing it (sending it is harmless).

## 5. unread_counts_for_user

Signature unchanged (`p_user_id uuid` still accepted so the existing call site
keeps working) but the argument is **ignored** — counts are always for
`auth.uid()`, and messages from blocked senders are no longer counted.

## 6. Auth: server-side email domain gate

Signups (and email *changes*) whose domain isn't in `allowed_email_domains`
(seeded: `nd.edu`) are rejected by a DB trigger. GoTrue surfaces this as a
generic "Database error saving new user" — the client-side domain check is now
purely UX and should stay, to give a friendly message first.
`EXPO_PUBLIC_TEST_EMAIL_DOMAINS` no longer opens a real hole by itself, but a
non-prod DB that should accept test signups needs:
`insert into public.allowed_email_domains values ('gmail.com');`

## 7. Input limits (mirror as `maxLength` / validation)

- gig title 3–120 · gig description ≤ 2000 · location labels ≤ 140
- payout ≤ $10,000 (`payout_cents ≤ 1_000_000`)
- hangout title 3–120 · vibe ≤ 60 · when_label ≤ 80 · description ≤ 2000
- (voices 4–400 and comments 1–500 were already enforced)
- Constraints are `NOT VALID` — after applying to the live project, run the
  `validate constraint` block at the top of `0032_content_length_limits.sql`.

## 8. Storage buckets

- `message-images`: 10 MB max, `image/jpeg|png|webp` only
- `avatars`: 5 MB max, same types
- Out-of-contract uploads now fail server-side (413 / invalid mime type).

## 9. Applying + housekeeping

- Fresh/live DB: run migrations `0021`–`0037` in order (live DB was last known
  at 0020), or paste the regenerated `_bundle.sql` for a fresh project.
- `_bundle.sql` is **generated** — never hand-edit; run
  `node supabase/scripts/generate-bundle.mjs` after adding a migration.
- Dashboard items still open (not expressible in SQL): Auth "Allowed email
  domains" allowlist (belt-and-suspenders with 0026), Site URL + redirect
  allowlist, SMTP.
- Known product caveat: an anonymous hangout host is necessarily visible to
  members *inside* the group chat (chat membership is real identity). The DB
  now prevents leaking it anywhere else.

## 10. Additions since the original pass (0033–0037)

**0033 — membership lock + comment reports.**
`conversation_members` UPDATE is column-granted to `last_read_at` only (no
other column can be written from the client). `reports.target_kind` gains
`comment`; report a comment with the comment's own id, not the parent post's.

**0034 — anon-DM lockdown, read RPC, profile limits.**
`start_gig_conversation` refuses anonymous gig posters with `42501` ("this
poster cannot be messaged") — keep the client-side `canMessage` gate as UX.
Mark-as-read goes through the `mark_conversation_read(p_conversation_id)`
RPC, which stamps `last_read_at` with the SERVER clock. Profile field limits
(mirror client-side): display_name ≤ 60, initials ≤ 8, major ≤ 80, dorm ≤ 80,
bio ≤ 240, links ≤ 10.

**0035 — reports are write-only for clients.**
The `reports: read own` SELECT policy and the table grant are gone: the
resolver trigger stamps the REAL author id into `target_user_id` (including
for anonymous content), so letting the reporter read their own row back was a
de-anonymization oracle. Clients must never `select` from `reports`;
"already reported" is signaled by `23505` on insert (treat as success).

**0036 — per-author insert rate limits (errcode `54000`).**
Rolling-hour caps on the content tables: gigs 5 · hangouts 5 · voices 10 ·
comments 60 · messages 120. Same errcode as the reports limiter — map to
"you're doing that too much, try again later" copy wherever the client
inserts into these tables.

**0037 — message-image paths carry no uid.**
Upload path is now `{conversationId}/{stamp}-{rand}.jpg`; the storage INSERT
policy checks conversation membership on the first path segment (a uid-first
path no longer passes). Rationale: image URLs are visible to every member,
and a uid in the path de-anonymized anonymous hangout hosts. The
delete-account function now also removes objects referenced by the user's
`messages.image_url` (the `{uid}/` prefix sweep only covers legacy objects).
