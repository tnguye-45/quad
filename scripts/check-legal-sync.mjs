#!/usr/bin/env node
// quad — legal drift check (legal/README.md "Canonical documents")
//
// The privacy policy and terms exist twice: legal/privacy.md + legal/tos.md
// are the documents of record that counsel reviews and that the App Store
// listing links to, while legal/index.ts holds inline template-literal copies
// because that's what actually renders in the app — including at the sign-up
// consent gate in app/(auth)/sign-up.tsx, where a student is agreeing to it.
//
// Nothing in TypeScript can express "these two must match". Without this
// check, counsel edits privacy.md, nobody remembers index.ts, and the app
// keeps showing un-reviewed text that the user is legally agreeing to. That
// is the failure this exists to prevent.
//
// The only tolerated difference is inline-code backticks: the in-app renderer
// (app/legal/_renderer.tsx) supports H1/H2/bullets/bold and nothing else, so
// `@nd.edu` in the .md would render with literal backtick characters. They're
// dropped from both sides before comparing. Everything else — wording,
// punctuation, bold runs, ordering — must be identical.
//
// Run: node scripts/check-legal-sync.mjs   (exit 1 on any drift)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

const PAIRS = [
  { constant: 'PRIVACY_MARKDOWN', markdown: 'legal/privacy.md' },
  { constant: 'TOS_MARKDOWN', markdown: 'legal/tos.md' },
];

// CRLF vs LF is a checkout artifact on Windows, and a trailing-newline
// difference is invisible in an editor — neither is drift worth failing on.
function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/`/g, '').trimEnd();
}

const source = readFileSync(join(ROOT, 'legal/index.ts'), 'utf8');
const failures = [];

for (const { constant, markdown } of PAIRS) {
  // Template literals, so the value runs from the opening backtick to the
  // first unescaped closing one.
  const match = source.match(
    new RegExp(`export const ${constant}\\s*=\\s*\`([\\s\\S]*?)\`;`),
  );
  if (!match) {
    failures.push(`legal/index.ts — no template-literal export named ${constant}`);
    continue;
  }
  const inlined = normalize(match[1].replace(/\\`/g, '`').replace(/\\\$/g, '$'));
  const canonical = normalize(readFileSync(join(ROOT, markdown), 'utf8'));
  if (inlined === canonical) continue;

  const a = canonical.split('\n');
  const b = inlined.split('\n');
  const i = a.findIndex((line, idx) => line !== b[idx]);
  failures.push(
    `${markdown} ↔ legal/index.ts:${constant} — first difference at line ${i + 1}\n` +
      `      ${markdown}: ${JSON.stringify(a[i] ?? '<end of file>')}\n` +
      `      ${constant}: ${JSON.stringify(b[i] ?? '<end of file>')}`,
  );
}

if (failures.length > 0) {
  console.error('Legal documents are out of sync:\n');
  for (const f of failures) console.error('  ' + f);
  console.error(
    '\nThe .md files are the document of record. Update legal/index.ts to match ' +
      'them (see the header comment in that file), then re-run this check.',
  );
  process.exit(1);
}
console.log('legal sync check: OK (privacy + tos match their .md source)');
