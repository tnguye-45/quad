// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'house': 'home',
  'paperplane.fill': 'send',
  'paperplane': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'briefcase.fill': 'work',
  'briefcase': 'work-outline',
  'person.3.fill': 'groups',
  'person.3': 'groups',
  'person.fill': 'person',
  'person': 'person-outline',
  'map.fill': 'map',
  'map': 'map',
  'message.fill': 'chat-bubble',
  'message': 'chat-bubble-outline',
  'text.bubble.fill': 'forum',
  'text.bubble': 'forum',
  'chevron.up': 'keyboard-arrow-up',
  'chevron.down': 'keyboard-arrow-down',
  'bubble.right': 'mode-comment',
  'plus': 'add',
  'plus.circle.fill': 'add-circle',
  'plus.square': 'add-box',
  'mappin.and.ellipse': 'location-on',
  'mappin': 'place',
  'clock.fill': 'schedule',
  'clock': 'schedule',
  'heart': 'favorite-border',
  'heart.fill': 'favorite',
  'arrow.up': 'arrow-upward',
  'arrow.down': 'arrow-downward',
  'arrow.up.circle': 'arrow-circle-up',
  'arrow.down.circle': 'arrow-circle-down',
  'arrow.up.circle.fill': 'arrow-circle-up',
  'arrow.down.circle.fill': 'arrow-circle-down',
  'square.and.arrow.up': 'ios-share',
  'bookmark': 'bookmark-border',
  'bookmark.fill': 'bookmark',
  'ellipsis': 'more-horiz',
  'magnifyingglass': 'search',
  'bell': 'notifications-none',
  'bell.fill': 'notifications',
  'flame': 'local-fire-department',
  'flame.fill': 'local-fire-department',
  'sparkles': 'auto-awesome',
  'eye': 'visibility',
  'eye.slash': 'visibility-off',
  'xmark': 'close',
  'circle': 'radio-button-unchecked',
  'checkmark.circle.fill': 'check-circle',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
