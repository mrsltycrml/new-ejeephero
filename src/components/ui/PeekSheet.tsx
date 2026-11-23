import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { color, elevation, nearestSheetSnap, radius, sheetHeights, type SheetSnap } from '../../constants/theme';

export type { SheetSnap };

type Props = {
  peek: React.ReactNode;
  children?: React.ReactNode;
  peekHeight?: number;
  initialSnap?: SheetSnap;
  wide?: boolean;
  expandAccessibilityLabel: string;
  collapseAccessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  onSnapChange?: (snap: SheetSnap, height: number) => void;
};

/** Bottom sheet with peek, half, and expanded snaps. Only the sheet captures touches. */
export default function PeekSheet({
  peek,
  children,
  peekHeight,
  initialSnap = 'peek',
  wide = false,
  expandAccessibilityLabel,
  collapseAccessibilityLabel,
  style,
  onSnapChange,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const heights = useMemo(() => sheetHeights(windowHeight, peekHeight), [windowHeight, peekHeight]);
  const [snap, setSnap] = useState<SheetSnap>(initialSnap);
  const snapRef = useRef<SheetSnap>(initialSnap);
  const heightsRef = useRef(heights);
  heightsRef.current = heights;
  const animated = useRef(new Animated.Value(heights[initialSnap])).current;

  useEffect(() => {
    Animated.spring(animated, {
      toValue: heights[snapRef.current],
      useNativeDriver: false,
      bounciness: 0,
      speed: 18,
    }).start();
    onSnapChange?.(snapRef.current, heights[snapRef.current]);
  }, [animated, heights]);

  const goTo = (next: SheetSnap) => {
    snapRef.current = next;
    setSnap(next);
    onSnapChange?.(next, heightsRef.current[next]);
    Animated.spring(animated, {
      toValue: heightsRef.current[next],
      useNativeDriver: false,
      bounciness: 0,
      speed: 18,
    }).start();
  };

  const cycle = () => {
    goTo(snapRef.current === 'peek' ? 'half' : snapRef.current === 'half' ? 'expanded' : 'peek');
  };

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 6,
    onPanResponderMove: (_event, gesture) => {
      const base = heightsRef.current[snapRef.current];
      const next = Math.min(heightsRef.current.expanded, Math.max(heightsRef.current.peek, base - gesture.dy));
      animated.setValue(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      const current = heightsRef.current[snapRef.current] - gesture.dy;
      goTo(nearestSheetSnap(current, heightsRef.current, gesture.vy));
    },
  }), [animated]);

  const expanded = snap !== 'peek';
  const handleLabel = snap === 'expanded' ? collapseAccessibilityLabel : expandAccessibilityLabel;

  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.sheet, wide && styles.wide, elevation.sheet, { height: animated }, style]}
    >
      <View {...pan.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={handleLabel}
          accessibilityState={{ expanded }}
          onPress={cycle}
          style={styles.handleHit}
        >
          <View accessibilityElementsHidden style={styles.handle} />
        </Pressable>
      </View>
      <View style={styles.peek}>{peek}</View>
      {expanded ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    backgroundColor: color.paper,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
  },
  wide: {
    left: 'auto',
    right: 16,
    bottom: 16,
    width: 420,
    maxWidth: '42%',
    borderRadius: radius.lg,
  },
  handleHit: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: 28,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.border,
  },
  peek: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingBottom: 28, gap: 16 },
});
