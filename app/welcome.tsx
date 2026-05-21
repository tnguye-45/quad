import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';

const FEATURES = [
  {
    marker: '01',
    title: 'Find quick gigs',
    body: 'Tutoring, moving help, rides to the airport, dog walks — earn cash from people on your campus.',
  },
  {
    marker: '02',
    title: 'Join hangouts',
    body: 'Study sessions, pickup basketball, dining hall meetups. Find your people for the things you already do.',
  },
  {
    marker: '03',
    title: 'See it on a map',
    body: "Everything's pinned to where it's actually happening. Walking distance only — no rideshares to nowhere.",
  },
  {
    marker: '04',
    title: 'Students only',
    body: '.edu email required. No randos, no scams — just verified students from your school.',
  },
];

export default function WelcomeScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { enableDevAuth } = useAuth();

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <NamePlaque size="xl" />
          <ThemedText style={[styles.eyebrow, { color: c.accent }]} type="mono">
            for notre dame students
          </ThemedText>
          <ThemedText style={[styles.tagline, { color: c.text }]}>
            The campus app for gigs and hangouts.
          </ThemedText>
        </View>

        <View style={styles.featureList}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.feature}>
              <ThemedText
                style={[styles.featureMarker, { color: c.textMuted }]}
                type="mono">
                {f.marker}
              </ThemedText>
              <View style={styles.featureText}>
                <ThemedText style={[styles.featureTitle, { color: c.text }]}>
                  {f.title}
                </ThemedText>
                <ThemedText style={[styles.featureBody, { color: c.textSecondary }]}>
                  {f.body}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.ctaBlock, { borderTopColor: c.border }]}>
        <Pressable
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => router.push('/(auth)/sign-up')}>
          <ThemedText style={[styles.ctaText, { color: c.background }]}>
            Sign up with @nd.edu
          </ThemedText>
        </Pressable>
        <Pressable onPress={() => router.push('/(auth)/sign-in')} hitSlop={8}>
          <ThemedText style={[styles.ctaSubtle, { color: c.textSecondary }]}>
            Already have an account?{' '}
            <ThemedText style={[styles.ctaSubtleLink, { color: c.text }]}>
              Sign in
            </ThemedText>
          </ThemedText>
        </Pressable>

        {__DEV__ ? (
          <Pressable onPress={enableDevAuth} style={styles.devButton} hitSlop={8}>
            <ThemedText
              style={[styles.devText, { color: c.textMuted }]}
              type="mono">
              dev · enter as admin
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    paddingTop: 84,
    paddingHorizontal: 28,
    paddingBottom: 32,
    gap: 40,
  },
  hero: {
    alignItems: 'flex-start',
    gap: 14,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginTop: 6,
  },
  tagline: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -0.4,
    maxWidth: 320,
    marginTop: 2,
  },
  featureList: {
    gap: 24,
  },
  feature: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-start',
  },
  featureMarker: {
    fontSize: 10,
    width: 24,
    fontWeight: '700',
    letterSpacing: 1,
    paddingTop: 4,
  },
  featureText: {
    flex: 1,
    gap: 4,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  featureBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  ctaBlock: {
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 14,
    alignItems: 'center',
    borderTopWidth: 0,
  },
  cta: {
    width: '100%',
    maxWidth: 420,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  ctaSubtle: {
    fontSize: 13,
  },
  ctaSubtleLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  devButton: {
    marginTop: 4,
    paddingVertical: 6,
  },
  devText: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
