import { ReactNode, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

export function FadeIn({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return v.setValue(1);
      Animated.timing(v, { toValue: 1, duration: 420, delay, useNativeDriver: true }).start();
    });
    return () => { cancelled = true; };
  }, [v, delay]);

  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}>
      {children}
    </Animated.View>
  );
}