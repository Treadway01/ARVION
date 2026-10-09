import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';

export function LockIcon({ unlocked }: { unlocked: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!unlocked) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [unlocked, scale]);

  return (
    <Animated.View
      accessibilityLabel={unlocked ? 'Unlocked (simulation)' : 'Locked (simulation)'}
      style={{ transform: [{ scale }] }}>
      <Ionicons
        name={unlocked ? 'lock-open-outline' : 'lock-closed-outline'}
        size={36}
        color={unlocked ? colors.ok : colors.textMuted}
      />
    </Animated.View>
  );
}