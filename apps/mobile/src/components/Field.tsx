import { useState } from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { colors, radius } from '../theme/tokens';

export function Field(props: TextInputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      accessibilityLabel={props.placeholder}
      placeholderTextColor={colors.textFaint}
      {...props}
      onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
      style={[
        {
          color: colors.text, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1,
          borderColor: focus ? colors.purple : colors.border, borderRadius: radius.md,
          paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
        },
        props.style,
      ]}
    />
  );
}