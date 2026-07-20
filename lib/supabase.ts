import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your Supabase project values.',
  );
}

// Catch the placeholder values from .env.example before they hit Supabase and
// produce a cryptic 401. The anon key is always a long JWT — the placeholder
// is the literal string left behind when the dev hasn't pasted their key yet.
if (
  supabaseAnonKey === 'PASTE_YOUR_ANON_KEY_HERE' ||
  supabaseAnonKey === 'your-anon-key-here' ||
  supabaseAnonKey.length < 40
) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY in .env is still a placeholder. ' +
      'Get the real key from Supabase Dashboard → Project Settings → API → "anon public", ' +
      'paste it into .env, and restart the dev server.',
  );
}

// Storage adapter that's safe under SSR/SSG (Expo's static web output renders
// routes in Node, where `window` doesn't exist).
const noopStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => {},
  removeItem: async (_key: string) => {},
};

const webBrowserStorage = {
  getItem: async (key: string) => globalThis.localStorage.getItem(key),
  setItem: async (key: string, value: string) => globalThis.localStorage.setItem(key, value),
  removeItem: async (key: string) => globalThis.localStorage.removeItem(key),
};

const storage =
  Platform.OS === 'web'
    ? typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
      ? webBrowserStorage
      : noopStorage
    : AsyncStorage;

// On a cold web load of a password-recovery link, gotrue parses the URL and
// fires PASSWORD_RECOVERY during client construction — before any React effect
// can subscribe to onAuthStateChange — and consumes the single-use token in
// the process. So the event alone can't be relied on to route the user to the
// reset screen. Capture the intent synchronously from the URL here, before
// createClient runs, and let the app shell consume it once the router mounts.
// Covers both the implicit flow (tokens in the hash: `#...&type=recovery`) and
// the PKCE flow (`?code=...&type=recovery`).
let pendingPasswordRecovery =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  /[?#&]type=recovery(&|$)/.test(window.location.hash + '&' + window.location.search);

/**
 * One-shot check used by the root layout's route guard: true exactly once if
 * this page load started from a password-recovery link.
 */
export function consumePendingPasswordRecovery(): boolean {
  const was = pendingPasswordRecovery;
  pendingPasswordRecovery = false;
  return was;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    // On web, email-confirmation and password-recovery links land back on the
    // app with tokens in the URL. We must parse them or the recovery flow is a
    // dead end (the user can never set a new password). Native uses a dedicated
    // screen + deep link, so it stays off there.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
