import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type Prefs = {
  messages: boolean;
  new_gigs: boolean;
  new_hangouts: boolean;
  new_voices: boolean;
};

const DEFAULTS: Prefs = {
  messages: true,
  new_gigs: true,
  new_hangouts: true,
  new_voices: false,
};

type ToggleKey = keyof Prefs;

const ROWS: { key: ToggleKey; title: string; subtitle: string }[] = [
  {
    key: 'messages',
    title: 'Messages',
    subtitle: 'Direct messages and hangout group chats.',
  },
  {
    key: 'new_gigs',
    title: 'New gigs',
    subtitle: 'Get notified when someone posts a new gig nearby.',
  },
  {
    key: 'new_hangouts',
    title: 'New hangouts',
    subtitle: 'Get notified when someone starts a hangout on campus.',
  },
  {
    key: 'new_voices',
    title: 'New voices',
    subtitle: 'High volume — off by default.',
  },
];

export default function NotificationSettingsScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, isDev } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (isDev || !session) {
      setPrefs(DEFAULTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('notification_prefs')
      .select('messages, new_gigs, new_hangouts, new_voices')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) {
      console.warn('[notif-prefs] load failed', error.message);
    }
    setPrefs(data ? { ...DEFAULTS, ...(data as Prefs) } : DEFAULTS);
    setLoading(false);
  }, [session, isDev]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(key: ToggleKey) {
    const next: Prefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    if (isDev || !session) return;
    setSaving(true);
    const { error } = await supabase
      .from('notification_prefs')
      .upsert(
        {
          user_id: session.user.id,
          ...next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    setSaving(false);
    if (error) {
      // Roll back the optimistic toggle on failure.
      console.warn('[notif-prefs] save failed', error.message);
      setPrefs(prefs);
    }
  }

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
            <ThemedText
              style={[styles.backText, { color: c.textMuted }]}
              type="mono">
              back
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.header}>
          <ThemedText style={[styles.title, { color: c.text }]}>
            Notifications
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: c.textSecondary }]}>
            Choose what we push to your device. You can change these any time.
          </ThemedText>
        </View>

        <View style={[styles.section, { borderTopColor: c.border }]}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={c.text} />
            </View>
          ) : (
            ROWS.map((row) => (
              <View
                key={row.key}
                style={[styles.row, { borderBottomColor: c.border }]}>
                <View style={styles.rowText}>
                  <ThemedText style={[styles.rowTitle, { color: c.text }]}>
                    {row.title}
                  </ThemedText>
                  <ThemedText style={[styles.rowSub, { color: c.textSecondary }]}>
                    {row.subtitle}
                  </ThemedText>
                </View>
                <Switch
                  value={prefs[row.key]}
                  onValueChange={() => toggle(row.key)}
                  trackColor={{ false: c.border, true: c.tint }}
                  thumbColor={c.background}
                />
              </View>
            ))
          )}
        </View>

        {saving ? (
          <ThemedText style={[styles.saving, { color: c.textMuted }]} type="mono">
            saving…
          </ThemedText>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 24,
  },
  topRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  backText: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  header: { gap: 8 },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  subtitle: { fontSize: 13, lineHeight: 19 },
  section: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 0,
  },
  center: { alignItems: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  rowSub: { fontSize: 12, lineHeight: 17 },
  saving: {
    fontSize: 10,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 8,
  },
});
