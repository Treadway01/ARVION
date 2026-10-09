import { Text, View } from 'react-native';
import { colors, radius } from '../theme/tokens';

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'purple' | 'cyan';

const tones: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.surface },
  ok: { fg: colors.ok, bg: 'rgba(79,209,139,0.12)' },
  warn: { fg: colors.warn, bg: 'rgba(232,176,79,0.12)' },
  danger: { fg: colors.danger, bg: 'rgba(242,85,93,0.12)' },
  purple: { fg: colors.purple, bg: colors.purpleSoft },
  cyan: { fg: colors.cyan, bg: colors.cyanSoft },
};

export function Chip({ label, tone = 'neutral', dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const t = tones[tone];
  return (
    <View
      accessibilityLabel={label}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.bg,
        borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5,
        borderWidth: 1, borderColor: colors.border,
      }}>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.fg }} />}
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '600', letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}