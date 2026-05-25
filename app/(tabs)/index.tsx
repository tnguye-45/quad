import { router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { ScreenHeader } from '@/components/screen-header';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GIG_CATEGORIES, usePosts, type Gig, type GigCategory } from '@/lib/posts-store';

type CatKey = 'All' | GigCategory;
const CATEGORIES: CatKey[] = ['All', ...GIG_CATEGORIES];

const CATEGORY_EMOJI: Record<CatKey, string> = {
  All: '✨',
  Tutoring: '📚',
  Moving: '📦',
  Rideshare: '🚗',
  Pets: '🐾',
  Creative: '🎨',
  Errands: '🛒',
};

export default function GigsScreen() {
  const [selected, setSelected] = useState<CatKey>('All');
  const [refreshing, setRefreshing] = useState(false);
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const { gigs, loading, hydrated, error, refresh } = usePosts();

  const visible = selected === 'All' ? gigs : gigs.filter((g) => g.category === selected);
  const showLoading = !hydrated && loading && gigs.length === 0;
  const isEmpty = hydrated && visible.length === 0;

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScreenHeader
        title="Gigs"
        subtitle={`notre dame · ${gigs.length} open`}
        rightActions={[
          {
            icon: 'map',
            label: 'Open map',
            onPress: () => router.push('/map' as never),
          },
          {
            icon: 'magnifyingglass',
            label: 'Search',
            onPress: () => {},
          },
        ]}
      />

      <FlatList
        data={visible}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => <GigRow gig={item} c={c} />}
        ListHeaderComponent={
          <>
            {error && !showLoading ? (
              <RetryRow message="Couldn't load gigs." onRetry={refresh} c={c} />
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storyRow}>
              {CATEGORIES.map((cat) => {
                const active = cat === selected;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setSelected(cat)}
                    hitSlop={4}
                    style={styles.story}>
                    <View
                      style={[
                        styles.storyBubble,
                        {
                          borderColor: active ? c.accent : c.border,
                          backgroundColor: active ? c.surface : c.background,
                          borderWidth: active ? 2.5 : 1.5,
                        },
                      ]}>
                      <ThemedText style={styles.storyEmoji}>
                        {CATEGORY_EMOJI[cat]}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={[
                        styles.storyLabel,
                        { color: active ? c.text : c.textSecondary },
                        active && styles.storyLabelActive,
                      ]}
                      type="mono">
                      {cat.toLowerCase()}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
          </>
        }
        ListEmptyComponent={
          showLoading ? (
            <SkeletonList count={4} avatarSize={44} />
          ) : isEmpty ? (
            <EmptyState
              c={c}
              glyph="briefcase"
              title="No gigs yet"
              body={
                selected === 'All'
                  ? 'Be the first to post a gig — moving help, tutoring, rides…'
                  : `No ${selected.toLowerCase()} gigs in the feed yet.`
              }
              ctaLabel="Post a gig"
              onPress={() => router.push('/post-gig' as never)}
            />
          ) : null
        }
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.textMuted}
          />
        }
        ListFooterComponent={<View style={{ height: 120 }} />}
      />
    </ThemedView>
  );
}

function GigRow({ gig, c }: { gig: Gig; c: (typeof Colors)['light'] }) {
  const poster = gig.anonymous || !gig.posterName ? 'anonymous' : gig.posterName;
  const initials = gig.anonymous || !gig.posterInitials ? '?' : gig.posterInitials;
  const avatarUri = gig.anonymous ? null : gig.posterAvatarUrl;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: c.border, opacity: pressed ? 0.5 : 1 },
      ]}
      onPress={() => router.push({ pathname: '/gig/[id]', params: { id: gig.id } })}>
      <Avatar uri={avatarUri} initials={initials} size={44} textSize={13} />

      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <ThemedText style={[styles.rowCategory, { color: c.textMuted }]} type="mono">
            {gig.category.toLowerCase()} · {gig.postedAgo}
          </ThemedText>
        </View>

        <ThemedText style={[styles.rowTitle, { color: c.text }]} numberOfLines={2}>
          {gig.title}
        </ThemedText>

        <View style={styles.rowFoot}>
          <View style={styles.rowFootLeft}>
            <IconSymbol name="mappin" size={11} color={c.textMuted} />
            <ThemedText style={[styles.rowFootText, { color: c.textMuted }]} type="mono">
              {gig.where.toLowerCase()}
            </ThemedText>
            <ThemedText style={[styles.rowFootText, { color: c.textMuted }]} type="mono">
              · {poster.toLowerCase()}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={[styles.payoutTag, { borderColor: c.borderStrong }]}>
        <ThemedText style={[styles.payoutText, { color: c.text }]}>{gig.payout}</ThemedText>
      </View>
    </Pressable>
  );
}

function EmptyState({
  c,
  glyph,
  title,
  body,
  ctaLabel,
  onPress,
}: {
  c: (typeof Colors)['light'];
  glyph: Parameters<typeof IconSymbol>[0]['name'];
  title: string;
  body: string;
  ctaLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.emptyBlock}>
      <IconSymbol name={glyph} size={36} color={c.textMuted} />
      <ThemedText style={[styles.emptyTitle, { color: c.text }]}>{title}</ThemedText>
      <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
        {body}
      </ThemedText>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.emptyCta,
          { backgroundColor: c.tint, opacity: pressed ? 0.8 : 1 },
        ]}>
        <ThemedText style={[styles.emptyCtaText, { color: c.background }]}>
          {ctaLabel}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function RetryRow({
  message,
  onRetry,
  c,
}: {
  message: string;
  onRetry: () => void | Promise<void>;
  c: (typeof Colors)['light'];
}) {
  return (
    <Pressable
      onPress={onRetry}
      style={({ pressed }) => [
        styles.retryRow,
        { borderColor: c.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <ThemedText style={[styles.retryText, { color: c.danger }]} type="mono">
        {message} Tap to retry.
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    paddingBottom: 20,
  },
  storyRow: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 18,
    gap: 16,
  },
  story: {
    alignItems: 'center',
    gap: 6,
    width: 64,
  },
  storyBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyEmoji: {
    fontSize: 22,
  },
  storyLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  storyLabelActive: {
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 0,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  rowMain: {
    flex: 1,
    gap: 4,
    paddingTop: 2,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowCategory: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  rowFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 2,
  },
  rowFootLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    flexWrap: 'wrap',
  },
  rowFootText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  payoutTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'center',
  },
  payoutText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  emptyBlock: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginTop: 4,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: '#5D6B85',
  },
  emptyCta: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 8,
  },
  emptyCtaText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  retryRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  retryText: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'lowercase',
  },
});
