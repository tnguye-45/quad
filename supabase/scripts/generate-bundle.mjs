// quad — regenerate supabase/migrations/_bundle.sql from the numbered
// migrations. The bundle is what gets pasted into the Supabase SQL editor for
// a from-scratch project; hand-maintaining it drifted from the real files
// (2026-07-19 review), so it is now generated. Never edit _bundle.sql by hand.
//
//   node supabase/scripts/generate-bundle.mjs
//
// Ordering is by the 4-digit numeric prefix (NOT directory order — 0012 was
// created after 0011 on disk).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

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

writeFileSync(join(migrationsDir, '_bundle.sql'), `${header}\n${parts.join('\n')}`);
console.log(`_bundle.sql regenerated from ${files.length} migrations (${files[0]}..${files[files.length - 1]})`);
