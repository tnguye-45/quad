import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
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
        <View style={styles.notSignedIn}>
          <ThemedText style={{ color: c.textSecondary }}>Not signed in.</ThemedText>
        </View>
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
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.5 : 1 }]}>
            <ThemedText style={[styles.closeText, { color: c.textMuted }]} type="mono">
              close
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.profileBlock}>
          <View style={styles.avatarWrap}>
            <Avatar uri={profile.avatar_url} initials={profile.initials} size={88} />
          </View>
          <ThemedText style={[styles.name, { color: c.text }]}>
            {profile.display_name || 'No name yet'}
          </ThemedText>
          {subline ? (
            <ThemedText style={[styles.subline, { color: c.textSecondary }]}>
              {subline}
            </ThemedText>
          ) : null}
          <ThemedText style={[styles.email, { color: c.textMuted }]} type="mono">
            {session.user.email}
          </ThemedText>
        </View>

        {profile.bio ? (
          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText style={[styles.sectionLabel, { color: c.textMuted }]} type="mono">
              about
            </ThemedText>
            <ThemedText style={[styles.bio, { color: c.text }]}>{profile.bio}</ThemedText>
          </View>
        ) : null}

        {profile.links.length > 0 ? (
          <View style={[styles.section, { borderTopColor: c.border }]}>
            <ThemedText style={[styles.sectionLabel, { color: c.textMuted }]} type="mono">
              links
            </ThemedText>
            <View style={styles.linksList}>
              {profile.links.map((l: ProfileLink, i: number) => (
                <Pressable
                  key={`${l.url}-${i}`}
                  onPress={() => openLink(l.url)}
                  style={({ pressed }) => [
                    styles.linkRow,
                    {
                      borderBottomColor: c.border,
                      opacity: pressed ? 0.5 : 1,
                    },
                  ]}>
                  <ThemedText style={styles.linkEmoji}>{linkEmoji(l.label, l.url)}</ThemedText>
                  <View style={styles.linkText}>
                    <ThemedText style={[styles.linkLabel, { color: c.text }]}>
                      {l.label}
                    </ThemedText>
                    <ThemedText
                      numberOfLines={1}
                      style={[styles.linkUrl, { color: c.textMuted }]}
                      type="mono">
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
            <ThemedText style={[styles.sectionLabel, { color: c.textMuted }]} type="mono">
              your posts
            </ThemedText>
            <ThemedText style={[styles.historyCount, { color: c.textMuted }]} type="mono">
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
                <ThemedText style={[styles.historyGroupLabel, { color: c.textMuted }]} type="mono">
                  gigs · {myPosts.gigs.length}
                </ThemedText>
              )}
              {myPosts.gigs.map((g) => (
                <GigHistoryRow key={g.id} gig={g} c={c} />
              ))}

              {myPosts.hangouts.length > 0 && (
                <ThemedText style={[styles.historyGroupLabel, { color: c.textMuted }]} type="mono">
                  hangouts · {myPosts.hangouts.length}
                </ThemedText>
              )}
              {myPosts.hangouts.map((h) => (
                <HangoutHistoryRow key={h.id} hangout={h} c={c} />
              ))}

              {myPosts.voices.length > 0 && (
                <ThemedText style={[styles.historyGroupLabel, { color: c.textMuted }]} type="mono">
                  voices · {myPosts.voices.length}
                </ThemedText>
              )}
              {myPosts.voices.map((v) => (
                <VoiceHistoryRow key={v.id} voice={v} c={c} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push('/profile-setup')}
            style={({ pressed }) => [
              styles.primaryAction,
              { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
            ]}>
            <ThemedText style={[styles.primaryActionText, { color: c.background }]}>
              Edit profile
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={handleSignOut}
            style={({ pressed }) => [styles.signOutBtn, { opacity: pressed ? 0.5 : 1 }]}>
            <ThemedText style={[styles.signOutText, { color: c.danger }]} type="mono">
              sign out
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function AnonTag({ colors }: { colors: (typeof Colors)['light'] }) {
  return (
    <ThemedText style={[styles.anonTag, { color: colors.textMuted }]} type="mono">
      · anonymous
    </ThemedText>
  );
}

function GigHistoryRow({ gig, c }: { gig: Gig; c: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.histRow, { borderBottomColor: c.border }]}>
      <View style={styles.histTop}>
        <ThemedText style={[styles.histTitle, { color: c.text }]} numberOfLines={1}>
          {gig.title}
        </ThemedText>
        <ThemedText style={[styles.histPayout, { color: c.text }]}>
          {gig.payout}
        </ThemedText>
      </View>
      <ThemedText style={[styles.histMeta, { color: c.textMuted }]} numberOfLines={1} type="mono">
        {gig.category.toLowerCase()} · {gig.where.toLowerCase()} · {gig.postedAgo}
        {gig.anonymous ? ' · anonymous' : ''}
      </ThemedText>
    </View>
  );
}

function HangoutHistoryRow({ hangout, c }: { hangout: Hangout; c: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.histRow, { borderBottomColor: c.border }]}>
      <ThemedText style={[styles.histTitle, { color: c.text }]} numberOfLines={1}>
        {hangout.title}
      </ThemedText>
      <ThemedText style={[styles.histMeta, { color: c.textMuted }]} numberOfLines={1} type="mono">
        {hangout.vibe.toLowerCase()} · {hangout.when.toLowerCase()} · {hangout.going} going
        {hangout.anonymous ? ' · anonymous' : ''}
      </ThemedText>
    </View>
  );
}

function VoiceHistoryRow({ voice, c }: { voice: Voice; c: (typeof Colors)['light'] }) {
  return (
    <View style={[styles.histRow, { borderBottomColor: c.border }]}>
      <View style={styles.histTop}>
        <ThemedText style={[styles.voiceTopicLabel, { color: c.textMuted }]} type="mono">
          {VOICE_TOPIC_EMOJI[voice.topic]} {voice.topic.toLowerCase()}
        </ThemedText>
        <ThemedText
          style={[
            styles.voiceVotes,
            { color: voice.votes > 0 ? c.accent : c.textMuted },
          ]}
          type="mono">
          {voice.votes >= 0 ? `+${voice.votes}` : voice.votes}
        </ThemedText>
      </View>
      <ThemedText style={[styles.voiceBody, { color: c.text }]} numberOfLines={3}>
        {voice.body}
      </ThemedText>
      {voice.anonymous ? <AnonTag colors={c} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 28,
  },
  notSignedIn: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  closeText: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  profileBlock: { alignItems: 'center', gap: 6, paddingTop: 12 },
  avatarWrap: { marginBottom: 10 },
  name: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 30,
  },
  subline: { fontSize: 14, marginTop: 2 },
  email: {
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 4,
  },
  section: {
    paddingTop: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  bio: { fontSize: 15, lineHeight: 22 },
  linksList: { gap: 0 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkEmoji: { fontSize: 18 },
  linkText: { flex: 1, gap: 2 },
  linkLabel: { fontSize: 15, fontWeight: '600' },
  linkUrl: {
    fontSize: 11,
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyCount: {
    fontSize: 10,
    letterSpacing: 0.6,
  },
  emptyHint: { fontSize: 13, lineHeight: 20 },
  historyList: { gap: 0 },
  historyGroupLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 4,
  },
  histRow: {
    paddingVertical: 12,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  histTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  histTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
    flex: 1,
  },
  histPayout: {
    fontSize: 14,
    fontWeight: '700',
  },
  histMeta: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  voiceTopicLabel: {
    fontSize: 10,
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  voiceVotes: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  voiceBody: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  anonTag: {
    fontSize: 10,
    letterSpacing: 0.4,
    marginTop: 4,
  },
  actions: { gap: 14, marginTop: 8, alignItems: 'center' },
  primaryAction: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  signOutBtn: { paddingVertical: 6 },
  signOutText: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
});
