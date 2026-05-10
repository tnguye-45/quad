import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Topic = 'Dining' | 'Dorm' | 'Class' | 'Campus' | 'Sports' | 'Random';

type Voice = {
  id: string;
  body: string;
  topic: Topic;
  postedAgo: string;
  votes: number;
  comments: number;
};

const FILTERS = ['Hot', 'New', 'Today'] as const;

const MOCK_VOICES: Voice[] = [
  {
    id: '1',
    body: 'south dining hall is straight up unhinged today. why is the line wrapping outside.',
    topic: 'Dining',
    postedAgo: '12m',
    votes: 142,
    comments: 23,
  },
  {
    id: '2',
    body: "to whoever left their hydroflask in DeBartolo 138, i'll bring it tomorrow at 9am. don't leak my information",
    topic: 'Class',
    postedAgo: '34m',
    votes: 89,
    comments: 5,
  },
  {
    id: '3',
    body: 'petition to make the leprechaun mascot scream less during football games',
    topic: 'Sports',
    postedAgo: '1h',
    votes: -12,
    comments: 47,
  },
  {
    id: '4',
    body: 'got asked out at the grotto today and i genuinely do not know how to feel',
    topic: 'Random',
    postedAgo: '2h',
    votes: 318,
    comments: 56,
  },
  {
    id: '5',
    body: 'Hesburgh 24-hour room is the realest place on campus at 3am. iykyk',
    topic: 'Class',
    postedAgo: '3h',
    votes: 204,
    comments: 12,
  },
  {
    id: '6',
    body: 'why does ND charge $9 for chicken tenders in the basket. it is gluttony pricing',
    topic: 'Dining',
    postedAgo: '4h',
    votes: 76,
    comments: 8,
  },
  {
    id: '7',
    body: 'first time at midnight mass at the basilica and wow. cried a little not gonna lie',
    topic: 'Campus',
    postedAgo: '5h',
    votes: 421,
    comments: 19,
  },
  {
    id: '8',
    body: 'if i see one more person ride a OneWheel through the quad during peak class change i will scream',
    topic: 'Campus',
    postedAgo: '6h',
    votes: 167,
    comments: 32,
  },
  {
    id: '9',
    body: "Dillon Hall is freezing again and it's NOVEMBER. fix the heat",
    topic: 'Dorm',
    postedAgo: '7h',
    votes: 95,
    comments: 14,
  },
  {
    id: '10',
    body: 'dome looked unreal tonight 😍',
    topic: 'Campus',
    postedAgo: '8h',
    votes: 53,
    comments: 3,
  },
  {
    id: '11',
    body: 'unpopular opinion: the food at NDH > SDH and i will die on this hill',
    topic: 'Dining',
    postedAgo: '11h',
    votes: -4,
    comments: 89,
  },
];

const TOPIC_EMOJI: Record<Topic, string> = {
  Dining: '🍕',
  Dorm: '🛏️',
  Class: '📚',
  Campus: '🏛️',
  Sports: '🏈',
  Random: '🎲',
};

export default function VoicesScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Hot');

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.brand}>
          Voices
        </ThemedText>
        <View style={styles.subRow}>
          <View style={[styles.anonDot, { backgroundColor: c.tint }]} />
          <ThemedText style={[styles.subtle, { color: c.textSecondary }]}>
            anonymous · 247 students online
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
        {MOCK_VOICES.map((v) => (
          <VoiceCard key={v.id} voice={v} c={c} />
        ))}
        <View style={{ height: 96 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => {}}>
        <IconSymbol name="plus" size={18} color={c.background} />
        <ThemedText style={[styles.fabText, { color: c.background }]}>Speak</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function VoiceCard({ voice, c }: { voice: Voice; c: (typeof Colors)['light'] }) {
  const [vote, setVote] = useState<0 | 1 | -1>(0);
  const score = voice.votes + vote;
  const positive = score >= 0;

  const press = (dir: 1 | -1) => () => {
    setVote(vote === dir ? 0 : dir);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.card, borderColor: c.border },
      ]}>
      <View style={styles.cardHead}>
        <View style={[styles.topicTag, { backgroundColor: c.subtle }]}>
          <ThemedText style={styles.topicEmoji}>{TOPIC_EMOJI[voice.topic]}</ThemedText>
          <ThemedText style={[styles.topicText, { color: c.textSecondary }]}>
            {voice.topic}
          </ThemedText>
        </View>
        <ThemedText style={[styles.timeText, { color: c.textSecondary }]}>
          {voice.postedAgo}
        </ThemedText>
      </View>

      <ThemedText style={[styles.body, { color: c.text }]}>{voice.body}</ThemedText>

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
              color={vote === 1 ? '#16a34a' : c.textSecondary}
            />
          </Pressable>
          <ThemedText
            style={[
              styles.voteCount,
              {
                color:
                  vote === 1 ? '#16a34a' : vote === -1 ? '#dc2626' : positive ? c.text : '#dc2626',
              },
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
              color={vote === -1 ? '#dc2626' : c.textSecondary}
            />
          </Pressable>
        </View>

        <Pressable style={styles.commentBtn} hitSlop={6}>
          <IconSymbol name="bubble.right" size={15} color={c.textSecondary} />
          <ThemedText style={[styles.commentCount, { color: c.textSecondary }]}>
            {voice.comments}
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
    paddingBottom: 12,
  },
  brand: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
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
    paddingVertical: 7,
    borderRadius: 999,
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
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
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
    borderRadius: 999,
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
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
