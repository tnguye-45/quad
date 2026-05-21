import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link' | 'mono';
  mono?: boolean;
};

const SANS = Fonts?.sans;
const MONO = Fonts?.mono;

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  mono = false,
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const family = mono || type === 'mono' ? MONO : SANS;

  return (
    <Text
      style={[
        { color, fontFamily: family },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        type === 'mono' ? styles.mono : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 15,
    lineHeight: 21,
  },
  defaultSemiBold: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  mono: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
  link: {
    lineHeight: 22,
    fontSize: 14,
    color: '#0a7ea4',
  },
});
