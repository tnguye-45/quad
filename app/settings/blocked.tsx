import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { confirmAsync } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';

type BlockedRow = {
  blocked_id: string;
  created_at: string;
  blocked: {
    id: string;
    display_name: string | null;
    initials: string | null;
    avatar_url: string | null;
  } | null;
};

export default function BlockedUsersScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, isDev } = useAuth();
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (isDev || !session) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('user_blocks')
      .select(
        'blocked_id, created_at, blocked:profiles!user_blocks_blocked_id_fkey(id, display_name, initials, avatar_url)',
      )
      .eq('blocker_id', session.user.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[blocked] load failed', error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as BlockedRow[]);
    }
    setLoading(false);
  }, [session, isDev]);

  useEffect(() => {
    load();
  }, [load]);

  async function unblock(blockedId: string, name: string | null) {
    if (!session) return;
    const confirmed = await confirmAsync({
      title: `Unblock ${name ?? 'this user'}?`,
      message: 'Their posts will show up again. You can re-block them at any time.',
      confirmLabel: 'Unblock',
    });
    if (!confirmed) return;
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', session.user.id)
      .eq('blocked_id', blockedId);
    if (error) {
      await confirmAsync({ title: 'Unblock failed', message: error.message, confirmLabel: 'OK' });
      return;
    }
    setRows((prev) => prev.filter((r) => r.blocked_id !== blockedId));
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
          <ThemedText style={[styles.title, { color: c.text }]}>Blocked</ThemedText>
          <ThemedText style={[styles.subtitle, { color: c.textSecondary }]}>
            People you&apos;ve blocked won&apos;t see your posts and you won&apos;t see theirs.
          </ThemedText>
        </View>

        <View style={[styles.section, { borderTopColor: c.border }]}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={c.text} />
            </View>
          ) : rows.length === 0 ? (
            <ThemedText style={[styles.empty, { color: c.textSecondary }]}>
              You haven&apos;t blocked anyone.
            </ThemedText>
          ) : (
            rows.map((r) => (
              <View
                key={r.blocked_id}
                style={[styles.row, { borderBottomColor: c.border }]}>
                <Avatar
                  uri={r.blocked?.avatar_url ?? null}
                  initials={r.blocked?.initials ?? null}
                  size={40}
                  textSize={13}
                />
                <View style={styles.rowText}>
                  <ThemedText style={[styles.name, { color: c.text }]} numberOfLines={1}>
                    {r.blocked?.display_name ?? 'Deleted user'}
                  </ThemedText>
                  <ThemedText
                    style={[styles.meta, { color: c.textMuted }]}
                    type="mono">
                    blocked {formatRelative(r.created_at)}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() =>
                    unblock(r.blocked_id, r.blocked?.display_name ?? null)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Unblock ${r.blocked?.display_name ?? 'this user'}`}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.unblockBtn,
                    { borderColor: c.borderStrong, opacity: pressed ? 0.5 : 1 },
                  ]}>
                  <ThemedText
                    style={[styles.unblockText, { color: c.text }]}
                    type="mono">
                    unblock
                  </ThemedText>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
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
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 0,
  },
  center: { alignItems: 'center', paddingVertical: 24 },
  empty: { fontSize: 14, paddingVertical: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  meta: { fontSize: 10, letterSpacing: 0.4 },
  unblockBtn: {
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  unblockText: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
});
