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
import { HANGOUT_VIBES, usePosts, type HangoutVibe } from '@/lib/posts-store';
import { PostAsToggle } from './post-gig';

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
          <View style={styles.heroBlock}>
            <ThemedText type="title" style={styles.heading}>
              Start a hangout
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              Invite other students to join you for something.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                Title *
              </ThemedText>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Pickup basketball at Rolfs"
                placeholderTextColor={c.textSecondary}
                style={[
                  styles.input,
                  { borderColor: c.border, color: c.text, backgroundColor: c.card },
                ]}
              />
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                Vibe *
              </ThemedText>
              <View style={styles.chipRow}>
                {HANGOUT_VIBES.map((v) => {
                  const active = vibe === v;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => setVibe(v)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? c.tint : c.card,
                          borderColor: active ? c.tint : c.border,
                        },
                      ]}>
                      <ThemedText
                        style={[styles.chipText, { color: active ? c.background : c.text }]}>
                        {v}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                When *
              </ThemedText>
              <TextInput
                value={when}
                onChangeText={setWhen}
                placeholder="e.g. Tonight · 8:00 PM"
                placeholderTextColor={c.textSecondary}
                style={[
                  styles.input,
                  { borderColor: c.border, color: c.text, backgroundColor: c.card },
                ]}
              />
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                Where *
              </ThemedText>
              <TextInput
                value={where}
                onChangeText={setWhere}
                placeholder="e.g. Hesburgh Library, 2nd floor"
                placeholderTextColor={c.textSecondary}
                style={[
                  styles.input,
                  { borderColor: c.border, color: c.text, backgroundColor: c.card },
                ]}
              />
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                Details
              </ThemedText>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Anything else people should know before joining?"
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
                {busy ? 'Starting…' : 'Start hangout'}
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
  descInput: {
    minHeight: 84,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
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
