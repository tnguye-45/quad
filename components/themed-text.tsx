import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

const MONO = Fonts?.mono;

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color, fontFamily: MONO },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 14,
    lineHeight: 20,
  },
  defaultSemiBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  link: {
    lineHeight: 22,
    fontSize: 14,
    color: '#0a7ea4',
  },
});
