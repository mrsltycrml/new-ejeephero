import React, { ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

export type HapticKind = 'light' | 'medium' | 'success' | 'warning' | 'error';

/**
 * Triggers a light native tactile signal on iOS/Android; no-op on Web/PWA.
 */
export function triggerHaptic(kind: HapticKind = 'light'): void {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'light') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (kind === 'medium') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (kind === 'success') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (kind === 'warning') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  } catch {
    // Ignore haptic hardware/runtime unavailability.
  }
}

export interface FormScrollViewProps extends ScrollViewProps {
  children: ReactNode;
  keyboardVerticalOffset?: number;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Unified keyboard-avoiding ScrollView for forms across iOS, Android, and Web.
 */
export const FormScrollView = React.forwardRef<React.ElementRef<typeof ScrollView>, FormScrollViewProps>(function FormScrollView(
  {
    children,
    keyboardVerticalOffset = Platform.OS === 'ios' ? 64 : 0,
    containerStyle,
    style,
    keyboardShouldPersistTaps = 'handled',
    automaticallyAdjustKeyboardInsets = true,
    ...rest
  },
  ref,
) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, containerStyle]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        ref={ref}
        style={[styles.flex, style]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});

export interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  sheetStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollable?: boolean;
}

/**
 * Slide-up bottom sheet modal with top handle, backdrop dismiss, safe-area inset, and keyboard avoidance.
 */
export function BottomSheetModal({
  visible,
  onClose,
  children,
  maxWidth = 560,
  sheetStyle,
  contentContainerStyle,
  scrollable = true,
}: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(20, insets.bottom + 12);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
          style={styles.backdrop}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.sheetWrap, { maxWidth }]}
        >
          <View style={[styles.sheet, { paddingBottom: bottomPad }, sheetStyle]}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
            {scrollable ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={[styles.sheetContent, contentContainerStyle]}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[styles.sheetContent, contentContainerStyle]}>{children}</View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export interface SkeletonBlockProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Single animated loading block matching the quiet surface design tokens.
 */
export function SkeletonBlock({
  width = '100%',
  height = 16,
  borderRadius = 6,
  style,
}: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.48)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.92, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.48, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

export type ScreenSkeletonPreset = 'dashboard' | 'list' | 'cards';

/**
 * Full-screen skeleton placeholder replacing blocking centered spinners.
 */
export function ScreenSkeleton({ preset = 'list' }: { preset?: ScreenSkeletonPreset }) {
  return (
    <View style={styles.skeletonScreen} accessibilityLabel="Loading content">
      <View style={styles.skeletonContainer}>
        <View style={styles.skeletonHeader}>
          <SkeletonBlock width="42%" height={30} borderRadius={8} />
          <SkeletonBlock width="68%" height={14} />
        </View>

        {preset === 'dashboard' ? (
          <>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <SkeletonBlock width="55%" height={12} />
                <SkeletonBlock width="40%" height={26} />
              </View>
              <View style={styles.kpiCard}>
                <SkeletonBlock width="55%" height={12} />
                <SkeletonBlock width="40%" height={26} />
              </View>
            </View>
            <View style={styles.skeletonCard}>
              <SkeletonBlock width="48%" height={18} />
              <SkeletonBlock width="100%" height={160} borderRadius={8} />
            </View>
            <View style={styles.skeletonCard}>
              <SkeletonBlock width="38%" height={18} />
              <SkeletonBlock width="90%" height={14} />
              <SkeletonBlock width="76%" height={14} />
            </View>
          </>
        ) : null}

        {preset === 'cards' ? (
          <>
            <View style={styles.skeletonCard}>
              <SkeletonBlock width="45%" height={18} />
              <SkeletonBlock width="100%" height={44} borderRadius={8} />
              <SkeletonBlock width="72%" height={14} />
            </View>
            <View style={styles.skeletonCard}>
              <SkeletonBlock width="52%" height={18} />
              <SkeletonBlock width="88%" height={14} />
              <SkeletonBlock width="64%" height={14} />
            </View>
          </>
        ) : null}

        {preset === 'list' ? (
          <View style={styles.skeletonCard}>
            <SkeletonBlock width="100%" height={42} borderRadius={8} />
            {[0, 1, 2, 3].map((idx) => (
              <View key={idx} style={styles.listRow}>
                <SkeletonBlock width={38} height={38} borderRadius={19} />
                <View style={styles.listCopy}>
                  <SkeletonBlock width="52%" height={15} />
                  <SkeletonBlock width="78%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(24, 40, 46, 0.45)',
  },
  sheetWrap: {
    width: '100%',
    maxHeight: '90%',
  },
  sheet: {
    width: '100%',
    backgroundColor: Colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.border,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '100%',
  },
  handleRow: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  sheetContent: {
    gap: 14,
    paddingBottom: 6,
  },
  skeleton: {
    backgroundColor: Colors.sand,
  },
  skeletonScreen: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  skeletonContainer: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    padding: 20,
    gap: 18,
  },
  skeletonHeader: {
    gap: 8,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 10,
  },
  skeletonCard: {
    backgroundColor: Colors.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 12,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
  },
  listCopy: {
    flex: 1,
    gap: 6,
  },
});
