# quad

A campus-only mobile app for the University of Notre Dame. Students connect to find **gigs** (paid tasks: tutoring, moving, rideshares), **hangouts** (study sessions, pickup basketball, dining hall meetups), and **voices** (an anonymous opinion feed). All gated by `@nd.edu` email.

Summer 2026 build by [@tnguye-45](https://github.com/tnguye-45).

## Status

**MVP — backend-wired and runnable end-to-end.** Auth, profile, posts (gigs, hangouts, voices), and chat threads all hit Supabase. The web preview runs in any browser; the dev shortcut on the welcome screen swaps the backend for in-memory seed data so you can demo the UI without configuring Supabase.

## The wedge

Generic gig and social apps already exist. The bet here is that being **campus-scoped** unlocks things they can't:

- `@nd.edu` email verification → trust by default
- Walking-distance map view → no rideshare needed
- Anonymous opinion feed alongside named posts → say things you can't on LinkedIn
- Verified majors / dorms → richer matching

## What's wired

| Feature | Backend | Notes |
|---|---|---|
| Sign-up / sign-in / password reset | Supabase auth | `@nd.edu` enforced client + server |
| Profile (name, year, major, dorm, bio, links) | `public.profiles` | Auto-created on sign-up by trigger |
| Gigs feed + post | `public.gigs` | Realtime inserts; anonymous flag respected on render |
| Hangouts feed + RSVP | `public.hangouts` + `hangout_attendees` | Host auto-RSVP'd on create |
| Voices feed + vote | `public.voices` + `public.voice_votes` | Score recomputed by trigger; realtime score updates |
| Anonymous posting toggle | `anonymous` column on each post type | Voices default anonymous; gigs/hangouts default named |
| "Your posts" history | Filter by `ownerId` | Anonymous posts visible to author only |
| Gig detail + "Message poster" | `public.conversations` + `conversation_members` | Finds existing thread for the gig or creates one |
| Chat threads | `public.messages` + realtime | Sends INSERT; subscribed channel hydrates new messages live |
| Map | Static iframe (Leaflet, OSM tiles) | Pins pulled from live store with a campus gazetteer; web-only |

**Dev mode** (welcome screen → "Dev: enter as admin") falls back to in-memory seeds + the mock six-thread inbox. Useful for UI demos without a real Supabase project.

## Getting started

```bash
npm install
cp .env.example .env       # fill in your Supabase project URL + anon key
npm run web                # opens http://localhost:8081 in the browser
```

For native: `npm run start` and scan the QR code with **Expo Go**.

### Skip auth for a quick tour

On the welcome screen, tap **"Dev: enter as admin (skip auth)"** to bypass Supabase. You'll get a fake session and a pre-filled profile — useful for clicking through the UI without a real account.

### Supabase setup

See [supabase/README.md](supabase/README.md) for the full one-time setup (~10 minutes). Short version:

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migrations in `supabase/migrations/` in order via the SQL Editor — or paste the generated `_bundle.sql` for a fresh project
3. Configure **Authentication → Allowed email domains** to include `nd.edu`
4. Do **NOT** hand-edit the Realtime publication. The migrations manage it: content tables (`gigs`, `hangouts`, `voices`, `comments`) were deliberately **removed** from `supabase_realtime` (their full-row payloads leaked anonymous author ids — see migration 0028); the client subscribes to the `feed_events` signal table plus `messages`/`conversation_members`, which the migrations publish. Re-adding the content tables reopens the leak.
5. Copy your project URL + anon key into `.env`

## Roadmap

- [x] Phase 1 — auth, profiles, anonymous posting, per-user history
- [x] Phase 2 — gigs / hangouts / voices on Supabase; real chat threads with realtime
- [ ] Phase 3 — voice comments, avatar upload (Supabase storage), push notifications, native map (replace Leaflet iframe), second campus

## Project layout

```
app/
  (auth)/           sign-in, sign-up, forgot-password, check-email
  (tabs)/           gigs (index), map, voices, explore (hangouts), messages
  chat/[id].tsx     thread view (real backend; dev mode uses the in-memory store)
  gig/[id].tsx      gig detail + message poster
  post-gig.tsx      modal — also exports the shared PostAsToggle
  post-voice.tsx    modal — voices are anonymous by default
  start-hangout.tsx modal
  profile-setup.tsx first-run + edit profile
  modal.tsx         the "Me" sheet (profile + Your posts history)
  splash.tsx, welcome.tsx
components/
  logo.tsx          Logo, NamePlaque (logo + "quad" wordmark)
  themed-text.tsx, themed-view.tsx, ui/icon-symbol.tsx, …
lib/
  supabase.ts       Supabase client (SSR-safe storage adapter)
  auth-context.tsx  session, profile, sign-in/up, dev shortcut
  posts-store.tsx   gigs/hangouts/voices via Supabase + realtime; falls back to seeds in dev mode
  messaging.ts      conversations + threads via Supabase; useConversations / useThread hooks; findOrCreateGigConversation helper
supabase/
  migrations/       0001–0037 (schema, RLS, realtime, security hardening); _bundle.sql is generated — never hand-edit
  CLIENT_CONTRACT.md what the client may read/subscribe to after the security pass — read before touching queries
  README.md         one-time Supabase project setup
```

## License

Not yet decided. All rights reserved for now.
