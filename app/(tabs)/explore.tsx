import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePosts, type Hangout } from '@/lib/posts-store';

export default function HangoutsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const { hangouts, rsvpHangout, loading, hydrated } = usePosts();
  const showLoading = !hydrated && loading && hangouts.length === 0;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <NamePlaque size="sm" />
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <ThemedText type="defaultSemiBold" style={[styles.section, { color: c.textSecondary }]}>
            Hangouts
          </ThemedText>
        </View>
        <ThemedText style={[styles.subtle, { color: c.textSecondary }]}>
          Find people doing things you&apos;d want to do
        </ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {showLoading ? (
          <ThemedText style={[styles.subtle, { textAlign: 'center', marginTop: 40 }]}>
            Loading hangouts…
          </ThemedText>
        ) : hangouts.length === 0 ? (
          <ThemedText style={[styles.subtle, { textAlign: 'center', marginTop: 40 }]}>
            No hangouts yet — start one.
          </ThemedText>
        ) : (
          hangouts.map((h) => (
            <HangoutCard key={h.id} hangout={h} c={c} onJoin={() => rsvpHangout(h.id)} />
          ))
        )}
        <View style={{ height: 96 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => router.push('/start-hangout')}>
        <IconSymbol name="plus" size={18} color={c.background} />
        <ThemedText style={[styles.fabText, { color: c.background }]}>Start a hangout</ThemedText>
      </Pressable>
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
    hangout.anonymous || !hangout.hostName ? 'Anonymous host' : `Hosted by ${hangout.hostName}`;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.card,
          borderColor: c.border,
        },
      ]}>
      <View style={styles.cardTop}>
        <View style={[styles.vibeTag, { backgroundColor: c.subtle }]}>
          <ThemedText style={[styles.vibeTagText, { color: c.textSecondary }]}>
            {hangout.vibe}
          </ThemedText>
        </View>
        <ThemedText style={[styles.goingText, { color: c.textSecondary }]}>
          {hangout.going} {hangout.going === 1 ? 'person' : 'people'} going
        </ThemedText>
      </View>

      <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
        {hangout.title}
      </ThemedText>

      <View style={styles.metaRow}>
        <IconSymbol name="clock.fill" size={13} color={c.textSecondary} />
        <ThemedText style={[styles.metaText, { color: c.textSecondary }]}>{hangout.when}</ThemedText>
      </View>
      <View style={styles.metaRow}>
        <IconSymbol name="mappin.and.ellipse" size={13} color={c.textSecondary} />
        <ThemedText style={[styles.metaText, { color: c.textSecondary }]}>{hangout.where}</ThemedText>
      </View>
      <ThemedText style={[styles.hostText, { color: c.textSecondary }]}>{hostLabel}</ThemedText>

      <Pressable
        onPress={onJoin}
        style={({ pressed }) => [
          styles.joinBtn,
          {
            backgroundColor: pressed ? c.subtle : 'transparent',
            borderColor: c.border,
          },
        ]}>
        <ThemedText style={[styles.joinBtnText, { color: c.text }]}>I&apos;m in</ThemedText>
      </Pressable>
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
    paddingBottom: 16,
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
  subtle: {
    fontSize: 13,
    marginTop: 6,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 10,
  },
  card: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vibeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  vibeTagText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  goingText: {
    fontSize: 12,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
  },
  hostText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  joinBtn: {
    marginTop: 6,
    paddingVertical: 9,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
  },
  joinBtnText: {
    fontWeight: '600',
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
