import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { colors, font } from '../theme/tokens';

type Props = { label: string; value?: string; mono?: boolean; chip?: ReactNode };

export function InfoRow({ label, value, mono, chip }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 12,
      }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {value && (
          <Text
            selectable
            style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, fontFamily: mono ? font.mono : undefined }}>
            {value}
          </Text>
        )}
      </View>
      {chip}
    </View>
  );
}