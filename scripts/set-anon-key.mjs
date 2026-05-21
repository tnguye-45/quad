#!/usr/bin/env node
// One-shot: paste the Supabase anon key into .env and run the verify script.
// Usage:  node scripts/set-anon-key.mjs <anon-key>

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env');

const key = process.argv[2];
if (!key) {
  console.error('Usage: node scripts/set-anon-key.mjs <anon-key>');
  console.error('Get the key from Supabase Dashboard → Project Settings → API → "anon public".');
  process.exit(2);
}
if (key.length < 40 || !key.startsWith('eyJ')) {
  console.error(`That doesn't look like a Supabase anon key.`);
  console.error(`Expected a JWT starting with "eyJ" (got "${key.slice(0, 12)}…", len ${key.length}).`);
  process.exit(2);
}

let env = readFileSync(envPath, 'utf8');
const re = /^EXPO_PUBLIC_SUPABASE_ANON_KEY=.*$/m;
if (re.test(env)) {
  env = env.replace(re, `EXPO_PUBLIC_SUPABASE_ANON_KEY=${key}`);
} else {
  if (!env.endsWith('\n')) env += '\n';
  env += `EXPO_PUBLIC_SUPABASE_ANON_KEY=${key}\n`;
}
writeFileSync(envPath, env);
console.log(`✓ Wrote anon key to ${envPath}\n`);

console.log('Running verify-supabase…\n');
const r = spawnSync(process.execPath, [resolve(here, 'verify-supabase.mjs')], {
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
