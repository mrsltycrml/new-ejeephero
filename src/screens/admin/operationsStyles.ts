import { StyleSheet } from 'react-native';
import { color, radius, tapTarget } from '../../constants/theme';
import { transitStyles } from '../../constants/transitStyles';

export const operationsStyles = StyleSheet.create({
  page: transitStyles.page,
  content: {
    ...transitStyles.content,
    maxWidth: 1024,
  },
  masthead: {
    ...transitStyles.masthead,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mastheadTitle: transitStyles.heading,
  mastheadMeta: transitStyles.description,
  panel: transitStyles.panel,
  toolbar: { gap: 8, padding: 12 },
  segmentBar: { flexDirection: 'row', flexWrap: 'wrap', padding: 4, gap: 4, borderRadius: radius.md, backgroundColor: color.sand },
  segmentBtn: {
    flexGrow: 1,
    minHeight: tapTarget,
    paddingVertical: 6,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  segmentBtnActive: transitStyles.selected,
  segmentText: { color: color.ink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  segmentTextActive: transitStyles.selectedText,
  emptyState: { padding: 16, color: color.inkMuted, fontSize: 14 },
  errorBanner: {
    padding: 12,
    borderRadius: radius.md,
    color: color.ember,
    backgroundColor: color.dangerBg,
    fontSize: 14,
  },
});
