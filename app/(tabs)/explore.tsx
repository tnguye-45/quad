import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Hangout = {
  id: string;
  title: string;
  when: string;
  where: string;
  going: number;
  vibe: string;
  vibeColor: { bg: string; fg: string };
};

const VIBE = {
  study: { bg: '#dbeafe', fg: '#1e40af' },
  sport: { bg: '#dcfce7', fg: '#166534' },
  food: { bg: '#ffedd5', fg: '#9a3412' },
  social: { bg: '#fce7f3', fg: '#9d174d' },
};

const MOCK_HANGOUTS: Hangout[] = [
  {
    id: '1',
    title: 'CS161 midterm cram session',
    when: 'Tonight · 8:00 PM',
    where: 'Green Library, 2nd floor',
    going: 4,
    vibe: 'Study',
    vibeColor: VIBE.study,
  },
  {
    id: '2',
    title: 'Pickup basketball — all skill levels',
    when: 'Sat · 3:00 PM',
    where: 'AOERC outdoor courts',
    going: 8,
    vibe: 'Sports',
    vibeColor: VIBE.sport,
  },
  {
    id: '3',
    title: 'Wilbur dining hall dinner',
    when: 'Tonight · 6:30 PM',
    where: 'Wilbur Hall',
    going: 3,
    vibe: 'Food',
    vibeColor: VIBE.food,
  },
  {
    id: '4',
    title: 'Boba run @ Coupa',
    when: 'Tomorrow · 4:00 PM',
    where: 'Coupa Café, Green Library',
    going: 2,
    vibe: 'Social',
    vibeColor: VIBE.social,
  },
  {
    id: '5',
    title: 'Sunset run around Lake Lag',
    when: 'Sun · 6:15 PM',
    where: 'Lake Lagunita trailhead',
    going: 5,
    vibe: 'Sports',
    vibeColor: VIBE.sport,
  },
];

export default function HangoutsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.header}>
        <ThemedText type="title">Hangouts</ThemedText>
        <ThemedText style={styles.subtle}>Find people doing things you'd want to do</ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {MOCK_HANGOUTS.map((h) => (
          <HangoutCard key={h.id} hangout={h} isDark={isDark} />
        ))}
        <View style={{ height: 96 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: '#0a7ea4', opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => {}}>
        <IconSymbol name="plus" size={20} color="#fff" />
        <ThemedText style={styles.fabText}>Start a hangout</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function HangoutCard({ hangout, isDark }: { hangout: Hangout; isDark: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? '#1f2937' : '#fff',
          borderColor: isDark ? '#374151' : '#e5e7eb',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      onPress={() => {}}>
      <View style={styles.cardTop}>
        <View style={[styles.vibeTag, { backgroundColor: hangout.vibeColor.bg }]}>
          <ThemedText style={[styles.vibeTagText, { color: hangout.vibeColor.fg }]}>
            {hangout.vibe}
          </ThemedText>
        </View>
        <View style={styles.goingPill}>
          <ThemedText style={styles.goingText}>
            {hangout.going} {hangout.going === 1 ? 'person' : 'people'} going
          </ThemedText>
        </View>
      </View>

      <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
        {hangout.title}
      </ThemedText>

      <View style={styles.metaRow}>
        <IconSymbol name="clock.fill" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
        <ThemedText style={styles.metaText}>{hangout.when}</ThemedText>
      </View>
      <View style={styles.metaRow}>
        <IconSymbol name="mappin.and.ellipse" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
        <ThemedText style={styles.metaText}>{hangout.where}</ThemedText>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.joinBtn,
          {
            backgroundColor: pressed ? '#075985' : '#0a7ea4',
          },
        ]}>
        <ThemedText style={styles.joinBtnText}>I'm in</ThemedText>
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
  subtle: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 4,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  card: {
    borderRadius: 16,
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
    borderRadius: 999,
  },
  vibeTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  goingPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  goingText: {
    fontSize: 12,
    opacity: 0.7,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    opacity: 0.7,
  },
  joinBtn: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  joinBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
