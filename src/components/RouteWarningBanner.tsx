import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { useRouteWarnings } from '../contexts/RouteWarningsContext';

export default function RouteWarningBanner({ onOpen }: { onOpen: () => void }) {
  const { warnings } = useRouteWarnings();
  const [seenId, setSeenId] = useState<string | null>(null);
  const latest = warnings[0];
  if (!latest || latest.closed_at || latest.id === seenId || Date.now() - Date.parse(latest.created_at) > 90000) return null;
  return (
    <View pointerEvents="box-none" style={styles.placement}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Possible off-route movement · ${latest.unit_label}. View alert.`}
        accessibilityLiveRegion="polite"
        style={styles.banner}
        onPress={() => {
          setSeenId(latest.id);
          onOpen();
        }}
      >
        <View style={styles.marker}>
          <Ionicons name="warning-outline" size={22} color={Colors.midnight} />
        </View>
        <View style={styles.message}>
          <Text style={styles.title}>Possible off-route movement</Text>
          <Text style={styles.unit}>{latest.unit_label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.action} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  placement: { position: 'absolute', bottom: 80, left: 12, right: 12, alignItems: 'center', zIndex: 20 },
  banner: {
    width: '100%', maxWidth: 480, minHeight: 60, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: Colors.warningBorder, backgroundColor: Colors.paper, elevation: 5,
  },
  marker: { alignSelf: 'stretch', width: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.signal },
  message: { flex: 1, paddingVertical: 10, gap: 3 },
  title: { color: Colors.ink, fontWeight: '700', fontSize: 15 },
  unit: { color: Colors.subtleGray, fontSize: 13 },
});
