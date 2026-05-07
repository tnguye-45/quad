import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type LogoProps = {
  size?: number;
  primary?: string;
  secondary?: string;
};

/**
 * The "quad" mark: a 2×2 grid in a diagonal checker pattern.
 * Top-left and bottom-right are the primary tint; the other two are softer.
 */
export function Logo({ size = 32, primary, secondary }: LogoProps) {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const dark = primary ?? c.text;
  const light = secondary ?? (scheme === 'dark' ? '#525252' : '#d1d5db');

  const cell = (size - size * 0.14) / 2;
  const radius = cell * 0.22;
  const gap = size * 0.14;

  const cellStyle = (color: string) => ({
    width: cell,
    height: cell,
    borderRadius: radius,
    backgroundColor: color,
  });

  return (
    <View style={{ width: size, height: size, gap, justifyContent: 'space-between' }}>
      <View style={[styles.row, { gap }]}>
        <View style={cellStyle(dark)} />
        <View style={cellStyle(light)} />
      </View>
      <View style={[styles.row, { gap }]}>
        <View style={cellStyle(light)} />
        <View style={cellStyle(dark)} />
      </View>
    </View>
  );
}

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<Size, { logo: number; word: number; gap: number; spacing: number }> = {
  sm: { logo: 18, word: 18, gap: 8, spacing: -0.4 },
  md: { logo: 28, word: 28, gap: 10, spacing: -0.8 },
  lg: { logo: 44, word: 46, gap: 14, spacing: -1.2 },
  xl: { logo: 64, word: 68, gap: 18, spacing: -2 },
};

type NamePlaqueProps = {
  size?: Size;
  align?: 'horizontal' | 'vertical';
  color?: string;
  showLogo?: boolean;
};

/**
 * Brand wordmark + logo combo — the "name plaque."
 * Use horizontal for headers, vertical for hero blocks.
 */
export function NamePlaque({
  size = 'md',
  align = 'horizontal',
  color,
  showLogo = true,
}: NamePlaqueProps) {
  const c = Colors[useColorScheme() ?? 'light'];
  const fg = color ?? c.text;
  const dim = SIZE_MAP[size];
  const isVertical = align === 'vertical';

  return (
    <View
      style={[
        styles.plaque,
        {
          flexDirection: isVertical ? 'column' : 'row',
          alignItems: 'center',
          gap: dim.gap,
        },
      ]}>
      {showLogo && <Logo size={dim.logo} primary={fg} />}
      <ThemedText
        style={[
          styles.wordmark,
          {
            color: fg,
            fontSize: dim.word,
            letterSpacing: dim.spacing,
            lineHeight: dim.word * 1.05,
          },
        ]}>
        quad
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  plaque: {
    alignSelf: 'flex-start',
  },
  wordmark: {
    fontWeight: '700',
  },
});
