import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { consumePendingPasswordRecovery } from '@/lib/supabase';
import {
  getColdStartRoute,
  setupNotificationHandler,
  subscribeToNotificationTaps,
} from '@/lib/notifications';
import { PostsProvider } from '@/lib/posts-store';
import { DevConversationsProvider } from '@/lib/dev-conversations';

setupNotificationHandler();

export const unstable_settings = {
  anchor: 'splash',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <PostsProvider>
        <DevConversationsProvider>
          <RootStack />
        </DevConversationsProvider>
      </PostsProvider>
    </AuthProvider>
  );
}

function RootStack() {
  const colorScheme = useColorScheme();
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // A cold web load of a recovery link consumed its token before this tree
    // mounted (see lib/supabase.ts) — route straight to the reset screen. If
    // the token was valid there's a recovery session; if it expired, the reset
    // screen explains and points back to "request a new link". Checked before
    // every other rule so neither the welcome kick nor the profile-setup
    // bounce can swallow the flow.
    if (consumePendingPasswordRecovery()) {
      router.replace('/(auth)/reset-password' as never);
      return;
    }

    const first = segments[0] as string | undefined;
    const inAuthGroup = first === '(auth)';
    // During password recovery the user IS signed in (a recovery session), but
    // must stay on the reset screen to set a new password — don't let the
    // "signed-in → go to tabs" rule bounce them away.
    const inResetPassword = inAuthGroup && (segments[1] as string | undefined) === 'reset-password';
    const inProfileSetup = first === 'profile-setup';
    const inLegal = first === 'legal'; // legal screens are accessible signed-out too
    const inSplashOrWelcome = first === undefined || first === 'splash' || first === 'welcome';
    // Allowlist the routes reachable while signed out. Everything else is
    // protected by default, so a newly added screen (e.g. connections,
    // post-gig) can't silently become publicly reachable on the web build.
    const isPublicRoute = inAuthGroup || inLegal || inSplashOrWelcome;

    if (!session) {
      // Not signed in — kick out of anything that isn't a public route.
      if (!isPublicRoute) {
        router.replace('/welcome');
      }
      return;
    }

    // Signed in — make sure profile is complete. Legal stays reachable so a
    // mid-onboarding user can read the terms without being bounced.
    if (!profile?.display_name) {
      // reset-password must also survive this rule: a recovery session for a
      // user who never finished onboarding would otherwise bounce to
      // profile-setup before they could set the new password.
      if (!inProfileSetup && !inLegal && !inResetPassword) router.replace('/profile-setup');
      return;
    }

    // Signed in with a complete profile — push past splash/welcome/auth screens,
    // except the password-reset screen, which must run to completion.
    if ((inAuthGroup || inSplashOrWelcome) && !inResetPassword) {
      router.replace('/(tabs)');
    }
  }, [session, profile, loading, segments, router]);

  // Push notification routing: cold-start lookup once auth is settled and the
  // user is on a real tab screen, plus a live subscription for taps that
  // arrive while the app is running.
  useEffect(() => {
    if (loading || !session || !profile?.display_name) return;
    let cancelled = false;
    getColdStartRoute().then((route) => {
      if (!cancelled && route) router.replace(route as never);
    });
    const unsubscribe = subscribeToNotificationTaps((route) => {
      router.push(route as never);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loading, session, profile?.display_name, router]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="profile-setup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Me' }} />
        <Stack.Screen
          name="post-gig"
          options={{ presentation: 'modal', title: 'Post a gig' }}
        />
        <Stack.Screen
          name="start-hangout"
          options={{ presentation: 'modal', title: 'Start a hangout' }}
        />
        <Stack.Screen
          name="post-voice"
          options={{ presentation: 'modal', title: 'Speak your mind' }}
        />
        <Stack.Screen
          name="gig/[id]"
          options={{ presentation: 'modal', title: 'Gig' }}
        />
        <Stack.Screen
          name="hangout/[id]"
          options={{ presentation: 'modal', title: 'Hangout' }}
        />
        <Stack.Screen
          name="voice/[id]"
          options={{ presentation: 'modal', title: 'Voice' }}
        />
        <Stack.Screen name="settings/account" options={{ headerShown: false }} />
        <Stack.Screen name="settings/blocked" options={{ headerShown: false }} />
        <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
        <Stack.Screen
          name="report"
          options={{ presentation: 'modal', title: 'Report' }}
        />
        <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="legal/tos" options={{ headerShown: false }} />
        <Stack.Screen
          name="legal"
          options={{ presentation: 'modal', title: 'Legal' }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

// Root-level crash screen. Without this, an uncaught render error in any route
// takes down the whole app with a white screen (or a red box in dev). Uses
// plain RN primitives — no themed components — so it can't itself crash if the
// theme context is what broke. Hex pairs match constants/theme's light palette.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={errStyles.screen}>
      <Text style={errStyles.eyebrow}>something broke</Text>
      <Text style={errStyles.heading}>quad hit an unexpected error</Text>
      <Text style={errStyles.body}>{error.message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={({ pressed }) => [errStyles.cta, { opacity: pressed ? 0.85 : 1 }]}>
        <Text style={errStyles.ctaText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const errStyles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
    backgroundColor: '#FBF8F1',
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
    color: '#C99700',
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: '#0C2340',
  },
  body: { fontSize: 13, lineHeight: 18, color: '#5D6B85' },
  cta: {
    marginTop: 14,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#0C2340',
  },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#FBF8F1' },
});

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
