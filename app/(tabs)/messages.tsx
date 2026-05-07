import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Convo = {
  id: string;
  name: string;
  initials: string;
  context: string;
  preview: string;
  time: string;
  unread?: boolean;
};

const CONVOS: Convo[] = [
  {
    id: 'marcus',
    name: 'Marcus K.',
    initials: 'MK',
    context: '🛋️ Help moving a couch · $40',
    preview: 'Sounds good! See you at 3',
    time: '12m',
    unread: true,
  },
  {
    id: 'priya',
    name: 'Priya S.',
    initials: 'PS',
    context: '🚗 SBN airport ride · $15',
    preview: 'I can grab you from Dillon',
    time: '1h',
    unread: true,
  },
  {
    id: 'jordan',
    name: 'Jordan L.',
    initials: 'JL',
    context: '📚 MATH 10560 tutor · $30/hr',
    preview: 'Want to meet at Hesburgh tonight?',
    time: '3h',
  },
  {
    id: 'cse-cram',
    name: 'CSE 20110 cram',
    initials: 'CS',
    context: '🎓 Hangout · 4 people',
    preview: 'Bringing snacks 🥨',
    time: '5h',
  },
  {
    id: 'aisha',
    name: 'Aisha M.',
    initials: 'AM',
    context: '📸 Senior portraits · $80',
    preview: 'Sent you a few sample shots',
    time: '1d',
  },
  {
    id: 'sam',
    name: 'Sam R.',
    initials: 'SR',
    context: '🐶 Dog walk · $15',
    preview: 'Thanks again — Bagel loved it',
    time: '2d',
  },
];

export default function MessagesScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const unreadCount = CONVOS.filter((co) => co.unread).length;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.brand}>
          Messages
        </ThemedText>
        <ThemedText style={[styles.subtle, { color: c.textSecondary }]}>
          {unreadCount} unread · {CONVOS.length} total
        </ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {CONVOS.map((co) => (
          <Pressable
            key={co.id}
            onPress={() => router.push(`/chat/${co.id}`)}
            style={({ pressed }) => [
              styles.row,
              {
                borderBottomColor: c.border,
                backgroundColor: pressed ? c.subtle : 'transparent',
              },
            ]}>
            <View style={[styles.avatar, { backgroundColor: c.subtle, borderColor: c.border }]}>
              <ThemedText style={styles.avatarText}>{co.initials}</ThemedText>
            </View>

            <View style={styles.rowMain}>
              <View style={styles.rowTop}>
                <ThemedText type="defaultSemiBold" style={styles.name}>
                  {co.name}
                </ThemedText>
                <ThemedText style={[styles.time, { color: c.textSecondary }]}>{co.time}</ThemedText>
              </View>
              <ThemedText style={[styles.context, { color: c.textSecondary }]}>
                {co.context}
              </ThemedText>
              <View style={styles.rowBottom}>
                <ThemedText
                  numberOfLines={1}
                  style={[
                    styles.preview,
                    { color: co.unread ? c.text : c.textSecondary },
                    co.unread && styles.previewUnread,
                  ]}>
                  {co.preview}
                </ThemedText>
                {co.unread && <View style={[styles.unreadDot, { backgroundColor: c.tint }]} />}
              </View>
            </View>
          </Pressable>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
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
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '600',
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
  },
  time: {
    fontSize: 12,
  },
  context: {
    fontSize: 12,
    marginBottom: 2,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  preview: {
    fontSize: 14,
    flex: 1,
  },
  previewUnread: {
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
