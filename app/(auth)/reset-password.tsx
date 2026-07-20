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

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';

const MIN_LEN = 8;

export default function ResetPasswordScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = password.length >= MIN_LEN && confirm.length >= MIN_LEN && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;
    if (password !== confirm) {
      setErr("Those passwords don't match.");
      return;
    }
    setErr(null);
    setBusy(true);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) {
      // Most common cause: the recovery link expired or was already used, so
      // there's no active recovery session to update.
      setErr(
        /session/i.test(error)
          ? 'Your reset link has expired. Request a new one from the sign-in screen.'
          : error,
      );
      return;
    }
    setDone(true);
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
            <NamePlaque size="sm" />
            <ThemedText style={[styles.eyebrow, { color: c.accent }]} type="mono">
              reset
            </ThemedText>
            <ThemedText style={[styles.heading, { color: c.text }]}>
              Set a new password
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              Choose a password with at least {MIN_LEN} characters.
            </ThemedText>
          </View>

          {done ? (
            <View style={styles.sentBlock}>
              <ThemedText style={[styles.sentText, { color: c.textSecondary }]}>
                Your password has been updated. You&apos;re all set.
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/(tabs)')}
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
                ]}>
                <ThemedText style={[styles.ctaText, { color: c.background }]}>
                  Continue to quad
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <ThemedText style={[styles.fieldLabel, { color: c.textMuted }]} type="mono">
                  new password
                </ThemedText>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={c.textMuted}
                  autoCapitalize="none"
                  secureTextEntry
                  textContentType="newPassword"
                  style={[styles.input, { color: c.text }]}
                />
                <View style={[styles.underline, { backgroundColor: c.border }]} />
              </View>

              <View style={styles.fieldGroup}>
                <ThemedText style={[styles.fieldLabel, { color: c.textMuted }]} type="mono">
                  confirm password
                </ThemedText>
                <TextInput
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="••••••••"
                  placeholderTextColor={c.textMuted}
                  autoCapitalize="none"
                  secureTextEntry
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    if (canSubmit) handleSubmit();
                  }}
                  style={[styles.input, { color: c.text }]}
                />
                <View style={[styles.underline, { backgroundColor: c.border }]} />
              </View>

              {err ? (
                <ThemedText style={[styles.error, { color: c.danger }]}>{err}</ThemedText>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
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
                  {busy ? 'Saving…' : 'Update password'}
                </ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/(auth)/sign-in')}
                style={styles.cancelBtn}
                hitSlop={8}>
                <ThemedText style={[styles.cancelText, { color: c.textMuted }]} type="mono">
                  back to sign in
                </ThemedText>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 80,
    paddingHorizontal: 28,
    paddingBottom: 36,
    gap: 36,
  },
  hero: { gap: 8, alignItems: 'flex-start' },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginTop: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  tagline: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  form: { gap: 22 },
  sentBlock: { gap: 20 },
  sentText: { fontSize: 15, lineHeight: 22 },
  fieldGroup: { gap: 8 },
  fieldLabel: {
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
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
