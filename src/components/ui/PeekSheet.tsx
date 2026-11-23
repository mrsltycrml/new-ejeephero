import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { color, elevation, nearestSheetSnap, radius, type SheetSnap } from '../../constants/theme';
import { fitSheetHeights } from '../../constants/sheetSnap';

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
  /** Space kept clear above the open sheet so floating map controls (search) and the handle never overlap. */
  topClearance?: number;
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
  topClearance = 96,
  onSnapChange,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  // The sheet lives inside the screen (below the header, above the tabs), so size it from that space, not the window.
  const [areaHeight, setAreaHeight] = useState(0);
  const heights = useMemo(() => {
    const area = areaHeight > 0 ? areaHeight : windowHeight;
    return fitSheetHeights(area, peekHeight, topClearance);
  }, [areaHeight, windowHeight, peekHeight, topClearance]);
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

  // A tap on the handle opens the sheet from peek and otherwise returns to the map.
  const cycle = () => {
    goTo(snapRef.current === 'peek' ? 'half' : 'peek');
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
  const handleLabel = snap === 'peek' ? expandAccessibilityLabel : collapseAccessibilityLabel;

  return (
    <>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}
      onLayout={event => { const next = Math.round(event.nativeEvent.layout.height); if (next > 0 && next !== areaHeight) setAreaHeight(next); }} />
    <Animated.View
      pointerEvents="auto"
      style={[styles.sheet, wide && styles.wide, elevation.sheet, { height: animated }, style]}
    >
      {/* The handle and the peek summary both drag the sheet, so it can always be pulled back down to the map. */}
      <View {...pan.panHandlers} style={styles.dragZone}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={handleLabel}
          accessibilityState={{ expanded }}
          onPress={cycle}
          hitSlop={{ top: 8, bottom: 8, left: 24, right: 24 }}
          style={styles.handleHit}
        >
          <View accessibilityElementsHidden style={styles.handle} />
        </Pressable>
        <View style={styles.peek}>{peek}</View>
      </View>
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
    </>
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
  // Web: stop the browser from claiming vertical drags here so the sheet's pan gesture gets them (iOS Safari).
  dragZone: Platform.OS === 'web' ? ({ touchAction: 'none' } as ViewStyle) : {},
  handleHit: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    minHeight: 32,
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
