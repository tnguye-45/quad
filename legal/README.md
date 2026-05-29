# legal/

Draft Privacy Policy (`privacy.md`) and Terms of Service (`terms.md`) for quad. Both are first drafts grounded in the actual data flows in the Supabase migrations and client code; both carry a "review by counsel recommended before launch" header and outstanding `TODO` placeholders (contact email, governing law / venue) that the project owner needs to fill in before publication.

## In-app surfacing

Wired into the app via `app/legal.tsx`, a modal screen that links out to the GitHub-rendered versions of `privacy.md` and `terms.md`:

- **Sign-up screen** (`app/(auth)/sign-up.tsx`) — footer line "By creating an account, you agree to our Terms and Privacy Policy" with both phrases linking to `/legal`.
- **Profile modal** (`app/modal.tsx`) — "Legal" section with a "Privacy & terms" row that pushes `/legal`.

The current link targets are GitHub blob URLs:
- https://github.com/tnguye-45/quad/blob/main/legal/privacy.md
- https://github.com/tnguye-45/quad/blob/main/legal/terms.md

These also serve as the App Store / Play Store "Privacy policy URL" listing field for v1.

## Before public launch

- Fill in the `TODO` placeholders (contact email in `privacy.md` §11; governing law and venue in `terms.md` §11).
- Have counsel review both documents.
- Optional: replace GitHub blob URLs with a cleaner hosted version (e.g., `legal.quad.app` or `tnguye-45.github.io/quad/legal/privacy`) and update `PRIVACY_URL` / `TERMS_URL` in `app/legal.tsx`.
