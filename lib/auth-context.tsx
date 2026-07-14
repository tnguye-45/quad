import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { clearPushToken, registerForPushToken } from './notifications';
import { supabase } from './supabase';

// Where Supabase should send the browser after it verifies the confirmation
// token. On the hosted web build the app lives under the `/quad/` subpath
// (EXPO_PUBLIC_BASE_URL=/quad, set by deploy.yml), so a bare origin would 404.
// Deriving from window.location keeps localhost dev working (base is empty
// there). This URL must also be allowlisted in Supabase → Auth → URL
// Configuration → Redirect URLs, or Supabase falls back to the Site URL.
function emailRedirectTo(): string | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  const base = process.env.EXPO_PUBLIC_BASE_URL ?? '';
  return `${window.location.origin}${base}/`;
}

export type ProfileLink = { label: string; url: string };

export type Profile = {
  id: string;
  display_name: string | null;
  initials: string | null;
  year: number | null;
  major: string | null;
  dorm: string | null;
  avatar_url: string | null;
  bio: string | null;
  links: ProfileLink[];
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isDev: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  enableDevAuth: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const EDU_DOMAIN = 'nd.edu';

// Extra domains allowed for testing only, from a comma-separated env var
// (e.g. EXPO_PUBLIC_TEST_EMAIL_DOMAINS=gmail.com). Unset in production, so the
// hosted build stays @nd.edu-only. This is the CLIENT gate only — Supabase's
// "Allowed email domains" dashboard setting is the real server-side gate.
const EXTRA_ALLOWED_DOMAINS = (process.env.EXPO_PUBLIC_TEST_EMAIL_DOMAINS ?? '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  if (lower.endsWith(`@${EDU_DOMAIN}`)) return true;
  const domain = lower.split('@')[1] ?? '';
  return EXTRA_ALLOWED_DOMAINS.includes(domain);
}

const DEV_USER_ID = '00000000-0000-4000-8000-00000000dev1';
const DEV_SESSION: Session = {
  access_token: 'dev-access-token',
  refresh_token: 'dev-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: DEV_USER_ID,
    aud: 'authenticated',
    email: 'dev@nd.edu',
    role: 'authenticated',
    app_metadata: { provider: 'dev' },
    user_metadata: {},
    created_at: new Date().toISOString(),
    email_confirmed_at: new Date().toISOString(),
  } as Session['user'],
};
const DEV_PROFILE: Profile = {
  id: DEV_USER_ID,
  display_name: 'Dev Admin',
  initials: 'DA',
  year: 4,
  major: 'Computer Science',
  dorm: 'Sorin College',
  avatar_url: null,
  bio: 'Building quad over the summer. Always down for a pickup basketball run or a late-night coding session at Hesburgh.',
  links: [
    { label: 'GitHub', url: 'https://github.com/tnguye-45' },
    { label: 'LinkedIn', url: 'https://linkedin.com/in/' },
  ],
  verified_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isDev, setIsDev] = useState(false);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[auth] failed to fetch profile', error.message);
      setProfile(null);
      return;
    }
    if (!data) {
      setProfile(null);
      return;
    }
    // Defensive default for `links` in case the 0004 migration hasn't run yet.
    const normalized: Profile = {
      ...(data as Profile),
      links: Array.isArray((data as Profile).links) ? (data as Profile).links : [],
    };
    setProfile(normalized);
    // Fire-and-forget: register this device's push token under the user's
    // account. No-ops on web, simulator, or when the user denies permission.
    registerForPushToken(userId).catch(() => {});
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        fetchProfile(data.session.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      // Ignore Supabase events while we're in dev mode so the fake session sticks.
      setIsDev((curIsDev) => {
        if (curIsDev) return curIsDev;
        setSession(newSession);
        if (newSession) {
          fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
        return curIsDev;
      });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    isDev,
    async signUp(email, password) {
      if (!isAllowedEmail(email)) {
        return { error: `Use your @${EDU_DOMAIN} email to sign up.` };
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: emailRedirectTo() },
      });
      return { error: error?.message ?? null };
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return { error: error?.message ?? null };
    },
    async signOut() {
      if (isDev) {
        setIsDev(false);
        setSession(null);
        setProfile(null);
        return;
      }
      // Drop the push token first so the device stops receiving notifications
      // for the previous account; tolerate failure since the sign-out matters more.
      if (session) await clearPushToken(session.user.id).catch(() => {});
      await supabase.auth.signOut();
    },
    async sendPasswordReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: emailRedirectTo(),
      });
      return { error: error?.message ?? null };
    },
    async refreshProfile() {
      if (isDev) return;
      if (session) await fetchProfile(session.user.id);
    },
    enableDevAuth() {
      setIsDev(true);
      setSession(DEV_SESSION);
      setProfile(DEV_PROFILE);
      setLoading(false);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
