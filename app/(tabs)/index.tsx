import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CampusMap } from '@/components/campus-map';
import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { GIG_CATEGORIES, usePosts, type Gig } from '@/lib/posts-store';

const CATEGORIES = ['All', ...GIG_CATEGORIES] as const;

export default function GigsScreen() {
  const [selected, setSelected] = useState<(typeof CATEGORIES)[number]>('All');
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const { profile } = useAuth();
  const { gigs, loading, hydrated } = usePosts();

  const visible = selected === 'All' ? gigs : gigs.filter((g) => g.category === selected);
  const showLoading = !hydrated && loading && gigs.length === 0;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <NamePlaque size="md" />
          <ThemedText style={[styles.subtle, { color: c.textSecondary }]}>
            University of Notre Dame · 142 online
          </ThemedText>
        </View>
        <Pressable
          onPress={() => router.push('/modal')}
          accessibilityLabel="Open your profile"
          style={({ pressed }) => [
            styles.avatar,
            {
              backgroundColor: c.subtle,
              borderColor: c.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <ThemedText style={styles.avatarText}>{profile?.initials || '?'}</ThemedText>
        </Pressable>
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
          {showLoading ? (
            <ThemedText
              style={[styles.subtle, { textAlign: 'center', marginTop: 40, color: c.textSecondary }]}>
              Loading gigs…
            </ThemedText>
          ) : (
            <>
              {visible.map((gig) => (
                <GigCard key={gig.id} gig={gig} c={c} />
              ))}
              {visible.length === 0 && (
                <ThemedText
                  style={[styles.subtle, { textAlign: 'center', marginTop: 40, color: c.textSecondary }]}>
                  {gigs.length === 0
                    ? 'No gigs posted yet — be the first.'
                    : 'No gigs in this category yet.'}
                </ThemedText>
              )}
            </>
          )}
        </View>

        <View style={{ height: 96 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => router.push('/post-gig')}>
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
      onPress={() => router.push({ pathname: '/gig/[id]', params: { id: gig.id } })}>
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
            <ThemedText style={styles.posterAvatarText}>
              {gig.anonymous || !gig.posterInitials ? '??' : gig.posterInitials}
            </ThemedText>
          </View>
          <ThemedText style={[styles.metaText, { color: c.text }]}>
            {gig.anonymous || !gig.posterName ? 'Anonymous' : gig.posterName}
          </ThemedText>
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
  brandBlock: {
    gap: 6,
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
    borderRadius: 4,
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
    borderRadius: 4,
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
