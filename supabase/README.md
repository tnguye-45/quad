# Supabase setup for quad

One-time steps to point the app at a real backend. Takes ~10 minutes.

## 1. Create the Supabase project

1. Go to https://supabase.com and sign in
2. **New project** → name it `quad` (or whatever), pick a region close to Notre Dame (us-east-1 / us-east-2 are good), set a strong DB password (save it in your password manager)
3. Wait ~2 minutes for it to provision

## 2. Run the migrations

**Fastest path:** open [migrations/_bundle.sql](migrations/_bundle.sql), copy the whole file, paste into Supabase dashboard → **SQL Editor → New query → Run**. That single paste applies 0001 through 0007 in order. Should see "Success. No rows returned."

If you'd rather paste them individually (same end result):

1. **SQL Editor** → **New query**
2. Open [migrations/0001_schema.sql](migrations/0001_schema.sql), copy, paste, **Run**.
3. Repeat with each subsequent migration **in order**:
   - [migrations/0002_rls.sql](migrations/0002_rls.sql) — Row-Level Security policies
   - [migrations/0003_triggers.sql](migrations/0003_triggers.sql) — auto-create profile + `updated_at` trigger
   - [migrations/0004_profile_links.sql](migrations/0004_profile_links.sql) — `profiles.links` jsonb column
   - [migrations/0005_voices.sql](migrations/0005_voices.sql) — `voices` + `voice_votes` tables (anonymous opinion feed)
   - [migrations/0006_app_alignment.sql](migrations/0006_app_alignment.sql) — adds `anonymous` to gigs/hangouts, `when_label` to hangouts, broadens gig category check to match the app's enum
   - [migrations/0007_conversations_and_realtime.sql](migrations/0007_conversations_and_realtime.sql) — `start_gig_conversation` / `join_hangout` / `leave_hangout` RPCs that bypass the conversation_members "self-only" RLS so a thread can have both participants. Also adds the realtime publication entries.

Run them in order — later migrations reference tables and columns from earlier ones.

To verify: in the SQL Editor, run `select tablename from pg_tables where schemaname = 'public';` — you should see 10 tables (profiles, gigs, hangouts, hangout_attendees, conversations, conversation_members, messages, reports, voices, voice_votes).

### 2b. Realtime is wired by SQL

The previous version of this doc asked you to toggle the realtime publication in the dashboard. Migration 0007 does this in SQL (`alter publication supabase_realtime add table …`), so no manual toggling is required. If you're on a fresh project the migration is idempotent — re-running it after dashboard-side changes is safe.

## 3. Configure auth

In the Supabase dashboard:

1. **Authentication → Sign In / Up → Email**
   - Confirm **Email** provider is enabled
   - **Confirm email** should be ON (default) — users must click the email link before they can sign in
2. **Authentication → Sign In / Up → Email → Allowed email domains**
   - Add `nd.edu`
   - This rejects sign-ups from any other domain at the API level. The app also validates client-side, but the server is the source of truth.
3. **Authentication → URL Configuration**
   - **Site URL**: for local dev set to `http://localhost:8081`. For native builds, use your app's deep-link URL (e.g., `quad://`).
   - **Redirect URLs**: add `http://localhost:8081/**` and (later) your production URL

## 4. Get your project URL + anon key

1. **Project Settings → API**
2. Copy **Project URL** and **`anon` public key**
3. Open `.env` in the repo root and replace the placeholder values:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   ```

4. Restart `npm run start` so Expo picks up the new env

## 5. Verify the backend from the command line

Once `.env` has the real anon key and the migrations are run, sanity-check the connection without launching the app:

```
npm run verify-supabase
```

The script checks that the URL + key are real, hits `/auth/v1/settings`, confirms each of the 10 expected tables is present, and verifies that anon writes are blocked by RLS. Any failure prints what's missing.

## 6. Smoke test in the app

In the app:

1. Tap through splash → welcome → **Sign up**
2. Enter your `nd.edu` email + a password
3. You should land on a "Check your email" screen
4. Open the link in your email
5. Come back, **Sign in**
6. You should land on the profile-setup screen — fill in your name + year + major
7. Land on the Gigs tab. Tap the **Me** button (top-right of Gigs) → see your profile → **Sign out**
8. Sign in again — profile data should persist

If that works, Phase 1 is done. ✓

## Schema overview

| Table | What it holds |
|---|---|
| `profiles` | Student profile (FK to `auth.users`) — name, year, major, dorm, avatar, bio |
| `gigs` | Posted work requests with category, payout, location, status |
| `hangouts` | Hosted gatherings with time, location, max capacity |
| `hangout_attendees` | RSVPs (composite key: hangout_id + user_id) |
| `conversations` | 1:1 (gig) or group (hangout) thread metadata |
| `conversation_members` | Who can read which conversation + `last_read_at` |
| `messages` | Chat content, immutable |
| `reports` | Trust & safety flags |

RLS is on everywhere. See [migrations/0002_rls.sql](migrations/0002_rls.sql) for the policy text. The `is_conversation_member()` SECURITY DEFINER helper is the key trick that makes conversation/message policies work without recursive RLS.

## Resetting (during development)

If you need to wipe and re-run:

```sql
drop schema public cascade;
create schema public;
grant all on schema public to postgres, anon, authenticated, service_role;
```

Then re-run all three migrations. **Don't do this in production** — it nukes everything.
