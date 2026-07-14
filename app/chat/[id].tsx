import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { useDevConversations, type DevConversation } from '@/lib/dev-conversations';
import {
  useThread,
  type MemberReadState,
  type Message,
  type TypingState,
} from '@/lib/messaging';
import { uploadMessageImage } from '@/lib/message-images';

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
const SCREEN_W = Dimensions.get('window').width;
const MAX_BUBBLE_IMAGE_W = Math.round(SCREEN_W * 0.62);

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, isDev } = useAuth();
  const realSession = !!session && !isDev;
  const { getConversation } = useDevConversations();

  if (realSession) {
    return <RealChat conversationId={id ?? ''} colors={c} userId={session!.user.id} />;
  }
  const convo = id ? getConversation(id) : undefined;
  if (convo) {
    return <DevChat conversationId={convo.id} colors={c} />;
  }
  return <EmptyChat colors={c} />;
}

function Header({
  colors: c,
  name,
  context,
  initials,
  avatarUri,
  online,
}: {
  colors: (typeof Colors)['light'];
  name: string;
  context: string;
  initials?: string;
  avatarUri?: string | null;
  online?: boolean;
}) {
  return (
    <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.background }]}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}>
        <IconSymbol name="chevron.left" size={26} color={c.text} />
      </Pressable>
      {initials ? (
        <View style={styles.headerAvatarWrap}>
          <Avatar uri={avatarUri} initials={initials} size={38} textSize={12} />
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
  const {
    messages,
    partnerName,
    partnerInitials,
    partnerAvatarUrl,
    loading,
    error,
    send,
    conversation,
    otherReads,
    typing,
    setTyping,
  } = useThread(conversationId);
  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, typing.length]);

  function handleDraftChange(value: string) {
    setDraft(value);
    setTyping(value.length > 0);
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text && !pendingImage) return;
    if (pendingImage) {
      setUploading(true);
      const out = await uploadMessageImage(userId, pendingImage);
      setUploading(false);
      if ('error' in out) {
        Alert.alert("Couldn't send image", out.error);
        return;
      }
      setPendingImage(null);
      setDraft('');
      const ok = await send({
        body: text || undefined,
        image: { url: out.url, width: out.width, height: out.height },
      });
      // Hand the draft back rather than silently eating what they typed.
      if (!ok) {
        setDraft(text);
        setPendingImage(pendingImage);
      }
    } else {
      setDraft('');
      const ok = await send({ body: text });
      if (!ok) setDraft(text);
    }
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo access in Settings to send images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPendingImage(result.assets[0].uri);
    }
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to send photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPendingImage(result.assets[0].uri);
    }
  }

  function openAttachSheet() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take photo', 'Choose from library'],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) pickFromCamera();
          else if (idx === 2) pickFromLibrary();
        },
      );
    } else {
      Alert.alert('Add a photo', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take photo', onPress: pickFromCamera },
        { text: 'Choose from library', onPress: pickFromLibrary },
      ]);
    }
  }

  const contextLabel = conversation?.gig
    ? `Re: ${conversation.gig.title}`
    : conversation?.hangout
      ? `Hangout · ${conversation.hangout.title}`
      : 'Conversation';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
          <Header
            colors={c}
            name={partnerName}
            context={contextLabel}
            initials={partnerInitials}
            avatarUri={partnerAvatarUrl}
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
                // Show the read-receipt row only beneath the latest *sent*
                // message — adding it beneath every bubble is noisy and not
                // what iMessage / IG DMs do.
                const isLatestMine =
                  isMine &&
                  i ===
                    (() => {
                      for (let j = messages.length - 1; j >= 0; j--) {
                        if (messages[j].sender_id === userId) return j;
                      }
                      return -1;
                    })();
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
                      <MessageBubble
                        message={m}
                        isMine={isMine}
                        c={c}
                        onTapImage={(uri) => setExpandedImage(uri)}
                      />
                    </View>
                    {isLatestMine ? (
                      <ReadReceiptRow
                        message={m}
                        otherReads={otherReads}
                        c={c}
                      />
                    ) : null}
                  </View>
                );
              })
            )}

            {typing.length > 0 ? (
              <TypingIndicator typing={typing} c={c} />
            ) : null}
          </ScrollView>

          {pendingImage ? (
            <View
              style={[
                styles.pendingPreview,
                { borderTopColor: c.border, backgroundColor: c.surface },
              ]}>
              <Image
                source={{ uri: pendingImage }}
                style={styles.pendingThumb}
                contentFit="cover"
              />
              <Pressable
                onPress={() => setPendingImage(null)}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.pendingClose,
                  { backgroundColor: c.tint, opacity: pressed ? 0.7 : 1 },
                ]}>
                <IconSymbol name="xmark" size={12} color={c.background} />
              </Pressable>
              <ThemedText
                style={[styles.pendingLabel, { color: c.textMuted }]}
                type="mono">
                {uploading ? 'uploading…' : 'ready to send'}
              </ThemedText>
            </View>
          ) : null}

          {error ? (
            <View style={[styles.errorBar, { borderTopColor: c.border }]}>
              <IconSymbol name="exclamationmark.triangle" size={13} color={c.danger} />
              <ThemedText style={[styles.errorText, { color: c.danger }]} type="mono">
                couldn&apos;t send — check your connection
              </ThemedText>
            </View>
          ) : null}

          <InputBar
            draft={draft}
            setDraft={handleDraftChange}
            onSend={handleSend}
            onAttach={openAttachSheet}
            colors={c}
            disabled={uploading}
            sendableOverride={!!pendingImage}
          />
        </ThemedView>
      </KeyboardAvoidingView>

      <ImageViewerModal
        uri={expandedImage}
        onClose={() => setExpandedImage(null)}
        c={c}
      />
    </GestureHandlerRootView>
  );
}

function TypingIndicator({
  typing,
  c,
}: {
  typing: TypingState[];
  c: (typeof Colors)['light'];
}) {
  const firstName = (typing[0].displayName ?? 'Someone').split(' ')[0];
  const label =
    typing.length === 1
      ? `${firstName} is typing…`
      : typing.length === 2
        ? `${firstName} and ${typing[1].displayName?.split(' ')[0] ?? 'someone'} are typing…`
        : `${typing.length} people typing…`;
  return (
    <View style={styles.typingRow}>
      <ThemedText
        style={[styles.typingText, { color: c.textMuted }]}
        type="mono">
        {label}
      </ThemedText>
    </View>
  );
}

function ReadReceiptRow({
  message,
  otherReads,
  c,
}: {
  message: Message;
  otherReads: MemberReadState[];
  c: (typeof Colors)['light'];
}) {
  if (otherReads.length === 0) return null;
  const readers = otherReads.filter((r) => r.lastReadAt >= message.sent_at);
  if (readers.length === 0) return null;
  // For a 1:1 thread (one other member), "Read" is enough. For groups, show
  // a count so the user knows not everyone has seen it yet.
  const label =
    otherReads.length === 1 ? 'Read' : `Read by ${readers.length}`;
  return (
    <View style={styles.readRow}>
      <ThemedText style={[styles.readText, { color: c.textMuted }]} type="mono">
        {label}
      </ThemedText>
    </View>
  );
}

function MessageBubble({
  message,
  isMine,
  c,
  onTapImage,
}: {
  message: Message;
  isMine: boolean;
  c: (typeof Colors)['light'];
  onTapImage: (uri: string) => void;
}) {
  const hasImage = !!message.image_url;
  const hasText = !!message.body && message.body.length > 0;

  if (hasImage && message.image_url) {
    const w = message.image_width ?? 1080;
    const h = message.image_height ?? 1080;
    const renderW = Math.min(MAX_BUBBLE_IMAGE_W, w);
    const renderH = Math.round((h / w) * renderW);

    return (
      <View
        style={[
          styles.imageBubble,
          isMine
            ? { borderBottomRightRadius: 4 }
            : { borderBottomLeftRadius: 4 },
        ]}>
        <Pressable
          onPress={() => onTapImage(message.image_url!)}
          accessibilityRole="button"
          accessibilityLabel="View image full size"
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <Image
            source={{ uri: message.image_url }}
            style={{
              width: renderW,
              height: renderH,
              borderRadius: 16,
              backgroundColor: c.subtle,
            }}
            contentFit="cover"
            transition={150}
          />
        </Pressable>
        {hasText ? (
          <ThemedText
            style={[styles.imageCaption, { color: c.text }]}>
            {message.body}
          </ThemedText>
        ) : null}
      </View>
    );
  }

  return (
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
        {message.body}
      </ThemedText>
    </View>
  );
}

function ImageViewerModal({
  uri,
  onClose,
  c,
}: {
  uri: string | null;
  onClose: () => void;
  c: (typeof Colors)['light'];
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (uri) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [uri, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(5, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      visible={!!uri}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.viewerBackdrop}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          style={({ pressed }) => [styles.viewerClose, { opacity: pressed ? 0.6 : 1 }]}>
          <IconSymbol name="xmark" size={22} color="#FFFFFF" />
        </Pressable>
        {uri ? (
          <GestureDetector gesture={composed}>
            <Animated.View style={[styles.viewerImageWrap, animatedStyle]}>
              <Image
                source={{ uri }}
                style={styles.viewerImage}
                contentFit="contain"
              />
            </Animated.View>
          </GestureDetector>
        ) : null}
        <ThemedText
          style={[styles.viewerHint, { color: c.textMuted }]}
          type="mono">
          pinch to zoom · double-tap
        </ThemedText>
      </View>
    </Modal>
  );
}

function DevChat({
  conversationId,
  colors: c,
}: {
  conversationId: string;
  colors: (typeof Colors)['light'];
}) {
  const { getConversation, sendMessage, markRead } = useDevConversations();
  const convo = getConversation(conversationId) as DevConversation | undefined;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const messages = convo?.messages ?? [];
  const isGroup = convo?.kind === 'hangout';

  // Clear the unread dot once the thread is open.
  useEffect(() => {
    markRead(conversationId);
  }, [conversationId, markRead]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    sendMessage(conversationId, text);
    setDraft('');
  }

  if (!convo) return <EmptyChat colors={c} />;

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
            const prev = messages[i - 1];
            const showStamp = !prev || m.sentAt - prev.sentAt > TIME_CLUSTER_GAP_MS;
            const showSender =
              isGroup && !isMine && !!m.senderName &&
              (!prev || prev.senderName !== m.senderName || prev.from === 'me');
            return (
              <View key={m.id ?? i}>
                {showStamp ? (
                  <ThemedText
                    style={[styles.clusterStamp, { color: c.textMuted }]}
                    type="mono">
                    {formatStamp(m.sentAt)}
                  </ThemedText>
                ) : null}
                {showSender ? (
                  <ThemedText
                    style={[styles.groupSender, { color: c.textMuted }]}
                    type="mono">
                    {m.senderName}
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
  onAttach,
  colors: c,
  disabled,
  sendableOverride,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  colors: (typeof Colors)['light'];
  disabled?: boolean;
  sendableOverride?: boolean;
}) {
  const canSend =
    !disabled && (draft.trim().length > 0 || !!sendableOverride);
  return (
    <View
      style={[
        styles.inputBar,
        { borderTopColor: c.border, backgroundColor: c.background },
      ]}>
      {onAttach ? (
        <Pressable
          onPress={onAttach}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          accessibilityState={{ disabled: !!disabled }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.attachBtn,
            { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
          ]}>
          <IconSymbol name="plus" size={22} color={c.text} />
        </Pressable>
      ) : null}
      <View style={[styles.inputWrap, { backgroundColor: c.subtle, borderColor: c.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={onSend}
          placeholder="Message…"
          placeholderTextColor={c.textMuted}
          returnKeyType="send"
          blurOnSubmit={false}
          editable={!disabled}
          style={[styles.input, { color: c.text }]}
        />
      </View>
      <Pressable
        onPress={onSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
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
  headerAvatarWrap: {
    position: 'relative',
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
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  errorText: {
    fontSize: 11,
    letterSpacing: 0.4,
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
  groupSender: {
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
    paddingLeft: 4,
    paddingBottom: 2,
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
  imageBubble: {
    maxWidth: '78%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  imageCaption: {
    fontSize: 14,
    lineHeight: 18,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  typingRow: {
    alignItems: 'flex-start',
    paddingTop: 4,
    paddingBottom: 8,
  },
  typingText: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'lowercase',
  },
  readRow: {
    alignItems: 'flex-end',
    paddingRight: 4,
    paddingTop: 2,
    paddingBottom: 4,
  },
  readText: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  pendingPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pendingThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  pendingClose: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingLabel: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flex: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
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
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 60,
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    zIndex: 2,
  },
  viewerImageWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerHint: {
    position: 'absolute',
    bottom: 48,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
