import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CommentThread } from '@/components/comment-thread';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePosts, VOICE_TOPIC_EMOJI } from '@/lib/posts-store';

export default function VoiceDetailScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { id } = useLocalSearchParams<{ id: string }>();
  const { voices, voteVoice } = usePosts();
  const voice = voices.find((v) => v.id === id);
  const [vote, setVote] = useState<0 | 1 | -1>(0);

  if (!voice) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={styles.emptyBlock}>
          <ThemedText style={[styles.emptyEyebrow, { color: c.textMuted }]} type="mono">
            404 · gone
          </ThemedText>
          <ThemedText style={[styles.emptyHeading, { color: c.text }]}>
            Voice not found
          </ThemedText>
          <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
            It may have been deleted, or the link is stale.
          </ThemedText>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.closeBtn,
              { borderColor: c.border, opacity: pressed ? 0.5 : 1 },
            ]}>
            <ThemedText style={[styles.closeText, { color: c.text }]} type="mono">
              close
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const score = voice.votes;
  const press = (dir: 1 | -1) => () => {
    const next = vote === dir ? 0 : dir;
    const delta = (next - vote) as 1 | -1 | 0 | 2 | -2;
    if (delta === 0) return;
    if (delta === 2) {
      voteVoice(voice.id, 1);
      voteVoice(voice.id, 1);
    } else if (delta === -2) {
      voteVoice(voice.id, -1);
      voteVoice(voice.id, -1);
    } else {
      voteVoice(voice.id, delta as 1 | -1);
    }
    setVote(next);
  };
  const scoreColor =
    vote === 1 ? c.accent : vote === -1 ? c.textSecondary : c.textSecondary;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <ThemedText style={[styles.eyebrow, { color: c.accent }]} type="mono">
            voice · {voice.topic.toLowerCase()}
          </ThemedText>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
            <ThemedText style={[styles.closeText, { color: c.textMuted }]} type="mono">
              close
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.topicRow}>
            <ThemedText style={styles.topicEmoji}>{VOICE_TOPIC_EMOJI[voice.topic]}</ThemedText>
            <ThemedText style={[styles.timeText, { color: c.textMuted }]} type="mono">
              posted {voice.postedAgo}
            </ThemedText>
          </View>
          <ThemedText style={[styles.body, { color: c.text }]}>{voice.body}</ThemedText>
        </View>

        <View style={[styles.voteBlock, { borderTopColor: c.border, borderBottomColor: c.border }]}>
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
              size={20}
              color={vote === 1 ? c.accent : c.textMuted}
            />
          </Pressable>
          <ThemedText style={[styles.voteScore, { color: scoreColor }]} type="mono">
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
              size={20}
              color={vote === -1 ? c.text : c.textMuted}
            />
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={styles.metaPill}>
            <IconSymbol name="bubble.right" size={14} color={c.textMuted} />
            <ThemedText style={[styles.metaPillText, { color: c.textMuted }]} type="mono">
              {voice.comments} {voice.comments === 1 ? 'comment' : 'comments'}
            </ThemedText>
          </View>
        </View>

        <CommentThread targetType="voice" targetId={voice.id} defaultAnonymous={true} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 20,
    paddingBottom: 48,
    gap: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  closeText: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 12,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topicEmoji: { fontSize: 22 },
  timeText: {
    fontSize: 11,
    letterSpacing: 0.4,
  },
  body: {
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  voteBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  voteBtn: {
    width: 36,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteScore: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
    minWidth: 36,
    textAlign: 'center',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaPillText: {
    fontSize: 11,
    letterSpacing: 0.4,
  },
  emptyBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyEyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  emptyHeading: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  emptyBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  closeBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
