import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { RouteCard } from '../../components/common/RouteCard';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { getOfflineData } from '../../services/offlineManager';

export default function DirectoryScreen({ navigation }: any) {
  const [routes, setRoutes] = useState<any[]>([]);

  useEffect(() => {
    // We use SQLite offline cache for directory so it works even without signal
    const loadRoutes = async () => {
      const { routes: localRoutes } = await getOfflineData();
      setRoutes(localRoutes);
    };
    loadRoutes();
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={routes}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate('RouteDetail', { routeId: item.id })}>
            <RouteCard 
              name={item.name} 
              description={item.description}
              colorCode={item.color_code}
            />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  list: {
    padding: spacing.md,
  }
});
