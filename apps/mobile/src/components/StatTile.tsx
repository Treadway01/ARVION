import { Text } from 'react-native';
import { GlassCard } from './GlassCard';
import { Skeleton } from './Skeleton';
import { colors, space } from '../theme/tokens';

type Props = { label: string; value: string | number; caption?: string; loading?: boolean };

export function StatTile({ label, value, caption, loading }: Props) {
  return (
    <GlassCard style={{ flex: 1, padding: space.md - 2, gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{label}</Text>
      {loading ? (
        <Skeleton height={30} width="60%" />
      ) : (
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 }}>{value}</Text>
      )}
      {caption && <Text style={{ color: colors.textFaint, fontSize: 11 }}>{caption}</Text>}
    </GlassCard>
  );
}