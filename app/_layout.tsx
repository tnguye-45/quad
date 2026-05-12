import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { PostsProvider } from '@/lib/posts-store';

export const unstable_settings = {
  anchor: 'splash',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <PostsProvider>
        <RootStack />
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
    const inProtectedApp = first === '(tabs)' || first === 'chat' || first === 'modal';
    const inSplashOrWelcome = first === undefined || first === 'splash' || first === 'welcome';

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
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
