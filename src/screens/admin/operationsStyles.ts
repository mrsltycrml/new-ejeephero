import { StyleSheet } from 'react-native';
import { Colors } from '../../constants/theme';
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
  segmentBar: { flexDirection: 'row', flexWrap: 'wrap', padding: 4, gap: 4, borderRadius: 10, backgroundColor: Colors.mutedBackground },
  segmentBtn: {
    flexGrow: 1,
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 7,
  },
  segmentBtnActive: transitStyles.selected,
  segmentText: { color: Colors.ink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  segmentTextActive: transitStyles.selectedText,
  emptyState: { padding: 16, color: Colors.subtleGray, fontSize: 14 },
  errorBanner: {
    padding: 12,
    borderRadius: 8,
    color: Colors.primaryRed,
    backgroundColor: Colors.dangerBg,
    fontSize: 14,
  },
});
