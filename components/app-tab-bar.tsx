import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUnreadCounts } from "@/lib/messaging";

type TabKey = "index" | "voices" | "explore" | "messages" | "map";

const ICON: Record<
  TabKey,
  {
    on: Parameters<typeof IconSymbol>[0]["name"];
    off: Parameters<typeof IconSymbol>[0]["name"];
  }
> = {
  index: { on: "briefcase.fill", off: "briefcase" },
  voices: { on: "text.bubble.fill", off: "text.bubble" },
  explore: { on: "person.3.fill", off: "person.3" },
  messages: { on: "message.fill", off: "message" },
  map: { on: "map.fill", off: "map" },
};

const TAB_ORDER: TabKey[] = ["index", "voices", "explore", "messages"];

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const scheme = useColorScheme() ?? "light";
  const c = Colors[scheme];
  const [sheetOpen, setSheetOpen] = useState(false);
  const { total: unreadTotal } = useUnreadCounts();

  const currentRoute = state.routes[state.index]?.name as TabKey | undefined;

  const press = (key: TabKey) => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const target = state.routes.find((r) => r.name === key);
    if (!target) return;
    const event = navigation.emit({
      type: "tabPress",
      target: target.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(target.name as never);
    }
  };

  const openCreate = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSheetOpen(true);
  };

  const go = (path: string) => {
    setSheetOpen(false);
    setTimeout(() => router.push(path as never), 60);
  };

  return (
    <>
      <View
        style={[
          styles.bar,
          { backgroundColor: c.background, borderTopColor: c.border },
        ]}
      >
        {/* Left two tabs */}
        {TAB_ORDER.slice(0, 2).map((key) => (
          <TabButton
            key={key}
            active={currentRoute === key}
            onPress={() => press(key)}
            iconOn={ICON[key].on}
            iconOff={ICON[key].off}
            color={c.tabIconSelected}
            inactiveColor={c.tabIconDefault}
          />
        ))}

        {/* Center create */}
        <Pressable
          onPress={openCreate}
          accessibilityLabel="Create"
          hitSlop={8}
          style={({ pressed }) => [
            styles.tab,
            styles.centerTab,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={[styles.createBtn, { backgroundColor: c.tint }]}>
            <IconSymbol name="plus" size={20} color={c.background} />
          </View>
        </Pressable>

        {/* Right two tabs */}
        {TAB_ORDER.slice(2).map((key) => (
          <TabButton
            key={key}
            active={currentRoute === key}
            onPress={() => press(key)}
            iconOn={ICON[key].on}
            iconOff={ICON[key].off}
            color={c.tabIconSelected}
            inactiveColor={c.tabIconDefault}
            // Gold dot on the Messages tab when anything is unread anywhere.
            // No number — the house style is minimalist; the count lives on
            // the Messages list itself.
            badgeColor={
              key === "messages" && unreadTotal > 0 ? c.accent : undefined
            }
          />
        ))}
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={sheetOpen}
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: c.background,
                borderColor: c.border,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle}>
              <View
                style={[styles.handleBar, { backgroundColor: c.borderStrong }]}
              />
            </View>

            <ThemedText
              style={[styles.sheetTitle, { color: c.text }]}
              type="title"
            >
              Create
            </ThemedText>
            <ThemedText
              style={[styles.sheetSub, { color: c.textSecondary }]}
              type="mono"
            >
              what do you want to share
            </ThemedText>

            <View style={styles.sheetGrid}>
              <SheetAction
                label="Voice"
                hint="anonymous opinion"
                icon="text.bubble.fill"
                c={c}
                onPress={() => go("/post-voice")}
              />
              <SheetAction
                label="Gig"
                hint="paid task"
                icon="briefcase.fill"
                c={c}
                onPress={() => go("/post-gig")}
              />
              <SheetAction
                label="Hangout"
                hint="invite people"
                icon="person.3.fill"
                c={c}
                onPress={() => go("/start-hangout")}
              />
              <SheetAction
                label="Network"
                hint="see your social graph"
                icon="person.crop.circle.fill"
                c={c}
                onPress={() => go("/connections")}
              />
            </View>

            <Pressable
              onPress={() => setSheetOpen(false)}
              style={({ pressed }) => [
                styles.sheetCancel,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <ThemedText
                style={[styles.sheetCancelText, { color: c.textSecondary }]}
                type="mono"
              >
                cancel
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function TabButton({
  active,
  onPress,
  iconOn,
  iconOff,
  color,
  inactiveColor,
  badgeColor,
}: {
  active: boolean;
  onPress: () => void;
  iconOn: Parameters<typeof IconSymbol>[0]["name"];
  iconOff: Parameters<typeof IconSymbol>[0]["name"];
  color: string;
  inactiveColor: string;
  badgeColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.5 : 1 }]}
    >
      <View style={{ position: "relative" }}>
        <IconSymbol
          name={active ? iconOn : iconOff}
          size={24}
          color={active ? color : inactiveColor}
        />
        {badgeColor ? (
          <View style={[styles.tabBadge, { backgroundColor: badgeColor }]} />
        ) : null}
      </View>
    </Pressable>
  );
}

function SheetAction({
  label,
  hint,
  icon,
  c,
  onPress,
}: {
  label: string;
  hint: string;
  icon: Parameters<typeof IconSymbol>[0]["name"];
  c: (typeof Colors)["light"];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { borderColor: c.border, opacity: pressed ? 0.5 : 1 },
      ]}
    >
      <View style={[styles.actionIcon, { borderColor: c.border }]}>
        <IconSymbol name={icon} size={20} color={c.text} />
      </View>
      <View style={styles.actionText}>
        <ThemedText style={[styles.actionLabel, { color: c.text }]}>
          {label}
        </ThemedText>
        <ThemedText
          style={[styles.actionHint, { color: c.textSecondary }]}
          type="mono"
        >
          {hint}
        </ThemedText>
      </View>
      <IconSymbol name="chevron.right" size={16} color={c.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 64,
    paddingBottom: 6,
    paddingTop: 6,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  centerTab: {
    flex: 1,
  },
  tabBadge: {
    position: "absolute",
    top: -2,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  createBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetHandle: {
    alignItems: "center",
    paddingVertical: 10,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetTitle: {
    marginTop: 8,
  },
  sheetSub: {
    marginTop: 6,
    marginBottom: 20,
    textTransform: "lowercase",
  },
  sheetGrid: {
    gap: 0,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    flex: 1,
    gap: 2,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  actionHint: {
    fontSize: 11,
    textTransform: "lowercase",
  },
  sheetCancel: {
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 4,
  },
  sheetCancelText: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
});
