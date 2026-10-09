import { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBackdrop } from './AppBackdrop';
import { colors, space } from '../theme/tokens';

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBackdrop />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md, paddingBottom: space.xl }}>
          <Text
            accessibilityRole="header"
            style={{ color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 }}>
            {title}
          </Text>
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}