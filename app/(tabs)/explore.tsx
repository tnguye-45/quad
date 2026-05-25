import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePosts, type Hangout } from '@/lib/posts-store';

const VIBE_EMOJI: Record<string, string> = {
  Study: '📚',
  Sports: '🏀',
  Food: '🍕',
  Social: '🎉',
  Other: '✨',
};

export default function HangoutsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const { hangouts, rsvpHangout, loading, hydrated } = usePosts();
  const showLoading = !hydrated && loading && hangouts.length === 0;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScreenHeader
        title="Hangouts"
        subtitle={`${hangouts.length} happening this week`}
      />

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}>
        {showLoading ? (
          <ThemedText style={[styles.empty, { color: c.textSecondary }]}>
            Loading…
          </ThemedText>
        ) : hangouts.length === 0 ? (
          <View style={styles.emptyBlock}>
            <ThemedText style={[styles.emptyHeading, { color: c.text }]}>
              Nothing on the schedule
            </ThemedText>
            <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
              Tap the + to start one.
            </ThemedText>
          </View>
        ) : (
          hangouts.map((h) => (
            <HangoutCard
              key={h.id}
              hangout={h}
              c={c}
              onJoin={() => rsvpHangout(h.id)}
            />
          ))
        )}
        <View style={{ height: 120 }} />
      </ScrollView>
    </ThemedView>
  );
}

function HangoutCard({
  hangout,
  c,
  onJoin,
}: {
  hangout: Hangout;
  c: (typeof Colors)['light'];
  onJoin: () => void;
}) {
  const hostLabel =
    hangout.anonymous || !hangout.hostName ? 'anonymous host' : hangout.hostName;
  const hostInitials =
    hangout.anonymous || !hangout.hostInitials ? '?' : hangout.hostInitials;
  const hostAvatarUri = hangout.anonymous ? null : hangout.hostAvatarUrl;

  return (
    <View style={[styles.card, { borderBottomColor: c.border }]}>
      <View style={styles.cardHead}>
        <Avatar uri={hostAvatarUri} initials={hostInitials} size={38} textSize={12} />
        <View style={styles.cardHeadText}>
          <ThemedText style={[styles.host, { color: c.text }]}>{hostLabel}</ThemedText>
          <ThemedText style={[styles.vibeText, { color: c.textMuted }]} type="mono">
            {VIBE_EMOJI[hangout.vibe] || '✨'} {hangout.vibe.toLowerCase()}
          </ThemedText>
        </View>
        <View style={[styles.goingBadge, { borderColor: c.border }]}>
          <ThemedText style={[styles.goingNum, { color: c.text }]}>{hangout.going}</ThemedText>
          <ThemedText style={[styles.goingLabel, { color: c.textMuted }]} type="mono">
            going
          </ThemedText>
        </View>
      </View>

      <ThemedText style={[styles.cardTitle, { color: c.text }]}>{hangout.title}</ThemedText>

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <IconSymbol name="clock" size={12} color={c.textMuted} />
          <ThemedText style={[styles.metaText, { color: c.textSecondary }]} type="mono">
            {hangout.when.toLowerCase()}
          </ThemedText>
        </View>
        <View style={styles.metaItem}>
          <IconSymbol name="mappin" size={12} color={c.textMuted} />
          <ThemedText style={[styles.metaText, { color: c.textSecondary }]} type="mono">
            {hangout.where.toLowerCase()}
          </ThemedText>
        </View>
      </View>

      <Pressable
        onPress={onJoin}
        style={({ pressed }) => [
          styles.joinBtn,
          { backgroundColor: c.tint, opacity: pressed ? 0.7 : 1 },
        ]}>
        <ThemedText style={[styles.joinBtnText, { color: c.background }]}>I&apos;m in</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 0,
  },
  card: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardHeadText: {
    flex: 1,
    gap: 1,
  },
  host: {
    fontSize: 14,
    fontWeight: '600',
  },
  vibeText: {
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  goingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  goingNum: {
    fontSize: 14,
    fontWeight: '700',
  },
  goingLabel: {
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  joinBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  joinBtnText: {
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  emptyBlock: {
    paddingHorizontal: 32,
    paddingTop: 80,
    alignItems: 'center',
    gap: 8,
  },
  emptyHeading: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: 14,
    textAlign: 'center',
  },
  empty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 60,
  },
});
