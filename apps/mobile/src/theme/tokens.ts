import { Platform } from 'react-native';

export const colors = {
  bg: '#07070B',
  surface: 'rgba(255,255,255,0.045)',
  surfaceRaised: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#F5F5F7',
  textMuted: '#8E8E9A',
  textFaint: '#5C5C68',
  purple: '#8B7CF6',
  purpleSoft: 'rgba(139,124,246,0.16)',
  cyan: '#4FD1E8',
  cyanSoft: 'rgba(79,209,232,0.14)',
  danger: '#F2555D',
  warn: '#E8B04F',
  ok: '#4FD18B',
};
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { md: 14, lg: 20, xl: 26, pill: 999 };
export const font = {
  mono: (Platform.OS === 'ios' ? 'Menlo' : 'monospace') as string,
};