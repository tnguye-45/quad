import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Avatar } from "@/components/avatar";
import { OrbitGraphView } from "@/components/orbit-graph";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth, type Profile, type ProfileLink } from "@/lib/auth-context";
import {
  buildOrbitGraph,
  demoOrbitSources,
  fetchOrbitSources,
  type OrbitGraph,
  type OrbitNode,
} from "@/lib/connections";

const FALLBACK_LINKS: ProfileLink[] = [
  { label: "LinkedIn", url: "https://linkedin.com/in/example" },
  { label: "Instagram", url: "https://instagram.com/example" },
];

// Demo/dev roster only — a real session must NEVER see these fictional
// students presented as classmates.
const FALLBACK_PROFILES: Profile[] = [
  {
    id: "demo-1",
    display_name: "Aisha Reyes",
    initials: "AR",
    year: 3,
    major: "Computer Science",
    dorm: "Dillon Hall",
    avatar_url: null,
    bio: "Runs the campus AI club and loves late-night debugging.",
    links: FALLBACK_LINKS,
    verified_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo-2",
    display_name: "Luis Chen",
    initials: "LC",
    year: 4,
    major: "Computer Science",
    dorm: "Sorin College",
    avatar_url: null,
    bio: "Building a student startup and always up for a coffee walk.",
    links: [{ label: "GitHub", url: "https://github.com/example" }],
    verified_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo-3",
    display_name: "Maya Patel",
    initials: "MP",
    year: 3,
    major: "Economics",
    dorm: "Dillon Hall",
    avatar_url: null,
    bio: "Keeps the campus food scene on lock and knows everyone in the dining halls.",
    links: [{ label: "Instagram", url: "https://instagram.com/example" }],
    verified_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

type ViewMode = "map" | "list";

export default function ConnectionsScreen() {
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];
  const { width } = useWindowDimensions();
  const { profile, isDev } = useAuth();
  const [graph, setGraph] = useState<OrbitGraph>({ nodes: [], peerEdges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The graph canvas is inherently opaque to a screen reader; the list is the
  // accessible representation, so it becomes the default when one is running.
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (active && enabled) setMode("list");
    });
    return () => {
      active = false;
    };
  }, []);

  const loadGraph = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const sources = isDev
        ? demoOrbitSources(FALLBACK_PROFILES)
        : await fetchOrbitSources(profile);
      setGraph(buildOrbitGraph(profile, sources));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load your orbit.");
      setGraph({ nodes: [], peerEdges: [] });
    } finally {
      setLoading(false);
    }
  }, [profile, isDev]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const selected = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );

  const graphSize = Math.min(width, 420);
  const isEmpty = !loading && !error && graph.nodes.length === 0;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="chevron.left" size={22} color={c.text} />
          </Pressable>
          <View style={styles.headerText}>
            <ThemedText style={[styles.title, { color: c.text }]}>
              Obsidian map
            </ThemedText>
            <ThemedText
              style={[styles.subtitle, { color: c.textMuted }]}
              type="mono"
            >
              people as nodes · overlap as edges
            </ThemedText>
          </View>
          {loading ? <ActivityIndicator color={c.accent} /> : null}
        </View>

        <View style={[styles.modeRow, { borderBottomColor: c.border }]}>
          {(["map", "list"] as const).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={styles.modeSegment}
              >
                <ThemedText
                  style={[
                    styles.modeText,
                    { color: active ? c.text : c.textMuted },
                    active && styles.modeTextActive,
                  ]}
                >
                  {m}
                </ThemedText>
                <View
                  style={[
                    styles.modeUnderline,
                    { backgroundColor: active ? c.accent : "transparent" },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <Pressable
            onPress={() => void loadGraph()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.retryRow,
              { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <ThemedText style={[styles.retryText, { color: c.danger }]} type="mono">
              couldn&apos;t load your orbit. tap to retry.
            </ThemedText>
          </Pressable>
        ) : null}

        {isEmpty ? (
          <View style={styles.emptyBlock}>
            <ThemedText style={[styles.emptyTitle, { color: c.text }]}>
              No orbit yet
            </ThemedText>
            <ThemedText style={[styles.emptyBody, { color: c.textSecondary }]}>
              Join a hangout, work a gig, or add your dorm and major — edges
              appear as overlap does.
            </ThemedText>
          </View>
        ) : mode === "map" ? (
          <View style={styles.mapWrap}>
            <OrbitGraphView
              graph={graph}
              me={{
                name: profile?.display_name ?? null,
                initials: profile?.initials ?? null,
                avatarUrl: profile?.avatar_url ?? null,
              }}
              size={graphSize}
              colors={c}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <View style={[styles.detail, { borderTopColor: c.border }]}>
              {selected ? (
                <>
                  <View style={styles.detailHead}>
                    <ThemedText style={[styles.detailName, { color: c.text }]}>
                      {selected.name ?? "A student"}
                    </ThemedText>
                    <ThemedText
                      style={[styles.detailMeta, { color: c.textMuted }]}
                      type="mono"
                      numberOfLines={1}
                    >
                      {[
                        selected.major,
                        selected.dorm,
                        selected.year ? `year ${selected.year}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                        .toLowerCase() || "profile still sparse"}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={[styles.detailTies, { color: c.accent }]}
                    type="mono"
                  >
                    {selected.ties.map((t) => t.label).join(" · ")}
                  </ThemedText>
                  {selected.bio ? (
                    <ThemedText
                      style={[styles.detailBio, { color: c.textSecondary }]}
                      numberOfLines={2}
                    >
                      {selected.bio}
                    </ThemedText>
                  ) : null}
                </>
              ) : (
                <ThemedText
                  style={[styles.detailHint, { color: c.textMuted }]}
                  type="mono"
                >
                  tap a node · gold edges are things that actually happened
                </ThemedText>
              )}
            </View>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {graph.nodes.map((node) => (
              <OrbitRow
                key={node.id}
                node={node}
                c={c}
                onPress={() => {
                  setSelectedId(node.id);
                  setMode("map");
                }}
              />
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </ThemedView>
    </GestureHandlerRootView>
  );
}

function OrbitRow({
  node,
  c,
  onPress,
}: {
  node: OrbitNode;
  c: (typeof Colors)["light"];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${node.name ?? "A student"} — ${node.ties
        .map((t) => t.label)
        .join(", ")}. Show on map.`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Avatar uri={node.avatarUrl} initials={node.initials ?? "?"} size={38} textSize={12} />
      <View style={styles.rowMain}>
        <ThemedText style={[styles.rowName, { color: c.text }]}>
          {node.name ?? "A student"}
        </ThemedText>
        <ThemedText
          style={[styles.rowMeta, { color: c.textMuted }]}
          type="mono"
          numberOfLines={1}
        >
          {[node.major, node.dorm].filter(Boolean).join(" · ").toLowerCase() ||
            "profile still sparse"}
        </ThemedText>
        <ThemedText style={[styles.rowTies, { color: c.accent }]} type="mono">
          {node.ties.map((t) => t.label).join(" · ")}
        </ThemedText>
      </View>
      <IconSymbol name="chevron.right" size={14} color={c.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: "lowercase",
  },
  modeRow: {
    flexDirection: "row",
    gap: 24,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modeSegment: {
    paddingVertical: 10,
    gap: 6,
  },
  modeText: {
    fontSize: 14,
  },
  modeTextActive: {
    fontWeight: "700",
  },
  modeUnderline: {
    height: 2,
    width: "100%",
    borderRadius: 1,
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
  emptyBlock: {
    paddingHorizontal: 32,
    paddingTop: 80,
    gap: 10,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  mapWrap: {
    flex: 1,
    justifyContent: "space-between",
  },
  detail: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 6,
    minHeight: 96,
  },
  detailHead: {
    gap: 2,
  },
  detailName: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  detailMeta: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  detailTies: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "lowercase",
  },
  detailBio: {
    fontSize: 13,
    lineHeight: 18,
  },
  detailHint: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "lowercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 15,
    fontWeight: "600",
  },
  rowMeta: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  rowTies: {
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: "lowercase",
  },
});
