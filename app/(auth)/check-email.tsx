import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function CheckEmailScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { email } = useLocalSearchParams<{ email?: string }>();

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.top}>
        <NamePlaque size="sm" />
      </View>

      <View style={styles.content}>
        <ThemedText style={[styles.eyebrow, { color: c.accent }]} type="mono">
          almost there
        </ThemedText>
        <ThemedText style={[styles.heading, { color: c.text }]}>
          Check your email
        </ThemedText>
        <ThemedText style={[styles.body, { color: c.textSecondary }]}>
          We sent a confirmation link to{' '}
          {email ? (
            <ThemedText style={[styles.bodyStrong, { color: c.text }]}>{email}</ThemedText>
          ) : (
            'your school email'
          )}
          . Tap it to verify your account, then come back to sign in.
        </ThemedText>
      </View>

      <View style={styles.ctaBlock}>
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
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 80,
    paddingBottom: 36,
    paddingHorizontal: 28,
  },
  top: { alignItems: 'flex-start' },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 10,
    maxWidth: 420,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 36,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  ctaBlock: { gap: 12 },
  cta: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
