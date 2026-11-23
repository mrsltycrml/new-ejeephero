import { StyleSheet } from 'react-native';
import { color, radius, space, tapTarget, type } from './theme';

export const transitStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.canvas },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: space.md, paddingBottom: 36, gap: space.md },
  panel: { backgroundColor: color.paper, borderColor: color.border, borderWidth: 1, borderRadius: radius.lg },
  masthead: { backgroundColor: 'transparent', borderRadius: 0, padding: space.lg, gap: space.xs },
  heading: { color: color.ink, ...type.display, fontSize: 36, lineHeight: 42 },
  description: { color: color.inkMuted, fontSize: 15, lineHeight: 22 },
  primaryButton: {
    minHeight: tapTarget, paddingHorizontal: space.md, paddingVertical: 12, borderRadius: radius.pill,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: color.action,
  },
  primaryText: { color: color.onDark, ...type.button, flexShrink: 1, textAlign: 'center' },
  selected: { backgroundColor: color.volt, borderColor: color.volt },
  selectedText: { color: color.voltInk, fontWeight: '800' },
});
