import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { findOrCreateGigConversation } from '@/lib/messaging';
import { usePosts } from '@/lib/posts-store';

export default function GigDetailScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gigs } = usePosts();
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const gig = gigs.find((g) => g.id === id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!gig) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={styles.emptyBlock}>
          <ThemedText type="title" style={styles.emptyHeading}>
            Gig not found
          </ThemedText>
          <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
            It may have been deleted or you opened a stale link.
          </ThemedText>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
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
    gig.anonymous || !gig.posterInitials ? '??' : gig.posterInitials;
  const canMessage = !isOwn && !gig.anonymous && gig.ownerId !== 'seed';

  async function handleMessage() {
    if (!gig || !session) return;
    if (!realSession) {
      // Dev mode — route to a mock thread keyed by the poster's first name.
      const key = (gig.posterName ?? '').split(' ')[0]?.toLowerCase() || 'marcus';
      router.replace(`/chat/${key}` as never);
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
        <View style={styles.topRow}>
          <View style={[styles.catTag, { backgroundColor: c.subtle }]}>
            <ThemedText style={[styles.catTagText, { color: c.textSecondary }]}>
              {gig.category}
            </ThemedText>
          </View>
          <ThemedText type="defaultSemiBold" style={[styles.payout, { color: c.text }]}>
            {gig.payout}
          </ThemedText>
        </View>

        <ThemedText type="title" style={styles.heading}>
          {gig.title}
        </ThemedText>

        <View style={styles.metaRow}>
          <IconSymbol name="mappin.and.ellipse" size={14} color={c.textSecondary} />
          <ThemedText style={[styles.metaText, { color: c.textSecondary }]}>
            {gig.where}
          </ThemedText>
        </View>
        <View style={styles.metaRow}>
          <IconSymbol name="clock.fill" size={14} color={c.textSecondary} />
          <ThemedText style={[styles.metaText, { color: c.textSecondary }]}>
            {gig.postedAgo}
          </ThemedText>
        </View>

        {gig.description ? (
          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText style={[styles.sectionLabel, { color: c.textSecondary }]}>
              Details
            </ThemedText>
            <ThemedText style={[styles.body, { color: c.text }]}>{gig.description}</ThemedText>
          </View>
        ) : null}

        <View style={[styles.section, { borderTopColor: c.border }]}>
          <ThemedText style={[styles.sectionLabel, { color: c.textSecondary }]}>
            Posted by
          </ThemedText>
          <View style={styles.posterRow}>
            <View style={[styles.posterAvatar, { backgroundColor: c.subtle, borderColor: c.border }]}>
              <ThemedText style={[styles.posterAvatarText, { color: c.text }]}>
                {posterInitials}
              </ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold" style={[styles.posterName, { color: c.text }]}>
                {posterLabel}
              </ThemedText>
              {gig.anonymous && (
                <ThemedText style={[styles.posterHint, { color: c.textSecondary }]}>
                  This gig was posted anonymously.
                </ThemedText>
              )}
              {isOwn && (
                <ThemedText style={[styles.posterHint, { color: c.textSecondary }]}>
                  You posted this.
                </ThemedText>
              )}
            </View>
          </View>
        </View>

        {canMessage ? (
          <Pressable
            onPress={handleMessage}
            disabled={busy}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: c.tint, opacity: busy ? 0.5 : pressed ? 0.85 : 1 },
            ]}>
            <ThemedText style={[styles.ctaText, { color: c.background }]}>
              {busy ? 'Opening…' : `Message ${gig.posterName?.split(' ')[0] ?? 'poster'}`}
            </ThemedText>
          </Pressable>
        ) : (
          <View
            style={[
              styles.ctaDisabled,
              { backgroundColor: c.subtle, borderColor: c.border },
            ]}>
            <ThemedText style={[styles.ctaDisabledText, { color: c.textSecondary }]}>
              {isOwn
                ? "You can't message yourself"
                : gig.anonymous
                  ? 'Anonymous posters can be replied to only by future updates'
                  : 'Demo gig — messaging not available'}
            </ThemedText>
          </View>
        )}

        {err ? <ThemedText style={styles.error}>{err}</ThemedText> : null}

        <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
          <ThemedText style={[styles.cancelText, { color: c.textSecondary }]}>
            Close
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 16,
    paddingBottom: 40,
    paddingHorizontal: 24,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  catTagText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  payout: { fontSize: 22 },
  heading: { fontSize: 24, lineHeight: 30 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: { fontSize: 14 },
  section: {
    paddingTop: 16,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  body: { fontSize: 15, lineHeight: 22 },
  posterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  posterAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterAvatarText: { fontSize: 14, fontWeight: '600' },
  posterName: { fontSize: 15 },
  posterHint: { fontSize: 12, marginTop: 2 },
  cta: {
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 4,
    alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '600' },
  ctaDisabled: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
  },
  ctaDisabledText: { fontSize: 13 },
  error: { fontSize: 13, color: '#dc2626' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 14 },
  emptyBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  emptyHeading: { fontSize: 22 },
  emptyBody: { fontSize: 14, textAlign: 'center' },
});
