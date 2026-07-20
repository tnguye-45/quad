import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// tos.md is the finalized Terms of Service (effective 2026-07-15). Do NOT
// point at legal/terms.md — that's an orphaned earlier draft with unfilled
// TODO placeholders.
const PRIVACY_URL = 'https://github.com/tnguye-45/quad/blob/main/legal/privacy.md';
const TERMS_URL = 'https://github.com/tnguye-45/quad/blob/main/legal/tos.md';

async function openExternal(url: string) {
  if (Platform.OS === 'web') {
    Linking.openURL(url);
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Linking.openURL(url);
  }
}

export default function LegalScreen() {
  const c = Colors[useColorScheme() ?? 'light'];

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <NamePlaque size="sm" />
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.5 : 1 }]}>
            <ThemedText style={[styles.closeText, { color: c.textMuted }]} type="mono">
              close
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <ThemedText style={[styles.eyebrow, { color: c.accent }]} type="mono">
            legal
          </ThemedText>
          <ThemedText style={[styles.heading, { color: c.text }]}>
            Privacy & terms
          </ThemedText>
          <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
            The documents that govern your use of quad. We&apos;ll note the
            effective date at the top of each if they change.
          </ThemedText>
        </View>

        <View style={styles.list}>
          <LegalRow
            label="Privacy Policy"
            sub="What we collect, how we use it, what you control"
            onPress={() => openExternal(PRIVACY_URL)}
            c={c}
          />
          <LegalRow
            label="Terms of Service"
            sub="Eligibility, acceptable use, gigs disclaimer"
            onPress={() => openExternal(TERMS_URL)}
            c={c}
          />
        </View>

        <View style={[styles.section, { borderTopColor: c.border }]}>
          <ThemedText style={[styles.sectionLabel, { color: c.textMuted }]} type="mono">
            not affiliated
          </ThemedText>
          <ThemedText style={[styles.body, { color: c.text }]}>
            quad is an independent student project. It is not an official
            University of Notre Dame product, and the University does not
            operate, endorse, or sponsor it.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function LegalRow({
  label,
  sub,
  onPress,
  c,
}: {
  label: string;
  sub: string;
  onPress: () => void;
  c: (typeof Colors)['light'];
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: c.border, opacity: pressed ? 0.5 : 1 },
      ]}>
      <View style={styles.rowText}>
        <ThemedText style={[styles.rowLabel, { color: c.text }]}>{label}</ThemedText>
        <ThemedText style={[styles.rowSub, { color: c.textMuted }]} type="mono">
          {sub.toLowerCase()}
        </ThemedText>
      </View>
      <ThemedText style={[styles.rowArrow, { color: c.textMuted }]} type="mono">
        ↗
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 28,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  closeText: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  hero: { gap: 8, alignItems: 'flex-start' },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  tagline: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 4 },
  rowLabel: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  rowSub: {
    fontSize: 10,
    letterSpacing: 0.6,
  },
  rowArrow: { fontSize: 14 },
  section: {
    paddingTop: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  body: { fontSize: 14, lineHeight: 20 },
});
