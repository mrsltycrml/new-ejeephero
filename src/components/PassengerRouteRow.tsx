import React from 'react';
import { StyleSheet, View } from 'react-native';
import { color } from '../constants/theme';

export default function PassengerRouteRow({ first, last, children }: {
  first: boolean;
  last: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View aria-hidden style={styles.axis}>
        {!first && <View style={[styles.line, { top: 0, height: 18 }]} />}
        {!last && <View style={[styles.line, { top: 18, bottom: 0 }]} />}
        <View style={[styles.dot, (first || last) && styles.terminus]} />
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  axis: { width: 16, alignItems: 'center' },
  line: { position: 'absolute', width: 3, backgroundColor: color.action },
  dot: { marginTop: 12, height: 12, width: 12, borderRadius: 6, borderWidth: 2, borderColor: color.action, backgroundColor: color.paper },
  terminus: { backgroundColor: color.signal, borderColor: color.ink },
  content: { flex: 1, minWidth: 0, gap: 3, paddingTop: 6, paddingBottom: 12 },
});
