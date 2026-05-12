import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
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
        <View style={styles.heroBlock}>
          <NamePlaque size="md" />
          <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
            Sign up with your @nd.edu email.
          </ThemedText>
        </View>

        <View style={styles.form}>
          <Field
            label="School email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@nd.edu"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            colors={c}
            hint={emailLooksBad ? 'Must end in @nd.edu' : null}
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="at least 8 characters"
            secureTextEntry
            autoComplete="new-password"
            colors={c}
          />
          {err ? (
            <ThemedText style={[styles.error, { color: '#dc2626' }]}>{err}</ThemedText>
          ) : null}

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
              {busy ? 'Creating account…' : 'Create account'}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: c.textSecondary }]}>
            Already have an account?{' '}
          </ThemedText>
          <Link href="/(auth)/sign-in" replace>
            <ThemedText type="defaultSemiBold" style={[styles.footerLink, { color: c.tint }]}>
              Sign in
            </ThemedText>
          </Link>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  hint,
  colors,
  ...rest
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  hint?: string | null;
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
      {hint ? <ThemedText style={[styles.hint, { color: '#dc2626' }]}>{hint}</ThemedText> : null}
    </View>
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
  heroBlock: { gap: 12 },
  tagline: { fontSize: 15, lineHeight: 22 },
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
  hint: { fontSize: 12, marginTop: 2 },
  error: { fontSize: 14, lineHeight: 20 },
  cta: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 4,
    alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '600' },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14 },
});
