import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';

type RightAction = {
  icon: Parameters<typeof IconSymbol>[0]['name'];
  onPress: () => void;
  label: string;
};

type Props = {
  title: string;
  subtitle?: string;
  rightActions?: RightAction[];
  showBrand?: boolean;
  showAvatar?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  rightActions = [],
  showBrand = true,
  showAvatar = true,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const { profile } = useAuth();

  return (
    <View style={[styles.wrap, { backgroundColor: c.background }]}>
      <View style={styles.topRow}>
        {showBrand ? <NamePlaque size="sm" /> : <View />}
        <View style={styles.actions}>
          {rightActions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              accessibilityLabel={a.label}
              hitSlop={8}
              style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.5 : 1 }]}>
              <IconSymbol name={a.icon} size={20} color={c.text} />
            </Pressable>
          ))}
          {showAvatar && (
            <Pressable
              onPress={() => router.push('/modal')}
              accessibilityLabel="Open your profile"
              hitSlop={6}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <Avatar
                uri={profile?.avatar_url}
                initials={profile?.initials}
                size={32}
                textSize={11}
              />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.titleRow}>
        <ThemedText style={[styles.title, { color: c.text }]}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText style={[styles.subtitle, { color: c.textMuted }]} type="mono">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    marginTop: 18,
    gap: 4,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
});
