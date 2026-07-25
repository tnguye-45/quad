#!/usr/bin/env node
// Smoke-test the Supabase backend: reachable, migrations applied, RLS on.
// Usage:  node scripts/verify-supabase.mjs
//
// Reads EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY from .env.
// Exits 0 on full pass, 1 on any failure.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env');

function loadEnv(path) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = { ...loadEnv(envPath), ...process.env };
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const results = [];
function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
  console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

// A network-level failure (host unreachable, DNS, TLS, offline) never reached
// the server, so it says nothing about whether a table exists or RLS is on.
// Treating it as "exists / RLS enforced" hides an offline run behind green
// PASSes — detect it explicitly and fail loudly instead.
const isNetworkError = (msg = '') =>
  /fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|und_err/i.test(
    msg,
  );

console.log('\nquad — Supabase backend verification\n');

if (!url) {
  fail('env EXPO_PUBLIC_SUPABASE_URL set', 'missing from .env');
  process.exit(1);
}
pass('env EXPO_PUBLIC_SUPABASE_URL set', url);

if (!key || key === 'PASTE_YOUR_ANON_KEY_HERE' || key === 'your-anon-key-here' || key.length < 40) {
  fail(
    'env EXPO_PUBLIC_SUPABASE_ANON_KEY set',
    'still a placeholder — paste your real anon key from Project Settings → API',
  );
  process.exit(1);
}
pass('env EXPO_PUBLIC_SUPABASE_ANON_KEY set', `${key.slice(0, 12)}…`);

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Auth settings endpoint — public, doesn't need RLS context.
try {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  if (!res.ok) {
    fail('auth /settings reachable', `HTTP ${res.status}`);
  } else {
    const body = await res.json();
    pass('auth /settings reachable', `email=${body?.external?.email ? 'on' : 'off'}`);
  }
} catch (e) {
  fail('auth /settings reachable', e.message);
}

// Each table should exist and be queryable (anon should be able to issue SELECT
// against the table even if RLS filters all rows out — a non-existent table
// returns a different error than RLS does).
//
// The probe is `select('*').limit(0)` — NOT `select('*', { head: true })`. A HEAD
// response carries no body, so PostgREST's error JSON never arrives and
// supabase-js hands back `error: null` for a table that does not exist. This
// script reported "✓ All 23 checks passed. Supabase backend is live." against a
// database missing feed_events and all four 0027 feed views — i.e. against a
// database where every feed in the app is empty. `limit(0)` transfers no rows
// either, but a GET returns the body, so PGRST205 / 42P01 come through.
// checkProbeIsSound() below fails the run if that ever regresses.
const expectedTables = [
  'profiles',
  'gigs',
  'hangouts',
  'hangout_attendees',
  'conversations',
  'conversation_members',
  'messages',
  'reports',
  'voices',
  'voice_votes',
  // 0009–0028 additions — without these the script used to report PASS
  // against a DB that the client can't actually run on.
  'user_push_tokens',
  'user_blocks',
  'notification_prefs',
  'comments',
  'feed_events',
  // 0027 feed views — the ONLY read path the client uses for content. A DB
  // missing these renders every feed empty even though the tables exist.
  'gigs_feed',
  'hangouts_feed',
  'voices_feed',
  'comments_feed',
];

// 42P01 = undefined_table, PGRST205 = schema cache miss. Either means the
// migration that creates this relation has not been applied.
const isMissingRelation = (error) =>
  error?.code === 'PGRST205' ||
  error?.code === '42P01' ||
  /(does not exist|PGRST205|schema cache|Could not find the table)/i.test(error?.message ?? '');

const probeRelation = (name) => supabase.from(name).select('*').limit(0);

// Self-check: a table that cannot exist must come back missing. If this ever
// passes, the probe has stopped distinguishing present from absent and every
// PASS below is meaningless — so refuse to report anything rather than print a
// screen of green. This is the exact failure the head:true probe had.
const { error: sentinelError } = await probeRelation('quad_verify_sentinel_does_not_exist');
if (isNetworkError(sentinelError?.message ?? '')) {
  fail('probe is sound', `unreachable (${sentinelError.message}) — check network/URL`);
} else if (!isMissingRelation(sentinelError)) {
  fail(
    'probe is sound',
    'a nonexistent table reported as PRESENT — the existence check is broken, ' +
      'every table result below would be a false PASS',
  );
  console.log('');
  console.log('✗ Aborting: cannot verify anything with a probe that detects nothing.\n');
  process.exit(1);
} else {
  pass('probe is sound', 'a nonexistent table is correctly reported missing');
}

for (const table of expectedTables) {
  const { error } = await probeRelation(table);
  if (error) {
    if (isNetworkError(error.message)) {
      // Never reached the server — can't conclude anything about the table.
      fail(`table public.${table} exists`, `unreachable (${error.message}) — check network/URL`);
    } else if (isMissingRelation(error)) {
      fail(`table public.${table} exists`, 'migration not applied — see LAUNCH_RUNBOOK.md §1');
    } else {
      // Other errors (e.g. permission denied) still mean the table exists.
      pass(`table public.${table} exists`, 'RLS enforced');
    }
  } else {
    pass(`table public.${table} exists`);
  }
}

// RLS smoke check: anon trying to INSERT into profiles should be rejected.
const { error: insertError } = await supabase
  .from('profiles')
  .insert({ id: '00000000-0000-4000-8000-00000000abcd', display_name: 'verify-script' });
if (insertError) {
  if (isNetworkError(insertError.message)) {
    fail('RLS blocks anon inserts on profiles', `unreachable (${insertError.message})`);
  } else {
    pass('RLS blocks anon inserts on profiles', insertError.message.split('\n')[0]);
  }
} else {
  fail('RLS blocks anon inserts on profiles', 'insert SUCCEEDED — RLS is NOT enforced!');
}

const failures = results.filter((r) => !r.ok);
console.log('');
if (failures.length === 0) {
  console.log(`✓ All ${results.length} checks passed. Supabase backend is live.\n`);
  process.exit(0);
} else {
  console.log(`✗ ${failures.length} of ${results.length} checks failed.\n`);
  for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`);
  console.log('');
  process.exit(1);
}
