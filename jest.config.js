// quad — unit tests for the pure logic behind the feeds and profile links.
//
// jest-expo gives us babel-preset-expo (so the TS/JSX and the `@/*` alias in
// the source files transform the same way Metro does) plus the React Native
// module mocks, without which importing anything under lib/ pulls in native
// modules that don't exist in Node.
//
// Scope is deliberately narrow: pure functions only, no component rendering.
// Screens are covered by tsc + eslint + manual QA; the functions here are the
// ones that fail silently and wrongly (money rounding, keyset cursor quoting,
// feed row masking, notification routing).

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  // lib/supabase.ts throws at import time unless the project env vars are set,
  // and every module under test imports it transitively. The stub keeps the
  // tests hermetic — nothing here should be able to reach the network even by
  // accident.
  moduleNameMapper: {
    '^@/lib/supabase$': '<rootDir>/__tests__/__helpers__/supabase-stub.ts',
    '^\\./supabase$': '<rootDir>/__tests__/__helpers__/supabase-stub.ts',
  },
};
