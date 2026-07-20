// Obsidian-style ego graph: the current user at center, their orbit laid out
// on concentric rings (1 = behavioral ties, 2 = strong overlap, 3 = weak).
// Deliberately dependency-free rendering — nodes are positioned Pressables and
// every edge is a 1px View rotated to the angle between its endpoints, so no
// SVG/Skia is needed at campus scale (≤40 nodes).

import * as Haptics from "expo-haptics";
import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Avatar } from "@/components/avatar";
import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import type { OrbitGraph, OrbitNode } from "@/lib/connections";

type ThemeColors = (typeof Colors)["light"];

type Positioned = {
  node: OrbitNode;
  x: number;
  y: number;
  size: number;
};

const RING_RADIUS: Record<1 | 2 | 3, number> = { 1: 0.24, 2: 0.36, 3: 0.47 };
const DOT_SIZE: Record<1 | 2 | 3, number> = { 1: 46, 2: 38, 3: 32 };
const ME_SIZE = 56;
const MAX_ZOOM = 2.5;

// Deterministic 0..1 from an id — angle jitter must not change between
// renders (Math.random would make the constellation twitch on every refresh).
function hash01(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967295;
}

function layout(graph: OrbitGraph, size: number): Positioned[] {
  const cx = size / 2;
  const cy = size / 2;
  const byRing: Record<1 | 2 | 3, OrbitNode[]> = { 1: [], 2: [], 3: [] };
  for (const node of graph.nodes) byRing[node.ring].push(node);

  const out: Positioned[] = [];
  for (const ring of [1, 2, 3] as const) {
    const nodes = byRing[ring];
    if (nodes.length === 0) continue;
    const radius = RING_RADIUS[ring] * size;
    // Each ring starts at its own deterministic offset so rings don't align
    // into spokes; per-node jitter keeps it organic instead of clock-face.
    const offset = hash01(nodes[0].id) * Math.PI * 2;
    const step = (Math.PI * 2) / nodes.length;
    nodes.forEach((node, i) => {
      const jitter = (hash01(node.id) - 0.5) * step * 0.5;
      const angle = offset + i * step + jitter;
      const r = radius * (0.96 + hash01(node.id + "r") * 0.08);
      out.push({
        node,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        size: DOT_SIZE[ring],
      });
    });
  }
  return out;
}

function Line({
  x1,
  y1,
  x2,
  y2,
  color,
  thickness,
  opacity,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  thickness: number;
  opacity: number;
}) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 1) return null;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (x1 + x2) / 2 - length / 2,
        top: (y1 + y2) / 2 - thickness / 2,
        width: length,
        height: thickness,
        backgroundColor: color,
        opacity,
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
}

function OrbitDot({
  positioned,
  selected,
  dimmed,
  showLabel,
  colors,
  onPress,
}: {
  positioned: Positioned;
  selected: boolean;
  dimmed: boolean;
  showLabel: boolean;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const { node, x, y, size } = positioned;
  const animated = useAnimatedStyle(() => ({
    opacity: withTiming(dimmed ? 0.14 : 1, { duration: 180 }),
    transform: [{ scale: withTiming(selected ? 1.12 : 1, { duration: 180 }) }],
  }));
  const behavioral = node.ring === 1;
  const label = (node.name ?? "someone").split(" ")[0].toLowerCase();
  return (
    <Animated.View
      style={[
        styles.dotWrap,
        { left: x - size / 2, top: y - size / 2, width: size },
        animated,
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${node.name ?? "A student"} — ${node.ties
          .map((t) => t.label)
          .join(", ")}`}
        hitSlop={8}
      >
        {selected && node.avatarUrl ? (
          <Avatar uri={node.avatarUrl} initials={node.initials ?? "?"} size={size} />
        ) : (
          <View
            style={[
              styles.dot,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: colors.surface,
                borderColor: selected
                  ? colors.accent
                  : behavioral
                    ? colors.accent
                    : colors.borderStrong,
                borderWidth: selected ? 2 : behavioral ? 1.5 : 1,
              },
            ]}
          >
            <ThemedText
              type="mono"
              style={[styles.dotInitials, { color: colors.text, fontSize: size * 0.3 }]}
            >
              {node.initials ?? "?"}
            </ThemedText>
          </View>
        )}
      </Pressable>
      {showLabel ? (
        <ThemedText
          type="mono"
          numberOfLines={1}
          style={[styles.dotLabel, { color: colors.textMuted }]}
        >
          {label}
        </ThemedText>
      ) : null}
    </Animated.View>
  );
}

export function OrbitGraphView({
  graph,
  me,
  size,
  colors,
  selectedId,
  onSelect,
}: {
  graph: OrbitGraph;
  me: { name: string | null; initials: string | null; avatarUrl: string | null };
  size: number;
  colors: ThemeColors;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const positioned = useMemo(() => layout(graph, size), [graph, size]);
  const positionById = useMemo(() => {
    const map = new Map<string, Positioned>();
    for (const p of positioned) map.set(p.node.id, p);
    return map;
  }, [positioned]);

  // When a node is selected, it and its peers hold; everything else recedes.
  const neighborIds = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const edge of graph.peerEdges) {
      if (edge.a === selectedId) set.add(edge.b);
      if (edge.b === selectedId) set.add(edge.a);
    }
    return set;
  }, [graph.peerEdges, selectedId]);

  // Bloom in from center whenever the graph data changes.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withSpring(1, { damping: 16, stiffness: 110 });
  }, [graph, progress]);
  const bloom = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.55 + 0.45 * progress.value }],
  }));

  // Pinch to zoom, pan while zoomed. minDistance keeps node taps working.
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      "worklet";
      scale.value = Math.min(MAX_ZOOM, Math.max(1, savedScale.value * e.scale));
    })
    .onEnd(() => {
      "worklet";
      savedScale.value = scale.value;
      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });
  const pan = Gesture.Pan()
    .minDistance(12)
    .onUpdate((e) => {
      "worklet";
      const max = (size * (scale.value - 1)) / 2;
      tx.value = Math.min(max, Math.max(-max, savedTx.value + e.translationX));
      ty.value = Math.min(max, Math.max(-max, savedTy.value + e.translationY));
    })
    .onEnd(() => {
      "worklet";
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });
  const gestures = Gesture.Simultaneous(pinch, pan);

  const viewport = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const cx = size / 2;
  const cy = size / 2;
  const dimFactor = 0.1;

  const handleSelect = (id: string | null) => {
    void Haptics.selectionAsync().catch(() => undefined);
    onSelect(id);
  };

  return (
    <GestureDetector gesture={gestures}>
      <Animated.View
        style={[styles.canvas, { width: size, height: size }, viewport]}
        accessibilityLabel={`Orbit map: ${graph.nodes.length} people in your orbit`}
      >
        <Animated.View style={[StyleSheet.absoluteFill, bloom]}>
          {/* edges under nodes: ego spokes first, then peer lines */}
          {positioned.map((p) => {
            const behavioral = p.node.ring === 1;
            const isSelected = p.node.id === selectedId;
            const base = behavioral ? 0.75 : 0.4;
            const opacity = selectedId
              ? isSelected
                ? 0.9
                : base * dimFactor
              : base;
            return (
              <Line
                key={`ego-${p.node.id}`}
                x1={cx}
                y1={cy}
                x2={p.x}
                y2={p.y}
                color={behavioral ? colors.accent : colors.borderStrong}
                thickness={behavioral ? 1.5 : 1}
                opacity={opacity}
              />
            );
          })}
          {graph.peerEdges.map((edge) => {
            const a = positionById.get(edge.a);
            const b = positionById.get(edge.b);
            if (!a || !b) return null;
            const touchesSelected =
              selectedId != null &&
              (edge.a === selectedId || edge.b === selectedId);
            const opacity = selectedId ? (touchesSelected ? 0.55 : 0.05) : 0.28;
            return (
              <Line
                key={`peer-${edge.a}-${edge.b}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                color={edge.kind === "hungout" ? colors.accent : colors.borderStrong}
                thickness={1}
                opacity={opacity}
              />
            );
          })}

          {positioned.map((p) => (
            <OrbitDot
              key={p.node.id}
              positioned={p}
              selected={p.node.id === selectedId}
              dimmed={neighborIds != null && !neighborIds.has(p.node.id)}
              showLabel={p.node.ring < 3 || p.node.id === selectedId}
              colors={colors}
              onPress={() =>
                handleSelect(p.node.id === selectedId ? null : p.node.id)
              }
            />
          ))}

          {/* me, dead center, gold ring — tapping clears any selection */}
          <View
            style={[
              styles.dotWrap,
              { left: cx - ME_SIZE / 2, top: cy - ME_SIZE / 2, width: ME_SIZE },
            ]}
          >
            <Pressable
              onPress={() => handleSelect(null)}
              accessibilityRole="button"
              accessibilityLabel="You, at the center of your orbit"
              hitSlop={8}
            >
              <View
                style={[
                  styles.meRing,
                  { borderColor: colors.accent, width: ME_SIZE, height: ME_SIZE },
                ]}
              >
                {me.avatarUrl ? (
                  <Avatar
                    uri={me.avatarUrl}
                    initials={me.initials ?? "you"}
                    size={ME_SIZE - 8}
                  />
                ) : (
                  <View
                    style={[
                      styles.dot,
                      {
                        width: ME_SIZE - 8,
                        height: ME_SIZE - 8,
                        borderRadius: (ME_SIZE - 8) / 2,
                        backgroundColor: colors.tint,
                        borderWidth: 0,
                      },
                    ]}
                  >
                    <ThemedText
                      type="mono"
                      style={[styles.dotInitials, { color: colors.background, fontSize: 15 }]}
                    >
                      {me.initials ?? "you"}
                    </ThemedText>
                  </View>
                )}
              </View>
            </Pressable>
            <ThemedText
              type="mono"
              style={[styles.dotLabel, { color: colors.textSecondary }]}
            >
              you
            </ThemedText>
          </View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  canvas: {
    alignSelf: "center",
    overflow: "hidden",
  },
  dotWrap: {
    position: "absolute",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    alignItems: "center",
    justifyContent: "center",
  },
  dotInitials: {
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  dotLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
    maxWidth: 72,
  },
  meRing: {
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
