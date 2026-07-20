import { router } from "expo-router";
import { useState } from "react";
import {
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    View,
} from "react-native";

import { Avatar } from "@/components/avatar";
import { ScreenHeader } from "@/components/screen-header";
import { SkeletonList } from "@/components/skeleton";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePosts, type Hangout } from "@/lib/posts-store";

const VIBE_EMOJI: Record<string, string> = {
  Study: "📚",
  Sports: "🏀",
  Food: "🍕",
  Social: "🎉",
  Other: "✨",
};

export default function HangoutsScreen() {
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];
  const {
    hangouts,
    rsvpHangout,
    myRsvps,
    loading,
    hydrated,
    error,
    refresh,
    loadMore,
    hasMore,
  } = usePosts();
  const [refreshing, setRefreshing] = useState(false);
  const showLoading = !hydrated && loading && hangouts.length === 0;
  // Don't invite them to "start a hangout" when the feed merely failed to load —
  // the retry row above is already saying the opposite.
  const isEmpty = hydrated && !error && hangouts.length === 0;

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScreenHeader
        title="Hangouts"
        subtitle={`${hangouts.length} happening this week`}
      />

      <Pressable
        onPress={() => router.push("/connections" as never)}
        accessibilityRole="button"
        accessibilityLabel="Open your connection map"
        style={({ pressed }) => [
          styles.networkCta,
          {
            borderColor: c.border,
            backgroundColor: c.surface,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={styles.networkCtaText}>
          <ThemedText style={[styles.networkTitle, { color: c.text }]}>
            Obsidian map
          </ThemedText>
          <ThemedText style={[styles.networkBody, { color: c.textSecondary }]}>
            see who overlaps with you by dorm, major, year, hangouts, and gigs
          </ThemedText>
        </View>
        <IconSymbol name="chevron.right" size={16} color={c.textMuted} />
      </Pressable>

      <FlatList
        data={hangouts}
        keyExtractor={(h) => h.id}
        renderItem={({ item }) => (
          <HangoutCard
            hangout={item}
            c={c}
            joined={!!myRsvps[item.id]}
            onJoin={() => rsvpHangout(item.id)}
          />
        )}
        ListHeaderComponent={
          error && !showLoading ? (
            <Pressable
              onPress={refresh}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.retryRow,
                { borderColor: c.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <ThemedText
                style={[styles.retryText, { color: c.danger }]}
                type="mono"
              >
                Couldn&apos;t load hangouts. Tap to retry.
              </ThemedText>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          showLoading ? (
            <SkeletonList count={3} avatarSize={38} />
          ) : isEmpty ? (
            <View style={styles.emptyBlock}>
              <IconSymbol name="person.3" size={36} color={c.textMuted} />
              <ThemedText style={[styles.emptyTitle, { color: c.text }]}>
                Nothing on the schedule
              </ThemedText>
              <ThemedText
                style={[styles.emptyBody, { color: c.textSecondary }]}
              >
                A study session, dining hall meetup, pickup basketball — pick
                anything.
              </ThemedText>
              <Pressable
                onPress={() => router.push("/start-hangout" as never)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.emptyCta,
                  { backgroundColor: c.tint, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <ThemedText
                  style={[styles.emptyCtaText, { color: c.background }]}
                >
                  Start a hangout
                </ThemedText>
              </Pressable>
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.textMuted}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasMore.hangouts) void loadMore("hangouts");
        }}
        ListFooterComponent={<View style={{ height: 120 }} />}
      />
    </ThemedView>
  );
}

function HangoutCard({
  hangout,
  c,
  joined,
  onJoin,
}: {
  hangout: Hangout;
  c: (typeof Colors)["light"];
  joined: boolean;
  onJoin: () => void;
}) {
  const hostLabel =
    hangout.anonymous || !hangout.hostName
      ? "anonymous host"
      : hangout.hostName;
  const hostInitials =
    hangout.anonymous || !hangout.hostInitials ? "?" : hangout.hostInitials;
  const hostAvatarUri = hangout.anonymous ? null : hangout.hostAvatarUrl;

  return (
    <Pressable
      onPress={() => router.push(`/hangout/${hangout.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`Hangout: ${hangout.title}`}
      style={({ pressed }) => [
        styles.card,
        { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={styles.cardHead}>
        <Avatar
          uri={hostAvatarUri}
          initials={hostInitials}
          size={38}
          textSize={12}
        />
        <View style={styles.cardHeadText}>
          <ThemedText style={[styles.host, { color: c.text }]}>
            {hostLabel}
          </ThemedText>
          <ThemedText
            style={[styles.vibeText, { color: c.textMuted }]}
            type="mono"
          >
            {VIBE_EMOJI[hangout.vibe] || "✨"} {hangout.vibe.toLowerCase()}
          </ThemedText>
        </View>
        <View style={[styles.goingBadge, { borderColor: c.border }]}>
          <ThemedText style={[styles.goingNum, { color: c.text }]}>
            {hangout.going}
          </ThemedText>
          <ThemedText
            style={[styles.goingLabel, { color: c.textMuted }]}
            type="mono"
          >
            going
          </ThemedText>
        </View>
      </View>

      <ThemedText style={[styles.cardTitle, { color: c.text }]}>
        {hangout.title}
      </ThemedText>

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <IconSymbol name="clock" size={12} color={c.textMuted} />
          <ThemedText
            style={[styles.metaText, { color: c.textSecondary }]}
            type="mono"
          >
            {hangout.when.toLowerCase()}
          </ThemedText>
        </View>
        <View style={styles.metaItem}>
          <IconSymbol name="mappin" size={12} color={c.textMuted} />
          <ThemedText
            style={[styles.metaText, { color: c.textSecondary }]}
            type="mono"
          >
            {hangout.where.toLowerCase()}
          </ThemedText>
        </View>
      </View>

      <Pressable
        onPress={(e) => {
          // Don't let the quick-RSVP tap also open the detail screen.
          (
            e as unknown as { stopPropagation?: () => void }
          ).stopPropagation?.();
          onJoin();
        }}
        disabled={joined}
        accessibilityRole="button"
        accessibilityState={{ disabled: joined }}
        style={({ pressed }) => [
          styles.joinBtn,
          joined
            ? {
                backgroundColor: "transparent",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: c.border,
              }
            : { backgroundColor: c.tint, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <ThemedText
          style={[
            styles.joinBtnText,
            { color: joined ? c.textSecondary : c.background },
          ]}
        >
          {joined ? "You're in" : "I'm in"}
        </ThemedText>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 0,
  },
  networkCta: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  networkCtaText: {
    flex: 1,
    gap: 2,
  },
  networkTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  networkBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  card: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardHeadText: {
    flex: 1,
    gap: 1,
  },
  host: {
    fontSize: 14,
    fontWeight: "600",
  },
  vibeText: {
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: "lowercase",
  },
  goingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  goingNum: {
    fontSize: 14,
    fontWeight: "700",
  },
  goingLabel: {
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  cardMeta: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  joinBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  joinBtnText: {
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  emptyBlock: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
    marginTop: 4,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  emptyCta: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 8,
  },
  emptyCtaText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  retryRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  retryText: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "lowercase",
  },
});
