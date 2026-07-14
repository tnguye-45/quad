import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
import { findOrCreateGigConversation } from '@/lib/messaging';
import { usePosts, type GigCategory } from '@/lib/posts-store';

const CATEGORY_EMOJI: Record<GigCategory, string> = {
  Tutoring: '📚',
  Moving: '📦',
  Rideshare: '🚗',
  Pets: '🐾',
  Creative: '🎨',
  Errands: '🛒',
};

export default function GigDetailScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gigs, hydrated } = usePosts();
  const { session, isDev } = useAuth();
  const { startGigConversation } = useDevConversations();
  const realSession = !!session && !isDev;
  const gig = gigs.find((g) => g.id === id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Until the store hydrates, a miss means "not loaded yet", not "deleted" —
  // deep links land here before the first fetch resolves.
  if (!gig && !hydrated) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={styles.emptyBlock}>
          <ActivityIndicator color={c.textMuted} />
        </View>
      </ThemedView>
    );
  }

  if (!gig) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={styles.emptyBlock}>
          <ThemedText style={[styles.emptyEyebrow, { color: c.textMuted }]} type="mono">
            404 · gone
          </ThemedText>
          <ThemedText style={[styles.emptyHeading, { color: c.text }]}>
            Gig not found
          </ThemedText>
          <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
            It may have been deleted, or you opened a stale link.
          </ThemedText>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1, marginTop: 16, alignSelf: 'stretch' },
            ]}>
            <ThemedText style={[styles.ctaText, { color: c.background }]}>Go back</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const isOwn = !!session && gig.ownerId === session.user.id;
  const posterLabel =
    gig.anonymous || !gig.posterName ? 'Anonymous student' : gig.posterName;
  const posterInitials =
    gig.anonymous || !gig.posterInitials ? '?' : gig.posterInitials;
  const posterAvatarUri = gig.anonymous ? null : gig.posterAvatarUrl;
  // In dev there's no backend, so seed gigs (ownerId 'seed') are messageable
  // too — the conversation is created client-side. Real sessions never see
  // seed rows, so the `!realSession` branch is what unlocks the demo.
  const canMessage =
    !isOwn && !gig.anonymous && (!realSession || gig.ownerId !== 'seed');
  const firstName = gig.posterName?.split(' ')[0] ?? 'poster';

  async function handleMessage() {
    if (!gig || !session) return;
    if (!realSession) {
      const convId = startGigConversation(gig);
      router.replace(`/chat/${convId}` as never);
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const convId = await findOrCreateGigConversation({
        meId: session.user.id,
        gigId: gig.id,
        posterId: gig.ownerId,
      });
      if (!convId) {
        setErr('Could not start a conversation.');
        return;
      }
      router.replace(`/chat/${convId}` as never);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to open conversation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.eyebrowRow}>
            <ThemedText style={styles.eyebrowEmoji}>
              {CATEGORY_EMOJI[gig.category] ?? '✨'}
            </ThemedText>
            <ThemedText style={[styles.eyebrow, { color: c.accent }]} type="mono">
              {gig.category.toLowerCase()} · {gig.postedAgo}
            </ThemedText>
          </View>
          <ThemedText style={[styles.heading, { color: c.text }]}>
            {gig.title}
          </ThemedText>
        </View>

        <View style={[styles.posterRow, { borderTopColor: c.border, borderBottomColor: c.border }]}>
          <Avatar
            uri={posterAvatarUri}
            initials={posterInitials}
            size={44}
            textSize={14}
          />
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.posterName, { color: c.text }]}>
              {posterLabel}
            </ThemedText>
            <ThemedText style={[styles.posterHint, { color: c.textMuted }]} type="mono">
              {gig.anonymous
                ? 'posted anonymously'
                : isOwn
                  ? 'you posted this'
                  : 'notre dame · verified'}
            </ThemedText>
          </View>
          <View style={styles.payoutBlock}>
            <ThemedText style={[styles.payoutLabel, { color: c.textMuted }]} type="mono">
              payout
            </ThemedText>
            <ThemedText style={[styles.payoutValue, { color: c.text }]}>
              {gig.payout}
            </ThemedText>
          </View>
        </View>

        <View style={styles.metaBlock}>
          <View style={styles.metaRow}>
            <IconSymbol name="mappin" size={14} color={c.textMuted} />
            <ThemedText style={[styles.metaText, { color: c.text }]}>
              {gig.where}
            </ThemedText>
          </View>
          <View style={styles.metaRow}>
            <IconSymbol name="clock" size={14} color={c.textMuted} />
            <ThemedText style={[styles.metaText, { color: c.text }]}>
              posted {gig.postedAgo}
            </ThemedText>
          </View>
        </View>

        {gig.description ? (
          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText style={[styles.sectionLabel, { color: c.textMuted }]} type="mono">
              details
            </ThemedText>
            <ThemedText style={[styles.body, { color: c.text }]}>
              {gig.description}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.ctaBlock}>
          {canMessage ? (
            <Pressable
              onPress={handleMessage}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
              style={({ pressed }) => [
                styles.cta,
                { backgroundColor: c.tint, opacity: busy ? 0.5 : pressed ? 0.85 : 1 },
              ]}>
              <ThemedText style={[styles.ctaText, { color: c.background }]}>
                {busy ? 'Opening…' : `Message ${firstName}`}
              </ThemedText>
            </Pressable>
          ) : (
            <View
              style={[
                styles.ctaDisabled,
                { borderColor: c.border, backgroundColor: c.subtle },
              ]}>
              <ThemedText
                style={[styles.ctaDisabledText, { color: c.textMuted }]}
                type="mono">
                {isOwn
                  ? "you can't message yourself"
                  : gig.anonymous
                    ? 'anonymous · cannot reply'
                    : 'demo gig · messaging off'}
              </ThemedText>
            </View>
          )}

          {err ? (
            <ThemedText style={[styles.error, { color: c.danger }]}>{err}</ThemedText>
          ) : null}

          <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.cancelBtn}>
            <ThemedText style={[styles.cancelText, { color: c.textMuted }]} type="mono">
              close
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.commentsHolder}>
          <CommentThread targetType="gig" targetId={gig.id} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 20,
    paddingBottom: 48,
    paddingHorizontal: 24,
    gap: 4,
  },
  hero: {
    gap: 10,
    paddingBottom: 18,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrowEmoji: { fontSize: 16 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  posterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  posterName: { fontSize: 15, fontWeight: '700' },
  posterHint: {
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 2,
    textTransform: 'lowercase',
  },
  payoutBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  payoutLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  payoutValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  metaBlock: {
    paddingVertical: 16,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 14,
  },
  section: {
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  body: { fontSize: 15, lineHeight: 22 },
  ctaBlock: {
    marginTop: 28,
    gap: 14,
  },
  cta: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
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
  error: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  cancelBtn: { paddingVertical: 8, alignItems: 'center' },
  cancelText: {
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
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  commentsHolder: {
    marginTop: 8,
    marginHorizontal: -24,
  },
});
