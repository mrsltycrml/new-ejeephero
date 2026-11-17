import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  FlatList,
} from 'react-native';
import { BottomSheetModal, ScreenSkeleton } from '../../components/AppUI';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import {
  MAKATI_OFFICIAL_TERMINALS,
  MAKATI_PRIMARY_ROUTE,
  MAKATI_ROUTE_2_COMING_SOON,
  OFFICIAL_TWO_ROUTES,
} from '../../services/offlineTransitService';
import { ESAKAY_OPERATIONS } from '../../constants/esakayOperations';

type Route = {
  id: string;
  name: string;
  description: string;
  color_code: string;
  operating_hours: string;
  base_fare: number;
  per_km_rate: number;
  is_coming_soon?: boolean;
};

type Terminal = {
  id: string;
  route_id: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence_order: number;
  routes?: Route;
};

const normalizeConfiguredRouteFare = (route: Route): Route =>
  route.id === MAKATI_PRIMARY_ROUTE.id
    ? {
        ...route,
        operating_hours: ESAKAY_OPERATIONS.serviceHours,
        base_fare: ESAKAY_OPERATIONS.regularBaseFare,
        per_km_rate: ESAKAY_OPERATIONS.additionalFarePerKm,
      }
    : route;

export default function DirectoryScreen({ navigation }: { navigation?: any; driverMode?: boolean }) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);

  const [fromSelection, setFromSelection] = useState<string>('');
  const [toSelection, setToSelection] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'from' | 'to'>('from');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllStops, setShowAllStops] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: routesData } = await supabase
          .from('routes')
          .select('*')
          .order('is_coming_soon', { ascending: true });
        const { data: terminalsData } = await supabase
          .from('terminals')
          .select('*, routes(*)')
          .order('sequence_order');

        const fallbackRoute: Route = { ...MAKATI_PRIMARY_ROUTE, is_coming_soon: false };
        const fallbackRoutes: Route[] = OFFICIAL_TWO_ROUTES;
        const fallbackTerminals: Terminal[] = MAKATI_OFFICIAL_TERMINALS.map((terminal) => ({
          ...terminal,
          routes: fallbackRoute,
        }));

        const resolvedRoutes: Route[] = routesData?.length
          ? routesData.map(normalizeConfiguredRouteFare)
          : fallbackRoutes;
        setRoutes([
          ...resolvedRoutes.filter(
            (route) =>
              !route.is_coming_soon &&
              route.id !== MAKATI_ROUTE_2_COMING_SOON.id &&
              !/ayala\s*[-–]?\s*circuit/i.test(route.name)
          ),
          MAKATI_ROUTE_2_COMING_SOON,
        ]);

        const resolvedTerminals = terminalsData?.length
          ? terminalsData
              .filter((terminal: Terminal) => terminal.route_id === MAKATI_PRIMARY_ROUTE.id)
              .map((terminal: Terminal) => ({
                ...terminal,
                routes: terminal.routes ? normalizeConfiguredRouteFare(terminal.routes) : fallbackRoute,
              }))
          : fallbackTerminals;

        setTerminals(resolvedTerminals);
        if (resolvedTerminals.length > 0) {
          setFromSelection(resolvedTerminals[0].id);
          setToSelection(resolvedTerminals[resolvedTerminals.length - 1].id);
        }
      } catch {
        const fallbackRoute: Route = { ...MAKATI_PRIMARY_ROUTE, is_coming_soon: false };
        setRoutes(OFFICIAL_TWO_ROUTES);
        const list = MAKATI_OFFICIAL_TERMINALS.map((terminal) => ({ ...terminal, routes: fallbackRoute }));
        setTerminals(list);
        if (list.length > 0) {
          setFromSelection(list[0].id);
          setToSelection(list[list.length - 1].id);
        }
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, []);

  if (loading) {
    return <ScreenSkeleton preset="cards" />;
  }

  const fromStop = terminals.find((t) => t.id === fromSelection) || terminals[0];
  const toStop = terminals.find((t) => t.id === toSelection) || terminals[terminals.length - 1];
  const fromIdx = Math.max(0, terminals.findIndex((t) => t.id === fromStop?.id));
  const toIdx = Math.max(0, terminals.findIndex((t) => t.id === toStop?.id));
  const intermediateCount = Math.max(0, Math.abs(toIdx - fromIdx) - 1);

  const handleOpenPicker = (type: 'from' | 'to') => {
    setModalType(type);
    setSearchQuery('');
    setModalVisible(true);
  };

  const selectItem = (id: string) => {
    if (modalType === 'from') setFromSelection(id);
    else setToSelection(id);
    setModalVisible(false);
  };

  const filteredTerminals = terminals.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* From & To Selectors */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>From</Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.selectorBox}
            onPress={() => handleOpenPicker('from')}
          >
            <Text style={styles.selectorText}>{fromStop?.name || 'MRT Buendia'}</Text>
            <Ionicons name="chevron-down" size={18} color={Colors.subtleGray} />
          </TouchableOpacity>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>To</Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.selectorBox}
            onPress={() => handleOpenPicker('to')}
          >
            <Text style={styles.selectorText}>{toStop?.name || 'Mandaluyong City Hall'}</Text>
            <Ionicons name="chevron-down" size={18} color={Colors.subtleGray} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Route 1 Timeline */}
        <Text style={styles.routeTitle}>Route 1</Text>

        <View style={styles.timelineBlock}>
          {/* Origin Stop */}
          <View style={styles.timelineRow}>
            <View style={styles.timelineAxis}>
              <View style={styles.timelineDotActive} />
              <View style={styles.timelineLine} />
            </View>
            <View style={styles.timelineContent}>
              <View style={styles.stopBadge}>
                <Text style={styles.stopBadgeText}>STOP {String(fromIdx + 1).padStart(2, '0')}</Text>
              </View>
              <Text style={styles.stopNameText}>{fromStop?.name || 'MRT Buendia'}</Text>
            </View>
          </View>

          {/* Intermediate Stops */}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setShowAllStops(!showAllStops)}
            style={styles.timelineRow}
          >
            <View style={styles.timelineAxis}>
              <View style={styles.timelineDotMuted} />
              <View style={styles.timelineLine} />
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.intermediateText}>
                {intermediateCount > 0
                  ? `${intermediateCount} intermediate stop${intermediateCount === 1 ? '' : 's'}`
                  : 'Direct stop sequence'}{' '}
                · {showAllStops ? 'Hide stops' : 'View all stops'}
              </Text>
            </View>
          </TouchableOpacity>

          {showAllStops &&
            terminals.map((st, idx) => (
              <View key={st.id} style={styles.timelineRowCompact}>
                <View style={styles.timelineAxis}>
                  <View style={styles.timelineDotSmall} />
                  {idx < terminals.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <Text style={styles.compactStopText}>
                  {String(idx + 1).padStart(2, '0')} · {st.name}
                </Text>
              </View>
            ))}

          {/* Destination Stop */}
          <View style={styles.timelineRow}>
            <View style={styles.timelineAxis}>
              <View style={styles.timelineDotActive} />
            </View>
            <View style={styles.timelineContent}>
              <View style={styles.stopBadge}>
                <Text style={styles.stopBadgeText}>STOP {String(toIdx + 1).padStart(2, '0')}</Text>
              </View>
              <Text style={styles.stopNameText}>{toStop?.name || 'Mandaluyong City Hall'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoNoteRow}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.subtleGray} />
          <Text style={styles.infoNoteText}>Check the map for active units.</Text>
        </View>

        {routes.some((r) => r.is_coming_soon) && (
          <View style={styles.comingSoonRow}>
            <Text style={styles.comingSoonTitle}>Route 2 · Ayala – Circuit Loop</Text>
            <View style={styles.comingSoonPill}>
              <Text style={styles.comingSoonPillText}>Coming soon</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation?.navigate('PassengerTabs', { screen: 'Map' })}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>View route on map</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Stop Picker Bottom Sheet */}
      <BottomSheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        scrollable={false}
        sheetStyle={{ height: '72%' }}
        contentContainerStyle={{ flex: 1 }}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {modalType === 'from' ? 'Select origin stop' : 'Select destination stop'}
          </Text>
          <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4 }}>
            <Ionicons name="close" size={24} color={Colors.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.modalSearchWrapper}>
          <Ionicons name="search-outline" size={19} color={Colors.subtleGray} />
          <TextInput
            style={styles.modalSearchInput}
            placeholder="Search stops..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={Colors.subtleGray}
          />
        </View>

        <FlatList
          data={filteredTerminals}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => (
            <TouchableOpacity style={styles.modalItem} onPress={() => selectItem(item.id)}>
              <View style={styles.modalNumBox}>
                <Text style={styles.modalNumText}>{String(index + 1).padStart(2, '0')}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalItemName}>{item.name}</Text>
                <Text style={styles.modalItemSub}>Route 1</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
            </TouchableOpacity>
          )}
          showsVerticalScrollIndicator={false}
        />
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 14,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink,
  },
  selectorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  selectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  routeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.ink,
  },
  timelineBlock: {
    paddingLeft: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 62,
  },
  timelineRowCompact: {
    flexDirection: 'row',
    minHeight: 34,
    alignItems: 'center',
  },
  timelineAxis: {
    width: 24,
    alignItems: 'center',
  },
  timelineDotActive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.brandGreen,
    marginTop: 4,
  },
  timelineDotMuted: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.brandGreen,
    backgroundColor: Colors.paper,
    marginTop: 6,
  },
  timelineDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.brandGreen,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.brandGreen,
    marginVertical: 2,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 14,
    gap: 4,
  },
  stopBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.paleGreen,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stopBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brandGreen,
  },
  stopNameText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.ink,
  },
  intermediateText: {
    fontSize: 14,
    color: Colors.subtleGray,
    fontWeight: '600',
    marginTop: 2,
  },
  compactStopText: {
    fontSize: 13,
    color: Colors.ink,
    paddingLeft: 12,
    paddingBottom: 8,
  },
  infoNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  infoNoteText: {
    fontSize: 14,
    color: Colors.subtleGray,
  },
  comingSoonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  comingSoonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
  comingSoonPill: {
    backgroundColor: Colors.canvas,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  comingSoonPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.subtleGray,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: Colors.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.ink,
  },
  modalSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  modalSearchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.ink,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  modalNumBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.paleGreen,
    borderWidth: 1,
    borderColor: Colors.brandGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.brandGreen,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  modalItemSub: {
    fontSize: 12,
    color: Colors.subtleGray,
    marginTop: 2,
  },
});
