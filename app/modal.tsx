import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth, type ProfileLink } from '@/lib/auth-context';
import {
  useMyPosts,
  VOICE_TOPIC_EMOJI,
  type Gig,
  type Hangout,
  type Voice,
} from '@/lib/posts-store';
import { linkEmoji } from '@/lib/profile-links';

function normalizeUrl(raw: string): string {
  return raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;
}

async function openLink(url: string) {
  const target = normalizeUrl(url.trim());
  if (Platform.OS === 'web') {
    Linking.openURL(target);
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(target);
  } catch {
    Linking.openURL(target);
  }
}

export default function MeModal() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { session, profile, signOut } = useAuth();
  const myPosts = useMyPosts(session?.user.id);

  async function handleSignOut() {
    await signOut();
  }

  if (!session || !profile) {
    return (
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <ThemedText style={{ color: c.textSecondary }}>Not signed in.</ThemedText>
      </ThemedView>
    );
  }

  const subline = [
    profile.year ? `Year ${profile.year}` : null,
    profile.major,
    profile.dorm,
  ]
    .filter(Boolean)
    .join(' · ');

  const totalPosts =
    myPosts.gigs.length + myPosts.hangouts.length + myPosts.voices.length;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <NamePlaque size="sm" />
        </View>

        <View style={styles.profileBlock}>
          <View style={[styles.avatar, { backgroundColor: c.subtle, borderColor: c.border }]}>
            <ThemedText style={[styles.avatarText, { color: c.text }]}>
              {profile.initials || '?'}
            </ThemedText>
          </View>
          <ThemedText type="title" style={styles.name}>
            {profile.display_name || 'No name yet'}
          </ThemedText>
          {subline ? (
            <ThemedText style={[styles.subline, { color: c.textSecondary }]}>
              {subline}
            </ThemedText>
          ) : null}
          <ThemedText style={[styles.email, { color: c.textSecondary }]}>
            {session.user.email}
          </ThemedText>
        </View>

        {profile.bio ? (
          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText style={[styles.sectionLabel, { color: c.textSecondary }]}>
              About
            </ThemedText>
            <ThemedText style={[styles.bio, { color: c.text }]}>{profile.bio}</ThemedText>
          </View>
        ) : null}

        {profile.links.length > 0 ? (
          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText style={[styles.sectionLabel, { color: c.textSecondary }]}>
              Links
            </ThemedText>
            <View style={styles.linksList}>
              {profile.links.map((l: ProfileLink, i: number) => (
                <Pressable
                  key={`${l.url}-${i}`}
                  onPress={() => openLink(l.url)}
                  style={({ pressed }) => [
                    styles.linkRow,
                    {
                      backgroundColor: pressed ? c.subtle : 'transparent',
                      borderColor: c.border,
                    },
                  ]}>
                  <ThemedText style={styles.linkEmoji}>{linkEmoji(l.label, l.url)}</ThemedText>
                  <View style={styles.linkText}>
                    <ThemedText
                      type="defaultSemiBold"
                      style={[styles.linkLabel, { color: c.text }]}>
                      {l.label}
                    </ThemedText>
                    <ThemedText
                      numberOfLines={1}
                      style={[styles.linkUrl, { color: c.textSecondary }]}>
                      {l.url.replace(/^https?:\/\//i, '')}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={[styles.section, { borderTopColor: c.border }]}>
          <View style={styles.historyHeader}>
            <ThemedText style={[styles.sectionLabel, { color: c.textSecondary }]}>
              Your posts
            </ThemedText>
            <ThemedText style={[styles.historyCount, { color: c.textSecondary }]}>
              {totalPosts} total
            </ThemedText>
          </View>

          {totalPosts === 0 ? (
            <ThemedText style={[styles.emptyHint, { color: c.textSecondary }]}>
              Anything you post — gigs, hangouts, or voices — will show up here, even
              when posted anonymously. Only you can see this list.
            </ThemedText>
          ) : (
            <View style={styles.historyList}>
              {myPosts.gigs.length > 0 && (
                <ThemedText style={[styles.historyGroupLabel, { color: c.textSecondary }]}>
                  Gigs
                </ThemedText>
              )}
              {myPosts.gigs.map((g) => (
                <GigHistoryRow key={g.id} gig={g} c={c} />
              ))}

              {myPosts.hangouts.length > 0 && (
                <ThemedText style={[styles.historyGroupLabel, { color: c.textSecondary }]}>
                  Hangouts
                </ThemedText>
              )}
              {myPosts.hangouts.map((h) => (
                <HangoutHistoryRow key={h.id} hangout={h} c={c} />
              ))}

              {myPosts.voices.length > 0 && (
                <ThemedText style={[styles.historyGroupLabel, { color: c.textSecondary }]}>
                  Voices
                </ThemedText>
              )}
              {myPosts.voices.map((v) => (
                <VoiceHistoryRow key={v.id} voice={v} c={c} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <ActionButton
            label="Edit profile"
            onPress={() => router.push('/profile-setup')}
            colors={c}
          />
          <ActionButton
            label="Sign out"
            onPress={handleSignOut}
            colors={c}
            destructive
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function AnonChip({ colors }: { colors: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.anonChip, { backgroundColor: colors.subtle, borderColor: colors.border }]}>
      <ThemedText style={[styles.anonChipText, { color: colors.textSecondary }]}>
        posted anonymously
      </ThemedText>
    </View>
  );
}

function GigHistoryRow({ gig, c }: { gig: Gig; c: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.histRow, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={styles.histTop}>
        <ThemedText type="defaultSemiBold" style={[styles.histTitle, { color: c.text }]} numberOfLines={1}>
          {gig.title}
        </ThemedText>
        <ThemedText type="defaultSemiBold" style={[styles.histPayout, { color: c.text }]}>
          {gig.payout}
        </ThemedText>
      </View>
      <ThemedText style={[styles.histMeta, { color: c.textSecondary }]} numberOfLines={1}>
        {gig.category} · {gig.where} · {gig.postedAgo}
      </ThemedText>
      {gig.anonymous && <AnonChip colors={c} />}
    </View>
  );
}

function HangoutHistoryRow({ hangout, c }: { hangout: Hangout; c: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.histRow, { borderColor: c.border, backgroundColor: c.card }]}>
      <ThemedText type="defaultSemiBold" style={[styles.histTitle, { color: c.text }]} numberOfLines={1}>
        {hangout.title}
      </ThemedText>
      <ThemedText style={[styles.histMeta, { color: c.textSecondary }]} numberOfLines={1}>
        {hangout.vibe} · {hangout.when} · {hangout.going} going
      </ThemedText>
      {hangout.anonymous && <AnonChip colors={c} />}
    </View>
  );
}

function VoiceHistoryRow({ voice, c }: { voice: Voice; c: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.histRow, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={styles.histTop}>
        <View style={[styles.voiceTopicTag, { backgroundColor: c.subtle }]}>
          <ThemedText style={styles.voiceTopicEmoji}>{VOICE_TOPIC_EMOJI[voice.topic]}</ThemedText>
          <ThemedText style={[styles.voiceTopicText, { color: c.textSecondary }]}>
            {voice.topic}
          </ThemedText>
        </View>
        <ThemedText style={[styles.histMeta, { color: c.textSecondary }]}>
          {voice.votes >= 0 ? `+${voice.votes}` : voice.votes}
        </ThemedText>
      </View>
      <ThemedText style={[styles.voiceBody, { color: c.text }]} numberOfLines={3}>
        {voice.body}
      </ThemedText>
      {voice.anonymous && <AnonChip colors={c} />}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  colors,
  destructive,
}: {
  label: string;
  onPress: () => void;
  colors: (typeof Colors)['light'];
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: pressed ? colors.subtle : colors.card,
          borderColor: colors.border,
        },
      ]}>
      <ThemedText style={{ color: destructive ? '#dc2626' : colors.text, fontSize: 16 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 16,
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 22,
  },
  brandRow: {
    alignItems: 'flex-start',
  },
  profileBlock: { alignItems: 'center', gap: 8, paddingTop: 4 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarText: { fontSize: 28, fontWeight: '600' },
  name: { fontSize: 22, lineHeight: 28 },
  subline: { fontSize: 14 },
  email: { fontSize: 13, marginTop: 2 },
  section: {
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bio: { fontSize: 15, lineHeight: 22 },
  linksList: { gap: 8 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 4,
    gap: 12,
  },
  linkEmoji: { fontSize: 18 },
  linkText: { flex: 1, gap: 1 },
  linkLabel: { fontSize: 14 },
  linkUrl: { fontSize: 13 },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyCount: { fontSize: 11, letterSpacing: 0.3 },
  emptyHint: { fontSize: 13, lineHeight: 19 },
  historyList: { gap: 10 },
  historyGroupLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  histRow: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    gap: 6,
  },
  histTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  histTitle: { fontSize: 14, flex: 1 },
  histPayout: { fontSize: 14 },
  histMeta: { fontSize: 12 },
  voiceTopicTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  voiceTopicEmoji: { fontSize: 11 },
  voiceTopicText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  voiceBody: { fontSize: 13, lineHeight: 19 },
  anonChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
    marginTop: 2,
  },
  anonChipText: {
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  actions: { gap: 10, marginTop: 4 },
  actionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 4,
    borderWidth: 1,
  },
});
