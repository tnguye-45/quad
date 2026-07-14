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
import { HANGOUT_VIBES, usePosts, type HangoutVibe } from '@/lib/posts-store';
import { PostAsToggle } from './post-gig';

const VIBE_EMOJI: Record<HangoutVibe, string> = {
  Study: '📖',
  Sports: '🏀',
  Food: '🍜',
  Social: '🎉',
  Other: '✨',
};

export default function StartHangoutScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { addHangout } = usePosts();
  const { profile, session } = useAuth();
  const [title, setTitle] = useState('');
  const [vibe, setVibe] = useState<HangoutVibe | null>(null);
  const [when, setWhen] = useState('');
  const [where, setWhere] = useState('');
  const [description, setDescription] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit =
    !busy &&
    title.trim().length >= 3 &&
    vibe !== null &&
    when.trim().length >= 2 &&
    where.trim().length >= 2;

  async function handleSubmit() {
    if (!canSubmit || !vibe) return;
    if (!session) {
      setErr('Sign in to host a hangout.');
      return;
    }
    if (!anonymous && (!profile?.display_name || !profile.initials)) {
      setErr('Set up your profile before hosting under your name.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await addHangout({
        title: title.trim(),
        vibe,
        when: when.trim(),
        where: where.trim(),
        description: description.trim() || undefined,
        anonymous,
        ownerId: session.user.id,
        hostName: profile?.display_name ?? null,
        hostInitials: profile?.initials ?? null,
        hostAvatarUrl: profile?.avatar_url ?? null,
      });
      router.back();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to start hangout.');
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
              hangouts · gather
            </ThemedText>
            <ThemedText style={[styles.heading, { color: c.text }]}>
              Start a hangout
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              Invite other students to join you for something.
            </ThemedText>
          </View>

          <FieldGroup label="Title" colors={c}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Pickup basketball at Rolfs"
              placeholderTextColor={c.textMuted}
              style={[styles.input, { color: c.text }]}
            />
            <View style={[styles.underline, { backgroundColor: c.border }]} />
          </FieldGroup>

          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: c.textMuted }]} type="mono">
              vibe
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storyRow}>
              {HANGOUT_VIBES.map((v) => {
                const active = vibe === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => setVibe(v)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
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
                      <ThemedText style={styles.storyEmoji}>{VIBE_EMOJI[v]}</ThemedText>
                    </View>
                    <ThemedText
                      style={[
                        styles.storyLabel,
                        { color: active ? c.text : c.textSecondary },
                        active && styles.storyLabelActive,
                      ]}
                      type="mono">
                      {v.toLowerCase()}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.row}>
            <FieldGroup label="When" colors={c} style={{ flex: 1 }}>
              <TextInput
                value={when}
                onChangeText={setWhen}
                placeholder="Tonight · 8 PM"
                placeholderTextColor={c.textMuted}
                style={[styles.input, { color: c.text }]}
              />
              <View style={[styles.underline, { backgroundColor: c.border }]} />
            </FieldGroup>
            <FieldGroup label="Where" colors={c} style={{ flex: 1 }}>
              <TextInput
                value={where}
                onChangeText={setWhere}
                placeholder="Hesburgh 2F"
                placeholderTextColor={c.textMuted}
                style={[styles.input, { color: c.text }]}
              />
              <View style={[styles.underline, { backgroundColor: c.border }]} />
            </FieldGroup>
          </View>

          <FieldGroup label="Details" colors={c}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Anything else they should know?"
              placeholderTextColor={c.textMuted}
              multiline
              numberOfLines={3}
              maxLength={400}
              style={[styles.input, styles.descInput, { color: c.text }]}
            />
            <View style={[styles.underline, { backgroundColor: c.border }]} />
          </FieldGroup>

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
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: c.tint,
                opacity: !canSubmit ? 0.35 : pressed ? 0.85 : 1,
              },
            ]}>
            <ThemedText style={[styles.ctaText, { color: c.background }]}>
              {busy ? 'Starting…' : 'Start hangout'}
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={styles.cancelBtn}
            hitSlop={8}>
            <ThemedText style={[styles.cancelText, { color: c.textMuted }]} type="mono">
              cancel
            </ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function FieldGroup({
  label,
  children,
  colors,
  style,
}: {
  label: string;
  children: React.ReactNode;
  colors: (typeof Colors)['light'];
  style?: object;
}) {
  return (
    <View style={[styles.fieldGroup, style]}>
      <ThemedText style={[styles.label, { color: colors.textMuted }]} type="mono">
        {label.toLowerCase()}
      </ThemedText>
      {children}
    </View>
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
  label: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  input: {
    fontSize: 17,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  underline: { height: 1 },
  descInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  row: { flexDirection: 'row', gap: 24 },
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
