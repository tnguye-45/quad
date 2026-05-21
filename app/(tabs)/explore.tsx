import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePosts, type Hangout } from '@/lib/posts-store';

export default function HangoutsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const { hangouts, rsvpHangout, loading, hydrated } = usePosts();
  const showLoading = !hydrated && loading && hangouts.length === 0;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <NamePlaque size="sm" />
        <ThemedText style={[styles.title, { color: c.text }]}>Hangouts</ThemedText>
        <ThemedText style={[styles.eyebrow, { color: c.textSecondary }]}>
          Find people doing things you&apos;d want to do
        </ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { borderTopColor: c.border }]}
        showsVerticalScrollIndicator={false}>
        {showLoading ? (
          <ThemedText style={[styles.empty, { color: c.textSecondary }]}>
            Loading…
          </ThemedText>
        ) : hangouts.length === 0 ? (
          <ThemedText style={[styles.empty, { color: c.textSecondary }]}>
            No hangouts yet — start one.
          </ThemedText>
        ) : (
          hangouts.map((h, i) => (
            <HangoutRow
              key={h.id}
              hangout={h}
              c={c}
              onJoin={() => rsvpHangout(h.id)}
              isFirst={i === 0}
            />
          ))
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => router.push('/start-hangout')}>
        <IconSymbol name="plus" size={16} color={c.background} />
        <ThemedText style={[styles.fabText, { color: c.background }]}>Start a hangout</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function HangoutRow({
  hangout,
  c,
  onJoin,
  isFirst,
}: {
  hangout: Hangout;
  c: (typeof Colors)['light'];
  onJoin: () => void;
  isFirst: boolean;
}) {
  const hostLabel =
    hangout.anonymous || !hangout.hostName ? 'anonymous host' : hangout.hostName;
  return (
    <View
      style={[
        styles.row,
        {
          borderTopColor: c.border,
          borderTopWidth: isFirst ? 0 : StyleSheet.hairlineWidth,
        },
      ]}>
      <View style={styles.rowTop}>
        <ThemedText style={[styles.vibeText, { color: c.textSecondary }]}>
          {hangout.vibe.toLowerCase()}
        </ThemedText>
        <ThemedText style={[styles.goingText, { color: c.textSecondary }]}>
          {hangout.going} {hangout.going === 1 ? 'going' : 'going'}
        </ThemedText>
      </View>

      <ThemedText style={[styles.rowTitle, { color: c.text }]}>
        {hangout.title}
      </ThemedText>

      <View style={styles.rowMeta}>
        <ThemedText style={[styles.rowMetaText, { color: c.textSecondary }]}>
          {hangout.when}
        </ThemedText>
        <ThemedText style={[styles.rowDot, { color: c.textSecondary }]}>·</ThemedText>
        <ThemedText style={[styles.rowMetaText, { color: c.textSecondary }]}>
          {hangout.where}
        </ThemedText>
      </View>

      <View style={styles.rowFoot}>
        <ThemedText style={[styles.hostText, { color: c.textSecondary }]}>
          {hostLabel}
        </ThemedText>
        <Pressable
          onPress={onJoin}
          hitSlop={6}
          style={({ pressed }) => [
            styles.joinBtn,
            {
              borderColor: c.text,
              opacity: pressed ? 0.5 : 1,
            },
          ]}>
          <ThemedText style={[styles.joinBtnText, { color: c.text }]}>
            I&apos;m in
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 0.2,
    marginTop: -6,
  },
  list: {
    paddingHorizontal: 20,
  },
  row: {
    paddingVertical: 20,
    gap: 8,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vibeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  goingText: {
    fontSize: 12,
  },
  rowTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  rowMetaText: {
    fontSize: 12,
  },
  rowDot: {
    fontSize: 12,
  },
  rowFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  hostText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  joinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  joinBtnText: {
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  empty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 60,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  fabText: {
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 0.1,
  },
});
