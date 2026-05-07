import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Gig = {
  id: string;
  title: string;
  payout: string;
  category: 'Tutoring' | 'Moving' | 'Rideshare' | 'Pets' | 'Creative' | 'Errands';
  distance: string;
  postedAgo: string;
  posterName: string;
  posterInitials: string;
};

const MOCK_GIGS: Gig[] = [
  {
    id: '1',
    title: 'Help moving a couch up 3 flights',
    payout: '$40',
    category: 'Moving',
    distance: '0.4 mi · Florence Moore',
    postedAgo: '12 min ago',
    posterName: 'Marcus K.',
    posterInitials: 'MK',
  },
  {
    id: '2',
    title: 'Need a ride to SFO Sat 6am',
    payout: '$25',
    category: 'Rideshare',
    distance: '32 mi · SFO',
    postedAgo: '1h ago',
    posterName: 'Priya S.',
    posterInitials: 'PS',
  },
  {
    id: '3',
    title: 'Calc 2 tutor for midterm prep',
    payout: '$30/hr',
    category: 'Tutoring',
    distance: 'Math 51 · Green Library',
    postedAgo: '2h ago',
    posterName: 'Jordan L.',
    posterInitials: 'JL',
  },
  {
    id: '4',
    title: 'Walk my dog this weekend',
    payout: '$15',
    category: 'Pets',
    distance: '0.2 mi · Escondido',
    postedAgo: '3h ago',
    posterName: 'Sam R.',
    posterInitials: 'SR',
  },
  {
    id: '5',
    title: 'Photographer for senior portraits',
    payout: '$80',
    category: 'Creative',
    distance: '0.8 mi · Hoover Tower',
    postedAgo: '5h ago',
    posterName: 'Aisha M.',
    posterInitials: 'AM',
  },
  {
    id: '6',
    title: 'Pick up Amazon package & drop it at my dorm',
    payout: '$8',
    category: 'Errands',
    distance: '0.3 mi · Tresidder',
    postedAgo: 'yesterday',
    posterName: 'Tyler J.',
    posterInitials: 'TJ',
  },
];

const CATEGORIES = ['All', 'Tutoring', 'Moving', 'Rideshare', 'Pets', 'Creative', 'Errands'] as const;

const CATEGORY_COLORS: Record<Gig['category'], { bg: string; fg: string }> = {
  Tutoring: { bg: '#dcfce7', fg: '#166534' },
  Moving: { bg: '#ffedd5', fg: '#9a3412' },
  Rideshare: { bg: '#dbeafe', fg: '#1e40af' },
  Pets: { bg: '#fce7f3', fg: '#9d174d' },
  Creative: { bg: '#ede9fe', fg: '#5b21b6' },
  Errands: { bg: '#fef9c3', fg: '#854d0e' },
};

export default function GigsScreen() {
  const [selected, setSelected] = useState<(typeof CATEGORIES)[number]>('All');
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  const visible = selected === 'All' ? MOCK_GIGS : MOCK_GIGS.filter((g) => g.category === selected);

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <ThemedText type="title">quad</ThemedText>
          <ThemedText style={styles.subtle}>Stanford · 142 students online</ThemedText>
        </View>
        <View style={[styles.avatar, { backgroundColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
          <ThemedText style={styles.avatarText}>YO</ThemedText>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {CATEGORIES.map((cat) => {
          const active = cat === selected;
          return (
            <Pressable
              key={cat}
              onPress={() => setSelected(cat)}
              style={[
                styles.filterPill,
                {
                  backgroundColor: active
                    ? isDark
                      ? '#fff'
                      : '#11181C'
                    : isDark
                    ? '#1f2937'
                    : '#f3f4f6',
                },
              ]}>
              <ThemedText
                style={[
                  styles.filterPillText,
                  { color: active ? (isDark ? '#11181C' : '#fff') : isDark ? '#9ca3af' : '#374151' },
                ]}>
                {cat}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {visible.map((gig) => (
          <GigCard key={gig.id} gig={gig} isDark={isDark} />
        ))}
        {visible.length === 0 && (
          <ThemedText style={[styles.subtle, { textAlign: 'center', marginTop: 40 }]}>
            No gigs in this category yet.
          </ThemedText>
        )}
        <View style={{ height: 96 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: '#0a7ea4', opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => {}}>
        <IconSymbol name="plus" size={20} color="#fff" />
        <ThemedText style={styles.fabText}>Post a gig</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function GigCard({ gig, isDark }: { gig: Gig; isDark: boolean }) {
  const cat = CATEGORY_COLORS[gig.category];
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
        <View style={[styles.catTag, { backgroundColor: cat.bg }]}>
          <ThemedText style={[styles.catTagText, { color: cat.fg }]}>{gig.category}</ThemedText>
        </View>
        <ThemedText type="defaultSemiBold" style={styles.payout}>
          {gig.payout}
        </ThemedText>
      </View>

      <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
        {gig.title}
      </ThemedText>

      <View style={styles.cardMeta}>
        <IconSymbol name="mappin.and.ellipse" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
        <ThemedText style={styles.metaText}>{gig.distance}</ThemedText>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.posterRow}>
          <View style={[styles.posterAvatar, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}>
            <ThemedText style={styles.posterAvatarText}>{gig.posterInitials}</ThemedText>
          </View>
          <ThemedText style={styles.metaText}>{gig.posterName}</ThemedText>
        </View>
        <ThemedText style={styles.metaText}>{gig.postedAgo}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  subtle: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
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
  catTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  catTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  payout: {
    fontSize: 18,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    opacity: 0.7,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  posterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  posterAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterAvatarText: {
    fontSize: 11,
    fontWeight: '600',
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
