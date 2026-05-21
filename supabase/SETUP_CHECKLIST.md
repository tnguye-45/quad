# Supabase setup — finish-up checklist

The code side is done. These four steps are the only remaining work, and they all
require a logged-in Supabase dashboard so they can't be automated. Each link
goes straight to the right page in your `anoosbiuaggassednkzt` project.

Project ref: `anoosbiuaggassednkzt`
Project URL (already in `.env`): `https://anoosbiuaggassednkzt.supabase.co`

---

## 1. Copy the anon public key

Open: <https://supabase.com/dashboard/project/anoosbiuaggassednkzt/settings/api>

→ scroll to **Project API keys** → click the **anon public** row → **Copy**.
It's a long JWT that starts with `eyJ`.

## 2. Paste it into `.env`

From the repo root:

```
npm run set-anon-key "eyJ...paste-the-whole-key-here..."
```

That script writes the key into `.env` and immediately runs `verify-supabase`,
which tells you which of the next steps (if any) you still need to do.

If you'd rather edit by hand: open `.env`, replace `PASTE_YOUR_ANON_KEY_HERE`
with the key, save. Then run `npm run verify-supabase` to confirm.

## 3. Run the migrations

Only needed if step 2's verify reports tables missing.

Open: <https://supabase.com/dashboard/project/anoosbiuaggassednkzt/sql/new>

Open `supabase/migrations/_bundle.sql` in your editor, **select all → copy**,
paste into the SQL Editor, click **Run**. It bundles all 7 migrations in order
and should finish with "Success. No rows returned."

Re-run `npm run verify-supabase` — all 10 tables should now report PASS.

## 4. Configure auth

Open: <https://supabase.com/dashboard/project/anoosbiuaggassednkzt/auth/providers>

- Confirm **Email** provider is enabled
- **Confirm email** = ON (default)
- Scroll to **Allowed email domains** → add `nd.edu` → Save

Then open: <https://supabase.com/dashboard/project/anoosbiuaggassednkzt/auth/url-configuration>

- **Site URL**: `http://localhost:8081` (for local dev). Add your prod URL later.
- **Redirect URLs**: add `http://localhost:8081/**`

## 5. Smoke test in the app

```
npm run start
```

In the browser/simulator:

1. Splash → Welcome → **Sign up**
2. Use your real `nd.edu` email + a password
3. You should land on a "Check your email" screen
4. Click the link in the email, come back, **Sign in**
5. Fill out profile setup → land on Gigs tab
6. Tap **Me** (top-right) → see profile → **Sign out** → sign back in → profile persists

If that works, the backend is live. ✓

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `verify-supabase` fails on "env EXPO_PUBLIC_SUPABASE_ANON_KEY set" | Anon key in `.env` is still the placeholder. Redo step 2. |
| `verify-supabase` fails on a table | That migration didn't run. Redo step 3 — `_bundle.sql` is idempotent on a fresh schema. If you ran some migrations partially, see "Resetting" in `supabase/README.md`. |
| Sign-up rejected even with `@nd.edu` | Confirm `nd.edu` is in **Allowed email domains** (step 4). |
| App throws "Missing EXPO_PUBLIC_SUPABASE_..." | `.env` not loaded — restart `npm run start` after editing `.env`. |
| App throws "anon key is still a placeholder" | Same — `.env` wasn't updated or dev server wasn't restarted. |
