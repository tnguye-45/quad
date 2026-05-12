import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
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
        <View style={styles.heroBlock}>
          <ThemedText type="title" style={styles.heading}>
            Reset your password
          </ThemedText>
          <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
            We&apos;ll email you a link to set a new password.
          </ThemedText>
        </View>

        {sent ? (
          <View style={styles.sentBlock}>
            <ThemedText style={[styles.sentText, { color: c.textSecondary }]}>
              Check your inbox at <ThemedText type="defaultSemiBold">{email}</ThemedText> for the
              reset link.
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
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                School email
              </ThemedText>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@nd.edu"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholderTextColor={c.textSecondary}
                style={[
                  styles.input,
                  { borderColor: c.border, color: c.text, backgroundColor: c.card },
                ]}
              />
            </View>
            {err ? <ThemedText style={styles.error}>{err}</ThemedText> : null}
            <Pressable
              disabled={email.length < 4 || busy}
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.cta,
                {
                  backgroundColor: c.tint,
                  opacity: email.length < 4 || busy ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText style={[styles.ctaText, { color: c.background }]}>
                {busy ? 'Sending…' : 'Send reset link'}
              </ThemedText>
            </Pressable>
          </View>
        )}
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 28,
    gap: 36,
  },
  heroBlock: { gap: 10 },
  heading: { fontSize: 26, lineHeight: 32 },
  tagline: { fontSize: 15, lineHeight: 22 },
  form: { gap: 16 },
  sentBlock: { gap: 20 },
  sentText: { fontSize: 15, lineHeight: 22 },
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
  error: { fontSize: 14, lineHeight: 20, color: '#dc2626' },
  cta: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 4,
    alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '600' },
});
