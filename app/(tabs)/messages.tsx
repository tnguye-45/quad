import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import {
  useConversations,
  useUnreadCounts,
  type ConversationSummary,
} from '@/lib/messaging';

type MockConvo = {
  id: string;
  name: string;
  initials: string;
  context: string;
  preview: string;
  time: string;
  unread?: boolean;
  active?: boolean;
};

const MOCK_CONVOS: MockConvo[] = [
  { id: 'marcus', name: 'Marcus K.', initials: 'MK', context: 'Help moving a couch · $40', preview: 'Sounds good! See you at 3', time: '12m', unread: true, active: true },
  { id: 'priya', name: 'Priya S.', initials: 'PS', context: 'SBN airport ride · $15', preview: 'I can grab you from Dillon', time: '1h', unread: true, active: true },
  { id: 'jordan', name: 'Jordan L.', initials: 'JL', context: 'MATH 10560 tutor · $30/hr', preview: 'Want to meet at Hesburgh tonight?', time: '3h' },
  { id: 'cse-cram', name: 'CSE 20110 cram', initials: 'CS', context: 'Hangout · 4 people', preview: 'Bringing snacks', time: '5h', active: true },
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
  const { byConversation: unreadByConversation } = useUnreadCounts();

  const useReal = realSession;
  const items: (MockConvo | (ConversationSummary & { __real: true }))[] = useReal
    ? conversations.map((co) => ({ ...co, __real: true as const }))
    : MOCK_CONVOS;
  const unreadCount = useReal
    ? conversations.filter((co) => co.unread).length
    : MOCK_CONVOS.filter((co) => co.unread).length;

  const activeNow = useReal
    ? items.slice(0, 4)
    : MOCK_CONVOS.filter((co) => co.active).slice(0, 6);

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScreenHeader
        title="Messages"
        subtitle={`${unreadCount} unread · ${items.length} total`}
      />

      {useReal && error ? (
        <ThemedText style={[styles.error, { color: c.danger }]}>{error}</ThemedText>
      ) : null}

      {activeNow.length > 0 && (
        <View style={[styles.activeWrap, { borderBottomColor: c.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeRow}>
            {activeNow.map((co) => {
              const isReal = '__real' in co;
              const name = isReal ? co.partnerName : co.name;
              const initials = isReal ? co.partnerInitials : co.initials;
              const avatarUri = isReal ? co.partnerAvatarUrl : null;
              return (
                <Pressable
                  key={co.id}
                  onPress={() => router.push(`/chat/${co.id}` as never)}
                  hitSlop={4}
                  style={styles.activeItem}>
                  <View style={styles.activeAvatarWrap}>
                    <Avatar uri={avatarUri} initials={initials} size={56} textSize={14} />
                    <View style={[styles.activeDot, { backgroundColor: '#22c55e', borderColor: c.background }]} />
                  </View>
                  <ThemedText
                    style={[styles.activeName, { color: c.text }]}
                    numberOfLines={1}>
                    {(name || '').split(' ')[0]}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

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
          {items.map((co) => {
            const isReal = '__real' in co;
            const name = isReal ? co.partnerName : co.name;
            const initials = isReal ? co.partnerInitials : co.initials;
            const avatarUri = isReal ? co.partnerAvatarUrl : null;
            const context = isReal ? co.contextLabel : co.context;
            const preview = isReal ? co.preview : co.preview;
            const time = isReal ? timeAgo(co.preview_at) : co.time;
            const unread = isReal
              ? co.unread || (unreadByConversation[co.id] ?? 0) > 0
              : !!co.unread;
            return (
              <Pressable
                key={co.id}
                onPress={() => router.push(`/chat/${co.id}` as never)}
                style={({ pressed }) => [
                  styles.row,
                  { opacity: pressed ? 0.5 : 1 },
                ]}>
                <Avatar uri={avatarUri} initials={initials} size={52} textSize={14} />

                <View style={styles.rowMain}>
                  <View style={styles.rowTop}>
                    <ThemedText
                      style={[
                        styles.name,
                        { color: c.text },
                        unread && styles.nameUnread,
                      ]}
                      numberOfLines={1}>
                      {name}
                    </ThemedText>
                    <ThemedText style={[styles.time, { color: c.textMuted }]} type="mono">
                      {time}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={[styles.context, { color: c.textMuted }]}
                    type="mono"
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
                    {unread && <View style={[styles.unreadDot, { backgroundColor: c.accent }]} />}
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
  },
  activeWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activeRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 16,
  },
  activeItem: {
    alignItems: 'center',
    gap: 6,
    width: 64,
  },
  activeAvatarWrap: {
    position: 'relative',
  },
  activeDot: {
    position: 'absolute',
    bottom: 0,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  activeName: {
    fontSize: 11,
    fontWeight: '500',
  },
  list: {
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  nameUnread: {
    fontWeight: '700',
  },
  time: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  context: {
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 1,
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
    width: 8,
    height: 8,
    borderRadius: 4,
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
    fontWeight: '700',
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
