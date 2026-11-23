import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '../AppUI';
import { color, elevation, radius, space, tapTarget, type } from '../../constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
  maxWidth?: number;
  sheetStyle?: StyleProp<ViewStyle>;
};

/** Map-first bottom sheet: navy header, rounded top, 48px close target. */
export default function OverlaySheet({ visible, onClose, title, closeLabel, children, maxWidth, sheetStyle }: Props) {
  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      maxWidth={maxWidth ?? 520}
      sheetStyle={[styles.sheet, elevation.sheet, sheetStyle]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={styles.close}>
            <Ionicons name="close" color={color.onDark} size={24} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 0, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden' },
  content: { gap: 0 },
  header: { backgroundColor: color.ink },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: space.xl,
    paddingRight: 8,
    paddingVertical: 8,
  },
  title: { flex: 1, ...type.title, fontSize: 22, lineHeight: 28, color: color.onDark },
  close: { alignItems: 'center', justifyContent: 'center', width: tapTarget, minHeight: tapTarget },
  body: { paddingHorizontal: space.xl, paddingTop: 22, paddingBottom: space.lg, gap: 22, backgroundColor: color.paper },
});
