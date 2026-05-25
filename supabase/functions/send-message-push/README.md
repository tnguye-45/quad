# send-message-push

Fan-out push notifications when a new row lands in `public.messages`. Triggered by `pg_net` from an `after insert` trigger on `messages` (see `supabase/migrations/0011_message_push_trigger.sql`).

## Payload

The trigger posts a Supabase-style DB webhook payload:

```json
{
  "type": "INSERT",
  "table": "messages",
  "schema": "public",
  "record": { "id": "...", "conversation_id": "...", "sender_id": "...", "body": "...", "sent_at": "..." }
}
```

The function fetches all `conversation_members` for `record.conversation_id` except `record.sender_id`, joins them to `user_push_tokens`, and POSTs to `https://exp.host/--/api/v2/push/send` in batches of 100. The Expo payload's `data` field is shaped to match what `lib/notifications.ts → routeForPayload` expects:

```json
{ "kind": "message", "conversationId": "<uuid>", "messageId": "<uuid>" }
```

## Env vars

Auto-injected by the Supabase Edge Runtime — nothing to set manually:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service role key is used for two things: PostgREST reads against `conversation_members`, `user_push_tokens`, `profiles`, and `conversations` (RLS bypass needed because `user_push_tokens` is per-user-readable only), and `DELETE` against stale token rows when Expo returns `DeviceNotRegistered`.

## Deploy

```bash
supabase functions deploy send-message-push
```

That's it. The function has no third-party deps — just `fetch` and the Deno runtime — so deploys are quick.

## Wire up the trigger (one-time per environment)

Apply `supabase/migrations/0011_message_push_trigger.sql`, then in the SQL editor as the `postgres` role run:

```sql
alter database postgres
  set app.settings.edge_function_url = 'https://<project-ref>.supabase.co/functions/v1/send-message-push';
alter database postgres
  set app.settings.service_role_key = '<service-role-jwt-from-dashboard>';
```

The trigger reads both at runtime via `current_setting(..., true)`. If `edge_function_url` is empty the trigger silently no-ops, so chat keeps working in local/dev environments where the function isn't deployed.

## Test locally

Run the function on a local port:

```bash
supabase functions serve send-message-push --env-file ./supabase/.env.local
```

`.env.local` needs:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>
```

Then fire a synthetic webhook (replace UUIDs with real ones from your DB):

```bash
curl -X POST http://localhost:54321/functions/v1/send-message-push \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{
    "type": "INSERT",
    "table": "messages",
    "schema": "public",
    "record": {
      "id": "00000000-0000-0000-0000-000000000001",
      "conversation_id": "<existing conversation uuid>",
      "sender_id": "<sender uuid — NOT the device you want notified>",
      "body": "hello from curl"
    }
  }'
```

A successful response looks like `{"sent": 1, "batches": 1}`. If you get `{"sent": 0, "reason": "no recipients with tokens"}` the conversation either has no other members or no member has registered a push token (see `lib/notifications.ts → registerForPushToken`).

## Stale token cleanup

Expo returns a per-recipient ticket. When a ticket says `details.error === 'DeviceNotRegistered'` (uninstall, token rotated, etc.) the function deletes the matching row from `public.user_push_tokens`. The next time that user opens the app, `registerForPushToken` will upsert a fresh token.

## Operational notes

- Trigger errors are caught and logged as `warning` so a failed push can never block a chat send.
- The function is idempotent on retries (the worst case is the recipient gets two pushes; Expo de-dupes within a short window via `_displayInForeground` rules on the client).
- Batches are sent in parallel (`Promise.all`) — for our scale (group chats top out at hangout capacity, ~dozens) this is plenty fast.
