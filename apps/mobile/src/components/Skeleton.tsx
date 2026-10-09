import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, DimensionValue } from 'react-native';
import { GlassCard } from './GlassCard';
import { colors, radius } from '../theme/tokens';

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: DimensionValue }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => { cancelled = true; loop?.stop(); };
  }, [opacity]);

  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={{ height, width, opacity, borderRadius: radius.md, backgroundColor: colors.border }}
    />
  );
}

export function SkeletonCard() {
  return (
    <GlassCard>
      <Skeleton height={14} width="30%" />
      <Skeleton height={20} width="70%" />
      <Skeleton height={14} width="50%" />
    </GlassCard>
  );
}