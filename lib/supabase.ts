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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
