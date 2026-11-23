import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/** Core brand and UI color tokens. Prefer these in new UI. */
export const color = {
  ink: '#13263F',
  inkMuted: '#3E4C5C',
  onDark: '#FFFFFF',
  onDarkMuted: '#D5DFEC',
  action: '#164BB6',
  actionPressed: '#103A8C',
  actionTint: '#E9F0FF',
  signal: '#FFD454',
  canvas: '#F5F4EF',
  paper: '#FFFFFF',
  border: '#C5CED8',
  sand: '#EFF2F5',
  ember: '#B42318',
  copper: '#B45309',
  success: '#087A55',
  successBg: '#E7F3EB',
  warning: '#B45309',
  warningBg: '#FDF3E1',
  warningBorder: '#E7C687',
  dangerBg: '#FADBD8',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 } satisfies TextStyle,
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3 } satisfies TextStyle,
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' } satisfies TextStyle,
  label: { fontSize: 14, lineHeight: 18, fontWeight: '700' } satisfies TextStyle,
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '500' } satisfies TextStyle,
  button: { fontSize: 16, lineHeight: 20, fontWeight: '700' } satisfies TextStyle,
} as const;

export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } satisfies ViewStyle,
  card: {
    shadowColor: color.ink,
    shadowOpacity: Platform.OS === 'web' ? 0.08 : 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  } satisfies ViewStyle,
  sheet: {
    shadowColor: color.ink,
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  } satisfies ViewStyle,
} as const;

/** Minimum tap target for controls used outdoors. */
export const tapTarget = 48;

/** Compact chrome so a map can run closer to the edges of the phone. */
export const chrome = {
  tabBar: 48,
  header: 48,
  search: 56,
} as const;

export { sheetSnap, sheetHeights, nearestSheetSnap, type SheetSnap } from './sheetSnap';

/**
 * Legacy color aliases. Existing screens keep compiling against `Colors`
 * while new work should use the `color` tokens above. Values stay in the
 * same family so unmigrated screens do not shift unexpectedly.
 */
export const Colors = {
  midnight: color.ink,
  action: color.action,
  actionTint: color.actionTint,
  signal: color.signal,
  onDark: color.onDark,
  onDarkMuted: color.onDarkMuted,
  primaryRed: color.ember,
  white: color.paper,
  offWhite: color.canvas,
  subtleGray: '#526174',
  border: color.border,
  canvas: color.canvas,
  paper: color.paper,
  ink: color.ink,
  sand: color.sand,
  warning: color.warning,
  warningBg: color.warningBg,
  warningBorder: color.warningBorder,
};
