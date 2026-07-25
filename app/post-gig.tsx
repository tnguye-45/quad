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
import { GIG_CATEGORIES, usePosts, type GigCategory } from '@/lib/posts-store';

const CATEGORY_EMOJI: Record<GigCategory, string> = {
  Tutoring: '📚',
  Moving: '📦',
  Rideshare: '🚗',
  Pets: '🐾',
  Creative: '🎨',
  Errands: '🛒',
};

export default function PostGigScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { addGig } = usePosts();
  const { profile, session } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GigCategory | null>(null);
  const [payout, setPayout] = useState('');
  const [where, setWhere] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const payoutNumber = Number(payout.replace(/[^0-9.]/g, ''));
  // DB check caps payout_cents at 1_000_000 ($10,000) — mirror it client-side.
  const payoutTooHigh = payoutNumber > 10000;
  const canSubmit =
    !busy &&
    title.trim().length >= 3 &&
    category !== null &&
    payoutNumber > 0 &&
    !payoutTooHigh &&
    where.trim().length >= 2;

  async function handleSubmit() {
    if (!canSubmit || !category) return;
    if (!session) {
      setErr('Sign in to post.');
      return;
    }
    if (!anonymous && (!profile?.display_name || !profile.initials)) {
      setErr('Set up your profile before posting under your name.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const ok = await addGig({
        title: title.trim(),
        description: description.trim() || undefined,
        payout: `$${Math.round(payoutNumber)}`,
        category,
        where: where.trim(),
        anonymous,
        ownerId: session.user.id,
        posterName: profile?.display_name ?? null,
        posterInitials: profile?.initials ?? null,
        posterAvatarUrl: profile?.avatar_url ?? null,
      });
      if (ok !== true) {
        // Keep the compose screen open with the typed content instead of
        // popping as if it saved.
        setErr(
          ok === 'rate_limited'
            ? "You're posting a lot right now — try again in a bit."
            : "Couldn't post your gig. Check your connection and try again.",
        );
        return;
      }
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
              gigs · paid task
            </ThemedText>
            <ThemedText style={[styles.heading, { color: c.text }]}>
              Post a gig
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              A quick task you&apos;ll pay another student to do.
            </ThemedText>
          </View>

          <FieldGroup label="Title" colors={c}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Help move a couch up 3 flights"
              placeholderTextColor={c.textMuted}
              maxLength={120}
              style={[styles.input, { color: c.text }]}
            />
            <View style={[styles.underline, { backgroundColor: c.border }]} />
          </FieldGroup>

          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: c.textMuted }]} type="mono">
              category
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storyRow}>
              {GIG_CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
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
                      <ThemedText style={styles.storyEmoji}>
                        {CATEGORY_EMOJI[cat]}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={[
                        styles.storyLabel,
                        { color: active ? c.text : c.textSecondary },
                        active && styles.storyLabelActive,
                      ]}
                      type="mono">
                      {cat.toLowerCase()}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.row}>
            <FieldGroup label="Payout" colors={c} style={{ flex: 1 }}>
              <View style={styles.inputWithPrefix}>
                <ThemedText style={[styles.prefix, { color: c.textMuted }]}>$</ThemedText>
                <TextInput
                  value={payout}
                  onChangeText={setPayout}
                  placeholder="40"
                  placeholderTextColor={c.textMuted}
                  keyboardType="numeric"
                  maxLength={5}
                  style={[styles.input, styles.inputBare, { color: c.text }]}
                />
              </View>
              <View style={[styles.underline, { backgroundColor: c.border }]} />
              {payoutTooHigh ? (
                <ThemedText style={[styles.fieldHint, { color: c.danger }]} type="mono">
                  max $10,000
                </ThemedText>
              ) : null}
            </FieldGroup>
            <FieldGroup label="Where" colors={c} style={{ flex: 2 }}>
              <TextInput
                value={where}
                onChangeText={setWhere}
                placeholder="Dillon Hall"
                placeholderTextColor={c.textMuted}
                maxLength={80}
                style={[styles.input, { color: c.text }]}
              />
              <View style={[styles.underline, { backgroundColor: c.border }]} />
            </FieldGroup>
          </View>

          <FieldGroup label="Description" colors={c}>
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
              {busy ? 'Posting…' : 'Post gig'}
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={styles.cancelBtn}>
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

export function PostAsToggle({
  anonymous,
  onChange,
  displayName,
  initials,
  colors,
}: {
  anonymous: boolean;
  onChange: (next: boolean) => void;
  displayName: string | null;
  initials: string | null;
  colors: (typeof Colors)['light'];
}) {
  const options: { value: boolean; label: string }[] = [
    { value: false, label: 'My profile' },
    { value: true, label: 'Anonymous' },
  ];
  return (
    <View style={styles.fieldGroup}>
      <ThemedText style={[styles.label, { color: colors.textMuted }]} type="mono">
        post as
      </ThemedText>
      <View style={styles.segmentRow}>
        {options.map((opt) => {
          const active = anonymous === opt.value;
          return (
            <Pressable
              key={opt.label}
              onPress={() => onChange(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={styles.segment}>
              <ThemedText
                style={[
                  styles.segmentText,
                  { color: active ? colors.text : colors.textMuted },
                  active && { fontWeight: '700' },
                ]}>
                {opt.label}
              </ThemedText>
              <View
                style={[
                  styles.segmentUnderline,
                  {
                    backgroundColor: active ? colors.accent : 'transparent',
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.previewRow, { borderColor: colors.border }]}>
        <View
          style={[
            styles.previewAvatar,
            { borderColor: colors.border, backgroundColor: colors.subtle },
          ]}>
          <ThemedText style={[styles.previewAvatarText, { color: colors.text }]}>
            {anonymous ? '?' : initials || '?'}
          </ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.previewName, { color: colors.text }]}>
            {anonymous ? 'Anonymous' : displayName || 'Set up your profile'}
          </ThemedText>
          <ThemedText
            style={[styles.previewHint, { color: colors.textMuted }]}
            type="mono">
            {anonymous ? 'no name shown on this post' : 'shown to other students'}
          </ThemedText>
        </View>
      </View>
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
  inputWithPrefix: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputBare: { flex: 1 },
  prefix: {
    fontSize: 17,
    marginRight: 4,
  },
  underline: {
    height: StyleSheet.hairlineWidth,
  },
  descInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 8,
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
  row: { flexDirection: 'row', gap: 24 },
  segmentRow: {
    flexDirection: 'row',
    gap: 24,
  },
  segment: {
    paddingVertical: 6,
    gap: 6,
  },
  segmentText: {
    fontSize: 14,
  },
  segmentUnderline: {
    height: 2,
    width: '100%',
    borderRadius: 1,
  },
  previewRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAvatarText: { fontSize: 13, fontWeight: '700' },
  previewName: { fontSize: 14, fontWeight: '600' },
  previewHint: {
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 2,
    textTransform: 'lowercase',
  },
  fieldHint: {
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'lowercase',
  },
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
