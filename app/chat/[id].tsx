import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { ensureSelfMembership, useThread } from '@/lib/messaging';

type Msg = { from: 'me' | 'them'; text: string; time?: string };

type MockConvo = {
  name: string;
  initials: string;
  context: string;
  online: boolean;
  messages: Msg[];
};

const MOCK_CONVOS: Record<string, MockConvo> = {
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

function formatTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const mock = id ? MOCK_CONVOS[id] : undefined;
  // Use real backend when we have a real session AND the id isn't a known
  // mock label. UUIDs from the gig-detail flow always fall through to real.
  const useReal = realSession && !mock;

  if (useReal) {
    return <RealChat conversationId={id ?? ''} colors={c} userId={session!.user.id} />;
  }
  if (mock) {
    return <MockChat convo={mock} colors={c} />;
  }
  return <EmptyChat colors={c} />;
}

function EmptyChat({ colors }: { colors: (typeof Colors)['light'] }) {
  return (
    <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ThemedText style={styles.back}>‹</ThemedText>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ThemedText type="defaultSemiBold" style={styles.headerName}>
            New conversation
          </ThemedText>
          <ThemedText style={[styles.headerContext, { color: colors.textSecondary }]}>
            No messages yet
          </ThemedText>
        </View>
      </View>
      <View style={styles.emptyBlock}>
        <ThemedText type="title" style={styles.emptyHeading}>
          Nothing here yet
        </ThemedText>
        <ThemedText style={[styles.emptyBody, { color: colors.textSecondary }]}>
          Once you and the other student start chatting, your messages will show up here.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

function RealChat({
  conversationId,
  colors: c,
  userId,
}: {
  conversationId: string;
  colors: (typeof Colors)['light'];
  userId: string;
}) {
  const { messages, partnerName, partnerInitials, loading, send, conversation } = useThread(
    conversationId,
  );
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);

  // If we open a freshly-created conversation, the poster may not yet be a
  // member — but if we (the viewer) are missing too, this no-ops safely.
  useEffect(() => {
    if (conversationId) {
      ensureSelfMembership({ conversationId, meId: userId });
    }
  }, [conversationId, userId]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await send(text);
  }

  const contextLabel = conversation?.gig
    ? `Re: ${conversation.gig.title}`
    : conversation?.hangout
      ? `Hangout · ${conversation.hangout.title}`
      : 'Conversation';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}>
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.background }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ThemedText style={styles.back}>‹</ThemedText>
          </Pressable>
          <View style={[styles.headerAvatar, { backgroundColor: c.subtle, borderColor: c.border }]}>
            <ThemedText style={styles.headerAvatarText}>{partnerInitials}</ThemedText>
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="defaultSemiBold" style={styles.headerName}>
              {partnerName}
            </ThemedText>
            <ThemedText style={[styles.headerContext, { color: c.textSecondary }]} numberOfLines={1}>
              {contextLabel}
            </ThemedText>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}>
          {loading && messages.length === 0 ? (
            <ThemedText style={[styles.loadingHint, { color: c.textSecondary }]}>
              Loading…
            </ThemedText>
          ) : messages.length === 0 ? (
            <ThemedText style={[styles.loadingHint, { color: c.textSecondary }]}>
              No messages yet — say hi.
            </ThemedText>
          ) : (
            messages.map((m, i) => (
              <View key={m.id ?? i}>
                <View style={[styles.bubbleRow, m.sender_id === userId && styles.bubbleRowRight]}>
                  <View
                    style={[
                      styles.bubble,
                      m.sender_id === userId
                        ? { backgroundColor: c.tint, borderTopRightRadius: 4 }
                        : { backgroundColor: c.subtle, borderTopLeftRadius: 4 },
                    ]}>
                    <ThemedText
                      style={[
                        styles.bubbleText,
                        { color: m.sender_id === userId ? c.background : c.text },
                      ]}>
                      {m.body}
                    </ThemedText>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <View style={[styles.inputBar, { borderTopColor: c.border, backgroundColor: c.background }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSend}
            placeholder="Message..."
            placeholderTextColor={c.textSecondary}
            returnKeyType="send"
            blurOnSubmit={false}
            style={[styles.input, { color: c.text, backgroundColor: c.subtle, borderColor: c.border }]}
          />
          <Pressable
            onPress={handleSend}
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
    </KeyboardAvoidingView>
  );
}

function MockChat({ convo, colors: c }: { convo: MockConvo; colors: (typeof Colors)['light'] }) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Msg[]>(convo.messages);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    setMessages(convo.messages);
    setDraft('');
  }, [convo]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    const newMsg: Msg = { from: 'me', text, time: formatTime(new Date()) };
    setMessages((cur) => [...cur, newMsg]);
    setDraft('');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}>
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
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}>
          {messages.map((m, i) => (
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
            onSubmitEditing={handleSend}
            placeholder="Message..."
            placeholderTextColor={c.textSecondary}
            returnKeyType="send"
            blurOnSubmit={false}
            style={[styles.input, { color: c.text, backgroundColor: c.subtle, borderColor: c.border }]}
          />
          <Pressable
            onPress={handleSend}
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
    </KeyboardAvoidingView>
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
  loadingHint: {
    fontSize: 13,
    textAlign: 'center',
    paddingTop: 40,
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
    borderRadius: 4,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: Fonts?.mono,
  },
  sendBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 4,
  },
  sendText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyHeading: { fontSize: 20 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
