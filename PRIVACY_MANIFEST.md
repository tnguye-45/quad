# Privacy manifest audit

Source of truth for the `ios.privacyManifests` block in `app.json`. Every collected data type and every "required reason API" we declare maps to a concrete code path in the app. This file is the paper trail Apple expects when an App Store review questions why a given category is declared (or, more dangerously, why it isn't).

Last reviewed: 2026-05-25 — pre-1.0 TestFlight.

## What we collect

All of these are **linked to the user's identity** (their `auth.users.id`) and **not used for tracking**. The single declared purpose for every category is `AppFunctionality` — there is no analytics SDK, no advertising SDK, no third-party identifier sharing.

| Data type | Where it's collected | Where it lives |
| --- | --- | --- |
| `EmailAddress` | Sign-up form (`@nd.edu` gate). | `auth.users.email` (Supabase Auth). |
| `Name` | Profile setup (`display_name`). | `public.profiles.display_name`. |
| `UserID` | Issued by Supabase Auth on sign-up. | `auth.users.id`, referenced by every public table. |
| `UserContent` | Post composers — gigs, hangouts, voices, bios, profile links. | `public.gigs`, `public.hangouts`, `public.voices`, `public.profiles.bio`/`links`. |
| `Messages` | Chat composer (`app/chat/[id].tsx`). | `public.messages`. |
| `PhotosorVideos` | Avatar picker (`expo-image-picker`) on profile setup. | `avatars/{uid}/avatar.<ext>` (Supabase Storage). |
| `DeviceID` | Expo push token, registered after notification permission is granted. | `public.user_push_tokens.expo_push_token`. Tokens uniquely identify a device install. |
| `CoarseLocation` | Optional `lat`/`lon` on a gig or hangout post (user-entered location-label is the primary input; coords are a future-facing nice-to-have). | `public.gigs.lat/lon`, `public.hangouts.lat/lon`. |

### What we do NOT collect

- **Precise location.** We never call `Location.getCurrentPositionAsync` or anything similar. The map component (`components/native-map.tsx`) renders the campus region from hard-coded coordinates.
- **Audio / video / health / financial / sensitive data.** None of these are touched.
- **Contacts, calendar, browsing history.** None.
- **Tracking across apps or websites.** `NSPrivacyTracking` is `false` and `NSPrivacyTrackingDomains` is empty.

## Required-reason API declarations

Each entry in `NSPrivacyAccessedAPITypes` maps a category we touch (directly or via a dependency) to the Apple-published reason code.

| Category | Reason | Why we use it |
| --- | --- | --- |
| `UserDefaults` | `CA92.1` — "access info from same app" | `expo-secure-store` / `AsyncStorage` for the Supabase session and Expo push token. Same-app reads only; never shared with another bundle. |
| `FileTimestamp` | `C617.1` — "display to user, with previous interaction" | React Native's filesystem (notably the asset bundle loader and `expo-image` cache) reads timestamps for files we already created. No timestamps leave the device. |
| `SystemBootTime` | `35F9.1` — "measure elapsed time" | Used by `react-native-reanimated` and `expo-notifications` for monotonic clocks. |
| `DiskSpace` | `E174.1` — "user-initiated, check space before write" | `expo-image-picker` checks free space before saving the avatar pick. |

## Third-party SDKs and their privacy manifests

We bundle Apple-required privacy manifests from the following SDKs *automatically* via Expo's prebuild — the entries above cover **our** app code. Each of these ships its own `PrivacyInfo.xcprivacy` inside its xcframework, and Expo merges them at build time:

- `expo` (and every `expo-*` package — `expo-image-picker`, `expo-notifications`, `expo-haptics`, `expo-image`, `expo-secure-store`, …)
- `@supabase/supabase-js` (HTTP + `AsyncStorage` only — does not collect anything itself)
- `@react-native-async-storage/async-storage`
- `react-native-maps`
- `react-native-reanimated`, `react-native-gesture-handler`, `react-native-screens`, `react-native-safe-area-context`

If the App Store rejects with **ITMS-91056** (missing required-reason API), it usually means a newly added native dep ships an API category we haven't declared. Re-run the audit by:

1. Building the iOS archive (`eas build -p ios`).
2. Reading the warnings emitted by Xcode's `PrivacyManifestValidator` step — they name the exact category that's undeclared.
3. Adding the corresponding `NSPrivacyAccessedAPIType` + reason code here and to `app.json`.

## Process

Whenever a new feature lands that touches a new data category:

1. Add the category to `NSPrivacyCollectedDataTypes` in `app.json`.
2. Add the row above with where it's collected and where it's stored.
3. Update the data-collection section of the privacy policy (`legal/privacy.md`).
4. If the new feature ships before the next App Store submission, also update the App Store "Privacy" questionnaire in App Store Connect to match.
