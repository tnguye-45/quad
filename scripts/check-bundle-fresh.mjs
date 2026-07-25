#!/usr/bin/env node
// quad — fail CI when supabase/migrations/_bundle.sql is out of date.
//
// The bundle is the documented install path: supabase/README.md and
// SETUP_CHECKLIST.md both say "paste _bundle.sql into the SQL editor". It is
// GENERATED from the numbered migrations, and nothing stopped it drifting — at
// the 2026-07-24 review it contained 0001–0037 while 0038+ existed on disk, so
// following the docs would have applied every migration EXCEPT the ones fixing
// the anonymity leak and the rate-limit bypass. Silently: a stale bundle runs
// clean and reports success.
//
// This regenerates in memory and compares. It never writes — a failing CI run
// tells you to run the generator yourself, so the diff lands in the commit that
// added the migration rather than appearing from nowhere.
//
// Run: node scripts/check-bundle-fresh.mjs   (exit 1 when stale)

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const bundlePath = join(migrationsDir, '_bundle.sql');

// Must match generate-bundle.mjs exactly — same filter, same numeric sort
// (NOT directory order), same header and part formatting. If you change one,
// change both; the whole point is that this reproduces that output byte for byte.
const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort((a, b) => Number(a.slice(0, 4)) - Number(b.slice(0, 4)) || a.localeCompare(b));

const header = `-- ═══════════════════════════════════════════════════════════════════════════
-- quad — GENERATED migration bundle. DO NOT EDIT BY HAND.
-- Regenerate with: node supabase/scripts/generate-bundle.mjs
-- Contains, in order: ${files.map((f) => f.slice(0, 4)).join(', ')}
-- ═══════════════════════════════════════════════════════════════════════════
`;

const parts = files.map((f) => {
  const body = readFileSync(join(migrationsDir, f), 'utf8').replace(/\s+$/, '');
  return `-- ═══════════════ ${f} ═══════════════\n\n${body}\n`;
});

const expected = `${header}\n${parts.join('\n')}`;

let actual;
try {
  actual = readFileSync(bundlePath, 'utf8');
} catch {
  console.error('_bundle.sql is missing. Run: node supabase/scripts/generate-bundle.mjs');
  process.exit(1);
}

// Normalize line endings only. Git checks out LF as CRLF on Windows, and that
// difference is not drift — the generator's own output would differ from a
// checked-out copy of the identical file.
const norm = (s) => s.replace(/\r\n/g, '\n');

if (norm(actual) === norm(expected)) {
  console.log(`bundle check: OK (_bundle.sql matches ${files.length} migrations)`);
  process.exit(0);
}

// Say WHICH migrations are missing — that's the usual cause and the fastest fix.
const inBundle = new Set([...norm(actual).matchAll(/-- ═+ (\d{4}_[^\s]+\.sql) ═+/g)].map((m) => m[1]));
const missing = files.filter((f) => !inBundle.has(f));
const extra = [...inBundle].filter((f) => !files.includes(f));

console.error('_bundle.sql is STALE — the documented install path would apply the wrong schema.\n');
if (missing.length) console.error(`  missing from bundle: ${missing.join(', ')}`);
if (extra.length) console.error(`  in bundle but not on disk: ${extra.join(', ')}`);
if (!missing.length && !extra.length) {
  console.error('  same migration list, but content differs — a migration file was edited after generating.');
}
console.error('\nFix: node supabase/scripts/generate-bundle.mjs (then commit _bundle.sql)\n');
process.exit(1);
