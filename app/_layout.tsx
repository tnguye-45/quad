import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
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

    const first = segments[0] as string | undefined;
    const inAuthGroup = first === '(auth)';
    const inProfileSetup = first === 'profile-setup';
    const inProtectedApp =
      first === '(tabs)' ||
      first === 'chat' ||
      first === 'modal' ||
      first === 'settings' ||
      first === 'report' ||
      first === 'gig' ||
      first === 'hangout' ||
      first === 'voice';
    const inLegal = first === 'legal'; // legal screens are accessible signed-out too
    const inSplashOrWelcome = first === undefined || first === 'splash' || first === 'welcome';
    void inLegal;

    if (!session) {
      // Not signed in — kick out of protected routes.
      if (inProtectedApp || inProfileSetup) {
        router.replace('/welcome');
      }
      return;
    }

    // Signed in — make sure profile is complete.
    if (!profile?.display_name) {
      if (!inProfileSetup) router.replace('/profile-setup');
      return;
    }

    // Signed in with a complete profile — push past splash/welcome/auth screens.
    if (inAuthGroup || inSplashOrWelcome) {
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

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
