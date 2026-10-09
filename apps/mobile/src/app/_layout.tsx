import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ColorValue } from 'react-native';
import { colors } from '../theme/tokens';

const icon = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) =>
    <Ionicons name={name} size={size} color={color as string} />;

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.purple,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="identity" options={{ title: 'Identity', tabBarIcon: icon('finger-print-outline') }} />
      <Tabs.Screen name="access" options={{ title: 'Access', tabBarIcon: icon('key-outline') }} />
      <Tabs.Screen name="ownr" options={{ title: 'OWNR', tabBarIcon: icon('cube-outline') }} />
      <Tabs.Screen name="issue" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="security" options={{ href: null }} />
      <Tabs.Screen name="authorization/[id]" options={{ href: null }} />
      <Tabs.Screen name="create-asset" options={{ href: null }} />
      <Tabs.Screen name="asset/[id]" options={{ href: null }} />
    </Tabs>
  );
}