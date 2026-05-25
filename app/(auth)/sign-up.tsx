import { Link, router } from 'expo-router';
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
import { isAllowedEmail, useAuth } from '@/lib/auth-context';

export default function SignUpScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailLooksBad = email.length > 0 && !isAllowedEmail(email);
  const canSubmit = email.length > 3 && password.length >= 8 && !busy;

  async function handleSubmit() {
    setErr(null);
    setBusy(true);
    const { error } = await signUp(email, password);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    router.replace({ pathname: '/(auth)/check-email', params: { email } });
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
              welcome
            </ThemedText>
            <ThemedText style={[styles.heading, { color: c.text }]}>
              Create your account
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              Sign up with your @nd.edu email.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <FieldGroup label="School email" colors={c} hint={emailLooksBad ? 'must end in @nd.edu' : null}>
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
              <View style={[styles.underline, { backgroundColor: emailLooksBad ? c.danger : c.border }]} />
            </FieldGroup>

            <FieldGroup label="Password" colors={c}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="at least 8 characters"
                placeholderTextColor={c.textMuted}
                secureTextEntry
                autoComplete="new-password"
                style={[styles.input, { color: c.text }]}
              />
              <View style={[styles.underline, { backgroundColor: c.border }]} />
            </FieldGroup>

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
                {busy ? 'Creating account…' : 'Create account'}
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: c.textSecondary }]}>
            Already have an account?{' '}
          </ThemedText>
          <Link href="/(auth)/sign-in" replace>
            <ThemedText style={[styles.footerLink, { color: c.text }]}>
              Sign in
            </ThemedText>
          </Link>
        </View>
        <View style={styles.legal}>
          <ThemedText style={[styles.legalText, { color: c.textMuted }]} type="mono">
            By signing up you agree to our{' '}
            <Link href="/legal/tos">
              <ThemedText style={[styles.legalLink, { color: c.text }]} type="mono">
                Terms
              </ThemedText>
            </Link>
            {' '}and{' '}
            <Link href="/legal/privacy">
              <ThemedText style={[styles.legalLink, { color: c.text }]} type="mono">
                Privacy Policy
              </ThemedText>
            </Link>
            .
          </ThemedText>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function FieldGroup({
  label,
  hint,
  children,
  colors,
}: {
  label: string;
  hint?: string | null;
  children: React.ReactNode;
  colors: (typeof Colors)['light'];
}) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]} type="mono">
        {label.toLowerCase()}
      </ThemedText>
      {children}
      {hint ? (
        <ThemedText style={[styles.hint, { color: colors.danger }]} type="mono">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 80,
    paddingHorizontal: 28,
    paddingBottom: 24,
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
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  tagline: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  form: { gap: 22 },
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
  hint: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'lowercase',
    marginTop: 2,
  },
  error: { fontSize: 13, lineHeight: 18 },
  cta: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 28,
  },
  footerText: { fontSize: 13 },
  footerLink: { fontSize: 13, fontWeight: '700' },
  legal: {
    paddingHorizontal: 28,
    paddingBottom: 24,
    alignItems: 'center',
  },
  legalText: {
    fontSize: 10,
    letterSpacing: 0.4,
    lineHeight: 16,
    textAlign: 'center',
  },
  legalLink: {
    fontSize: 10,
    letterSpacing: 0.4,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
