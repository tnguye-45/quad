# Deploying quad to GitHub Pages

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the
Expo web bundle and publishes it to GitHub Pages.

Final URL: **https://tnguye-45.github.io/quad/**

## First-time setup (do this once)

### 1. Enable Pages

1. Push to GitHub: `git push origin main`
2. In the repo on GitHub: **Settings → Pages**
3. Under **Build and deployment → Source**, pick **GitHub Actions**

That's it for the source side. The workflow handles everything else.

### 2. (Optional) Supabase live mode

Without secrets, the deployed site runs in **demo mode** — every screen
renders with mock data and sign-up/posting fail with a "not configured"
notice. To wire it to your real Supabase project:

1. **Settings → Secrets and variables → Actions → New repository secret**
2. Add two secrets:
   - `EXPO_PUBLIC_SUPABASE_URL` = your project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = the anon public key
3. Re-run the latest workflow (Actions → Deploy → Re-run all jobs) so the
   new values are baked into the bundle.

Anon keys are designed to be public — they're embedded in every Supabase
client by design and RLS does the actual access control. It's safe to put
them in a public-repo workflow.

### 3. Supabase redirect URL (only if using auth)

In your Supabase dashboard: **Authentication → URL Configuration**, add
`https://tnguye-45.github.io/quad/` to **Site URL** and to the **Redirect
URLs** allowlist. Otherwise email-confirmation links won't bounce back to
the live site.

## What gets deployed

The workflow runs `npx expo export --platform web` with:

- `EXPO_PUBLIC_BASE_URL=/quad` so all asset URLs and route hrefs are
  prefixed for serving under `/quad/`
- A `.nojekyll` file added to `dist/` so Pages doesn't strip files starting
  with `_` (Expo emits several)

## Caveats

- **Static export limitations.** Expo's static web export pre-renders each
  route to its own HTML file. Direct deep links work, but anything that
  needs server-side rendering (none of which we use right now) won't.
- **Native modules are stubbed on web.** `react-native-maps` has a web stub
  (`components/native-map.web.tsx` → null); the web map uses the existing
  Leaflet iframe instead.
- **Push notifications need a real device.** The push-token registration
  path is a no-op on web (it returns early before touching Expo's push
  service).

## Local dev still works as-is

`npm run web` continues to serve from `/` because `EXPO_PUBLIC_BASE_URL` is
only set in the workflow, not in your local environment.
