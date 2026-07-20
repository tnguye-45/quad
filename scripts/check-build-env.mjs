#!/usr/bin/env node
// Release-readiness gate. Runs automatically on EAS builds (via the
// `eas-build-pre-install` npm hook) and locally as `npm run check-build-env`.
//
// Fails when a distributed build would ship broken or unsafe:
//  1. EXPO_PUBLIC_TEST_EMAIL_DOMAINS present — the @nd.edu signup gate would
//     be bypassed in the shipped client.
//  2. Supabase URL/anon key unavailable — lib/supabase.ts throws on import,
//     so the binary crashes on first open.
//  3. No EAS projectId in app.json — push registration silently no-ops.

import { existsSync, readFileSync } from 'node:fs';

const errors = [];

// ── 1. Dev-only email-domain bypass ─────────────────────────────────────────
if (process.env.EXPO_PUBLIC_TEST_EMAIL_DOMAINS) {
  errors.push(
    'EXPO_PUBLIC_TEST_EMAIL_DOMAINS is set in the environment. ' +
      'This bypasses the @nd.edu signup gate — unset it before building.',
  );
}
if (
  existsSync('.env') &&
  /^\s*EXPO_PUBLIC_TEST_EMAIL_DOMAINS\s*=\s*\S/m.test(readFileSync('.env', 'utf8'))
) {
  errors.push(
    '.env contains an active EXPO_PUBLIC_TEST_EMAIL_DOMAINS line. ' +
      'This bypasses the @nd.edu signup gate — remove or comment it out.',
  );
}

// ── 2. Supabase credentials the client needs at import time ─────────────────
// On EAS these come from the build profile's `env` block in eas.json (the
// gitignored .env is never uploaded). Locally, .env on disk counts.
const envFile = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
for (const key of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) {
  const inEnv = !!process.env[key];
  const inFile = new RegExp(`^\\s*${key}\\s*=\\s*\\S`, 'm').test(envFile);
  if (!inEnv && !inFile) {
    errors.push(
      `${key} is not set. A production binary throws on import without it ` +
        '(crash on first open). On EAS it must come from the build profile env in eas.json.',
    );
  }
}

// ── 3. EAS projectId for push notifications ─────────────────────────────────
try {
  const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
  if (!appJson?.expo?.extra?.eas?.projectId) {
    errors.push(
      'app.json has no expo.extra.eas.projectId — push notifications will never ' +
        'register. Run `npx eas-cli init` (requires an Expo account login) to wire it.',
    );
  }
} catch (e) {
  errors.push(`Could not read app.json: ${e.message}`);
}

if (errors.length > 0) {
  console.error('\n✗ Build blocked by check-build-env:\n');
  for (const err of errors) console.error(`  • ${err}\n`);
  process.exit(1);
}
console.log('✓ check-build-env: release configuration looks good.');
