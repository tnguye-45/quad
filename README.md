# quad

A campus-only mobile app where students connect to find **work gigs** (yard help, tutoring, moving, rideshares to the airport) and **hangout groups** (study sessions, pickup basketball, dining hall meetups).

Summer 2026 build by [@tnguye-45](https://github.com/tnguye-45).

## Status

Pre-MVP. Scaffold only — no features built yet.

## The wedge

Generic gig and social apps already exist. The bet here is that being **campus-scoped** unlocks things they can't:

- `.edu` email verification → trust by default
- Walking-distance map view → no rideshare needed
- Class-schedule aware → "free between 2pm and 4pm" filtering
- Verified majors / dorms → richer matching

## Roadmap

- [ ] Phase 1 — **gigs only**, single campus, manual seeding
- [ ] Phase 2 — hangout groups
- [ ] Phase 3 — second campus

The two modes ship in sequence, not in parallel — gigs first because the value is concrete and bootstrapping a two-sided social marketplace from zero is harder than bootstrapping a transactional one.

## Stack

- **App:** Expo (React Native) + expo-router — runs on iOS, Android, and web from one codebase
- **Backend:** Supabase — Postgres, auth (with `.edu` email verification), realtime, storage
- **Lang:** TypeScript

## Getting started

```bash
npm install
cp .env.example .env       # fill in your Supabase project URL + anon key
npm run start              # opens Expo dev tools
```

Then scan the QR code with the Expo Go app on your phone, or:

```bash
npm run android   # Android emulator
npm run ios       # iOS simulator (macOS only)
npm run web       # browser
```

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier works for dev)
2. From **Project Settings → API**, copy the project URL and anon public key into `.env`
3. (Later) Configure the `.edu` email allowlist under **Authentication → Email Auth**

## Project layout

```
app/              expo-router file-based routes
  (tabs)/         tab navigator
  _layout.tsx     root layout
components/       shared UI
hooks/            shared hooks
lib/
  supabase.ts     Supabase client
constants/        theme, colors
```

## License

Not yet decided. All rights reserved for now.
