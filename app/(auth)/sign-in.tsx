import { Link } from 'expo-router';
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
import { useAuth } from '@/lib/auth-context';

export default function SignInScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = email.length > 3 && password.length > 0 && !busy;

  async function handleSubmit() {
    setErr(null);
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setErr(error);
    // On success, the auth gate in _layout.tsx redirects.
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}>
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={styles.heroBlock}>
          <NamePlaque size="md" />
          <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
            Welcome back.
          </ThemedText>
        </View>

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
          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
              Password
            </ThemedText>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              placeholderTextColor={c.textSecondary}
              style={[
                styles.input,
                { borderColor: c.border, color: c.text, backgroundColor: c.card },
              ]}
            />
          </View>

          <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
            <ThemedText style={[styles.forgotText, { color: c.textSecondary }]}>
              Forgot password?
            </ThemedText>
          </Link>

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
              {busy ? 'Signing in…' : 'Sign in'}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: c.textSecondary }]}>
            New here?{' '}
          </ThemedText>
          <Link href="/(auth)/sign-up" replace>
            <ThemedText type="defaultSemiBold" style={[styles.footerLink, { color: c.tint }]}>
              Create an account
            </ThemedText>
          </Link>
        </View>
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
  heroBlock: { gap: 12 },
  tagline: { fontSize: 15, lineHeight: 22 },
  form: { gap: 16 },
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
  forgotLink: { alignSelf: 'flex-end' },
  forgotText: { fontSize: 13 },
  error: { fontSize: 14, lineHeight: 20, color: '#dc2626' },
  cta: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 4,
    alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '600' },
  footer: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14 },
});
