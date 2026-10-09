import { useRef } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { colors, radius } from '../theme/tokens';

type Props = { label: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' };

export function PrimaryButton({ label, onPress, disabled, variant = 'primary' }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => to(0.97)}
      onPressOut={() => to(1)}>
      <Animated.View
        style={{
          transform: [{ scale }], minHeight: 52, justifyContent: 'center', alignItems: 'center',
          borderRadius: radius.md, opacity: disabled ? 0.4 : 1,
          backgroundColor: primary ? colors.purple : colors.surface,
          borderWidth: primary ? 0 : 1, borderColor: colors.borderStrong,
        }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}