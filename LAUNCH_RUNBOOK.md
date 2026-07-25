# quad — launch runbook

`supabase/SETUP_CHECKLIST.md` opens with "The code side is done. These four steps are
the only remaining work." That was true for *sign-in*. It is not true for a working
app: push notifications, image upload, and in-app account deletion each depend on a
setup step that appears in no checklist — only inside a migration header or a function
README. Every one of them fails **silently**, which is why they've stayed open.

This file is the ordered sequence. Work top to bottom. Steps marked **BLOCKER** will
break launch day; the rest degrade a feature.

---

## 0. Before anything — regenerate the migration bundle

**BLOCKER.** `supabase/migrations/_bundle.sql` is what both `supabase/README.md` and
`SETUP_CHECKLIST.md` tell you to paste into the SQL editor. It is **generated**, and it
is stale the moment anyone adds a migration. At the time of writing it contained
0001–0037 while 0038+ existed on disk — pasting it would have applied every migration
*except* the ones fixing the anonymity leak and the rate-limit bypass, with no error.

```
node supabase/scripts/generate-bundle.mjs
```

Confirm the header line lists every migration on disk before you paste it anywhere.
CI now guards this: `scripts/check-bundle-fresh.mjs` regenerates in memory and fails the
build when the committed bundle doesn't match, naming the migrations that are missing.

---

## 1. Apply the migrations

**The bundle is only pastable into a FRESH project.** `0001_schema.sql` opens with
`create table public.profiles (…)` — no `if not exists` — and the SQL editor runs a paste
as a single transaction, so against a partially-migrated database the whole thing aborts
on the first statement. 0005, 0013, 0014, 0015 and 0019 have the same shape. If the
project already has tables, apply the missing migrations **individually, in number
order**, and leave the bundle for the next fresh environment.

To find out where a live project actually stands, probe for a relation each migration
introduces rather than trusting the migration history: `gigs.origin` (0020),
`allowed_email_domains` (0026), `gigs_feed` (0027), `feed_events` (0028),
`content_write_log` (0039). `verify-supabase` covers the tables and views; the columns
need a hand query.

SQL Editor → paste `_bundle.sql` (fresh projects) or the missing files in order → Run.
Then verify:

```
npm run verify-supabase
```

Note what that script does and does not prove. It checks that 19 tables/views exist and
that anon inserts are refused. Its existence probe used `select('*', { head: true })`,
which returns no response body — so PostgREST's error never reached the client and every
missing table scored a PASS. It reported a fully green backend against a project that had
no feed views at all. Fixed to `select('*').limit(0)`, plus a sentinel probe that aborts
the run if a table that cannot exist is ever reported present. It says "Supabase backend is live", but it does **not**
check storage buckets, the `allowed_email_domains` seed, the push settings, the realtime
publication, or whether any edge function is deployed. Passing it means auth and feeds
will work. It does not mean the app works.

Then run the `validate constraint` blocks listed at the top of `0032` and `0034`. They
were added `NOT VALID` so they'd bind new rows without scanning existing ones; until you
validate, old out-of-bounds rows stay.

**Two statements need elevated ownership and can fail quietly on some projects:**
`alter publication supabase_realtime add table …` (0007 / 0018 / 0028) and
`create policy … on storage.objects` (0010 / 0017 / 0037). On Supabase these normally
succeed as `postgres`, but verify rather than assume — if the publication one didn't
take, feeds never update live; if the storage one didn't, image upload 403s.

```sql
-- expect: feed_events, messages, conversation_members
select tablename from pg_publication_tables where pubname = 'supabase_realtime';

-- expect: avatars, message-images (both public, with size + mime limits from 0031)
select id, public, file_size_limit, allowed_mime_types from storage.buckets;

-- expect: one row, 'nd.edu'
select * from public.allowed_email_domains;
```

If `storage.buckets` is empty, 0031's `update … where id = 'message-images'` silently
matched zero rows and the limits were never applied.

---

## 2. Deploy the edge functions

**BLOCKER.** Four functions exist and **nothing in the setup path deploys them.** The
instructions live in each function's own README, which the checklist never points at.

```
supabase functions deploy send-message-push
supabase functions deploy send-new-post-push
supabase functions deploy send-new-comment-push
supabase functions deploy delete-account
```

Consequences of skipping:

- `delete-account` undeployed → the Delete-my-account button in Settings fails.
  That is an **App Store 5.1.1(v) rejection**, not just a broken feature.
- the three push functions undeployed → the DB triggers still fire `net.http_post`
  into a 404 and swallow the error by design. No notification, no log, no symptom.

Each function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which the Supabase
runtime injects automatically — no secrets to set by hand.

---

## 3. Wire the push settings

**BLOCKER for notifications.** Every push trigger begins with:

```sql
if v_url is null or v_url = '' then
  return new;   -- "Not configured yet — silently no-op"
end if;
```

That is deliberate (a failed push must never block a chat message), and it means an
unconfigured project looks *exactly* like a working one. These four settings are
documented only in the headers of 0011, 0012 and 0019. Run as `postgres` in the SQL
editor, substituting your project ref and service-role key:

```sql
alter database postgres set app.settings.edge_function_url     = 'https://<ref>.supabase.co/functions/v1/send-message-push';
alter database postgres set app.settings.new_post_push_url     = 'https://<ref>.supabase.co/functions/v1/send-new-post-push';
alter database postgres set app.settings.new_comment_push_url  = 'https://<ref>.supabase.co/functions/v1/send-new-comment-push';
alter database postgres set app.settings.service_role_key      = '<service-role-jwt>';
```

`alter database … set` only takes effect on **new** connections — restart the project
(or wait for the pool to cycle) before testing.

The service-role key is a full-access credential. It lives in the database and is
forwarded by `pg_net` as the bearer token the functions check against. It must never
reach the client bundle, `eas.json`, or a repo secret used by the web build.

Verify: `select name, setting from pg_settings where name like 'app.settings.%';`

---

## 4. Configure real SMTP

**BLOCKER, and the most likely launch-day failure.** Sign-up is gated on email
confirmation. Supabase's built-in email sender is rate-limited to a handful of messages
per hour and is explicitly not intended for production. At move-in, a dorm's worth of
students signing up in one evening will hit that ceiling, and the failure mode is
"confirmation email never arrives" — indistinguishable, to the student, from the app
being broken.

Auth → SMTP Settings → configure a real provider (Resend, Postmark and SendGrid all
have free tiers that comfortably cover a campus launch). Send yourself a test
confirmation from a fresh address before you believe it.

---

## 5. Auth configuration

- Email provider enabled, **Confirm email = ON**.
- **Allowed email domains** → `nd.edu`. This is belt-and-braces: migration 0026 already
  enforces the domain with a trigger on `auth.users` covering both signup *and* email
  change, which is the real gate. Set the dashboard field anyway.
- **URL Configuration** → Site URL and Redirect URLs must include every origin the app
  runs on, or confirmation and password-reset links dead-end:
  - `http://localhost:8081/**` (local dev)
  - `https://tnguye-45.github.io/quad/**` (Pages build — note the `/quad` subpath;
    `lib/auth-context.tsx` derives the redirect from `EXPO_PUBLIC_BASE_URL`)
  - your native deep-link scheme, for device builds

---

## 6. Upgrade off the free tier

Free projects pause after ~7 days of inactivity. `.github/workflows/supabase-keepalive.yml`
pings every 3 days to prevent that, and its own header admits the workaround is
unofficial and unguaranteed. A paused project on launch day is a total outage with no
in-app signal. Upgrade to Pro before you hand the link to anyone.

---

## 7. Client build configuration

- `npm run check-build-env` (also runs automatically on every EAS build) blocks a
  release when `EXPO_PUBLIC_TEST_EMAIL_DOMAINS` is set, when the Supabase keys are
  missing, or when `app.json` has no EAS `projectId`. **Push registration silently
  no-ops without that projectId** — `lib/notifications.ts` logs a warning and returns.
- `.env` currently carries a commented-out `EXPO_PUBLIC_TEST_EMAIL_DOMAINS` line. Leave
  it commented.
- Web deploy needs `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` as repo
  secrets, or the Pages build ships placeholders and every request fails at runtime.

---

## 8. End-to-end smoke test, on a real device

The checklist's smoke test stops at sign-in. These are the paths that depend on the
steps above, and each one is invisible to the existing test:

| Path | Depends on | Failure symptom if skipped |
|---|---|---|
| Sign up → confirm email → sign in | §4 SMTP | email never arrives |
| Post a gig from a second account | §2, §3 | first account gets no push |
| Send a DM | §2, §3 | no push; chat itself still works |
| Attach a photo to a message | §1 storage policies | upload fails |
| Set an avatar | §1 storage policies | upload fails |
| Comment on a gig | §2, §3 | post owner gets no push |
| Settings → Delete my account | §2 | request fails; **App Store blocker** |
| Two devices, same account | — | see "known gaps" below |

Push cannot be tested on web or a simulator — `registerForPushToken` returns early on
both. You need a physical device and a development build.

---

## Known gaps at time of writing

Not blockers, but you should know them before students find them:

- **Anonymous hangouts have no group chat** (migration 0038). Deliberate: the
  membership row named the host that anonymity is supposed to hide. RSVP still works.
- **Pre-0038 conversations tied to anonymous hangouts may still exist** and are a live
  leak. 0038 deliberately does not delete them — the review query is in its header. Run
  it and clean up by hand.
- **There is no "leave a hangout" UI.** The `leave_hangout` RPC exists and is called
  from nowhere.
- **Seed content must set `origin = 'seeded'`** (migration 0020) or the launch metric —
  organic gigs claimed per day — is unmeasurable forever.
- **`SETUP_CHECKLIST.md` step 3 still says "all 10 tables should now report PASS."**
  `verify-supabase` checks 19 tables and views. Stale copy, harmless.

---

## Minimum viable launch

If you do nothing else, do these four, in order:

1. `node supabase/scripts/generate-bundle.mjs`, then apply the bundle (§0, §1)
2. `supabase functions deploy` × 4 (§2)
3. The four `alter database postgres set app.settings.*` statements, then restart (§3)
4. Real SMTP (§4)

Steps 2–4 are each invisible when skipped. That is the whole reason this file exists.
