// Stands in for lib/supabase.ts under jest (see moduleNameMapper in
// jest.config.js). The real module throws at import time when the project env
// vars are missing, and every module under test imports it transitively.
//
// Every entry point throws rather than returning a benign empty result: these
// tests only cover pure functions, so a call landing here means a test is
// exercising a code path it didn't mean to, and a silent `{ data: [] }` would
// let that pass green.

function unavailable(): never {
  throw new Error(
    'supabase client used in a unit test — only pure functions are under test here',
  );
}

export const supabase = {
  from: unavailable,
  rpc: unavailable,
  channel: unavailable,
  removeChannel: unavailable,
  storage: {
    from: unavailable,
  },
  auth: {
    getSession: unavailable,
    onAuthStateChange: unavailable,
    signInWithPassword: unavailable,
    signOut: unavailable,
  },
};

export function consumePendingPasswordRecovery(): boolean {
  return false;
}
