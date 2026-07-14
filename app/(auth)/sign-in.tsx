import { Link } from 'expo-router';
import { useRef, useState } from 'react';
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

export default function SignInScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const canSubmit = email.length > 3 && password.length > 0 && !busy;

  async function handleSubmit() {
    setErr(null);
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setErr(error);
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
              welcome back
            </ThemedText>
            <ThemedText style={[styles.heading, { color: c.text }]}>
              Sign in
            </ThemedText>
          </View>

          <View style={styles.form}>
            <FieldGroup label="School email" colors={c}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@nd.edu"
                placeholderTextColor={c.textMuted}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                style={[styles.input, { color: c.text }]}
              />
              <View style={[styles.underline, { backgroundColor: c.border }]} />
            </FieldGroup>

            <FieldGroup label="Password" colors={c}>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={c.textMuted}
                secureTextEntry
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (canSubmit) handleSubmit();
                }}
                style={[styles.input, { color: c.text }]}
              />
              <View style={[styles.underline, { backgroundColor: c.border }]} />
            </FieldGroup>

            <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
              <ThemedText style={[styles.forgotText, { color: c.textMuted }]} type="mono">
                forgot password?
              </ThemedText>
            </Link>

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
                {busy ? 'Signing in…' : 'Sign in'}
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: c.textSecondary }]}>
            New here?{' '}
          </ThemedText>
          <Link href="/(auth)/sign-up" replace>
            <ThemedText style={[styles.footerLink, { color: c.text }]}>
              Create an account
            </ThemedText>
          </Link>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function FieldGroup({
  label,
  children,
  colors,
}: {
  label: string;
  children: React.ReactNode;
  colors: (typeof Colors)['light'];
}) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]} type="mono">
        {label.toLowerCase()}
      </ThemedText>
      {children}
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
  forgotLink: { alignSelf: 'flex-end', paddingVertical: 4 },
  forgotText: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
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
});
