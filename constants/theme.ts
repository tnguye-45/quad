/**
 * App color tokens. Notre Dame palette: gold accent on warm cream + navy text.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0C2340',
    textSecondary: '#5D6B85',
    textMuted: '#9CA5B5',
    background: '#FBF8F1',
    surface: '#F6F1E4',
    card: '#FFFDF6',
    border: '#E8DFC9',
    borderStrong: '#D4C6A5',
    subtle: '#F2EBD9',
    tint: '#0C2340',
    accent: '#C99700',
    danger: '#B83C2E',
    online: '#1E9E5A',
    icon: '#5D6B85',
    tabIconDefault: '#9CA5B5',
    tabIconSelected: '#0C2340',
  },
  dark: {
    text: '#FBF8F1',
    textSecondary: '#B8BFCD',
    textMuted: '#6E7A93',
    background: '#0A1A2E',
    surface: '#0F2238',
    card: '#142A44',
    border: '#1F3552',
    borderStrong: '#37496A',
    subtle: '#142A44',
    tint: '#FBF8F1',
    accent: '#E0B040',
    danger: '#EF6B5A',
    online: '#3FC97E',
    icon: '#B8BFCD',
    tabIconDefault: '#6E7A93',
    tabIconSelected: '#E0B040',
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
