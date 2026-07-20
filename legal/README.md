# legal/

Legal documents for quad.

## Canonical documents

- **`tos.md`** — Terms of Service, effective July 15, 2026. Real contact email (quadcampusapp@gmail.com) and terms; this is the document users agree to at sign-up.
- **`privacy.md`** — Privacy Policy, grounded in the actual data flows in the Supabase migrations and client code.

## Orphaned draft

- **`terms.md`** — an earlier, longer ToS draft (last updated 2026-05-25) that still contains unfilled `TODO` placeholders (governing law / venue). It is **not** linked from the app and should not be published as-is. Either fold anything worth keeping into `tos.md` and delete it, or have counsel finish it and swap it in deliberately.

## In-app surfacing

Wired into the app via `app/legal.tsx`, a modal screen that links out to the GitHub-rendered versions of the canonical docs:

- **Sign-up screen** (`app/(auth)/sign-up.tsx`) — footer line "By creating an account, you agree to our Terms and Privacy Policy" with both phrases linking to `/legal`.
- **Profile modal** (`app/modal.tsx`) — "Legal" section with a "Privacy & terms" row that pushes `/legal`.

The current link targets are GitHub blob URLs:

- https://github.com/tnguye-45/quad/blob/main/legal/privacy.md
- https://github.com/tnguye-45/quad/blob/main/legal/tos.md

These also serve as the App Store / Play Store "Privacy policy URL" listing field for v1.

## Before public launch

- Have counsel review both canonical documents.
- Resolve the orphaned `terms.md` draft (fold in or delete).
- Optional: replace GitHub blob URLs with a cleaner hosted version (e.g., `legal.quad.app` or `tnguye-45.github.io/quad/legal/privacy`) and update `PRIVACY_URL` / `TERMS_URL` in `app/legal.tsx`.
