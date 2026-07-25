# send-new-post-push

Fan-out push notifications when a new row lands in `public.gigs`, `public.hangouts` or `public.voices`. The DB triggers are `trg_gigs_push` / `trg_hangouts_push` (migration 0012) and `trg_voices_push` (migration 0019); all three run `notify_new_post()`, which POSTs the standard Supabase DB-webhook payload here and dispatches on `payload.table`.

## Payload

```json
{
  "type": "INSERT",
  "table": "gigs",            // or "hangouts" or "voices"
  "schema": "public",
  "record": {
    "id": "...",
    "title": "...",            // gigs/hangouts; voices have "body" + "topic"
    "poster_id": "..."         // or "host_id" (hangouts) / "author_id" (voices)
    // ...other columns are ignored
  }
}
```

Validation is per-table: gigs and hangouts must carry `title`, voices must carry `body`. A malformed record is a `400`; an unrecognised table is a `200` with `skipped: true`.

## Recipient selection

Recipients are every row in `public.user_push_tokens` — **one row per device** since migration 0040, so a user with a phone and a tablet gets one message per device — minus:

1. The author (`poster_id` / `host_id` / `author_id`).
2. Anyone on either side of a `public.user_blocks` row with the author (table from migration 0013).
3. Anyone whose `public.notification_prefs` pref for this kind resolves to `false`.

Pref defaults differ by kind (migration 0015), and the function queries a different side of the table for each:

| kind | pref column | missing row means | query |
| --- | --- | --- | --- |
| gig | `new_gigs` | `true` (opt-out) | select users with the pref `false`, exclude them |
| hangout | `new_hangouts` | `true` (opt-out) | select users with the pref `false`, exclude them |
| voice | `new_voices` | **`false`** (opt-in) | select users with the pref `true`, keep only them |

Voices are opt-in because the feed is high-volume — that is what the "High volume — off by default" switch in `app/settings/notifications.tsx` promises. Querying the opted-*out* set for voices, as the other two kinds do, would have pushed every voice to every student who never opened the settings screen.

Block and notification-prefs lookups are tolerant of missing tables: if migrations 0013 or 0015 haven't run yet, those filter steps no-op. Note the asymmetry that follows for voices — with no `notification_prefs` table there is no opted-in set, so voice pushes go to nobody. That is the safe direction for an opt-in kind.

## Anonymity

Voices are an anonymous surface (migrations 0027 / 0034 / 0037). The voice notification carries **only the topic and the body** — never the author's name, initials, or anything else derived from `author_id`. `author_id` is used server-side only, to exclude the author from their own push and to apply the two-way block filter. Do not add an author name to this path; the lock screen would become the one place in the product that de-anonymises a voice.

## Notification data

The Expo `data` field follows the contract documented in `lib/notifications.ts → routeForPayload`:

```json
{ "kind": "gig",     "gigId":     "<uuid>" }    // routes to /gig/<id>
{ "kind": "hangout", "hangoutId": "<uuid>" }    // routes to /hangout/<id>
{ "kind": "voice",   "voiceId":   "<uuid>" }    // routes to /voice/<id>
```

## Env vars

Auto-injected by the Supabase Edge Runtime — nothing to set manually:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy

```bash
supabase functions deploy send-new-post-push
```

## Test locally

```bash
supabase functions serve send-new-post-push --env-file ./supabase/.env.local

curl -X POST http://localhost:54321/functions/v1/send-new-post-push \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <service-role-key>' \
  -d '{
    "type": "INSERT",
    "table": "gigs",
    "schema": "public",
    "record": {
      "id": "00000000-0000-0000-0000-000000000001",
      "title": "Test gig",
      "poster_id": "<uuid that has at least one OTHER user with a push token>"
    }
  }'
```

Expected: `{"sent": <n>, "batches": 1, "kind": "gig"}` — `sent` counts **devices**, not people. If you get `{"sent": 0, ...}`, either no one else has registered a push token, all of them have opted out of `new_gigs`, or they all have a block with the author.

For the voices path, swap `"table": "voices"` and a record of `{ "id", "body", "topic", "author_id" }`. Expect `sent: 0` unless some other user has explicitly set `new_voices = true` — that is the opt-in default working, not a bug.

The `authorization` header is required: the function compares it in constant time against the service role key, because the public function URL is otherwise unauthenticated.

## Stale token cleanup

Tickets with `details.error === 'DeviceNotRegistered'` delete the matching `user_push_tokens` row — scoped to `(user_id, expo_push_token)`, so one dead device never unregisters the same user's other, healthy devices.
