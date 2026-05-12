import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function CheckEmailScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { email } = useLocalSearchParams<{ email?: string }>();

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.content}>
        <ThemedText style={styles.emoji}>📬</ThemedText>
        <ThemedText type="title" style={styles.heading}>
          Check your email
        </ThemedText>
        <ThemedText style={[styles.body, { color: c.textSecondary }]}>
          We sent a confirmation link to{' '}
          {email ? (
            <ThemedText type="defaultSemiBold">{email}</ThemedText>
          ) : (
            'your school email'
          )}
          . Tap it to verify your account, then come back to sign in.
        </ThemedText>
      </View>

      <Pressable
        onPress={() => router.replace('/(auth)/sign-in')}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
        ]}>
        <ThemedText style={[styles.ctaText, { color: c.background }]}>
          Back to sign in
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 100,
    paddingBottom: 40,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  content: { gap: 20, alignItems: 'center' },
  emoji: { fontSize: 56 },
  heading: { fontSize: 28, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 380 },
  cta: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '600' },
});
