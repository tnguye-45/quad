import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { CommentThread } from '@/components/comment-thread';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { useDevConversations } from '@/lib/dev-conversations';
import { joinHangout } from '@/lib/messaging';
import { usePosts, type PostLookup } from '@/lib/posts-store';

const VIBE_EMOJI: Record<string, string> = {
  Study: '📚',
  Sports: '🏀',
  Food: '🍕',
  Social: '🎉',
  Other: '✨',
};

export default function HangoutDetailScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hangouts, rsvpHangout, hydrated, fetchPostById, myRsvps } = usePosts();
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const { joinHangoutConversation } = useDevConversations();
  const hangout = hangouts.find((h) => h.id === id);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [joinErr, setJoinErr] = useState<string | null>(null);

  // Deep links / push taps can point at a hangout older than the loaded feed
  // pages — the store only holds the first pages, so a miss after hydration
  // needs one direct lookup before we're allowed to claim "gone".
  const lookupStartedRef = useRef(false);
  const [lookup, setLookup] = useState<PostLookup | null>(null);
  useEffect(() => {
    if (!hangout && hydrated && !lookupStartedRef.current) {
      lookupStartedRef.current = true;
      void fetchPostById('hangout', id).then(setLookup);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hangout, hydrated, lookup]);

  // Until the store hydrates AND the by-id lookup answers, a miss means "not
  // loaded yet", not "deleted".
  if (!hangout && (!hydrated || lookup === null)) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={styles.emptyBlock}>
          <ActivityIndicator color={c.textMuted} />
        </View>
      </ThemedView>
    );
  }

  if (!hangout && lookup === 'error') {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={styles.emptyBlock}>
          <ThemedText style={[styles.emptyEyebrow, { color: c.textMuted }]} type="mono">
            offline?
          </ThemedText>
          <ThemedText style={[styles.emptyHeading, { color: c.text }]}>
            Couldn&apos;t load this hangout
          </ThemedText>
          <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
            Check your connection and try again.
          </ThemedText>
          <Pressable
            onPress={() => {
              lookupStartedRef.current = false;
              setLookup(null);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.closeBtn,
              { borderColor: c.border, opacity: pressed ? 0.5 : 1 },
            ]}>
            <ThemedText style={[styles.closeText, { color: c.text }]} type="mono">
              retry
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  if (!hangout) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={styles.emptyBlock}>
          <ThemedText style={[styles.emptyEyebrow, { color: c.textMuted }]} type="mono">
            404 · gone
          </ThemedText>
          <ThemedText style={[styles.emptyHeading, { color: c.text }]}>
            Hangout not found
          </ThemedText>
          <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
            It may have been deleted, or the link is stale.
          </ThemedText>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
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

  const isOwn = !!session && hangout.ownerId === session.user.id;
  // A join from a previous session (or from the feed card) lives in myRsvps —
  // without it this screen re-offered "I'm in" to people already going.
  const isJoined = joined || !!myRsvps[hangout.id];
  const hostLabel =
    hangout.anonymous || !hangout.hostName ? 'Anonymous host' : hangout.hostName;
  const hostInitials =
    hangout.anonymous || !hangout.hostInitials ? '?' : hangout.hostInitials;
  const hostAvatarUri = hangout.anonymous ? null : hangout.hostAvatarUrl;

  async function onJoin() {
    if (!hangout || isOwn || joining || isJoined) return;
    setJoining(true);
    setJoinErr(null);
    try {
      // One RPC does it all: rsvpHangout's join_hangout call inserts the
      // attendee row, adds us to the group chat, and returns the conversation
      // id. Failures come back typed so a full hangout says "full" here, on
      // the button the user actually tapped — not as a fake feed-load banner.
      const res = await rsvpHangout(hangout.id);
      if (res.status === 'full') {
        setJoinErr('This hangout is full.');
        return;
      }
      if (res.status === 'blocked') {
        setJoinErr("You can't join this hangout.");
        return;
      }
      if (res.status === 'not_found') {
        setJoinErr('This hangout no longer exists.');
        return;
      }
      if (res.status === 'error') {
        setJoinErr("Couldn't RSVP. Check your connection and try again.");
        return;
      }
      // 'ok' carries the conversation id from the RPC; dev mode and 'already'
      // (joined earlier, id not cached) resolve it here.
      let cid = res.conversationId;
      if (!cid) {
        if (realSession) {
          const jr = await joinHangout(hangout.id);
          cid = jr.ok ? jr.conversationId : null;
        } else {
          cid = joinHangoutConversation(hangout);
        }
      }
      if (!cid) {
        setJoinErr("Couldn't join the group chat. Try again.");
        return;
      }
      setConvId(cid);
      setJoined(true);
    } catch {
      setJoinErr("Couldn't RSVP. Check your connection and try again.");
    } finally {
      setJoining(false);
    }
  }

  async function openGroupChat() {
    if (!hangout) return;
    let cid = convId;
    if (!cid) {
      if (realSession) {
        const jr = await joinHangout(hangout.id);
        cid = jr.ok ? jr.conversationId : null;
      } else {
        cid = joinHangoutConversation(hangout);
      }
      setConvId(cid);
    }
    if (cid) router.push(`/chat/${cid}` as never);
    else setJoinErr("Couldn't open the group chat. Try again.");
  }

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <ThemedText style={[styles.eyebrow, { color: c.accent }]} type="mono">
            hangout · {hangout.vibe.toLowerCase()}
          </ThemedText>
          <View style={styles.brandActions}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/report',
                  params: {
                    type: 'hangout',
                    id: hangout.id,
                    // 'seed' is a dev-only placeholder, not a real uuid.
                    ...(hangout.ownerId !== 'seed' ? { userId: hangout.ownerId } : {}),
                  },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Report this hangout"
              hitSlop={10}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <ThemedText style={[styles.closeText, { color: c.textMuted }]} type="mono">
                report
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              hitSlop={10}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <ThemedText style={[styles.closeText, { color: c.textMuted }]} type="mono">
                close
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <ThemedText style={[styles.heading, { color: c.text }]}>{hangout.title}</ThemedText>
        </View>

        <View style={[styles.hostRow, { borderTopColor: c.border, borderBottomColor: c.border }]}>
          <Avatar uri={hostAvatarUri} initials={hostInitials} size={44} textSize={14} />
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.hostName, { color: c.text }]}>{hostLabel}</ThemedText>
            <ThemedText style={[styles.hostHint, { color: c.textMuted }]} type="mono">
              {VIBE_EMOJI[hangout.vibe] ?? '✨'} {hangout.vibe.toLowerCase()}
              {isOwn ? ' · you' : ''}
            </ThemedText>
          </View>
          <View style={styles.goingBlock}>
            <ThemedText style={[styles.goingNum, { color: c.text }]}>{hangout.going}</ThemedText>
            <ThemedText style={[styles.goingLabel, { color: c.textMuted }]} type="mono">
              going
            </ThemedText>
          </View>
        </View>

        <View style={styles.metaBlock}>
          <View style={styles.metaRow}>
            <IconSymbol name="clock" size={14} color={c.textMuted} />
            <ThemedText style={[styles.metaText, { color: c.text }]}>{hangout.when}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <IconSymbol name="mappin" size={14} color={c.textMuted} />
            <ThemedText style={[styles.metaText, { color: c.text }]}>{hangout.where}</ThemedText>
          </View>
        </View>

        {hangout.description ? (
          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText style={[styles.sectionLabel, { color: c.textMuted }]} type="mono">
              details
            </ThemedText>
            <ThemedText style={[styles.bodyText, { color: c.text }]}>{hangout.description}</ThemedText>
          </View>
        ) : null}

        <View style={styles.ctaBlock}>
          {isOwn || isJoined ? (
            <>
              {isOwn ? (
                <ThemedText
                  style={[styles.hostingHint, { color: c.textMuted }]}
                  type="mono">
                  {"you're hosting · "}{hangout.going} going
                </ThemedText>
              ) : null}
              <Pressable
                onPress={openGroupChat}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
                ]}>
                <ThemedText style={[styles.ctaText, { color: c.background }]}>
                  Open group chat
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={onJoin}
              disabled={joining}
              accessibilityRole="button"
              accessibilityState={{ disabled: joining, busy: joining }}
              style={({ pressed }) => [
                styles.cta,
                {
                  backgroundColor: c.tint,
                  opacity: joining ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText style={[styles.ctaText, { color: c.background }]}>
                {joining ? 'Joining…' : "I'm in"}
              </ThemedText>
            </Pressable>
          )}
          {joinErr ? (
            <ThemedText style={[styles.error, { color: c.danger }]}>{joinErr}</ThemedText>
          ) : null}
        </View>

        <CommentThread targetType="hangout" targetId={hangout.id} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  error: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 10 },
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
  brandActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  hero: {
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 24,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hostName: { fontSize: 15, fontWeight: '700' },
  hostHint: {
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 2,
    textTransform: 'lowercase',
  },
  goingBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  goingNum: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  goingLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  metaBlock: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: { fontSize: 14 },
  section: {
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 24,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  bodyText: { fontSize: 15, lineHeight: 22 },
  ctaBlock: {
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 24,
    gap: 14,
  },
  cta: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  hostingHint: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'lowercase',
    textAlign: 'center',
    marginBottom: 2,
  },
  ctaDisabled: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  ctaDisabledText: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
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
