# send-new-post-push

Fan-out push notifications when a new row lands in `public.gigs` or `public.hangouts`. The DB trigger that fires this function is part of Engineer B's push track; this function is shape-compatible with the standard Supabase DB webhook payload so the same wiring used by `send-message-push` works here.

## Payload

```json
{
  "type": "INSERT",
  "table": "gigs",            // or "hangouts"
  "schema": "public",
  "record": {
    "id": "...",
    "title": "...",
    "poster_id": "..."         // or "host_id" for hangouts
    // ...other columns are ignored
  }
}
```

## Recipient selection

Recipients are every user with a row in `public.user_push_tokens`, minus:

1. The author (`poster_id` / `host_id`).
2. Anyone on either side of a `public.user_blocks` row with the author (table from migration 0013).
3. Anyone whose `public.notification_prefs.{new_gigs|new_hangouts}` is `false`. Missing row → default `true` (so brand-new users get pushes until they opt out).

Block and notification-prefs lookups are tolerant of missing tables: if migrations 0013 or 0015 haven't run yet, those filter steps no-op and the push still goes out.

## Notification data

The Expo `data` field follows the contract documented in `lib/notifications.ts → routeForPayload`:

```json
{ "kind": "gig",     "gigId":     "<uuid>" }    // routes to /gig/<id>
{ "kind": "hangout", "hangoutId": "<uuid>" }    // (no detail screen yet)
```

## Env vars

Auto-injected by the Supabase Edge Runtime — nothing to set manually:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy

```bash
supabase functions deploy send-new-post-push
```

## Wire up the trigger

A follow-up migration (owned by the push track) should add `AFTER INSERT` triggers on `public.gigs` and `public.hangouts` that POST the standard DB-webhook payload to this function via `pg_net`. See `supabase/migrations/0011_message_push_trigger.sql` for the pattern — the only difference is `'edge_function_url'` should point at `…/functions/v1/send-new-post-push` and the trigger should fire on both `gigs` and `hangouts` (one trigger per table, both pointing at the same function).

## Test locally

```bash
supabase functions serve send-new-post-push --env-file ./supabase/.env.local

curl -X POST http://localhost:54321/functions/v1/send-new-post-push \
  -H 'content-type: application/json' \
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

Expected: `{"sent": <n>, "batches": 1, "kind": "gig"}`. If you get `{"sent": 0, ...}`, either no one else has registered a push token, all of them have opted out of `new_gigs`, or they all have a block with the author.

## Stale token cleanup

Same as `send-message-push`: tickets with `details.error === 'DeviceNotRegistered'` cause the matching `user_push_tokens` row to be deleted.
