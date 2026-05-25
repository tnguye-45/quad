# delete-account

Hard-delete the calling user's account and all their data. Required by App Store guideline 5.1.1(v).

## Auth

The function expects the **user's** JWT in the `Authorization: Bearer <access_token>` header (i.e. `supabase.auth.getSession().access_token`). It then re-verifies that JWT against GoTrue (`/auth/v1/user`) to recover the caller's `uid` — never trust a uid sent in the body.

Once verified, the function uses the service role key (auto-injected by the Supabase Edge Runtime) to bypass RLS and delete every row tied to that uid.

## What gets deleted

In order:

1. `voice_votes` where `user_id = uid`
2. `voices` where `author_id = uid`
3. `hangout_attendees` where `user_id = uid`
4. `messages` where `sender_id = uid` (messages they sent — counterpart messages stay so conversation history isn't gutted for the other party)
5. `conversation_members` where `user_id = uid`
6. `gigs` where `poster_id = uid` (cascades any conversations whose `gig_id` matches)
7. `hangouts` where `host_id = uid` (same, for hangout-linked conversations)
8. `reports` where `reporter_id = uid` (rows that *targeted* this user keep — `target_user_id` nulls out via the existing `ON DELETE SET NULL` FK)
9. `user_blocks` where `blocker_id = uid` OR `blocked_id = uid` (two deletes — 0013)
10. `notification_prefs` where `user_id = uid` (0015)
11. `user_push_tokens` where `user_id = uid`
12. All objects under `avatars/{uid}/` in storage
13. `profiles` where `id = uid` (also cascades from step 14 — explicit for safety)
14. `auth.admin.deleteUser(uid)` — finally removes the auth.users row

Most of the table deletes would happen automatically via `ON DELETE CASCADE` from `auth.users`, but doing them explicitly:

- makes failure modes obvious (one warning per step),
- gives the final cascade less work, and
- works even if a FK cascade misbehaves on a partially-migrated environment.

## Client contract

```ts
const { data: { session } } = await supabase.auth.getSession();
await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
  method: 'POST',
  headers: { authorization: `Bearer ${session.access_token}` },
});
// then:
await supabase.auth.signOut();
router.replace('/welcome');
```

Success: `200 { ok: true }`.
Failures: `401 { error: '...' }` (bad JWT), `500 { error: '...' }` (something blew up server-side).

## Env vars

Auto-injected by the Supabase Edge Runtime — nothing to set manually:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy

```bash
supabase functions deploy delete-account
```

No DB migration is strictly required (the function only reads `auth.users` via the admin API and writes to existing tables). It does reference `user_blocks` (0013) and `notification_prefs` (0015) — if those tables don't exist yet, those individual DELETEs no-op with a 404 warning and the rest proceeds.

## Test locally

```bash
supabase functions serve delete-account --env-file ./supabase/.env.local

# In another shell, after signing in as a throwaway user:
USER_JWT="<paste access token from the app>"
curl -X POST http://localhost:54321/functions/v1/delete-account \
  -H "authorization: Bearer $USER_JWT"
```

Expected: `{"ok":true}`. The user can no longer sign in afterward.
