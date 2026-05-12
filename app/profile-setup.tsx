import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { useAuth, type ProfileLink } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const YEARS = [1, 2, 3, 4, 5] as const;

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isValidUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return Boolean(u.hostname);
  } catch {
    return false;
  }
}

export default function ProfileSetupScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, profile, isDev, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [year, setYear] = useState<number | null>(profile?.year ?? null);
  const [major, setMajor] = useState(profile?.major ?? '');
  const [dorm, setDorm] = useState(profile?.dorm ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [links, setLinks] = useState<ProfileLink[]>(profile?.links ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep local state in sync if the profile loads after first render (e.g., on
  // first-time setup the trigger creates the row a beat after signup).
  useEffect(() => {
    if (!profile) return;
    setDisplayName((cur) => cur || profile.display_name || '');
    setYear((cur) => cur ?? profile.year);
    setMajor((cur) => cur || profile.major || '');
    setDorm((cur) => cur || profile.dorm || '');
    setBio((cur) => cur || profile.bio || '');
    setLinks((cur) => (cur.length > 0 ? cur : profile.links));
  }, [profile]);

  const canSubmit =
    displayName.trim().length >= 2 && year !== null && major.trim().length >= 2 && !busy;

  function setLinkLabel(i: number, label: string) {
    setLinks((cur) => cur.map((l, idx) => (idx === i ? { ...l, label } : l)));
  }
  function setLinkUrl(i: number, url: string) {
    setLinks((cur) => cur.map((l, idx) => (idx === i ? { ...l, url } : l)));
  }
  function addLink() {
    setLinks((cur) => [...cur, { label: '', url: '' }]);
  }
  function removeLink(i: number) {
    setLinks((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!session) return;
    setErr(null);

    const cleanedLinks: ProfileLink[] = links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label && l.url);

    const badLink = cleanedLinks.find((l) => !isValidUrl(l.url));
    if (badLink) {
      setErr(`"${badLink.label}" doesn't look like a valid URL.`);
      return;
    }

    setBusy(true);

    // Dev mode has no real auth token — skip Supabase and just bounce back.
    if (isDev) {
      setBusy(false);
      router.replace('/(tabs)');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        initials: computeInitials(displayName),
        year,
        major: major.trim(),
        dorm: dorm.trim() || null,
        bio: bio.trim() || null,
        links: cleanedLinks,
      })
      .eq('id', session.user.id);
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    await refreshProfile();
    setBusy(false);
  }

  const isEditing = Boolean(profile?.display_name);

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
              {isEditing ? 'Edit your profile' : 'Set up your profile'}
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              So other students know who&apos;s offering or asking.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <Field
              label="Display name *"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="First Last"
              autoCapitalize="words"
              colors={c}
            />

            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                Year *
              </ThemedText>
              <View style={styles.yearRow}>
                {YEARS.map((y) => {
                  const active = year === y;
                  return (
                    <Pressable
                      key={y}
                      onPress={() => setYear(y)}
                      style={[
                        styles.yearPill,
                        {
                          backgroundColor: active ? c.tint : c.card,
                          borderColor: active ? c.tint : c.border,
                        },
                      ]}>
                      <ThemedText
                        style={[styles.yearText, { color: active ? c.background : c.text }]}>
                        {y}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Field
              label="Major *"
              value={major}
              onChangeText={setMajor}
              placeholder="e.g. Computer Science"
              colors={c}
            />
            <Field
              label="Dorm (optional)"
              value={dorm}
              onChangeText={setDorm}
              placeholder="e.g. Dillon Hall"
              colors={c}
            />

            <View style={styles.fieldGroup}>
              <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                Bio
              </ThemedText>
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="A sentence or two about you."
                placeholderTextColor={c.textSecondary}
                multiline
                numberOfLines={3}
                maxLength={240}
                style={[
                  styles.input,
                  styles.bioInput,
                  { borderColor: c.border, color: c.text, backgroundColor: c.card },
                ]}
              />
              <ThemedText style={[styles.charCount, { color: c.textSecondary }]}>
                {bio.length}/240
              </ThemedText>
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.linksHeader}>
                <ThemedText style={[styles.fieldLabel, { color: c.textSecondary }]}>
                  Links
                </ThemedText>
                <Pressable onPress={addLink} hitSlop={8}>
                  <ThemedText type="defaultSemiBold" style={[styles.addLink, { color: c.tint }]}>
                    + Add link
                  </ThemedText>
                </Pressable>
              </View>
              {links.length === 0 ? (
                <ThemedText style={[styles.emptyHint, { color: c.textSecondary }]}>
                  GitHub, LinkedIn, Instagram — anything you want to share.
                </ThemedText>
              ) : (
                <View style={styles.linksList}>
                  {links.map((l, i) => (
                    <View key={i} style={styles.linkRow}>
                      <TextInput
                        value={l.label}
                        onChangeText={(t) => setLinkLabel(i, t)}
                        placeholder="Label"
                        placeholderTextColor={c.textSecondary}
                        style={[
                          styles.input,
                          styles.linkLabel,
                          { borderColor: c.border, color: c.text, backgroundColor: c.card },
                        ]}
                      />
                      <TextInput
                        value={l.url}
                        onChangeText={(t) => setLinkUrl(i, t)}
                        placeholder="https://…"
                        placeholderTextColor={c.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        style={[
                          styles.input,
                          styles.linkUrl,
                          { borderColor: c.border, color: c.text, backgroundColor: c.card },
                        ]}
                      />
                      <Pressable
                        onPress={() => removeLink(i)}
                        hitSlop={8}
                        style={styles.removeBtn}>
                        <ThemedText
                          style={[styles.removeBtnText, { color: c.textSecondary }]}>
                          ×
                        </ThemedText>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {err ? <ThemedText style={styles.error}>{err}</ThemedText> : null}

            <Pressable
              disabled={!canSubmit}
              onPress={handleSave}
              style={({ pressed }) => [
                styles.cta,
                {
                  backgroundColor: c.tint,
                  opacity: !canSubmit ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText style={[styles.ctaText, { color: c.background }]}>
                {busy ? 'Saving…' : isEditing ? 'Save changes' : 'Save and continue'}
              </ThemedText>
            </Pressable>

            {isEditing ? (
              <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
                <ThemedText style={[styles.cancelText, { color: c.textSecondary }]}>
                  Cancel
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  colors,
  ...rest
}: React.ComponentProps<typeof TextInput> & {
  label: string;
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 28,
    gap: 32,
  },
  heroBlock: { gap: 10 },
  heading: { fontSize: 26, lineHeight: 32 },
  tagline: { fontSize: 15, lineHeight: 22 },
  form: { gap: 20 },
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
  bioInput: {
    minHeight: 84,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  charCount: {
    fontSize: 11,
    alignSelf: 'flex-end',
  },
  yearRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  yearPill: {
    width: 48,
    height: 44,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearText: { fontSize: 16, fontWeight: '600' },
  linksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addLink: { fontSize: 13 },
  emptyHint: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  linksList: { gap: 8, marginTop: 4 },
  linkRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  linkLabel: { flex: 1 },
  linkUrl: { flex: 2 },
  removeBtn: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 22, lineHeight: 22 },
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
