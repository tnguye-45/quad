import { router, useLocalSearchParams } from 'expo-router';
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
import { supabase } from '@/lib/supabase';

const REASONS = [
  { key: 'spam', label: 'Spam' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'inappropriate', label: 'Inappropriate content' },
  { key: 'other', label: 'Something else' },
] as const;

type ReasonKey = (typeof REASONS)[number]['key'];

const TARGET_KIND_LABELS: Record<string, string> = {
  gig: 'gig',
  hangout: 'hangout',
  voice: 'voice',
  message: 'message',
  profile: 'profile',
};

const VALID_KINDS = ['gig', 'hangout', 'voice', 'message', 'profile'] as const;

export default function ReportScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, isDev } = useAuth();
  const params = useLocalSearchParams<{ type?: string; id?: string; userId?: string }>();

  const targetKindParam = (params.type ?? '').toString();
  const targetKind = (VALID_KINDS as readonly string[]).includes(targetKindParam)
    ? (targetKindParam as (typeof VALID_KINDS)[number])
    : null;
  const targetId = (params.id ?? '').toString();
  const targetUserId = params.userId ? params.userId.toString() : null;

  const [reason, setReason] = useState<ReasonKey | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = !!reason && !!targetKind && !!targetId && !busy;

  async function handleSubmit() {
    if (!canSubmit || !reason || !targetKind || !targetId) return;
    setErr(null);
    setBusy(true);

    if (isDev) {
      // Dev: pretend we sent it. No real insert because the dev profile FK
      // would fail.
      setBusy(false);
      setDone(true);
      setTimeout(() => router.back(), 900);
      return;
    }

    if (!session) {
      setBusy(false);
      setErr('You need to be signed in to report.');
      return;
    }

    const { error } = await supabase.from('reports').insert({
      reporter_id: session.user.id,
      target_kind: targetKind,
      target_id: targetId,
      target_user_id: targetUserId,
      reason,
      details: details.trim().length > 0 ? details.trim() : null,
    });

    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.back(), 900);
  }

  if (!targetKind || !targetId) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <ThemedText style={[styles.backText, { color: c.textMuted }]} type="mono">
                close
              </ThemedText>
            </Pressable>
          </View>
          <ThemedText style={[styles.title, { color: c.text }]}>
            Missing target
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: c.textSecondary }]}>
            This report screen needs a `type` and an `id`. Go back and try again.
          </ThemedText>
        </ScrollView>
      </ThemedView>
    );
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
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <ThemedText
                style={[styles.backText, { color: c.textMuted }]}
                type="mono">
                close
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.header}>
            <ThemedText style={[styles.title, { color: c.text }]}>
              Report this {TARGET_KIND_LABELS[targetKind]}
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: c.textSecondary }]}>
              We&apos;ll review every report. Reporters stay anonymous to the
              person reported.
            </ThemedText>
          </View>

          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText
              style={[styles.sectionLabel, { color: c.textMuted }]}
              type="mono">
              reason
            </ThemedText>
            <View style={styles.reasonList}>
              {REASONS.map((r) => {
                const selected = reason === r.key;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => setReason(r.key)}
                    style={({ pressed }) => [
                      styles.reasonRow,
                      {
                        borderBottomColor: c.border,
                        opacity: pressed ? 0.5 : 1,
                      },
                    ]}>
                    <ThemedText style={[styles.reasonLabel, { color: c.text }]}>
                      {r.label}
                    </ThemedText>
                    <View
                      style={[
                        styles.radio,
                        {
                          borderColor: selected ? c.tint : c.border,
                          backgroundColor: selected ? c.tint : 'transparent',
                        },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText
              style={[styles.sectionLabel, { color: c.textMuted }]}
              type="mono">
              more context · optional
            </ThemedText>
            <TextInput
              value={details}
              onChangeText={setDetails}
              multiline
              numberOfLines={4}
              maxLength={1000}
              placeholder="Anything we should know?"
              placeholderTextColor={c.textMuted}
              style={[styles.textarea, { color: c.text, borderColor: c.border }]}
            />
            <ThemedText
              style={[styles.counter, { color: c.textMuted }]}
              type="mono">
              {details.length} / 1000
            </ThemedText>
          </View>

          {err ? (
            <ThemedText style={[styles.error, { color: c.danger }]}>{err}</ThemedText>
          ) : null}

          {done ? (
            <ThemedText
              style={[styles.success, { color: c.tint }]}
              type="defaultSemiBold">
              Report submitted. Thank you.
            </ThemedText>
          ) : (
            <Pressable
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                {
                  backgroundColor: c.tint,
                  opacity: !canSubmit ? 0.35 : pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText
                style={[styles.submitText, { color: c.background }]}>
                {busy ? 'Submitting…' : 'Submit report'}
              </ThemedText>
            </Pressable>
          )}
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 24,
  },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  backText: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  header: { gap: 8 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  subtitle: { fontSize: 13, lineHeight: 19 },
  section: {
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  reasonList: { gap: 0 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reasonLabel: { fontSize: 15, fontWeight: '500' },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  textarea: {
    fontSize: 15,
    lineHeight: 21,
    minHeight: 110,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    textAlignVertical: 'top',
  },
  counter: {
    fontSize: 10,
    letterSpacing: 0.6,
    textAlign: 'right',
  },
  error: { fontSize: 13, lineHeight: 18 },
  success: { fontSize: 14, textAlign: 'center' },
  submitBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
