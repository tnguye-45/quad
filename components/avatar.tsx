import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  uri?: string | null;
  initials?: string | null;
  size: number;
  /** Hairline border around the avatar. Defaults to true. */
  bordered?: boolean;
  /** Override the initials text size. Defaults to a size proportional to `size`. */
  textSize?: number;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({ uri, initials, size, bordered = true, textSize, style }: Props) {
  const c = Colors[useColorScheme() ?? 'light'];
  const radius = size / 2;
  const label = (initials && initials.trim()) || '?';
  const computedTextSize = textSize ?? Math.max(10, Math.round(size * 0.36));

  const base: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: radius,
      backgroundColor: c.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    bordered && {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderStrong,
    },
    style,
  ];

  if (uri) {
    return (
      <View style={base}>
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
        />
      </View>
    );
  }

  return (
    <View style={base}>
      <ThemedText style={{ color: c.text, fontSize: computedTextSize, fontWeight: '700' }}>
        {label}
      </ThemedText>
    </View>
  );
}
