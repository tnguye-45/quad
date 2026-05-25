import { router } from 'expo-router';
import { useState } from 'react';
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
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import {
  usePosts,
  VOICE_TOPICS,
  VOICE_TOPIC_EMOJI,
  type VoiceTopic,
} from '@/lib/posts-store';
import { PostAsToggle } from './post-gig';

export default function PostVoiceScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { addVoice } = usePosts();
  const { profile, session } = useAuth();
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState<VoiceTopic | null>(null);
  const [anonymous, setAnonymous] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit =
    !busy && body.trim().length >= 4 && body.trim().length <= 400 && topic !== null;

  async function handleSubmit() {
    if (!canSubmit || !topic) return;
    if (!session) {
      setErr('Sign in to speak.');
      return;
    }
    if (!anonymous && (!profile?.display_name || !profile.initials)) {
      setErr('Set up your profile before posting under your name.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await addVoice({
        body: body.trim(),
        topic,
        anonymous,
        ownerId: session.user.id,
        posterName: profile?.display_name ?? null,
        posterInitials: profile?.initials ?? null,
        posterAvatarUrl: profile?.avatar_url ?? null,
      });
      router.back();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to post.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}>
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <ThemedText style={[styles.eyebrow, { color: c.accent }]} type="mono">
              voices · anonymous by default
            </ThemedText>
            <ThemedText style={[styles.heading, { color: c.text }]}>
              Speak your mind
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              Other students can upvote or push back. Be sharp, not cruel.
            </ThemedText>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: c.textMuted }]} type="mono">
              topic
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storyRow}>
              {VOICE_TOPICS.map((t) => {
                const active = topic === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setTopic(t)}
                    hitSlop={4}
                    style={styles.story}>
                    <View
                      style={[
                        styles.storyBubble,
                        {
                          borderColor: active ? c.accent : c.border,
                          backgroundColor: active ? c.surface : c.background,
                          borderWidth: active ? 2.5 : 1.5,
                        },
                      ]}>
                      <ThemedText style={styles.storyEmoji}>
                        {VOICE_TOPIC_EMOJI[t]}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={[
                        styles.storyLabel,
                        { color: active ? c.text : c.textSecondary },
                        active && styles.storyLabelActive,
                      ]}
                      type="mono">
                      {t.toLowerCase()}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <ThemedText style={[styles.label, { color: c.textMuted }]} type="mono">
                what&apos;s on your mind
              </ThemedText>
              <ThemedText style={[styles.charCount, { color: c.textMuted }]} type="mono">
                {body.length}/400
              </ThemedText>
            </View>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Say it. No filters."
              placeholderTextColor={c.textMuted}
              multiline
              numberOfLines={6}
              maxLength={400}
              style={[styles.bodyInput, { color: c.text }]}
            />
            <View style={[styles.underline, { backgroundColor: c.border }]} />
          </View>

          <PostAsToggle
            anonymous={anonymous}
            onChange={setAnonymous}
            displayName={profile?.display_name ?? null}
            initials={profile?.initials ?? null}
            colors={c}
          />

          {err ? (
            <ThemedText style={[styles.error, { color: c.danger }]}>{err}</ThemedText>
          ) : null}

          <Pressable
            disabled={!canSubmit}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: c.tint,
                opacity: !canSubmit ? 0.35 : pressed ? 0.85 : 1,
              },
            ]}>
            <ThemedText style={[styles.ctaText, { color: c.background }]}>
              {busy ? 'Posting…' : 'Post'}
            </ThemedText>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.cancelBtn} hitSlop={8}>
            <ThemedText style={[styles.cancelText, { color: c.textMuted }]} type="mono">
              cancel
            </ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 16,
    paddingBottom: 56,
    paddingHorizontal: 24,
    gap: 24,
  },
  hero: { gap: 6 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  tagline: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  fieldGroup: { gap: 10 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  charCount: {
    fontSize: 10,
    letterSpacing: 0.6,
  },
  storyRow: {
    paddingTop: 4,
    paddingBottom: 4,
    gap: 14,
  },
  story: {
    alignItems: 'center',
    gap: 6,
    width: 64,
  },
  storyBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyEmoji: { fontSize: 22 },
  storyLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  storyLabelActive: { fontWeight: '700' },
  bodyInput: {
    fontSize: 17,
    lineHeight: 24,
    minHeight: 140,
    paddingTop: 4,
    paddingHorizontal: 0,
    textAlignVertical: 'top',
  },
  underline: { height: 1 },
  error: { fontSize: 13, lineHeight: 18 },
  cta: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  cancelBtn: { paddingVertical: 8, alignItems: 'center' },
  cancelText: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
