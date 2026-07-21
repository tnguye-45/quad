import Constants from 'expo-constants';
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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { confirmAsync } from '@/lib/confirm';
import { clearPushToken } from '@/lib/notifications';

const CONFIRM_WORD = 'DELETE';

export default function AccountSettingsScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, signOut, isDev } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canDelete = confirm.trim().toUpperCase() === CONFIRM_WORD && !busy;

  async function callDeleteAccount(): Promise<{ ok: boolean; error?: string }> {
    // Dev mode: skip the network call. Just clear the local session.
    if (isDev) return { ok: true };

    if (!session) return { ok: false, error: 'not signed in' };

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return { ok: false, error: 'missing EXPO_PUBLIC_SUPABASE_URL' };

    try {
      // Best-effort: clear our push token row before nuking the user so the
      // Edge Function doesn't race the client. Tolerate failure — the function
      // deletes user_push_tokens anyway.
      await clearPushToken(session.user.id).catch(() => {});

      const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
      });
      if (!res.ok) {
        let body = '';
        try {
          body = (await res.json()).error ?? '';
        } catch {
          body = await res.text().catch(() => '');
        }
        return { ok: false, error: `delete failed (${res.status}): ${body || 'unknown'}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function handleDelete() {
    if (!canDelete) return;
    setErr(null);
    const confirmed = await confirmAsync({
      title: 'Delete account?',
      message:
        'This permanently removes your profile, posts, hangouts, voices, and messages you sent. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    const result = await callDeleteAccount();
    if (!result.ok) {
      setBusy(false);
      setErr(result.error ?? 'Something went wrong.');
      return;
    }
    // Sign out (clears local session + Supabase session). signOut also tries to
    // call supabase.auth.signOut(); that will 401 since the user no longer
    // exists — fine, we tolerate the warning.
    await signOut().catch(() => {});
    // Hard reset to /welcome so the route guard can't bounce us back.
    router.replace('/welcome');
  }

  const appVersion = Constants.expoConfig?.version ?? '—';

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
              accessibilityRole="button"
              hitSlop={10}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <ThemedText
                style={[styles.backText, { color: c.textMuted }]}
                type="mono">
                back
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.header}>
            <ThemedText style={[styles.title, { color: c.text }]}>Account</ThemedText>
            <ThemedText style={[styles.subtitle, { color: c.textSecondary }]}>
              {session?.user.email ?? 'Not signed in'}
            </ThemedText>
          </View>

          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText
              style={[styles.sectionLabel, { color: c.textMuted }]}
              type="mono">
              preferences
            </ThemedText>
            <View style={styles.linkList}>
              <Link href="/settings/notifications" asChild>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.linkRow,
                    { borderBottomColor: c.border, opacity: pressed ? 0.5 : 1 },
                  ]}>
                  <ThemedText style={[styles.linkLabel, { color: c.text }]}>
                    Notifications
                  </ThemedText>
                </Pressable>
              </Link>
              <Link href="/settings/blocked" asChild>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.linkRow,
                    { borderBottomColor: c.border, opacity: pressed ? 0.5 : 1 },
                  ]}>
                  <ThemedText style={[styles.linkLabel, { color: c.text }]}>
                    Blocked users
                  </ThemedText>
                </Pressable>
              </Link>
            </View>
          </View>

          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText
              style={[styles.sectionLabel, { color: c.textMuted }]}
              type="mono">
              legal
            </ThemedText>
            <View style={styles.linkList}>
              <Link href="/legal/privacy" asChild>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.linkRow,
                    { borderBottomColor: c.border, opacity: pressed ? 0.5 : 1 },
                  ]}>
                  <ThemedText style={[styles.linkLabel, { color: c.text }]}>
                    Privacy policy
                  </ThemedText>
                </Pressable>
              </Link>
              <Link href="/legal/tos" asChild>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.linkRow,
                    { borderBottomColor: c.border, opacity: pressed ? 0.5 : 1 },
                  ]}>
                  <ThemedText style={[styles.linkLabel, { color: c.text }]}>
                    Terms of service
                  </ThemedText>
                </Pressable>
              </Link>
            </View>
          </View>

          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText
              style={[styles.sectionLabel, { color: c.textMuted }]}
              type="mono">
              danger zone
            </ThemedText>
            <ThemedText style={[styles.danger, { color: c.text }]}>
              Delete your account
            </ThemedText>
            <ThemedText
              style={[styles.dangerBody, { color: c.textSecondary }]}>
              Permanently removes your profile, posts you made, hangouts you
              hosted, voices, and messages you sent. Messages sent to you stay
              in the other person&apos;s history. This cannot be undone.
            </ThemedText>
            <ThemedText
              style={[styles.fieldLabel, { color: c.textMuted }]}
              type="mono">
              type {CONFIRM_WORD} to confirm
            </ThemedText>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder={CONFIRM_WORD}
              placeholderTextColor={c.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.input, { color: c.text }]}
            />
            <View
              style={[
                styles.underline,
                {
                  backgroundColor:
                    confirm.length > 0 && !canDelete ? c.danger : c.border,
                },
              ]}
            />
            {err ? (
              <ThemedText style={[styles.error, { color: c.danger }]}>
                {err}
              </ThemedText>
            ) : null}
            <Pressable
              disabled={!canDelete}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete your account permanently"
              accessibilityState={{ disabled: !canDelete }}
              style={({ pressed }) => [
                styles.deleteBtn,
                {
                  borderColor: c.danger,
                  opacity: !canDelete ? 0.35 : pressed ? 0.7 : 1,
                },
              ]}>
              <ThemedText style={[styles.deleteText, { color: c.danger }]}>
                {busy ? 'Deleting…' : 'Delete my account'}
              </ThemedText>
            </Pressable>
          </View>

          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText
              style={[styles.versionText, { color: c.textMuted }]}
              type="mono">
              quad · v{appVersion}
            </ThemedText>
          </View>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 60,
    gap: 28,
  },
  topRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  backText: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  header: { gap: 6 },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  subtitle: { fontSize: 14, lineHeight: 20 },
  section: {
    paddingTop: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  linkList: { gap: 0 },
  linkRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkLabel: { fontSize: 15, fontWeight: '500' },
  danger: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  dangerBody: { fontSize: 13, lineHeight: 20 },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    fontSize: 17,
    paddingVertical: 8,
    paddingHorizontal: 0,
    letterSpacing: 1,
  },
  underline: { height: 1 },
  error: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  deleteBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  versionText: {
    fontSize: 10,
    letterSpacing: 0.6,
    textAlign: 'center',
  },
});
