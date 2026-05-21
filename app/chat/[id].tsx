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
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { useThread } from '@/lib/messaging';

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

// Format a timestamp the way iMessage / Instagram DM does:
// — same day: "2:14 PM"
// — yesterday: "Yesterday 2:14 PM"
// — earlier this week: "Mon 2:14 PM"
// — older: "Mar 5, 2:14 PM"
function formatStamp(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const time = formatTime(d);
  const sameDay =
    d.toDateString() === new Date(now).toDateString();
  if (sameDay) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  const daysAgo = (now - ts) / 86_400_000;
  if (daysAgo < 7) {
    const wd = d.toLocaleDateString(undefined, { weekday: 'short' });
    return `${wd} ${time}`;
  }
  const md = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${md}, ${time}`;
}

const TIME_CLUSTER_GAP_MS = 5 * 60 * 1000;

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const mock = id ? MOCK_CONVOS[id] : undefined;
  const useReal = realSession && !mock;

  if (useReal) {
    return <RealChat conversationId={id ?? ''} colors={c} userId={session!.user.id} />;
  }
  if (mock) {
    return <MockChat convo={mock} colors={c} />;
  }
  return <EmptyChat colors={c} />;
}

function Header({
  colors: c,
  name,
  context,
  initials,
  online,
}: {
  colors: (typeof Colors)['light'];
  name: string;
  context: string;
  initials?: string;
  online?: boolean;
}) {
  return (
    <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.background }]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}>
        <IconSymbol name="chevron.left" size={26} color={c.text} />
      </Pressable>
      {initials ? (
        <View style={[styles.headerAvatar, { backgroundColor: c.subtle, borderColor: c.borderStrong }]}>
          <ThemedText style={[styles.headerAvatarText, { color: c.text }]}>{initials}</ThemedText>
          {online ? (
            <View style={[styles.onlineDot, { backgroundColor: '#22C55E', borderColor: c.background }]} />
          ) : null}
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.headerName, { color: c.text }]}>{name}</ThemedText>
        <ThemedText
          style={[styles.headerContext, { color: c.textMuted }]}
          type="mono"
          numberOfLines={1}>
          {context.toLowerCase()}
        </ThemedText>
      </View>
    </View>
  );
}

function EmptyChat({ colors }: { colors: (typeof Colors)['light'] }) {
  return (
    <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header colors={colors} name="New conversation" context="No messages yet" />
      <View style={styles.emptyBlock}>
        <ThemedText style={[styles.emptyHeading, { color: colors.text }]}>
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
        <Header
          colors={c}
          name={partnerName}
          context={contextLabel}
          initials={partnerInitials}
        />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}>
          {loading && messages.length === 0 ? (
            <ThemedText style={[styles.loadingHint, { color: c.textMuted }]} type="mono">
              loading…
            </ThemedText>
          ) : messages.length === 0 ? (
            <ThemedText style={[styles.loadingHint, { color: c.textMuted }]} type="mono">
              no messages yet — say hi
            </ThemedText>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              const showStamp =
                !prev || m.sent_at - prev.sent_at > TIME_CLUSTER_GAP_MS;
              const isMine = m.sender_id === userId;
              return (
                <View key={m.id ?? i}>
                  {showStamp ? (
                    <ThemedText
                      style={[styles.clusterStamp, { color: c.textMuted }]}
                      type="mono">
                      {formatStamp(m.sent_at)}
                    </ThemedText>
                  ) : null}
                  <View style={[styles.bubbleRow, isMine && styles.bubbleRowRight]}>
                    <View
                      style={[
                        styles.bubble,
                        isMine
                          ? { backgroundColor: c.tint, borderBottomRightRadius: 4 }
                          : { backgroundColor: c.subtle, borderBottomLeftRadius: 4 },
                      ]}>
                      <ThemedText
                        style={[
                          styles.bubbleText,
                          { color: isMine ? c.background : c.text },
                        ]}>
                        {m.body}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <InputBar
          draft={draft}
          setDraft={setDraft}
          onSend={handleSend}
          colors={c}
        />
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
        <Header
          colors={c}
          name={convo.name}
          context={convo.context}
          initials={convo.initials}
          online={convo.online}
        />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}>
          {messages.map((m, i) => {
            const isMine = m.from === 'me';
            return (
              <View key={i}>
                {m.time ? (
                  <ThemedText
                    style={[styles.clusterStamp, { color: c.textMuted }]}
                    type="mono">
                    {m.time}
                  </ThemedText>
                ) : null}
                <View style={[styles.bubbleRow, isMine && styles.bubbleRowRight]}>
                  <View
                    style={[
                      styles.bubble,
                      isMine
                        ? { backgroundColor: c.tint, borderBottomRightRadius: 4 }
                        : { backgroundColor: c.subtle, borderBottomLeftRadius: 4 },
                    ]}>
                    <ThemedText
                      style={[
                        styles.bubbleText,
                        { color: isMine ? c.background : c.text },
                      ]}>
                      {m.text}
                    </ThemedText>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <InputBar
          draft={draft}
          setDraft={setDraft}
          onSend={handleSend}
          colors={c}
        />
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function InputBar({
  draft,
  setDraft,
  onSend,
  colors: c,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  colors: (typeof Colors)['light'];
}) {
  const canSend = draft.trim().length > 0;
  return (
    <View
      style={[
        styles.inputBar,
        { borderTopColor: c.border, backgroundColor: c.background },
      ]}>
      <View style={[styles.inputWrap, { backgroundColor: c.subtle, borderColor: c.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={onSend}
          placeholder="Message…"
          placeholderTextColor={c.textMuted}
          returnKeyType="send"
          blurOnSubmit={false}
          style={[styles.input, { color: c.text }]}
        />
      </View>
      <Pressable
        onPress={onSend}
        disabled={!canSend}
        hitSlop={6}
        style={({ pressed }) => [
          styles.sendBtn,
          {
            backgroundColor: canSend ? c.tint : c.subtle,
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <IconSymbol
          name="arrow.up"
          size={18}
          color={canSend ? c.background : c.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 12,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  headerName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerContext: {
    fontSize: 10,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  messages: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 2,
  },
  loadingHint: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingTop: 40,
  },
  clusterStamp: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingTop: 16,
    paddingBottom: 6,
  },
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 3,
  },
  bubbleRowRight: { justifyContent: 'flex-end' },
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flex: 1,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 6,
    maxHeight: 120,
  },
  input: {
    fontSize: 15,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyHeading: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
