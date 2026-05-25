import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type BoxProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A single shimmer box. The shimmer is a Reanimated horizontal linear-ish
 * gradient effect implemented via an animated translucent slab moving
 * across the box. Cheap enough to render dozens per screen.
 */
export function SkeletonBox({ width, height = 14, radius = 6, style }: BoxProps) {
  const c = Colors[useColorScheme() ?? 'light'];
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: 0.4 + 0.4 * Math.abs(0.5 - progress.value) * 2,
  }));

  return (
    <View
      style={[
        styles.box,
        {
          width: width as number | `${number}%` | undefined,
          height,
          borderRadius: radius,
          backgroundColor: c.subtle,
        },
        style,
      ]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: c.border, borderRadius: radius },
          animated,
        ]}
      />
    </View>
  );
}

/**
 * A skeleton row in the shape of a feed item: a circular avatar + two
 * stacked text lines. Used by Gigs / Hangouts / Voices / Messages while
 * the initial fetch is in flight.
 */
export function SkeletonRow({ avatarSize = 44 }: { avatarSize?: number }) {
  const c = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={[styles.row, { borderBottomColor: c.border }]}>
      <SkeletonBox
        width={avatarSize}
        height={avatarSize}
        radius={avatarSize / 2}
      />
      <View style={styles.rowLines}>
        <SkeletonBox width="70%" height={12} radius={4} />
        <SkeletonBox width="45%" height={10} radius={4} />
      </View>
    </View>
  );
}

/**
 * Convenience: render N skeleton rows. Use to fill a feed area while
 * the initial fetch is in flight.
 */
export function SkeletonList({
  count = 4,
  avatarSize = 44,
}: {
  count?: number;
  avatarSize?: number;
}) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} avatarSize={avatarSize} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLines: {
    flex: 1,
    gap: 8,
  },
});
