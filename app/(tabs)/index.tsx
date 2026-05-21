import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CampusMap } from '@/components/campus-map';
import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { GIG_CATEGORIES, usePosts, type Gig } from '@/lib/posts-store';

const CATEGORIES = ['All', ...GIG_CATEGORIES] as const;

export default function GigsScreen() {
  const [selected, setSelected] = useState<(typeof CATEGORIES)[number]>('All');
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const { profile } = useAuth();
  const { gigs, loading, hydrated } = usePosts();

  const visible = selected === 'All' ? gigs : gigs.filter((g) => g.category === selected);
  const showLoading = !hydrated && loading && gigs.length === 0;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <NamePlaque size="md" />
          <ThemedText style={[styles.eyebrow, { color: c.textSecondary }]}>
            Notre Dame · {gigs.length} open
          </ThemedText>
        </View>
        <Pressable
          onPress={() => router.push('/modal')}
          accessibilityLabel="Open your profile"
          style={({ pressed }) => [
            styles.avatar,
            {
              borderColor: c.border,
              opacity: pressed ? 0.5 : 1,
            },
          ]}>
          <ThemedText style={[styles.avatarText, { color: c.text }]}>
            {profile?.initials || '?'}
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <CampusMap />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}>
          {CATEGORIES.map((cat) => {
            const active = cat === selected;
            return (
              <Pressable key={cat} onPress={() => setSelected(cat)} hitSlop={6} style={styles.filterChip}>
                <ThemedText
                  style={[
                    styles.filterText,
                    { color: active ? c.text : c.textSecondary },
                    active && styles.filterTextActive,
                  ]}>
                  {cat.toLowerCase()}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.list, { borderTopColor: c.border }]}>
          {showLoading ? (
            <ThemedText
              style={[styles.empty, { color: c.textSecondary }]}>
              Loading…
            </ThemedText>
          ) : visible.length === 0 ? (
            <ThemedText style={[styles.empty, { color: c.textSecondary }]}>
              {gigs.length === 0
                ? 'No gigs posted yet — be the first.'
                : 'No gigs in this category yet.'}
            </ThemedText>
          ) : (
            visible.map((gig, i) => (
              <GigRow key={gig.id} gig={gig} c={c} isFirst={i === 0} />
            ))
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => router.push('/post-gig')}>
        <IconSymbol name="plus" size={16} color={c.background} />
        <ThemedText style={[styles.fabText, { color: c.background }]}>Post</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function GigRow({ gig, c, isFirst }: { gig: Gig; c: (typeof Colors)['light']; isFirst: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        {
          borderTopColor: c.border,
          borderTopWidth: isFirst ? 0 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.5 : 1,
        },
      ]}
      onPress={() => router.push({ pathname: '/gig/[id]', params: { id: gig.id } })}>
      <View style={styles.rowTop}>
        <ThemedText style={[styles.rowCategory, { color: c.textSecondary }]}>
          {gig.category.toLowerCase()}
        </ThemedText>
        <ThemedText style={[styles.rowPayout, { color: c.text }]}>
          {gig.payout}
        </ThemedText>
      </View>

      <ThemedText style={[styles.rowTitle, { color: c.text }]}>
        {gig.title}
      </ThemedText>

      <View style={styles.rowMeta}>
        <ThemedText style={[styles.rowMetaText, { color: c.textSecondary }]}>
          {gig.where}
        </ThemedText>
        <ThemedText style={[styles.rowDot, { color: c.textSecondary }]}>·</ThemedText>
        <ThemedText style={[styles.rowMetaText, { color: c.textSecondary }]}>
          {gig.anonymous || !gig.posterName ? 'anonymous' : gig.posterName}
        </ThemedText>
        <ThemedText style={[styles.rowDot, { color: c.textSecondary }]}>·</ThemedText>
        <ThemedText style={[styles.rowMetaText, { color: c.textSecondary }]}>
          {gig.postedAgo}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  brandBlock: {
    gap: 8,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scroll: {
    paddingBottom: 20,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 18,
    paddingBottom: 8,
    paddingTop: 4,
  },
  filterChip: {
    paddingVertical: 6,
  },
  filterText: {
    fontSize: 13,
    letterSpacing: 0.1,
  },
  filterTextActive: {
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  row: {
    paddingVertical: 18,
    gap: 8,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  rowCategory: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  rowPayout: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
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
