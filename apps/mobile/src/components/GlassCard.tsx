import { View, ViewProps } from 'react-native';
import { colors, radius, space } from '../theme/tokens';

type Props = ViewProps & { raised?: boolean; accent?: string };

export function GlassCard({ style, raised, accent, children, ...rest }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: raised ? colors.surfaceRaised : colors.surface,
          borderColor: raised ? colors.borderStrong : colors.border,
          borderWidth: 1,
          borderRadius: raised ? radius.xl : radius.lg,
          padding: raised ? space.lg - 4 : space.md,
          gap: space.sm,
          overflow: 'hidden',
        },
        style,
      ]}
      {...rest}>
      {accent && (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent }} />
      )}
      {children}
    </View>
  );
}