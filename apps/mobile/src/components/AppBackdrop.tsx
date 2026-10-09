import { View } from 'react-native';
import { colors } from '../theme/tokens';

type GlowProps = {
  size: number; color: string; alpha: number;
  top?: number; left?: number; right?: number; bottom?: number;
};

// Stacked translucent circles approximate a soft glow without a blur library.
function Glow({ size, color, alpha, top, left, right, bottom }: GlowProps) {
  const layers = 8;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', width: size, height: size, top, left, right, bottom,
        alignItems: 'center', justifyContent: 'center',
      }}>
      {Array.from({ length: layers }, (_, i) => {
        const s = size * (1 - i / layers);
        return (
          <View
            key={i}
            style={{
              position: 'absolute', width: s, height: s, borderRadius: s / 2,
              backgroundColor: color, opacity: alpha / layers,
            }}
          />
        );
      })}
    </View>
  );
}

export function AppBackdrop() {
  return (
    <>
      <Glow size={460} color={colors.purple} alpha={0.28} top={-220} right={-170} />
      <Glow size={380} color={colors.cyan} alpha={0.14} bottom={-170} left={-190} />
    </>
  );
}