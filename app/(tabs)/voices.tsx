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
        <View style={styles.brandRow}>
          <NamePlaque size="sm" />
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <ThemedText type="defaultSemiBold" style={[styles.section, { color: c.textSecondary }]}>
            Voices
          </ThemedText>
        </View>
        <View style={styles.subRow}>
          <View style={[styles.anonDot, { backgroundColor: c.tint }]} />
          <ThemedText style={[styles.subtle, { color: c.textSecondary }]}>
            anonymous by default · {voices.length} {voices.length === 1 ? 'voice' : 'voices'}
          </ThemedText>
        </View>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.filterPill,
                {
                  backgroundColor: active ? c.tint : c.subtle,
                  borderColor: active ? c.tint : c.border,
                },
              ]}>
              <ThemedText
                style={[
                  styles.filterPillText,
                  { color: active ? c.background : c.textSecondary },
                ]}>
                {f}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {showLoading ? (
          <ThemedText style={[styles.subtle, { textAlign: 'center', marginTop: 40, color: c.textSecondary }]}>
            Loading voices…
          </ThemedText>
        ) : ordered.length === 0 ? (
          <ThemedText style={[styles.subtle, { textAlign: 'center', marginTop: 40, color: c.textSecondary }]}>
            No voices yet — be the first to speak.
          </ThemedText>
        ) : (
          ordered.map((v) => (
            <VoiceCard key={v.id} voice={v} c={c} onVote={(d) => voteVoice(v.id, d)} />
          ))
        )}
        <View style={{ height: 96 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => router.push('/post-voice')}>
        <IconSymbol name="plus" size={18} color={c.background} />
        <ThemedText style={[styles.fabText, { color: c.background }]}>Speak</ThemedText>
      </Pressable>
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
  // voice.votes is already optimistically updated by voteVoice in the store —
  // don't add `vote` to it or the score double-counts on tap.
  const score = voice.votes;

  const press = (dir: 1 | -1) => () => {
    const next = vote === dir ? 0 : dir;
    // Apply only the delta between previous and next so the store stays consistent.
    const delta = (next - vote) as 1 | -1 | 0 | 2 | -2;
    if (delta !== 0) {
      // Two-step vote (e.g. up -> down) needs two ticks.
      if (delta === 2) {
        onVote(1);
        onVote(1);
      } else if (delta === -2) {
        onVote(-1);
        onVote(-1);
      } else {
        onVote(delta as 1 | -1);
      }
    }
    setVote(next);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.card, borderColor: c.border },
      ]}>
      <View style={styles.cardHead}>
        <View style={[styles.topicTag, { backgroundColor: c.subtle }]}>
          <ThemedText style={styles.topicEmoji}>{VOICE_TOPIC_EMOJI[voice.topic]}</ThemedText>
          <ThemedText style={[styles.topicText, { color: c.textSecondary }]}>
            {voice.topic}
          </ThemedText>
        </View>
        <ThemedText style={[styles.timeText, { color: c.textSecondary }]}>
          {voice.postedAgo || timeAgo(voice.postedAt)}
        </ThemedText>
      </View>

      <ThemedText style={[styles.body, { color: c.text }]}>{voice.body}</ThemedText>

      <View style={styles.authorRow}>
        <View
          style={[
            styles.authorBadge,
            { backgroundColor: c.subtle, borderColor: c.border },
          ]}>
          <ThemedText style={[styles.authorBadgeText, { color: c.textSecondary }]}>
            {voice.anonymous || !voice.posterName ? 'anonymous' : voice.posterName}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.cardFoot, { borderTopColor: c.border }]}>
        <View
          style={[
            styles.voteBox,
            { backgroundColor: c.subtle, borderColor: c.border },
          ]}>
          <Pressable
            onPress={press(1)}
            hitSlop={6}
            style={({ pressed }) => [styles.voteBtn, pressed && { opacity: 0.5 }]}>
            <IconSymbol
              name="chevron.up"
              size={18}
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
            hitSlop={6}
            style={({ pressed }) => [styles.voteBtn, pressed && { opacity: 0.5 }]}>
            <IconSymbol
              name="chevron.down"
              size={18}
              color={vote === -1 ? c.text : c.textSecondary}
            />
          </Pressable>
        </View>

        <View style={styles.commentBtn}>
          <IconSymbol name="bubble.right" size={15} color={c.textSecondary} />
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
    paddingBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  divider: {
    width: 1,
    height: 16,
  },
  section: {
    fontSize: 14,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  anonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subtle: {
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 12,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    paddingHorizontal: 20,
    gap: 10,
  },
  card: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topicTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  topicEmoji: {
    fontSize: 12,
  },
  topicText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  timeText: {
    fontSize: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
  },
  authorRow: {
    flexDirection: 'row',
  },
  authorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1,
  },
  authorBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  voteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    gap: 2,
  },
  voteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  voteCount: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'center',
  },
  commentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  commentCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
