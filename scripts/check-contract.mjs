#!/usr/bin/env node
// quad — static contract check (CLIENT_CONTRACT.md §1–§2)
//
// The DB contract (migrations 0023+) is not expressible in TypeScript: table
// SELECT on voices/gigs/hangouts/comments is revoked column-by-column, so a
// select string that names a revoked column typechecks fine and then fails
// the WHOLE request with 42501 at runtime — which is exactly how the Messages
// tab shipped broken once (poster_id/host_id embeds in lib/messaging.ts).
// This script greps the client source for the three violation classes and
// fails CI before a red build can deploy:
//
//   1. READ selects on the locked base tables — feeds must use *_feed views.
//      (insert(...).select(...) write-returns are allowed: RETURNING only
//      needs SELECT privilege on the returned columns, which are granted.)
//   2. Embeds of a locked table (e.g. `gig:gigs(...)`) inside any select
//      string — embeds read the base table and are revoked wholesale.
//   3. Realtime postgres_changes subscriptions on the content tables — they
//      were removed from the publication and silently never fire; the only
//      signal is feed_events (plus messages / conversation_members).
//
// Run: node scripts/check-contract.mjs   (exit 1 on any violation)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SCAN_DIRS = ['app', 'lib', 'components', 'hooks'];
const LOCKED_TABLES = ['gigs', 'hangouts', 'voices', 'comments', 'hangout_attendees'];

const violations = [];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function scan(file) {
  const raw = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  // Blank out comments (preserving newlines so line numbers stay right) —
  // prose ABOUT a violation must not trip the check. Crude but sufficient:
  // // line comments and /* block comments */.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

  // 1. Direct read: .from('<locked>') immediately chained to .select(
  //    (writes chain .insert/.update/.delete first, so they don't match).
  //    hangout_attendees own-row reads ARE allowed by the contract — exclude.
  const readLocked = /\.from\(\s*['"](gigs|hangouts|voices|comments)['"]\s*\)\s*\.select\(/g;
  for (const m of src.matchAll(readLocked)) {
    violations.push(
      `${rel}:${lineOf(src, m.index)} — read-select on locked base table '${m[1]}'; use ${m[1]}_feed`,
    );
  }

  // 2. Embeds of a locked table inside a select string: `alias:gigs(...)`.
  const embed = /[\w"']\s*:\s*(gigs|hangouts|voices|comments)\s*\(/g;
  for (const m of src.matchAll(embed)) {
    violations.push(
      `${rel}:${lineOf(src, m.index)} — embed of locked table '${m[1]}' in a select string (42501 at runtime)`,
    );
  }

  // 3. Realtime subscriptions on content tables. postgres_changes options are
  //    object literals with a `table:` key; match table: '<locked>'.
  const rt = new RegExp(`table:\\s*['"](${LOCKED_TABLES.join('|')})['"]`, 'g');
  for (const m of src.matchAll(rt)) {
    violations.push(
      `${rel}:${lineOf(src, m.index)} — realtime subscription on '${m[1]}'; these tables left the publication (subscribe to feed_events)`,
    );
  }
}

for (const dir of SCAN_DIRS) {
  try {
    for (const file of walk(join(ROOT, dir))) scan(file);
  } catch {
    // missing dir is fine
  }
}

if (violations.length > 0) {
  console.error('CLIENT_CONTRACT violations found:\n');
  for (const v of violations) console.error('  ' + v);
  console.error(
    `\n${violations.length} violation(s). See supabase/CLIENT_CONTRACT.md §1–§2.`,
  );
  process.exit(1);
}
console.log('contract check: OK (no base-table reads, embeds, or dead realtime subscriptions)');
