import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Hangout = {
  id: string;
  title: string;
  when: string;
  where: string;
  going: number;
  vibe: string;
};

const MOCK_HANGOUTS: Hangout[] = [
  {
    id: '1',
    title: 'CSE 20110 midterm cram session',
    when: 'Tonight · 8:00 PM',
    where: 'Hesburgh Library, 2nd floor',
    going: 4,
    vibe: 'Study',
  },
  {
    id: '2',
    title: 'Pickup basketball — all skill levels',
    when: 'Sat · 3:00 PM',
    where: 'Rolfs Sports Recreation Center',
    going: 8,
    vibe: 'Sports',
  },
  {
    id: '3',
    title: 'South Dining Hall dinner',
    when: 'Tonight · 6:30 PM',
    where: 'South Dining Hall',
    going: 3,
    vibe: 'Food',
  },
  {
    id: '4',
    title: 'Coffee run @ Hagerty',
    when: 'Tomorrow · 4:00 PM',
    where: 'Hagerty Family Café, DPAC',
    going: 2,
    vibe: 'Social',
  },
  {
    id: '5',
    title: 'Sunset run around the lakes',
    when: 'Sun · 6:15 PM',
    where: "St. Joseph's Lake trail",
    going: 5,
    vibe: 'Sports',
  },
];

export default function HangoutsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.brand}>
          Hangouts
        </ThemedText>
        <ThemedText style={[styles.subtle, { color: c.textSecondary }]}>
          Find people doing things you'd want to do
        </ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {MOCK_HANGOUTS.map((h) => (
          <HangoutCard key={h.id} hangout={h} c={c} />
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
        <ThemedText style={[styles.fabText, { color: c.background }]}>Start a hangout</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function HangoutCard({ hangout, c }: { hangout: Hangout; c: (typeof Colors)['light'] }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      onPress={() => {}}>
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

      <Pressable
        style={({ pressed }) => [
          styles.joinBtn,
          {
            backgroundColor: pressed ? c.subtle : 'transparent',
            borderColor: c.border,
          },
        ]}>
        <ThemedText style={[styles.joinBtnText, { color: c.text }]}>I&apos;m in</ThemedText>
      </Pressable>
    </Pressable>
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
  brand: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subtle: {
    fontSize: 13,
    marginTop: 4,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vibeTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
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
  joinBtn: {
    marginTop: 6,
    paddingVertical: 9,
    borderRadius: 8,
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
