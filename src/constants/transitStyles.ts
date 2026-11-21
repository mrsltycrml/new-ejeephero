import { StyleSheet } from 'react-native';
import { Colors } from './theme';

export const transitStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.canvas },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 36, gap: 16 },
  panel: { backgroundColor: Colors.paper, borderColor: Colors.border, borderWidth: 1, borderRadius: 12 },
  masthead: { backgroundColor: Colors.ink, borderRadius: 12, padding: 20, gap: 8 },
  heading: { color: Colors.onDark, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  description: { color: Colors.onDarkMuted, fontSize: 15, lineHeight: 21 },
  primaryButton: {
    minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.brandGreen,
  },
  primaryText: { color: Colors.white, fontSize: 16, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  selected: { backgroundColor: Colors.signal },
  selectedText: { color: Colors.ink, fontWeight: '700' },
});
