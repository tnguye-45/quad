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
import { GIG_CATEGORIES, usePosts, type GigCategory } from '@/lib/posts-store';

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
  const canSubmit =
    !busy &&
    title.trim().length >= 3 &&
    category !== null &&
    payoutNumber > 0 &&
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
      await addGig({
        title: title.trim(),
        description: description.trim() || undefined,
        payout: `$${Math.round(payoutNumber)}`,
        category,
        where: where.trim(),
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
              Post a gig
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              A quick task you&apos;ll pay another student to do.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <Field
              label="Title *"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Help move a couch up 3 flights"
              colors={c}
            />

            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                Category *
              </ThemedText>
              <View style={styles.chipRow}>
                {GIG_CATEGORIES.map((cat) => {
                  const active = category === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setCategory(cat)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? c.tint : c.card,
                          borderColor: active ? c.tint : c.border,
                        },
                      ]}>
                      <ThemedText
                        style={[
                          styles.chipText,
                          { color: active ? c.background : c.text },
                        ]}>
                        {cat}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                  Payout *
                </ThemedText>
                <View style={[styles.inputWithPrefix, { borderColor: c.border, backgroundColor: c.card }]}>
                  <ThemedText style={[styles.prefix, { color: c.textSecondary }]}>$</ThemedText>
                  <TextInput
                    value={payout}
                    onChangeText={setPayout}
                    placeholder="40"
                    placeholderTextColor={c.textSecondary}
                    keyboardType="numeric"
                    style={[styles.inputBare, { color: c.text }]}
                  />
                </View>
              </View>
              <View style={[styles.fieldGroup, { flex: 2 }]}>
                <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                  Where *
                </ThemedText>
                <TextInput
                  value={where}
                  onChangeText={setWhere}
                  placeholder="e.g. Dillon Hall"
                  placeholderTextColor={c.textSecondary}
                  style={[
                    styles.input,
                    { borderColor: c.border, color: c.text, backgroundColor: c.card },
                  ]}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                Description
              </ThemedText>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Anything else they should know?"
                placeholderTextColor={c.textSecondary}
                multiline
                numberOfLines={3}
                maxLength={400}
                style={[
                  styles.input,
                  styles.descInput,
                  { borderColor: c.border, color: c.text, backgroundColor: c.card },
                ]}
              />
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

function Field({
  label,
  colors,
  ...rest
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  colors: (typeof Colors)['light'];
}) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</ThemedText>
      <TextInput
        {...rest}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.card },
        ]}
      />
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
  const options = [
    { value: false, label: 'Show my profile' },
    { value: true, label: 'Post anonymously' },
  ];
  return (
    <View style={styles.fieldGroup}>
      <ThemedText style={[styles.fieldLabel, { color: colors.textSecondary }]}>
        Post as
      </ThemedText>
      <View style={styles.segmentRow}>
        {options.map((opt) => {
          const active = anonymous === opt.value;
          return (
            <Pressable
              key={opt.label}
              onPress={() => onChange(opt.value)}
              style={[
                styles.segment,
                {
                  backgroundColor: active ? colors.tint : colors.card,
                  borderColor: active ? colors.tint : colors.border,
                },
              ]}>
              <ThemedText
                style={[
                  styles.segmentText,
                  { color: active ? colors.background : colors.text },
                ]}>
                {opt.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View
        style={[
          styles.previewRow,
          { backgroundColor: colors.subtle, borderColor: colors.border },
        ]}>
        <View
          style={[styles.previewAvatar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={[styles.previewAvatarText, { color: colors.text }]}>
            {anonymous ? '??' : initials || '??'}
          </ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText type="defaultSemiBold" style={{ color: colors.text, fontSize: 13 }}>
            {anonymous ? 'Anonymous' : displayName || 'No profile yet'}
          </ThemedText>
          <ThemedText style={{ color: colors.textSecondary, fontSize: 12 }}>
            {anonymous
              ? 'Other students will not see your name.'
              : 'This is how your post will appear.'}
          </ThemedText>
        </View>
      </View>
    </View>
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
  inputWithPrefix: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
  },
  inputBare: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: Fonts?.mono,
  },
  prefix: {
    fontSize: 14,
    marginRight: 4,
    fontFamily: Fonts?.mono,
  },
  descInput: {
    minHeight: 84,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  row: { flexDirection: 'row', gap: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
  },
  previewRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
  },
  previewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAvatarText: { fontSize: 11, fontWeight: '600' },
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
