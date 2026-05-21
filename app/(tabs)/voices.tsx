import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
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
  const { voices, voteVoice, loading, hydrated } = usePosts();
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

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <NamePlaque size="sm" />
        <ThemedText style={[styles.title, { color: c.text }]}>Voices</ThemedText>
        <ThemedText style={[styles.eyebrow, { color: c.textSecondary }]}>
          anonymous · {voices.length} {voices.length === 1 ? 'voice' : 'voices'}
        </ThemedText>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable key={f} onPress={() => setFilter(f)} hitSlop={6} style={styles.filterChip}>
              <ThemedText
                style={[
                  styles.filterText,
                  { color: active ? c.text : c.textSecondary },
                  active && styles.filterTextActive,
                ]}>
                {f.toLowerCase()}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { borderTopColor: c.border }]}
        showsVerticalScrollIndicator={false}>
        {showLoading ? (
          <ThemedText style={[styles.empty, { color: c.textSecondary }]}>
            Loading…
          </ThemedText>
        ) : ordered.length === 0 ? (
          <ThemedText style={[styles.empty, { color: c.textSecondary }]}>
            No voices yet — be the first to speak.
          </ThemedText>
        ) : (
          ordered.map((v, i) => (
            <VoiceRow
              key={v.id}
              voice={v}
              c={c}
              onVote={(d) => voteVoice(v.id, d)}
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
        onPress={() => router.push('/post-voice')}>
        <IconSymbol name="plus" size={16} color={c.background} />
        <ThemedText style={[styles.fabText, { color: c.background }]}>Speak</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function VoiceRow({
  voice,
  c,
  onVote,
  isFirst,
}: {
  voice: Voice;
  c: (typeof Colors)['light'];
  onVote: (delta: 1 | -1 | 0) => void;
  isFirst: boolean;
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
        <View style={styles.topicGroup}>
          <ThemedText style={styles.topicEmoji}>{VOICE_TOPIC_EMOJI[voice.topic]}</ThemedText>
          <ThemedText style={[styles.topicText, { color: c.textSecondary }]}>
            {voice.topic.toLowerCase()}
          </ThemedText>
        </View>
        <ThemedText style={[styles.timeText, { color: c.textSecondary }]}>
          {voice.postedAgo || timeAgo(voice.postedAt)}
        </ThemedText>
      </View>

      <ThemedText style={[styles.body, { color: c.text }]}>{voice.body}</ThemedText>

      <View style={styles.rowFoot}>
        <View style={styles.voteGroup}>
          <Pressable
            onPress={press(1)}
            hitSlop={8}
            style={({ pressed }) => [styles.voteBtn, pressed && { opacity: 0.4 }]}>
            <IconSymbol
              name="chevron.up"
              size={16}
              color={vote === 1 ? c.text : c.textSecondary}
            />
          </Pressable>
          <ThemedText
            style={[
              styles.voteCount,
              { color: vote !== 0 ? c.text : c.textSecondary },
            ]}>
            {score > 0 ? `+${score}` : score}
          </ThemedText>
          <Pressable
            onPress={press(-1)}
            hitSlop={8}
            style={({ pressed }) => [styles.voteBtn, pressed && { opacity: 0.4 }]}>
            <IconSymbol
              name="chevron.down"
              size={16}
              color={vote === -1 ? c.text : c.textSecondary}
            />
          </Pressable>
        </View>

        <View style={styles.commentGroup}>
          <IconSymbol name="bubble.right" size={13} color={c.textSecondary} />
          <ThemedText style={[styles.commentCount, { color: c.textSecondary }]}>
            {voice.comments}
          </ThemedText>
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 18,
    paddingBottom: 8,
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
    marginTop: 4,
  },
  row: {
    paddingVertical: 20,
    gap: 12,
  },
  rowTop: {
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
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  timeText: {
    fontSize: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  rowFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  voteGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  voteBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  voteCount: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'center',
  },
  commentGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  commentCount: {
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
