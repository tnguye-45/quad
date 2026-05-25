import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePosts, VOICE_TOPIC_EMOJI, type Voice } from '@/lib/posts-store';

const FILTERS = ['Hot', 'New', 'Today'] as const;

export default function VoicesScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Hot');
  const [refreshing, setRefreshing] = useState(false);
  const { voices, voteVoice, loading, hydrated, error, refresh, loadMore, hasMore } = usePosts();
  const showLoading = !hydrated && loading && voices.length === 0;

  const ordered = useMemo(() => {
    const list = [...voices];
    if (filter === 'New') {
      list.sort((a, b) => b.postedAt - a.postedAt);
    } else if (filter === 'Today') {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      return list.filter((v) => v.postedAt >= cutoff).sort((a, b) => b.votes - a.votes);
    } else {
      list.sort((a, b) => b.votes - a.votes);
    }
    return list;
  }, [voices, filter]);

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
      <ScreenHeader title="Voices" subtitle={`anonymous · ${voices.length} ${voices.length === 1 ? 'voice' : 'voices'}`} />

      <View style={[styles.filterRow, { borderBottomColor: c.border }]}>
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable key={f} onPress={() => setFilter(f)} hitSlop={6} style={styles.filterChip}>
              <ThemedText
                style={[
                  styles.filterText,
                  { color: active ? c.text : c.textMuted },
                  active && styles.filterTextActive,
                ]}>
                {f.toLowerCase()}
              </ThemedText>
              {active && <View style={[styles.filterUnderline, { backgroundColor: c.accent }]} />}
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={ordered}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => (
          <VoiceCard
            voice={item}
            c={c}
            onVote={(d) => voteVoice(item.id, d)}
          />
        )}
        ListHeaderComponent={
          error && !showLoading ? (
            <Pressable
              onPress={refresh}
              style={({ pressed }) => [
                styles.retryRow,
                { borderColor: c.border, opacity: pressed ? 0.6 : 1 },
              ]}>
              <ThemedText style={[styles.retryText, { color: c.danger }]} type="mono">
                Couldn&apos;t load voices. Tap to retry.
              </ThemedText>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          showLoading ? (
            <SkeletonList count={4} avatarSize={36} />
          ) : (
            <View style={styles.emptyBlock}>
              <IconSymbol name="text.bubble" size={36} color={c.textMuted} />
              <ThemedText style={[styles.emptyTitle, { color: c.text }]}>
                No voices yet
              </ThemedText>
              <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
                Voices are anonymous. Drop the first hot take.
              </ThemedText>
              <Pressable
                onPress={() => router.push('/post-voice' as never)}
                style={({ pressed }) => [
                  styles.emptyCta,
                  { backgroundColor: c.tint, opacity: pressed ? 0.8 : 1 },
                ]}>
                <ThemedText style={[styles.emptyCtaText, { color: c.background }]}>
                  Post a voice
                </ThemedText>
              </Pressable>
            </View>
          )
        }
        contentContainerStyle={styles.list}
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
          // Filter "Today" trims server pages, so pagination only kicks in
          // on Hot / New where we still want to chase the cursor.
          if (filter !== 'Today' && hasMore.voices) {
            void loadMore('voices');
          }
        }}
        ListFooterComponent={<View style={{ height: 120 }} />}
      />
    </ThemedView>
  );
}

function VoiceCard({
  voice,
  c,
  onVote,
}: {
  voice: Voice;
  c: (typeof Colors)['light'];
  onVote: (delta: 1 | -1 | 0) => void;
}) {
  const [vote, setVote] = useState<0 | 1 | -1>(0);
  const score = voice.votes;

  const press = (dir: 1 | -1) => () => {
    const next = vote === dir ? 0 : dir;
    const delta = (next - vote) as 1 | -1 | 0 | 2 | -2;
    if (delta === 0) return;
    if (delta === 2) {
      onVote(1);
      onVote(1);
    } else if (delta === -2) {
      onVote(-1);
      onVote(-1);
    } else {
      onVote(delta as 1 | -1);
    }
    setVote(next);
  };

  const scoreColor =
    vote === 1 ? c.accent : vote === -1 ? c.textSecondary : c.textSecondary;

  return (
    <View style={[styles.card, { borderBottomColor: c.border }]}>
      <View style={styles.voteRail}>
        <Pressable
          onPress={press(1)}
          hitSlop={10}
          style={({ pressed }) => [
            styles.voteBtn,
            vote === 1 && { backgroundColor: c.subtle },
            { opacity: pressed ? 0.5 : 1 },
          ]}>
          <IconSymbol
            name="chevron.up"
            size={18}
            color={vote === 1 ? c.accent : c.textMuted}
          />
        </Pressable>
        <ThemedText
          style={[styles.voteScore, { color: scoreColor }]}
          type="mono">
          {score > 0 ? `+${score}` : score === 0 ? '0' : score}
        </ThemedText>
        <Pressable
          onPress={press(-1)}
          hitSlop={10}
          style={({ pressed }) => [
            styles.voteBtn,
            vote === -1 && { backgroundColor: c.subtle },
            { opacity: pressed ? 0.5 : 1 },
          ]}>
          <IconSymbol
            name="chevron.down"
            size={18}
            color={vote === -1 ? c.text : c.textMuted}
          />
        </Pressable>
      </View>

      <View style={styles.cardMain}>
        <View style={styles.cardTop}>
          <View style={styles.topicGroup}>
            <ThemedText style={styles.topicEmoji}>{VOICE_TOPIC_EMOJI[voice.topic]}</ThemedText>
            <ThemedText style={[styles.topicText, { color: c.textSecondary }]} type="mono">
              {voice.topic.toLowerCase()}
            </ThemedText>
          </View>
          <ThemedText style={[styles.timeText, { color: c.textMuted }]} type="mono">
            {voice.postedAgo || timeAgo(voice.postedAt)}
          </ThemedText>
        </View>

        <ThemedText style={[styles.body, { color: c.text }]}>{voice.body}</ThemedText>

        <View style={styles.cardFoot}>
          <View style={styles.footAction}>
            <IconSymbol name="bubble.right" size={14} color={c.textMuted} />
            <ThemedText style={[styles.footActionText, { color: c.textMuted }]} type="mono">
              {voice.comments}
            </ThemedText>
          </View>
          <View style={styles.footAction}>
            <IconSymbol name="square.and.arrow.up" size={14} color={c.textMuted} />
            <ThemedText style={[styles.footActionText, { color: c.textMuted }]} type="mono">
              share
            </ThemedText>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable hitSlop={6} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
            <IconSymbol name="ellipsis" size={16} color={c.textMuted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function timeAgo(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'just now';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterChip: {
    paddingVertical: 12,
    position: 'relative',
  },
  filterText: {
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  filterTextActive: {
    fontWeight: '700',
  },
  filterUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -StyleSheet.hairlineWidth,
    height: 2,
  },
  list: {
    paddingHorizontal: 0,
  },
  card: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  voteRail: {
    width: 36,
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  voteBtn: {
    width: 32,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteScore: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cardMain: {
    flex: 1,
    gap: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topicGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topicEmoji: {
    fontSize: 13,
  },
  topicText: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  timeText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingTop: 2,
  },
  footAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footActionText: {
    fontSize: 11,
    letterSpacing: 0.4,
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
