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

export default function ForgotPasswordScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setErr(null);
    setBusy(true);
    const { error } = await sendPasswordReset(email);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    setSent(true);
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
              Reset your password
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              We&apos;ll email you a link to set a new password.
            </ThemedText>
          </View>

          {sent ? (
            <View style={styles.sentBlock}>
              <ThemedText style={[styles.sentText, { color: c.textSecondary }]}>
                Check your inbox at{' '}
                <ThemedText style={[styles.sentTextStrong, { color: c.text }]}>{email}</ThemedText>
                {' '}for the reset link.
              </ThemedText>
              <Pressable
                onPress={() => router.replace('/(auth)/sign-in')}
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
                ]}>
                <ThemedText style={[styles.ctaText, { color: c.background }]}>
                  Back to sign in
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <ThemedText style={[styles.fieldLabel, { color: c.textMuted }]} type="mono">
                  school email
                </ThemedText>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@nd.edu"
                  placeholderTextColor={c.textMuted}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={[styles.input, { color: c.text }]}
                />
                <View style={[styles.underline, { backgroundColor: c.border }]} />
              </View>
              {err ? (
                <ThemedText style={[styles.error, { color: c.danger }]}>{err}</ThemedText>
              ) : null}
              <Pressable
                disabled={email.length < 4 || busy}
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.cta,
                  {
                    backgroundColor: c.tint,
                    opacity: email.length < 4 || busy ? 0.35 : pressed ? 0.85 : 1,
                  },
                ]}>
                <ThemedText style={[styles.ctaText, { color: c.background }]}>
                  {busy ? 'Sending…' : 'Send reset link'}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => router.replace('/(auth)/sign-in')}
                style={styles.cancelBtn}
                hitSlop={8}>
                <ThemedText style={[styles.cancelText, { color: c.textMuted }]} type="mono">
                  cancel
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
  sentTextStrong: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
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
