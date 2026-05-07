import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Msg = { from: 'me' | 'them'; text: string; time?: string };

type Convo = {
  name: string;
  initials: string;
  context: string;
  online: boolean;
  messages: Msg[];
};

const CONVOS: Record<string, Convo> = {
  marcus: {
    name: 'Marcus K.',
    initials: 'MK',
    context: 'Re: Help moving a couch · $40',
    online: true,
    messages: [
      { from: 'them', text: 'hey! is the couch still up for moving this afternoon?', time: '2:14 PM' },
      { from: 'me', text: 'yeah! how does 3pm work?' },
      { from: 'them', text: "perfect. it's a 2-seater leather, going from Dillon Hall up to Sorin 4th floor" },
      { from: 'me', text: "cool. I'll bring my friend Tyler so it's faster, $40 split between us is fine" },
      { from: 'them', text: 'works for me 🙏' },
      { from: 'them', text: 'Sounds good! See you at 3', time: '2:32 PM' },
    ],
  },
  priya: {
    name: 'Priya S.',
    initials: 'PS',
    context: 'Re: SBN airport ride · $15',
    online: false,
    messages: [
      { from: 'them', text: 'are you still doing the SBN ride saturday?', time: '1:05 PM' },
      { from: 'me', text: 'yes! 6am pickup at the front circle?' },
      { from: 'them', text: 'I can grab you from Dillon', time: '1:42 PM' },
    ],
  },
  jordan: {
    name: 'Jordan L.',
    initials: 'JL',
    context: 'Re: MATH 10560 tutor · $30/hr',
    online: true,
    messages: [
      { from: 'me', text: 'hey, saw your tutoring post — could you help me prep for the midterm?' },
      { from: 'them', text: "for sure. what's tripping you up?", time: '11:02 AM' },
      { from: 'me', text: 'mostly series convergence and integration by parts' },
      { from: 'them', text: 'Want to meet at Hesburgh tonight?', time: '11:15 AM' },
    ],
  },
  'cse-cram': {
    name: 'CSE 20110 cram',
    initials: 'CS',
    context: 'Group · 4 people · Tonight 8pm',
    online: true,
    messages: [
      { from: 'them', text: 'who needs to review proof by induction lol' },
      { from: 'me', text: 'me 😅' },
      { from: 'them', text: 'same' },
      { from: 'them', text: 'Bringing snacks 🥨', time: '10:48 AM' },
    ],
  },
  aisha: {
    name: 'Aisha M.',
    initials: 'AM',
    context: 'Re: Senior portraits · $80',
    online: false,
    messages: [
      { from: 'them', text: 'hey! got time to chat about your shoot?' },
      { from: 'me', text: 'yes — thinking late afternoon for golden hour at the Dome' },
      { from: 'them', text: 'perfect time. I can do this Friday or Sunday' },
      { from: 'them', text: 'Sent you a few sample shots 📸', time: 'Yesterday' },
    ],
  },
  sam: {
    name: 'Sam R.',
    initials: 'SR',
    context: 'Re: Dog walk · $15',
    online: false,
    messages: [
      { from: 'me', text: 'all done — Bagel had a great time at the lakes!' },
      { from: 'them', text: 'omg the photo is so cute, ty' },
      { from: 'them', text: 'Thanks again — Bagel loved it', time: '2 days ago' },
    ],
  },
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = Colors[useColorScheme() ?? 'light'];
  const convo = CONVOS[id ?? ''] ?? CONVOS.marcus;
  const [draft, setDraft] = useState('');

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.background }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ThemedText style={styles.back}>‹</ThemedText>
        </Pressable>
        <View style={[styles.headerAvatar, { backgroundColor: c.subtle, borderColor: c.border }]}>
          <ThemedText style={styles.headerAvatarText}>{convo.initials}</ThemedText>
          {convo.online && <View style={[styles.onlineDot, { borderColor: c.background }]} />}
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText type="defaultSemiBold" style={styles.headerName}>
            {convo.name}
          </ThemedText>
          <ThemedText style={[styles.headerContext, { color: c.textSecondary }]}>
            {convo.context}
          </ThemedText>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}>
        {convo.messages.map((m, i) => (
          <View key={i}>
            <View style={[styles.bubbleRow, m.from === 'me' && styles.bubbleRowRight]}>
              <View
                style={[
                  styles.bubble,
                  m.from === 'me'
                    ? { backgroundColor: c.tint, borderTopRightRadius: 4 }
                    : { backgroundColor: c.subtle, borderTopLeftRadius: 4 },
                ]}>
                <ThemedText
                  style={[
                    styles.bubbleText,
                    { color: m.from === 'me' ? c.background : c.text },
                  ]}>
                  {m.text}
                </ThemedText>
              </View>
            </View>
            {m.time && (
              <ThemedText
                style={[
                  styles.timeText,
                  { color: c.textSecondary },
                  m.from === 'me' && styles.timeTextRight,
                ]}>
                {m.time}
              </ThemedText>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.inputBar, { borderTopColor: c.border, backgroundColor: c.background }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message..."
          placeholderTextColor={c.textSecondary}
          style={[styles.input, { color: c.text, backgroundColor: c.subtle, borderColor: c.border }]}
        />
        <Pressable
          onPress={() => setDraft('')}
          disabled={!draft.trim()}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: draft.trim() ? c.tint : c.subtle,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <ThemedText
            style={[
              styles.sendText,
              { color: draft.trim() ? c.background : c.textSecondary },
            ]}>
            Send
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    fontSize: 32,
    fontWeight: '300',
    width: 24,
    lineHeight: 32,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 12,
    fontWeight: '600',
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#22c55e',
    borderWidth: 2,
  },
  headerName: {
    fontSize: 15,
  },
  headerContext: {
    fontSize: 12,
    marginTop: 1,
  },
  messages: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 4,
  },
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 4,
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  timeText: {
    fontSize: 11,
    textAlign: 'left',
    marginVertical: 6,
    marginLeft: 4,
  },
  timeTextRight: {
    textAlign: 'right',
    marginRight: 4,
    marginLeft: 0,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 15,
  },
  sendBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  sendText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
