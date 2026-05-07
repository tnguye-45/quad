import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const FEATURES = [
  {
    emoji: '💼',
    title: 'Find quick gigs',
    body: 'Tutoring, moving help, rides to the airport, dog walks — earn cash from people on your campus.',
  },
  {
    emoji: '👥',
    title: 'Join hangouts',
    body: 'Study sessions, pickup basketball, dining hall meetups. Find your people for the things you already do.',
  },
  {
    emoji: '🗺️',
    title: 'See it on a map',
    body: "Everything's pinned to where it's actually happening. Walking distance only — no rideshares to nowhere.",
  },
  {
    emoji: '🎓',
    title: 'Students only',
    body: '.edu email required. No randos, no scams — just verified students from your school.',
  },
];

export default function WelcomeScreen() {
  const c = Colors[useColorScheme() ?? 'light'];

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.content}>
        <View style={styles.heroBlock}>
          <ThemedText style={[styles.brand, { color: c.text }]}>quad</ThemedText>
          <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
            The campus app for gigs and hangouts.
          </ThemedText>
          <View style={[styles.campusPill, { backgroundColor: c.subtle, borderColor: c.border }]}>
            <ThemedText style={[styles.campusPillText, { color: c.textSecondary }]}>
              University of Notre Dame
            </ThemedText>
          </View>
        </View>

        <View style={styles.featureList}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.feature}>
              <ThemedText style={styles.featureEmoji}>{f.emoji}</ThemedText>
              <View style={styles.featureText}>
                <ThemedText type="defaultSemiBold" style={styles.featureTitle}>
                  {f.title}
                </ThemedText>
                <ThemedText style={[styles.featureBody, { color: c.textSecondary }]}>
                  {f.body}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.ctaBlock}>
        <Pressable
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => router.replace('/(tabs)')}>
          <ThemedText style={[styles.ctaText, { color: c.background }]}>Get started</ThemedText>
        </Pressable>
        <ThemedText style={[styles.ctaSubtle, { color: c.textSecondary }]}>
          Free · no account needed yet
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    gap: 36,
  },
  heroBlock: {
    alignItems: 'flex-start',
    gap: 10,
  },
  brand: {
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1.5,
    lineHeight: 52,
  },
  tagline: {
    fontSize: 17,
    lineHeight: 24,
    maxWidth: 320,
  },
  campusPill: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  campusPillText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  featureList: {
    gap: 22,
  },
  feature: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  featureEmoji: {
    fontSize: 28,
    lineHeight: 32,
    width: 36,
    textAlign: 'center',
  },
  featureText: {
    flex: 1,
    gap: 3,
  },
  featureTitle: {
    fontSize: 15,
  },
  featureBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  ctaBlock: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 24,
  },
  cta: {
    width: '100%',
    maxWidth: 420,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
  },
  ctaSubtle: {
    fontSize: 12,
  },
});
