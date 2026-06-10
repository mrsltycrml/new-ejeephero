import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { getOfflineData } from '../../services/offlineManager';

export default function RouteDetailScreen({ route }: any) {
  const { routeId } = route.params;
  const [routeInfo, setRouteInfo] = useState<any>(null);
  const [terminals, setTerminals] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const data = await getOfflineData();
      const r = data.routes.find((r: any) => r.id === routeId);
      const t = data.terminals.filter((t: any) => t.route_id === routeId);
      setRouteInfo(r);
      setTerminals(t);
    };
    loadData();
  }, [routeId]);

  if (!routeInfo) return <View style={styles.container} />;

  const coordinates = terminals.map(t => ({ latitude: t.latitude, longitude: t.longitude }));

  return (
    <ScrollView style={styles.container}>
      {terminals.length > 0 && (
        <View style={styles.mapContainer}>
          <MapView 
            style={styles.map} 
            scrollEnabled={false} 
            zoomEnabled={false}
            initialRegion={{
              latitude: terminals[0].latitude,
              longitude: terminals[0].longitude,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
          >
            <Polyline
              coordinates={coordinates}
              strokeColor={routeInfo.color_code || colors.primary}
              strokeWidth={4}
            />
            {terminals.map(t => (
              <Marker
                key={`term-${t.id}`}
                coordinate={{ latitude: t.latitude, longitude: t.longitude }}
              >
                <View style={[styles.marker, { backgroundColor: routeInfo.color_code || colors.primary }]} />
              </Marker>
            ))}
          </MapView>
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.title}>{routeInfo.name}</Text>
        <Text style={styles.hours}>🕒 {routeInfo.operating_hours}</Text>
        <Text style={styles.description}>{routeInfo.description}</Text>

        <Text style={styles.sectionTitle}>Terminals / Stops</Text>
        <View style={styles.timeline}>
          {terminals.map((t, index) => (
            <View key={t.id} style={styles.terminalRow}>
              <View style={styles.timelineIndicator}>
                <View style={[styles.timelineDot, { backgroundColor: routeInfo.color_code }]} />
                {index < terminals.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <Text style={styles.terminalName}>{t.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  mapContainer: {
    height: 250,
    width: '100%',
  },
  map: {
    flex: 1,
  },
  marker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'white',
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  hours: {
    ...typography.bodyBold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  timeline: {
    marginLeft: spacing.sm,
  },
  terminalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  timelineIndicator: {
    alignItems: 'center',
    width: 20,
    marginRight: spacing.sm,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    zIndex: 1,
  },
  timelineLine: {
    width: 2,
    height: 40,
    backgroundColor: colors.border,
    position: 'absolute',
    top: 12,
  },
  terminalName: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: -2,
  }
});
