import * as ImagePicker from 'expo-image-picker';
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

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth, type ProfileLink } from '@/lib/auth-context';
import { uploadAvatar } from '@/lib/avatars';
import {
  detectPlatform,
  isPaymentLink,
  paymentHandleFromUrl,
  paymentUrlFromHandle,
  PLATFORMS,
  type Platform as LinkPlatform,
} from '@/lib/profile-links';
import { supabase } from '@/lib/supabase';

const YEARS = [1, 2, 3, 4, 5] as const;

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Payment links live in the same `links` array as everything else, but the UI
// gives them dedicated handle inputs — split them out for editing and merge
// them back on save.
function splitLinks(all: ProfileLink[]): {
  social: ProfileLink[];
  venmo: string;
  cashapp: string;
} {
  const social: ProfileLink[] = [];
  let venmo = '';
  let cashapp = '';
  for (const l of all) {
    const p = detectPlatform(l.url);
    if (p?.id === 'venmo') venmo = paymentHandleFromUrl(l.url) ?? '';
    else if (p?.id === 'cashapp') cashapp = paymentHandleFromUrl(l.url) ?? '';
    else social.push(l);
  }
  return { social, venmo, cashapp };
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
  const [links, setLinks] = useState<ProfileLink[]>(
    () => splitLinks(profile?.links ?? []).social,
  );
  const [venmo, setVenmo] = useState(() => splitLinks(profile?.links ?? []).venmo);
  const [cashapp, setCashapp] = useState(() => splitLinks(profile?.links ?? []).cashapp);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName((cur) => cur || profile.display_name || '');
    setYear((cur) => cur ?? profile.year);
    setMajor((cur) => cur || profile.major || '');
    setDorm((cur) => cur || profile.dorm || '');
    setBio((cur) => cur || profile.bio || '');
    const split = splitLinks(profile.links);
    setLinks((cur) => (cur.length > 0 ? cur : split.social));
    setVenmo((cur) => cur || split.venmo);
    setCashapp((cur) => cur || split.cashapp);
    setAvatarUrl((cur) => cur ?? profile.avatar_url);
  }, [profile]);

  async function handlePickAvatar() {
    if (!session) return;
    setErr(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErr('Allow photo access in Settings to set an avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri) return;
    if (isDev) {
      setAvatarUrl(asset.uri);
      return;
    }
    setAvatarBusy(true);
    const out = await uploadAvatar(session.user.id, asset.uri, asset.mimeType ?? 'image/jpeg');
    setAvatarBusy(false);
    if (out.error) {
      setErr(out.error);
      return;
    }
    if (out.url) {
      setAvatarUrl(out.url);
      refreshProfile().catch(() => {});
    }
  }

  const canSubmit =
    displayName.trim().length >= 2 && year !== null && major.trim().length >= 2 && !busy;

  function setLinkLabel(i: number, label: string) {
    setLinks((cur) => cur.map((l, idx) => (idx === i ? { ...l, label } : l)));
  }
  function setLinkUrl(i: number, url: string) {
    setLinks((cur) =>
      cur.map((l, idx) => {
        if (idx !== i) return l;
        const detected = detectPlatform(url);
        const labelIsAuto = !l.label || PLATFORMS.some((p) => p.label === l.label);
        return {
          ...l,
          url,
          label: detected && labelIsAuto ? detected.label : l.label,
        };
      }),
    );
  }
  // Combined with venmo + cashapp, the saved links array must stay within the
  // DB cap (profiles_links_count <= 10). Cap social links at 8 so a full
  // profile can't overflow it and hit an opaque constraint error on save.
  const MAX_SOCIAL_LINKS = 8;
  function addPlatformLink(platform: LinkPlatform) {
    setLinks((cur) =>
      cur.length >= MAX_SOCIAL_LINKS ? cur : [...cur, { label: platform.label, url: '' }],
    );
  }
  function addCustomLink() {
    setLinks((cur) => (cur.length >= MAX_SOCIAL_LINKS ? cur : [...cur, { label: '', url: '' }]));
  }
  function removeLink(i: number) {
    setLinks((cur) => cur.filter((_, idx) => idx !== i));
  }

  function placeholderForRow(row: ProfileLink): string {
    const fromUrl = detectPlatform(row.url);
    if (fromUrl) return fromUrl.placeholder;
    const labelMatch = PLATFORMS.find((p) => p.label === row.label);
    return labelMatch?.placeholder ?? 'https://…';
  }

  async function handleSave() {
    if (!session) return;
    setErr(null);

    const cleanedLinks: ProfileLink[] = links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      // Payment links have their own inputs below — keep them out of the
      // social list so they can't be saved twice.
      .filter((l) => l.label && l.url && !isPaymentLink(l.url));

    const badLink = cleanedLinks.find((l) => !isValidUrl(l.url));
    if (badLink) {
      setErr(`"${badLink.label}" doesn't look like a valid URL.`);
      return;
    }

    if (venmo.trim()) {
      const url = paymentUrlFromHandle('venmo', venmo);
      if (!url) {
        setErr("That Venmo handle doesn't look right — letters, numbers, dashes and underscores only.");
        return;
      }
      cleanedLinks.push({ label: 'Venmo', url });
    }
    if (cashapp.trim()) {
      const url = paymentUrlFromHandle('cashapp', cashapp);
      if (!url) {
        setErr("That cashtag doesn't look right — it should look like $yourname.");
        return;
      }
      cleanedLinks.push({ label: 'Cash App', url });
    }

    setBusy(true);

    if (isDev) {
      setBusy(false);
      router.replace('/(tabs)');
      return;
    }

    // Upsert, not update: if the signup trigger ever failed to create the
    // profiles row, update() matches zero rows and "succeeds" — the guard then
    // sees no display_name and bounces the user back here forever.
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        display_name: displayName.trim(),
        initials: computeInitials(displayName),
        year,
        major: major.trim(),
        dorm: dorm.trim() || null,
        bio: bio.trim() || null,
        links: cleanedLinks,
      });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    // Capture edit-vs-first-run BEFORE refreshProfile updates the closure.
    const wasEditing = Boolean(profile?.display_name);
    await refreshProfile();
    setBusy(false);
    // On the real backend the root route guard only redirects away from
    // auth/splash/welcome — it never moves us off profile-setup — so a
    // successful save must navigate explicitly or the user is stranded here.
    if (wasEditing) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
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
          <View style={styles.hero}>
            <ThemedText style={[styles.eyebrow, { color: c.accent }]} type="mono">
              {isEditing ? 'edit' : 'one more thing'}
            </ThemedText>
            <ThemedText style={[styles.heading, { color: c.text }]}>
              {isEditing ? 'Edit your profile' : 'Set up your profile'}
            </ThemedText>
            <ThemedText style={[styles.tagline, { color: c.textSecondary }]}>
              So other students know who&apos;s offering or asking.
            </ThemedText>
          </View>

          <View style={styles.avatarBlock}>
            <Pressable
              onPress={handlePickAvatar}
              accessibilityRole="button"
              accessibilityLabel={avatarUrl ? 'Change profile photo' : 'Choose a profile photo'}
              accessibilityState={{ disabled: avatarBusy }}
              disabled={avatarBusy}
              hitSlop={8}
              style={({ pressed }) => [
                styles.avatarPress,
                { opacity: avatarBusy ? 0.5 : pressed ? 0.7 : 1 },
              ]}>
              <Avatar
                uri={avatarUrl}
                initials={
                  profile?.initials || computeInitials(displayName) || '?'
                }
                size={96}
              />
              <View
                style={[
                  styles.avatarEditPill,
                  { backgroundColor: c.tint, borderColor: c.background },
                ]}>
                <ThemedText
                  style={[styles.avatarEditText, { color: c.background }]}
                  type="mono">
                  {avatarBusy ? '…' : avatarUrl ? 'change' : 'add'}
                </ThemedText>
              </View>
            </Pressable>
            <ThemedText style={[styles.avatarHint, { color: c.textMuted }]} type="mono">
              tap to {avatarUrl ? 'change' : 'add'} photo
            </ThemedText>
          </View>

          <FieldGroup label="Display name" colors={c}>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="First Last"
              placeholderTextColor={c.textMuted}
              autoCapitalize="words"
              maxLength={60}
              style={[styles.input, { color: c.text }]}
            />
            <View style={[styles.underline, { backgroundColor: c.border }]} />
          </FieldGroup>

          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: c.textMuted }]} type="mono">
              year
            </ThemedText>
            <View style={styles.yearRow}>
              {YEARS.map((y) => {
                const active = year === y;
                return (
                  <Pressable
                    key={y}
                    onPress={() => setYear(y)}
                    accessibilityRole="button"
                    accessibilityLabel={`Year ${y}`}
                    accessibilityState={{ selected: active }}
                    style={styles.yearItem}>
                    <View
                      style={[
                        styles.yearBubble,
                        {
                          borderColor: active ? c.accent : c.border,
                          backgroundColor: active ? c.surface : c.background,
                          borderWidth: active ? 2.5 : 1.5,
                        },
                      ]}>
                      <ThemedText
                        style={[
                          styles.yearText,
                          { color: active ? c.text : c.textSecondary },
                          active && { fontWeight: '700' },
                        ]}>
                        {y}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <FieldGroup label="Major" colors={c}>
            <TextInput
              value={major}
              onChangeText={setMajor}
              placeholder="Computer Science"
              placeholderTextColor={c.textMuted}
              maxLength={80}
              style={[styles.input, { color: c.text }]}
            />
            <View style={[styles.underline, { backgroundColor: c.border }]} />
          </FieldGroup>

          <FieldGroup label="Dorm (optional)" colors={c}>
            <TextInput
              value={dorm}
              onChangeText={setDorm}
              placeholder="Dillon Hall"
              placeholderTextColor={c.textMuted}
              maxLength={80}
              style={[styles.input, { color: c.text }]}
            />
            <View style={[styles.underline, { backgroundColor: c.border }]} />
          </FieldGroup>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <ThemedText style={[styles.label, { color: c.textMuted }]} type="mono">
                bio
              </ThemedText>
              <ThemedText style={[styles.charCount, { color: c.textMuted }]} type="mono">
                {bio.length}/240
              </ThemedText>
            </View>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="A sentence or two about you."
              placeholderTextColor={c.textMuted}
              multiline
              numberOfLines={3}
              maxLength={240}
              style={[styles.input, styles.bioInput, { color: c.text }]}
            />
            <View style={[styles.underline, { backgroundColor: c.border }]} />
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: c.textMuted }]} type="mono">
              payments
            </ThemedText>
            <ThemedText style={[styles.emptyHint, { color: c.textSecondary }]}>
              So people can pay you for gigs. Shown on your profile.
            </ThemedText>
            <View style={styles.payRow}>
              <ThemedText style={[styles.paySigil, { color: c.textMuted }]}>💸</ThemedText>
              <TextInput
                value={venmo}
                onChangeText={setVenmo}
                placeholder="@your-venmo"
                placeholderTextColor={c.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={32}
                accessibilityLabel="Venmo handle"
                style={[styles.input, styles.payInput, { color: c.text }]}
              />
            </View>
            <View style={[styles.underline, { backgroundColor: c.border }]} />
            <View style={styles.payRow}>
              <ThemedText style={[styles.paySigil, { color: c.textMuted }]}>💵</ThemedText>
              <TextInput
                value={cashapp}
                onChangeText={setCashapp}
                placeholder="$yourcashtag"
                placeholderTextColor={c.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={32}
                accessibilityLabel="Cash App cashtag"
                style={[styles.input, styles.payInput, { color: c.text }]}
              />
            </View>
            <View style={[styles.underline, { backgroundColor: c.border }]} />
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={[styles.label, { color: c.textMuted }]} type="mono">
              social & professional
            </ThemedText>
            <ThemedText style={[styles.emptyHint, { color: c.textSecondary }]}>
              Tap a platform to add it. Other students will see these on your profile.
            </ThemedText>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              {PLATFORMS.filter(
                (p) => p.id !== 'other' && p.id !== 'venmo' && p.id !== 'cashapp',
              ).map((p) => {
                const alreadyAdded = links.some(
                  (l) => l.label === p.label && !l.url,
                );
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => addPlatformLink(p)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: alreadyAdded }}
                    disabled={alreadyAdded}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: c.border,
                        backgroundColor: pressed ? c.subtle : c.background,
                        opacity: alreadyAdded ? 0.4 : 1,
                      },
                    ]}>
                    <ThemedText style={styles.chipEmoji}>{p.emoji}</ThemedText>
                    <ThemedText style={[styles.chipText, { color: c.text }]}>
                      {p.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={addCustomLink}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.chip,
                  {
                    borderColor: c.border,
                    backgroundColor: pressed ? c.subtle : c.background,
                    borderStyle: 'dashed',
                  },
                ]}>
                <ThemedText style={[styles.chipText, { color: c.textSecondary }]}>
                  + custom
                </ThemedText>
              </Pressable>
            </ScrollView>

            {links.length > 0 ? (
              <View style={styles.linksList}>
                {links.map((l, i) => (
                  <View key={i} style={[styles.linkRow, { borderBottomColor: c.border }]}>
                    <View style={styles.linkInputs}>
                      <TextInput
                        value={l.label}
                        onChangeText={(t) => setLinkLabel(i, t)}
                        placeholder="Label"
                        placeholderTextColor={c.textMuted}
                        maxLength={40}
                        style={[styles.linkLabelInput, { color: c.text }]}
                      />
                      <TextInput
                        value={l.url}
                        onChangeText={(t) => setLinkUrl(i, t)}
                        placeholder={placeholderForRow(l)}
                        placeholderTextColor={c.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        maxLength={300}
                        style={[styles.linkUrlInput, { color: c.textSecondary }]}
                      />
                    </View>
                    <Pressable
                      onPress={() => removeLink(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${l.label || 'this'} link`}
                      hitSlop={8}
                      style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.5 : 1 }]}>
                      <ThemedText
                        style={[styles.removeBtnText, { color: c.textMuted }]}>
                        ×
                      </ThemedText>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {err ? (
            <ThemedText style={[styles.error, { color: c.danger }]}>{err}</ThemedText>
          ) : null}

          <Pressable
            disabled={!canSubmit}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: c.tint,
                opacity: !canSubmit ? 0.35 : pressed ? 0.85 : 1,
              },
            ]}>
            <ThemedText style={[styles.ctaText, { color: c.background }]}>
              {busy ? 'Saving…' : isEditing ? 'Save changes' : 'Save and continue'}
            </ThemedText>
          </Pressable>

          {isEditing ? (
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              style={styles.cancelBtn}
              hitSlop={8}>
              <ThemedText style={[styles.cancelText, { color: c.textMuted }]} type="mono">
                cancel
              </ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
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
      <ThemedText style={[styles.label, { color: colors.textMuted }]} type="mono">
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
    paddingBottom: 48,
    paddingHorizontal: 28,
    gap: 24,
  },
  hero: { gap: 6 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  tagline: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  avatarBlock: { alignItems: 'center', gap: 10 },
  avatarPress: { position: 'relative' },
  avatarEditPill: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 2,
  },
  avatarEditText: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  avatarHint: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  fieldGroup: { gap: 10 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
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
  bioInput: {
    minHeight: 64,
    textAlignVertical: 'top',
    paddingTop: 4,
  },
  underline: { height: 1 },
  charCount: {
    fontSize: 10,
    letterSpacing: 0.6,
  },
  yearRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 4,
  },
  yearItem: { alignItems: 'center' },
  yearBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearText: { fontSize: 17 },
  emptyHint: { fontSize: 13, lineHeight: 18 },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paySigil: { fontSize: 16 },
  payInput: { flex: 1 },
  chipRow: { gap: 8, paddingVertical: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: '500' },
  linksList: { gap: 0 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkInputs: { flex: 1, gap: 2 },
  linkLabelInput: {
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  linkUrlInput: {
    fontSize: 12,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 22, lineHeight: 22 },
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
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
