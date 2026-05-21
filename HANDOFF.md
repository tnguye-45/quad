# Handoff — quad UI/UX redesign (2026-05-21)

Context for the next agent picking this up.

## What just shipped (one commit on `main`)

A Fizz + Instagram-inspired redesign of all four main tabs in the **Notre Dame palette** (warm cream + ND navy + ND gold). The user explicitly rejected the prior all-black monochrome direction and chose ND gold + navy from a 3-option preview.

### Palette (`constants/theme.ts`)
- BG cream `#FBF8F1` · text navy `#0C2340` · accent gold `#C99700` · border sand `#E8DFC9`
- Dark mode: deep navy BG `#0A1A2E` + warmer gold accent `#E0B040`
- New tokens: `textMuted`, `borderStrong`, `surface`, `subtle`, `accent`, `danger`
- **Use gold (`c.accent`) only for active highlights**: upvoted score+arrow, filter underline, story-bubble ring, unread dot. Use navy (`c.tint`) for primary surfaces (CTAs, create button).

### New components
- `components/app-tab-bar.tsx` — custom Instagram-style tab bar. 4 nav icons + prominent center "+" that opens a slide-up Create sheet (Voice / Gig / Hangout). Replaces all three per-screen FABs.
- `components/screen-header.tsx` — shared header used by every tab: small `NamePlaque` + 34px bold title + tiny mono subtitle + right-side icon actions + profile avatar.

### Typography shift (`components/themed-text.tsx`)
- **Default font changed** from monospace → sans-serif (for Instagram readability).
- Use `type="mono"` (or `mono` prop) for tags, timestamps, eyebrow labels, meta lines.
- Title weight bumped to 800.

### Tab redesigns
| Tab | Key pattern |
|---|---|
| `app/(tabs)/index.tsx` (Gigs) | Horizontal story-bar of category bubbles (emoji + gold ring when active). Feed rows: 44px avatar + title + mono meta + hairline payout pill. Map moved to header icon. |
| `app/(tabs)/voices.tsx` | Fizz-style 36px vertical vote rail on the left (up / score / down) — gold highlight when upvoted. Underlined filter tabs with gold underline on active. Card foot row with comments + share + ellipsis. |
| `app/(tabs)/explore.tsx` (Hangouts) | Host avatar + name header, "X going" badge, bold title, icon-prefixed meta (clock + pin), full-width navy filled "I'm in" button. |
| `app/(tabs)/messages.tsx` | Active-now row of 56px avatar bubbles with green presence dot on top. 52px DM list below with mono context line and gold unread dot. |

### Tab layout (`app/(tabs)/_layout.tsx`)
- Uses `tabBar={(p) => <AppTabBar {...p} />}` to swap in the custom bar.
- `Map` is registered but hidden with `href: null` — reached via the map icon in the Gigs header.

### Icon mapping additions (`components/ui/icon-symbol.tsx`)
Added 20+ icons: outlined variants (`briefcase`, `person.3`, `text.bubble`, etc.), `heart`, `bookmark`, `magnifyingglass`, `bell`, `flame`, `sparkles`, `ellipsis`, `arrow.up/down`, `square.and.arrow.up`, `xmark`, `chevron.left`, `plus.square`, `plus.circle.fill`.

## Verified working
- Web bundle clean (last build ~250ms).
- iOS bundle clean (user connected from Expo Go on iPhone via `exp://192.168.1.166:8081`).

## Screens NOT yet touched by this redesign
Still use the older monospace/editorial style. When you visit any of them, port to the new palette + `ScreenHeader` + sans-serif type:
- `app/welcome.tsx`
- `app/(auth)/sign-up.tsx`, `sign-in.tsx`, `check-email.tsx`, `forgot-password.tsx`
- `app/modal.tsx` (profile / Your posts history)
- `app/profile-setup.tsx`
- `app/post-gig.tsx`, `app/start-hangout.tsx`, `app/post-voice.tsx`
- `app/gig/[id].tsx`, `app/chat/[id].tsx`
- `app/(tabs)/map.tsx` (header overlay only — map itself is HTML)

## Known issues carried forward
- `voteVoiceImpl` in `lib/posts-store.tsx`: rapid up→down taps fire independent delete + upsert calls that can race server-side. Optimistic UI is correct; fix would be a single RPC.
- `RealChat` in `app/chat/[id].tsx` lacks per-message timestamps (MockChat has them). Needs a clustering policy (e.g. show time when gap > 5min).
- Native (iOS/Android) map view shows a "coming soon" placeholder — only web has the Leaflet map.

## To run
- Web: `npm run web` → http://localhost:8081
- iPhone via Expo Go: `npx expo start` → scan QR or enter `exp://<LAN-IP>:8081` (LAN IP was `192.168.1.166` last session)

## Dev shortcut
`enableDevAuth` in `lib/auth-context.tsx` injects a fake session for testing without going through `@nd.edu` sign-up.
