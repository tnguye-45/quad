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
import { useAuth } from '@/lib/auth-context';
import { useDevConversations } from '@/lib/dev-conversations';
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
  sortAt: number;
};

type Item = MockConvo | (ConversationSummary & { __real: true });

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
  const { conversations, loading, error, refresh } = useConversations();
  const { byConversation: unreadByConversation } = useUnreadCounts();
  const { conversations: devConversations } = useDevConversations();
  const [refreshing, setRefreshing] = useState(false);

  const useReal = realSession;

  // Dev-mode conversations come from the in-memory store, so threads you start
  // from a gig or join from a hangout show up here just like the real feed.
  const devItems: MockConvo[] = devConversations
    .map((co) => {
      const last = co.messages[co.messages.length - 1];
      const preview = last ? (last.from === 'me' ? `You: ${last.text}` : last.text) : 'No messages yet';
      return {
        id: co.id,
        name: co.name,
        initials: co.initials,
        context: co.context,
        preview,
        time: timeAgo(last?.sentAt ?? 0),
        unread: co.unread,
        active: co.online,
        sortAt: last?.sentAt ?? 0,
      };
    })
    .sort((a, b) => b.sortAt - a.sortAt);

  const items: Item[] = useReal
    ? conversations.map((co) => ({ ...co, __real: true as const }))
    : devItems;
  const unreadCount = useReal
    ? conversations.filter((co) => co.unread || (unreadByConversation[co.id] ?? 0) > 0).length
    : devItems.filter((co) => co.unread).length;

  const activeNow = useReal
    ? items.slice(0, 4)
    : devItems.filter((co) => co.active).slice(0, 6);

  const showLoading = useReal && loading && conversations.length === 0;
  const isEmpty = useReal && !loading && conversations.length === 0;

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
        title="Messages"
        subtitle={`${unreadCount} unread · ${items.length} total`}
      />

      <FlatList
        data={items}
        keyExtractor={(co) => co.id}
        renderItem={({ item: co }) => {
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
        }}
        ListHeaderComponent={
          <>
            {useReal && error ? (
              <Pressable
                onPress={refresh}
                style={({ pressed }) => [
                  styles.retryRow,
                  { borderColor: c.border, opacity: pressed ? 0.6 : 1 },
                ]}>
                <ThemedText style={[styles.retryText, { color: c.danger }]} type="mono">
                  Couldn&apos;t load messages. Tap to retry.
                </ThemedText>
              </Pressable>
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
          </>
        }
        ListEmptyComponent={
          showLoading ? (
            <SkeletonList count={5} avatarSize={52} />
          ) : isEmpty ? (
            <View style={styles.emptyBlock}>
              <IconSymbol name="message" size={36} color={c.textMuted} />
              <ThemedText style={[styles.emptyTitle, { color: c.text }]}>
                No conversations yet
              </ThemedText>
              <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
                Open a gig on the Gigs tab and hit “Message poster” to start one.
              </ThemedText>
              <Pressable
                onPress={() => router.push('/(tabs)' as never)}
                style={({ pressed }) => [
                  styles.emptyCta,
                  { backgroundColor: c.tint, opacity: pressed ? 0.8 : 1 },
                ]}>
                <ThemedText style={[styles.emptyCtaText, { color: c.background }]}>
                  Browse gigs
                </ThemedText>
              </Pressable>
            </View>
          ) : null
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
        ListFooterComponent={<View style={{ height: 40 }} />}
      />
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
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 40,
    alignItems: 'center',
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
    textAlign: 'center',
    lineHeight: 20,
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
