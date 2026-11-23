import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/** Charge direction: electric teal and lime on warm mint paper. */
export const color = {
  ink: '#10241B',
  inkMuted: '#3F5A4C',
  onDark: '#FFFFFF',
  onDarkMuted: '#D7E8DC',
  action: '#0A7A58',
  actionPressed: '#065C42',
  actionTint: '#CFF5DC',
  signal: '#C8FF3B',
  volt: '#C8FF3B',
  voltInk: '#1C3A00',
  mint: '#CFF5DC',
  canvas: '#E8F6EE',
  paper: '#FFFDF6',
  border: '#C5D9CC',
  sand: '#D8F5E4',
  ember: '#C51A2C',
  copper: '#B45309',
  success: '#065C42',
  successBg: '#CFF5DC',
  warning: '#B45309',
  warningBg: '#FDF3E1',
  warningBorder: '#E7C687',
  dangerBg: '#FADBD8',
} as const;

/** Loaded via expo-font / @expo-google-fonts. Fallback weights still apply if a face is missing. */
export const font = {
  display: 'Fraunces_700Bold',
  displayMedium: 'Fraunces_600SemiBold',
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extra: 'PlusJakartaSans_800ExtraBold',
} as const;

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const type = {
  display: { fontFamily: font.display, fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -0.8 } satisfies TextStyle,
  /** Detail-page headings inside cards (route names and similar long titles). */
  headline: { fontFamily: font.display, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 } satisfies TextStyle,
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4 } satisfies TextStyle,
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24, fontWeight: '400' } satisfies TextStyle,
  label: { fontFamily: font.bold, fontSize: 14, lineHeight: 18, fontWeight: '700' } satisfies TextStyle,
  meta: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, fontWeight: '500' } satisfies TextStyle,
  button: { fontFamily: font.extra, fontSize: 16, lineHeight: 20, fontWeight: '800' } satisfies TextStyle,
  kicker: { fontFamily: font.extra, fontSize: 12, lineHeight: 16, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' } satisfies TextStyle,
} as const;

const inkShadow = color.ink;

export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } satisfies ViewStyle,
  card: {
    shadowColor: inkShadow,
    shadowOpacity: Platform.OS === 'web' ? 0.10 : 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  } satisfies ViewStyle,
  sheet: {
    shadowColor: inkShadow,
    shadowOpacity: 0.16,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  } satisfies ViewStyle,
} as const;

/** Minimum tap target for controls used outdoors. */
export const tapTarget = 48;

/** Compact chrome so a map can run closer to the edges of the phone. */
export const chrome = {
  tabBar: 56,
  header: 52,
  search: 52,
} as const;

export { sheetSnap, sheetHeights, nearestSheetSnap, type SheetSnap } from './sheetSnap';

/**
 * Legacy color aliases. Existing screens keep compiling against `Colors`
 * while new work should use the `color` tokens above.
 */
export const Colors = {
  midnight: color.ink,
  action: color.action,
  actionTint: color.actionTint,
  signal: color.signal,
  onDark: color.onDark,
  onDarkMuted: color.onDarkMuted,
  ember: color.ember,
  primaryRed: color.ember,
  white: color.paper,
  offWhite: color.canvas,
  subtleGray: color.inkMuted,
  border: color.border,
  canvas: color.canvas,
  paper: color.paper,
  ink: color.ink,
  sand: color.sand,
  warning: color.warning,
  warningBg: color.warningBg,
  warningBorder: color.warningBorder,
};
