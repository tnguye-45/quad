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
import { Colors, Fonts } from '@/constants/theme';
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
  // Voices default to anonymous — that's the whole point of the tab.
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
          <View style={styles.heroBlock}>
            <ThemedText type="title" style={styles.heading}>
              Speak your mind
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              Anonymous by default. Other students can upvote or push back.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                Topic *
              </ThemedText>
              <View style={styles.chipRow}>
                {VOICE_TOPICS.map((t) => {
                  const active = topic === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setTopic(t)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? c.tint : c.card,
                          borderColor: active ? c.tint : c.border,
                        },
                      ]}>
                      <ThemedText style={styles.chipEmoji}>{VOICE_TOPIC_EMOJI[t]}</ThemedText>
                      <ThemedText
                        style={[
                          styles.chipText,
                          { color: active ? c.background : c.text },
                        ]}>
                        {t}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                What&apos;s on your mind? *
              </ThemedText>
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="Say it. No filters."
                placeholderTextColor={c.textSecondary}
                multiline
                numberOfLines={5}
                maxLength={400}
                style={[
                  styles.input,
                  styles.bodyInput,
                  { borderColor: c.border, color: c.text, backgroundColor: c.card },
                ]}
              />
              <ThemedText style={[styles.charCount, { color: c.textSecondary }]}>
                {body.length}/400
              </ThemedText>
            </View>

            <PostAsToggle
              anonymous={anonymous}
              onChange={setAnonymous}
              displayName={profile?.display_name ?? null}
              initials={profile?.initials ?? null}
              colors={c}
            />

            {err ? <ThemedText style={styles.error}>{err}</ThemedText> : null}

            <Pressable
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.cta,
                {
                  backgroundColor: c.tint,
                  opacity: !canSubmit ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText style={[styles.ctaText, { color: c.background }]}>
                {busy ? 'Posting…' : 'Post'}
              </ThemedText>
            </Pressable>

            <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
              <ThemedText style={[styles.cancelText, { color: c.textSecondary }]}>
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 24,
    gap: 24,
  },
  heroBlock: { gap: 8 },
  heading: { fontSize: 24, lineHeight: 30 },
  tagline: { fontSize: 14, lineHeight: 20 },
  form: { gap: 18 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: Fonts?.mono,
  },
  bodyInput: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  charCount: {
    fontSize: 11,
    alignSelf: 'flex-end',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  chipEmoji: { fontSize: 13 },
  chipText: { fontSize: 13, fontWeight: '500' },
  error: { fontSize: 14, lineHeight: 20, color: '#dc2626' },
  cta: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 4,
    alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '600' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 14 },
});
