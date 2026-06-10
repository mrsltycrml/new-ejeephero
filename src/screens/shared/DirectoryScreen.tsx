import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { supabase } from '../../lib/supabase';
import { getOfflineData } from '../../services/offlineManager';
import useConnectivity from '../../hooks/useConnectivity';
import { Ionicons } from '@expo/vector-icons';

export default function DirectoryScreen({ navigation }: any) {
  const [routes, setRoutes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const { isConnected } = useConnectivity();

  useEffect(() => {
    loadData();
  }, [isConnected]);

  const loadData = async () => {
    if (isConnected) {
      const { data } = await supabase.from('routes').select('*');
      if (data) setRoutes(data);
    } else {
      const { routes: offlineRoutes } = await getOfflineData();
      setRoutes(offlineRoutes);
    }
  };

  const filteredRoutes = routes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.description.toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: item.color_code }]}
      onPress={() => navigation.navigate('RouteDetail', { route: item })}
    >
      <View style={styles.cardContent}>
        <Text style={styles.routeName}>{item.name}</Text>
        <Text style={styles.routeDesc} numberOfLines={2}>{item.description}</Text>
        <View style={styles.footer}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.footerText}>{item.operating_hours}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.border} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Maghanap ng ruta..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {!isConnected && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineText}>Nasa Offline Mode (Kasalukuyang naka-cache)</Text>
        </View>
      )}

      <FlatList
        data={filteredRoutes}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 48,
    ...typography.body,
  },
  offlineBadge: {
    backgroundColor: colors.warningLight,
    padding: spacing.xs,
    alignItems: 'center',
  },
  offlineText: {
    ...typography.caption,
    color: colors.text,
  },
  list: {
    padding: spacing.md,
    paddingTop: 0,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  routeName: {
    ...typography.bodyBold,
    color: colors.primary,
    fontSize: 16,
  },
  routeDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginVertical: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: 4,
  }
});
