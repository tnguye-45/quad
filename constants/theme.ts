/**
 * App color tokens. Clean grey/white palette.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#111827',
    textSecondary: '#6b7280',
    background: '#fafafa',
    card: '#ffffff',
    border: '#e5e7eb',
    subtle: '#f3f4f6',
    tint: '#111827',
    icon: '#6b7280',
    tabIconDefault: '#9ca3af',
    tabIconSelected: '#111827',
  },
  dark: {
    text: '#fafafa',
    textSecondary: '#a3a3a3',
    background: '#0a0a0a',
    card: '#171717',
    border: '#262626',
    subtle: '#262626',
    tint: '#fafafa',
    icon: '#a3a3a3',
    tabIconDefault: '#737373',
    tabIconSelected: '#fafafa',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
