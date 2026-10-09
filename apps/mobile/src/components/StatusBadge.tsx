import { Text, View } from 'react-native';
import { IntegrationStatus } from '../core/status';
import { colors } from '../theme/tokens';

const tone: Record<IntegrationStatus, string> = {
  LIVE: colors.ok, CONNECTED: colors.ok, VERIFIED: colors.ok,
  SIMULATION: colors.warn, CONFIGURATION_REQUIRED: colors.warn,
  NOT_CONNECTED: colors.textMuted, NOT_DEPLOYED: colors.textMuted,
  UNAVAILABLE: colors.danger,
};

export function StatusBadge({ status }: { status: IntegrationStatus }) {
  const c = tone[status];
  return (
    <View accessibilityLabel={`Status: ${status.replace('_', ' ')}`}
      style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: c,
        borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: c, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>
        {status.replace(/_/g, ' ')}
      </Text>
    </View>
  );
}