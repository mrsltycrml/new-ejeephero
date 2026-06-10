import { Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

export const typography = {
  h1: {
    fontFamily,
    fontSize: 32,
    fontWeight: 'bold' as const,
  },
  h2: {
    fontFamily,
    fontSize: 24,
    fontWeight: 'bold' as const,
  },
  h3: {
    fontFamily,
    fontSize: 20,
    fontWeight: '600' as const,
  },
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontFamily,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  caption: {
    fontFamily,
    fontSize: 12,
    fontWeight: '400' as const,
  },
};
