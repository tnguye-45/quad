import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CampusMap } from '@/components/campus-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Gig = {
  id: string;
  title: string;
  payout: string;
  category: 'Tutoring' | 'Moving' | 'Rideshare' | 'Pets' | 'Creative' | 'Errands';
  where: string;
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
    where: 'Dillon Hall · 0.4 mi',
    postedAgo: '12 min ago',
    posterName: 'Marcus K.',
    posterInitials: 'MK',
  },
  {
    id: '2',
    title: 'Need a ride to South Bend airport Sat 6am',
    payout: '$15',
    category: 'Rideshare',
    where: 'SBN · 4 mi',
    postedAgo: '1h ago',
    posterName: 'Priya S.',
    posterInitials: 'PS',
  },
  {
    id: '3',
    title: 'MATH 10560 tutor for midterm prep',
    payout: '$30/hr',
    category: 'Tutoring',
    where: 'Hesburgh Library',
    postedAgo: '2h ago',
    posterName: 'Jordan L.',
    posterInitials: 'JL',
  },
  {
    id: '4',
    title: 'Walk my dog this weekend',
    payout: '$15',
    category: 'Pets',
    where: 'Sorin College · 0.2 mi',
    postedAgo: '3h ago',
    posterName: 'Sam R.',
    posterInitials: 'SR',
  },
  {
    id: '5',
    title: 'Photographer for senior portraits at the Dome',
    payout: '$80',
    category: 'Creative',
    where: 'Main Building · 0.6 mi',
    postedAgo: '5h ago',
    posterName: 'Aisha M.',
    posterInitials: 'AM',
  },
  {
    id: '6',
    title: 'Pick up Amazon package & drop it at my dorm',
    payout: '$8',
    category: 'Errands',
    where: 'LaFortune · 0.3 mi',
    postedAgo: 'yesterday',
    posterName: 'Tyler J.',
    posterInitials: 'TJ',
  },
];

const CATEGORIES = ['All', 'Tutoring', 'Moving', 'Rideshare', 'Pets', 'Creative', 'Errands'] as const;

export default function GigsScreen() {
  const [selected, setSelected] = useState<(typeof CATEGORIES)[number]>('All');
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];

  const visible = selected === 'All' ? MOCK_GIGS : MOCK_GIGS.filter((g) => g.category === selected);

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <View>
          <ThemedText type="title" style={styles.brand}>
            quad
          </ThemedText>
          <ThemedText style={[styles.subtle, { color: c.textSecondary }]}>
            University of Notre Dame · 142 online
          </ThemedText>
        </View>
        <View style={[styles.avatar, { backgroundColor: c.subtle, borderColor: c.border }]}>
          <ThemedText style={styles.avatarText}>YO</ThemedText>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <CampusMap />

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
                    backgroundColor: active ? c.tint : c.subtle,
                    borderColor: active ? c.tint : c.border,
                  },
                ]}>
                <ThemedText
                  style={[
                    styles.filterPillText,
                    { color: active ? c.background : c.textSecondary },
                  ]}>
                  {cat}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.list}>
          {visible.map((gig) => (
            <GigCard key={gig.id} gig={gig} c={c} />
          ))}
          {visible.length === 0 && (
            <ThemedText style={[styles.subtle, { textAlign: 'center', marginTop: 40 }]}>
              No gigs in this category yet.
            </ThemedText>
          )}
        </View>

        <View style={{ height: 96 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => {}}>
        <IconSymbol name="plus" size={18} color={c.background} />
        <ThemedText style={[styles.fabText, { color: c.background }]}>Post a gig</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function GigCard({ gig, c }: { gig: Gig; c: (typeof Colors)['light'] }) {
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
        <View style={[styles.catTag, { backgroundColor: c.subtle }]}>
          <ThemedText style={[styles.catTagText, { color: c.textSecondary }]}>
            {gig.category}
          </ThemedText>
        </View>
        <ThemedText type="defaultSemiBold" style={[styles.payout, { color: c.text }]}>
          {gig.payout}
        </ThemedText>
      </View>

      <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
        {gig.title}
      </ThemedText>

      <View style={styles.cardMeta}>
        <IconSymbol name="mappin.and.ellipse" size={13} color={c.textSecondary} />
        <ThemedText style={[styles.metaText, { color: c.textSecondary }]}>{gig.where}</ThemedText>
      </View>

      <View style={[styles.divider, { backgroundColor: c.border }]} />

      <View style={styles.cardFooter}>
        <View style={styles.posterRow}>
          <View style={[styles.posterAvatar, { backgroundColor: c.subtle }]}>
            <ThemedText style={styles.posterAvatarText}>{gig.posterInitials}</ThemedText>
          </View>
          <ThemedText style={[styles.metaText, { color: c.text }]}>{gig.posterName}</ThemedText>
        </View>
        <ThemedText style={[styles.metaText, { color: c.textSecondary }]}>{gig.postedAgo}</ThemedText>
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
    paddingBottom: 20,
  },
  brand: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subtle: {
    fontSize: 13,
    marginTop: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scroll: {
    paddingBottom: 20,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 16,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    paddingHorizontal: 20,
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
  catTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  catTagText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  payout: {
    fontSize: 18,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 13,
  },
  divider: {
    height: 1,
    marginTop: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  posterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  posterAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterAvatarText: {
    fontSize: 10,
    fontWeight: '600',
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
