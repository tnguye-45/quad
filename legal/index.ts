// Inline copies of the legal markdown so they ship in the JS bundle without
// configuring a Metro text-loader. `legal/privacy.md` and `legal/tos.md` are
// the documents of record for legal review; this file is the runtime mirror
// and must never say something they don't.
//
// That relationship is enforced, not trusted: `scripts/check-legal-sync.mjs`
// runs in both CI workflows and fails the build if either constant drifts
// from its .md. Edit the .md first, then paste it here — the one difference
// the check tolerates is inline-code backticks, which app/legal/_renderer.tsx
// has no syntax for and which would otherwise render as literal characters.
//
// If a future change makes the duplication painful, swap to a Metro asset
// transformer (e.g. metro-transform-worker overrides for .md) and read the
// .md files at runtime instead. For pre-1.0 it's not worth the build-config
// churn.

export const PRIVACY_MARKDOWN = `# Privacy Policy

**Effective date:** July 15, 2026.

quad is a Notre Dame student community app. This document describes what we collect and how we use it.

## What we collect

- **Email address.** You sign up with your @nd.edu email so we can verify you're a current student. We never email you marketing.
- **Profile content.** Your display name, year, major, dorm, bio, avatar, and any profile links you choose to share with the campus directory.
- **Posts.** Gigs you post, hangouts you host, voices (opinion posts) you submit. Voices are anonymous to other users by default.
- **Messages.** The bodies of messages you send to other students.
- **Push token.** When you opt into notifications, we store a device-specific push token so we can deliver them.
- **Location.** Posts carry a free-text location label you type yourself, like "Hesburgh Library". We do not collect device location — coarse or precise — and we do not track where you are.

## What we do NOT collect

- We do not use any third-party analytics or ad SDKs.
- We do not track you across other apps or websites.
- We do not collect contacts, calendar data, health data, or financial information.

## Who can see your data

- Other authenticated students can see your profile (display name, year, major, dorm, bio, links, avatar) and any non-anonymous posts you make.
- Voice posts marked anonymous show no author to other students.
- Messages are only visible to participants in the conversation.

## Deletion

You can delete your account at any time from **Account settings → Delete my account**. This removes your profile, posts, hangouts, voices, push tokens, and messages you sent. Messages others sent to you remain in those conversations for the other party's history.

## Changes

If we change this policy, we'll update the effective date above and notify you in-app before the changes take effect.

## Contact

For privacy questions or data-export requests, email the team at quadcampusapp@gmail.com.
`;

export const TOS_MARKDOWN = `# Terms of Service

**Effective date:** July 15, 2026.

By signing up for quad you agree to the following.

## Who can use quad

quad is for current University of Notre Dame students with an active @nd.edu email. We may suspend accounts that no longer meet this criterion.

## Acceptable use

You agree not to post or send:

- Harassment, hate speech, or threats.
- Sexual or sexually-suggestive content.
- Content that violates Notre Dame's du Lac code of conduct.
- Spam, scams, or commercial solicitation outside of legitimate student gigs.
- Content that infringes someone else's copyright, trademark, or other IP.

We use a combination of user reports (the "..." menu on any post or chat thread) and our own review to enforce these rules. We may remove content or accounts that violate them, with or without prior notice.

## Your content

You keep ownership of the gigs, hangouts, voices, and messages you post. You grant quad a limited license to host and display that content to other students within the app.

## No warranty

quad is provided "as is." We don't guarantee gigs will be filled, hangouts will happen, or that students you meet through the app are who they say they are. Use common sense, meet in public places, and trust your instincts.

## Liability

To the extent permitted by law, quad is not liable for any damages arising from your use of the app, including disputes between you and another student.

## Governing law

These terms are governed by the laws of the State of Indiana, without regard to its conflict-of-law rules. Any dispute arising from these terms or your use of quad will be resolved in the state or federal courts located in St. Joseph County, Indiana.

## Changes

We may update these terms; if we do, we'll notify you in-app before the changes take effect.

## Contact

For questions, email the team at quadcampusapp@gmail.com.
`;
