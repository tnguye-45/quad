import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { useConversations, type ConversationSummary } from '@/lib/messaging';

type MockConvo = {
  id: string;
  name: string;
  initials: string;
  context: string;
  preview: string;
  time: string;
  unread?: boolean;
};

const MOCK_CONVOS: MockConvo[] = [
  { id: 'marcus', name: 'Marcus K.', initials: 'MK', context: 'Help moving a couch · $40', preview: 'Sounds good! See you at 3', time: '12m', unread: true },
  { id: 'priya', name: 'Priya S.', initials: 'PS', context: 'SBN airport ride · $15', preview: 'I can grab you from Dillon', time: '1h', unread: true },
  { id: 'jordan', name: 'Jordan L.', initials: 'JL', context: 'MATH 10560 tutor · $30/hr', preview: 'Want to meet at Hesburgh tonight?', time: '3h' },
  { id: 'cse-cram', name: 'CSE 20110 cram', initials: 'CS', context: 'Hangout · 4 people', preview: 'Bringing snacks', time: '5h' },
  { id: 'aisha', name: 'Aisha M.', initials: 'AM', context: 'Senior portraits · $80', preview: 'Sent you a few sample shots', time: '1d' },
  { id: 'sam', name: 'Sam R.', initials: 'SR', context: 'Dog walk · $15', preview: 'Thanks again — Bagel loved it', time: '2d' },
];

function timeAgo(ts: number): string {
  if (!ts) return '';
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return 'just now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function MessagesScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const { conversations, loading, error } = useConversations();

  const useReal = realSession;
  const items: (MockConvo | (ConversationSummary & { __real: true }))[] = useReal
    ? conversations.map((co) => ({ ...co, __real: true as const }))
    : MOCK_CONVOS;
  const unreadCount = useReal
    ? conversations.filter((co) => co.unread).length
    : MOCK_CONVOS.filter((co) => co.unread).length;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <NamePlaque size="sm" />
        <ThemedText style={[styles.title, { color: c.text }]}>Messages</ThemedText>
        <ThemedText style={[styles.eyebrow, { color: c.textSecondary }]}>
          {unreadCount} unread · {items.length} total
        </ThemedText>
      </View>

      {useReal && error ? (
        <ThemedText style={[styles.error, { color: '#dc2626' }]}>{error}</ThemedText>
      ) : null}

      {useReal && loading && items.length === 0 ? (
        <View style={styles.emptyBlock}>
          <ThemedText style={[styles.empty, { color: c.textSecondary }]}>
            Loading…
          </ThemedText>
        </View>
      ) : useReal && items.length === 0 ? (
        <View style={styles.emptyBlock}>
          <ThemedText style={[styles.emptyHeading, { color: c.text }]}>
            No conversations yet
          </ThemedText>
          <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
            Tap a gig on the Gigs tab and hit &quot;Message poster&quot; to start one.
          </ThemedText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}>
          {items.map((co, i) => {
            const isReal = '__real' in co;
            const name = isReal ? co.partnerName : co.name;
            const initials = isReal ? co.partnerInitials : co.initials;
            const context = isReal ? co.contextLabel : co.context;
            const preview = isReal ? co.preview : co.preview;
            const time = isReal ? timeAgo(co.preview_at) : co.time;
            const unread = isReal ? co.unread : !!co.unread;
            return (
              <Pressable
                key={co.id}
                onPress={() => router.push(`/chat/${co.id}` as never)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderTopColor: c.border,
                    borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                    opacity: pressed ? 0.5 : 1,
                  },
                ]}>
                <View style={[styles.avatar, { borderColor: c.border }]}>
                  <ThemedText style={[styles.avatarText, { color: c.text }]}>
                    {initials}
                  </ThemedText>
                </View>

                <View style={styles.rowMain}>
                  <View style={styles.rowTop}>
                    <ThemedText style={[styles.name, { color: c.text }]} numberOfLines={1}>
                      {name}
                    </ThemedText>
                    <ThemedText style={[styles.time, { color: c.textSecondary }]}>
                      {time}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={[styles.context, { color: c.textSecondary }]}
                    numberOfLines={1}>
                    {context}
                  </ThemedText>
                  <View style={styles.rowBottom}>
                    <ThemedText
                      numberOfLines={1}
                      style={[
                        styles.preview,
                        { color: unread ? c.text : c.textSecondary },
                        unread && styles.previewUnread,
                      ]}>
                      {preview}
                    </ThemedText>
                    {unread && <View style={[styles.unreadDot, { backgroundColor: c.tint }]} />}
                  </View>
                </View>
              </Pressable>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
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
    flexDirection: 'row',
    paddingVertical: 16,
    gap: 14,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  time: {
    fontSize: 12,
  },
  context: {
    fontSize: 12,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  preview: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  previewUnread: {
    fontWeight: '600',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  emptyBlock: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  empty: {
    fontSize: 13,
    textAlign: 'center',
  },
  emptyHeading: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptyBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
});
