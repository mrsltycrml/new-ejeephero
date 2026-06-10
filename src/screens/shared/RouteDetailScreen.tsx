import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import { getOfflineData } from '../../services/offlineManager';
import useConnectivity from '../../hooks/useConnectivity';

export default function RouteDetailScreen({ route: navRoute }: any) {
  const { route } = navRoute.params;
  const [terminals, setTerminals] = useState<any[]>([]);
  const { isConnected } = useConnectivity();

  useEffect(() => {
    fetchTerminals();
  }, []);

  const fetchTerminals = async () => {
    if (isConnected) {
      const { data } = await supabase
        .from('terminals')
        .select('*')
        .eq('route_id', route.id)
        .order('sequence_order', { ascending: true });
      if (data) setTerminals(data);
    } else {
      const { terminals: offlineTerms } = await getOfflineData();
      setTerminals(offlineTerms.filter((t: any) => t.route_id === route.id));
    }
  };

  const renderTerminal = ({ item }: { item: any }) => (
    <View style={styles.terminalItem}>
      <View style={styles.sequenceBadge}>
        <Text style={styles.sequenceText}>{item.sequence_order}</Text>
      </View>
      <Text style={styles.terminalName}>{item.name}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          region={terminals.length > 0 ? {
            latitude: terminals[0].latitude,
            longitude: terminals[0].longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          } : undefined}
        >
          {terminals.map(t => (
            <Marker
              key={t.id}
              coordinate={{ latitude: t.latitude, longitude: t.longitude }}
            >
              <View style={styles.miniMarker} />
            </Marker>
          ))}
        </MapView>
      </View>

      <View style={styles.details}>
        <Text style={styles.routeName}>{route.name}</Text>
        <Text style={styles.routeHours}>Operating Hours: {route.operating_hours}</Text>
        <Text style={styles.routeDesc}>{route.description}</Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Listahan ng mga Terminal</Text>
        <FlatList
          data={terminals}
          renderItem={renderTerminal}
          keyExtractor={item => item.id}
          scrollEnabled={false}
        />
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
    height: 200,
    backgroundColor: colors.surface,
  },
  map: {
    flex: 1,
  },
  miniMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'white',
  },
  details: {
    padding: spacing.lg,
  },
  routeName: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  routeHours: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  routeDesc: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  terminalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  sequenceBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  sequenceText: {
    ...typography.caption,
    color: 'white',
    fontWeight: 'bold',
  },
  terminalName: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  }
});
