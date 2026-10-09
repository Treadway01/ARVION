import { Text } from 'react-native';
import { GlassCard } from './GlassCard';
import { StatusBadge } from './StatusBadge';
import { IntegrationStatus } from '../core/status';
import { colors } from '../theme/tokens';

type Props = { title: string; body: string; status?: IntegrationStatus };

export function EmptyState({ title, body, status = 'NOT_CONNECTED' }: Props) {
  return (
    <GlassCard>
      <StatusBadge status={status} />
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{title}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>{body}</Text>
    </GlassCard>
  );
}