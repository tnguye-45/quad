import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
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

/** Search runs server-side, so pushing every keystroke down would be a
 *  request per character. Long enough to coalesce typing, short enough that
 *  the list doesn't feel stuck. */
const SEARCH_DEBOUNCE_MS = 250;

export default function GigsScreen() {
  const [selected, setSelected] = useState<CatKey>('All');
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const {
    gigs,
    loading,
    hydrated,
    error,
    refresh,
    loadMore,
    hasMore,
    gigFeed,
    setGigFilter,
    loadMoreGigFeed,
  } = usePosts();

  const trimmedQuery = query.trim();
  const category = selected === 'All' ? null : selected;
  // Category and search are applied inside the gigs_feed query (posts-store)
  // rather than over the loaded pages, so scrolling keeps paginating while a
  // filter is on and an empty result really does mean the server has nothing.
  useEffect(() => {
    const t = setTimeout(
      () => setGigFilter({ category, query: trimmedQuery }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [category, trimmedQuery, setGigFilter]);

  // "Is a filter on?" is answered by the local controls, not the store: the
  // store trails them by the debounce, and reading it here would flash the
  // unfiltered list for a beat after a chip tap.
  const filtered = category !== null || trimmedQuery.length > 0;
  const settled =
    gigFeed.filter.category === category && gigFeed.filter.query === trimmedQuery;
  const pending = filtered && (!settled || gigFeed.loading);
  const visible = filtered ? (gigFeed.rows ?? []) : gigs;
  const listError = filtered ? gigFeed.error : error;

  // Stale-while-revalidate: the skeleton only replaces the list when there's
  // nothing under it, so refining a search doesn't strobe on every keystroke.
  const showLoading = filtered
    ? pending && gigFeed.rows === null
    : !hydrated && loading && gigs.length === 0;
  // `hydrated` flips true even when the fetch threw, so without the error check
  // a failed load renders "No gigs yet" directly under the retry row.
  const isEmpty =
    !showLoading &&
    !listError &&
    visible.length === 0 &&
    (filtered ? !pending : hydrated);

  function toggleSearch() {
    setSearching((on) => {
      if (on) setQuery('');
      return !on;
    });
  }

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
        // Not "N open": gigs_feed carries accepted/done/cancelled rows too,
        // and this only ever counted the pages loaded so far. Count what is
        // actually on screen and claim nothing about status.
        subtitle={`notre dame · ${visible.length} gigs`}
        rightActions={[
          {
            icon: 'map',
            label: 'Open map',
            onPress: () => router.push('/map' as never),
          },
          {
            icon: 'magnifyingglass',
            label: searching ? 'Close search' : 'Search gigs',
            onPress: toggleSearch,
          },
        ]}
      />

      {searching ? (
        <View style={[styles.searchRow, { borderBottomColor: c.border }]}>
          <IconSymbol name="magnifyingglass" size={16} color={c.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="search gigs…"
            placeholderTextColor={c.textMuted}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search gigs"
            style={[styles.searchInput, { color: c.text }]}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <IconSymbol name="xmark" size={14} color={c.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => <GigRow gig={item} c={c} />}
        ListHeaderComponent={
          <>
            {listError && !showLoading ? (
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
                    accessibilityRole="button"
                    accessibilityLabel={`Filter by ${cat}`}
                    accessibilityState={{ selected: active }}
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
            trimmedQuery ? (
              <EmptyState
                c={c}
                glyph="magnifyingglass"
                title="No matches"
                body={`Nothing matching “${query.trim()}”. Try a different word.`}
                ctaLabel="Clear search"
                onPress={() => setQuery('')}
              />
            ) : (
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
            )
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
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          // Pagination follows the filter now. It used to be skipped entirely
          // whenever a category or search was active, so the list ended at
          // whatever page 1 happened to contain.
          if (filtered) {
            if (gigFeed.hasMore) void loadMoreGigFeed();
          } else if (hasMore.gigs) {
            void loadMore('gigs');
          }
        }}
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
      onPress={() => router.push({ pathname: '/gig/[id]', params: { id: gig.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Gig: ${gig.title}`}>
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
        accessibilityRole="button"
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
      accessibilityRole="button"
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
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
