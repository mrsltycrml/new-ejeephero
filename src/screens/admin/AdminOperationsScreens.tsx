import { mergeAdminUnits, type UnifiedUnitRow } from '../../utils/adminUnitRows';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BottomSheetModal, ScreenSkeleton, triggerHaptic } from '../../components/AppUI';
import { operationsStyles as ops } from './operationsStyles';
import AdminRegistryManager from '../../components/AdminRegistryManager';
import { Colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  loadRegistry,
  saveRegistryRecord,
  setRegistryDeleted,
  type ManagedUnit,
  type RegistryMode,
} from '../../services/fleetRegistryService';
import {
  currentReportingPeriod,
  formatReportingPeriod,
  periodContains,
  type ReportingPeriod,
} from '../../utils/reportingPeriod';
import {
  downloadAdminPeriodReport,
  openAdminPeriodReport,
  type PreparedAdminReport,
} from '../../services/adminReportService';
import {
  forceEndShift,
  loadAdminOperations,
  setDriverHidden,
  summarizeDrivers,
  summarizeUnits,
  type OperationsData,
} from '../../services/adminOperationsService';

const emptyData: OperationsData = {
  shifts: [],
  drivers: [],
  routes: [],
  speedEvents: null,
  tripViolations: null,
};
let operationsChannelSequence = 0;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'DR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function useOperationsData() {
  const [data, setData] = useState<OperationsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await loadAdminOperations());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load operations data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => {
        void load();
      }, 30_000);
      const channel = supabase
        .channel(`admin-operations-live-${++operationsChannelSequence}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicles' }, () => {
          void load();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'speed_events' }, () => {
          void load();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_violations' }, () => {
          void load();
        })
        .subscribe();
      return () => {
        clearInterval(timer);
        void supabase.removeChannel(channel);
      };
    }, [load])
  );

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  return { data, loading, refreshing, error, refresh };
}

type UnifiedDriverRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  unitCode?: string;
  routeName?: string;
  onShift?: boolean;
  registeredLabel?: string;
  activeVehicleId?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. DRIVERS TAB (Board 03 left & middle, Board 08 left)
// ─────────────────────────────────────────────────────────────────────────────
export function AdminDriversScreen() {
  const { data, loading, refreshing, error, refresh } = useOperationsData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending' | 'hidden'>('all');
  const [reviewingDriver, setReviewingDriver] = useState<UnifiedDriverRow | null>(null);
  const [editingDriver, setEditingDriver] = useState<UnifiedDriverRow | null>(null);
  const [addingDriverOpen, setAddingDriverOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const dbDrivers = useMemo(
    () => summarizeDrivers(data.drivers, data.shifts),
    [data.drivers, data.shifts]
  );

  const combinedDrivers: UnifiedDriverRow[] = useMemo(() => {
    const dbRows: UnifiedDriverRow[] = dbDrivers.map((d) => {
      const shift = d.activeShift || d.latestShift;
      const st = d.profile.supervisor_hidden ? 'hidden' : d.profile.status || 'Unavailable';
      return {
        id: d.profile.id,
        name: d.profile.full_name || d.profile.email || 'Driver',
        email: d.profile.email || 'Email unavailable',
        status: st,
        unitCode: shift?.body_number || undefined,
        routeName: data.routes.find(route => route.id === shift?.route_id)?.name || 'Route unavailable',
        onShift: Boolean(d.activeShift),
        activeVehicleId: d.activeShift?.id,
        registeredLabel: 'Registration date unavailable',
      };
    });
    return dbRows;
  }, [dbDrivers, data.routes]);

  const filteredDrivers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combinedDrivers.filter((d) => {
      if (filter !== 'all' && d.status !== filter) return false;
      return `${d.name} ${d.email} ${d.unitCode || ''}`.toLowerCase().includes(q);
    });
  }, [combinedDrivers, filter, query]);

  const handleApproveReject = async (driver: UnifiedDriverRow, nextStatus: 'approved' | 'rejected') => {
    setSaving(true);
    try {
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ status: nextStatus })
          .eq('id', driver.id);
        if (updateErr) throw new Error(updateErr.message);
        refresh();
      triggerHaptic(nextStatus === 'approved' ? 'success' : 'medium');
      setReviewingDriver(null);
    } catch (e: any) {
      Alert.alert('Could not update driver', e.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDriverEdit = async () => {
    if (!editingDriver) return;
    setSaving(true);
    try {
        const { error: err } = await supabase
          .from('profiles')
          .update({ full_name: editName.trim() })
          .eq('id', editingDriver.id);
        if (err) throw new Error(err.message);
        refresh();
      triggerHaptic('success');
      setEditingDriver(null);
    } catch (e: any) {
      Alert.alert('Could not save driver', e.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleHideRestore = async (driver: UnifiedDriverRow, hide: boolean) => {
    try {
        await setDriverHidden(driver.id, hide);
        refresh();
      triggerHaptic('medium');
      setEditingDriver(null);
    } catch (e: any) {
      Alert.alert('Could not update driver', e.message || 'Try again.');
    }
  };

  if (loading) return <ScreenSkeleton preset="list" />;

  return (
    <>
      <ScrollView
        style={ops.page}
        contentContainerStyle={ops.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={ops.masthead}>
          <Text accessibilityRole="header" style={ops.mastheadTitle}>Drivers</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setEditName('');
              setEditEmail('');
              setAddingDriverOpen(true);
            }}
            style={styles.topAddBtn}
          >
            <Ionicons name="people-outline" size={18} color={Colors.onDark} />
            <Text style={styles.topAddText}>Driver roster</Text>
          </TouchableOpacity>
        </View>

        <View style={ops.panel}>
          <View style={ops.toolbar}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color={Colors.subtleGray} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                accessibilityLabel="Search drivers"
                placeholder="Search drivers"
                placeholderTextColor={Colors.subtleGray}
                style={styles.searchInput}
              />
            </View>

            <View style={ops.segmentBar}>
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'approved', label: 'Approved' },
                  { key: 'pending', label: 'Pending' },
                  { key: 'hidden', label: 'Hidden' },
                ] as const
              ).map((tab) => {
                const active = filter === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setFilter(tab.key)}
                    style={[ops.segmentBtn, active && ops.segmentBtnActive]}
                  >
                    <Text style={[ops.segmentText, active && ops.segmentTextActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {!!error && <Text accessibilityRole="alert" style={ops.errorBanner}>{error}</Text>}

          {!error && !filteredDrivers.length && <Text style={ops.emptyState}>{query || filter !== 'all' ? 'No drivers match these filters.' : 'No driver accounts.'}</Text>}
          {filteredDrivers.map((d) => (
            <View key={d.id} style={styles.listRow}>
              <TouchableOpacity
                style={styles.recordButton}
                accessibilityRole="button"
                onPress={() => {
                  if (d.status === 'pending') {
                    setReviewingDriver(d);
                  } else {
                    setEditName(d.name);
                    setEditEmail(d.email);
                    setEditingDriver(d);
                  }
                }}
              >
                <View style={styles.initialsCircle}>
                  <Text style={styles.initialsText}>{initialsOf(d.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{d.name}</Text>
                  <Text style={styles.rowSub}>{d.email}</Text>
                  {d.status === 'approved' && (
                    <Text style={styles.rowSub}>
                      Approved · {d.onShift ? 'On shift' : 'Off duty'}{d.unitCode ? ` · ${d.unitCode}` : ''}
                    </Text>
                  )}
                  {d.status === 'pending' && (
                    <View style={[styles.statusBadge, styles.badgeAmber, { alignSelf: 'flex-start', marginTop: 4 }]}>
                      <Text style={[styles.statusBadgeText, styles.badgeAmberText]}>Pending approval</Text>
                    </View>
                  )}
                  {d.status === 'hidden' && <Text style={styles.rowSub}>Hidden · inactive</Text>}
                  {!['approved', 'pending', 'hidden'].includes(d.status) && <Text style={styles.rowSub}>{d.status}</Text>}
                </View>

                {d.status === 'pending' ? (
                  <View style={styles.reviewBtn}><Text style={styles.reviewText}>Review</Text></View>
                ) : d.status !== 'hidden' && (
                  <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
                )}
              </TouchableOpacity>
              {d.status === 'hidden' && (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => {
                    void handleHideRestore(d, false);
                  }}
                  style={styles.restoreOutlineBtn}
                >
                  <Text style={styles.restoreOutlineText}>Restore</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* BOARD 03 MIDDLE: DRIVER APPROVAL SHEET */}
      <BottomSheetModal
        visible={Boolean(reviewingDriver)}
        onClose={() => setReviewingDriver(null)}
        maxWidth={480}
        contentContainerStyle={{ gap: 16 }}
      >
        {reviewingDriver && (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setReviewingDriver(null)}
              style={styles.backNavRow}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.ink} />
              <Text style={styles.sheetHeaderLabel}>Drivers</Text>
            </TouchableOpacity>

            <View style={styles.topActionRow}>
              <Text style={styles.title}>Driver approval</Text>
              <View style={[styles.statusBadge, styles.badgeAmber]}>
                <Text style={[styles.statusBadgeText, styles.badgeAmberText]}>Pending approval</Text>
              </View>
            </View>

            <View style={{ alignItems: 'center', gap: 6, paddingVertical: 6 }}>
              <View style={[styles.initialsCircle, { width: 56, height: 56, borderRadius: 28 }]}>
                <Text style={[styles.initialsText, { fontSize: 18 }]}>
                  {initialsOf(reviewingDriver.name)}
                </Text>
              </View>
              <Text style={[styles.rowTitle, { fontSize: 20 }]}>{reviewingDriver.name}</Text>
            </View>

            <View style={styles.kvGroup}>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Email</Text>
                <Text style={styles.kvValue}>{reviewingDriver.email}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Role</Text>
                <Text style={styles.kvValue}>Driver</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Registered</Text>
                <Text style={styles.kvValue}>{reviewingDriver.registeredLabel || 'Unavailable'}</Text>
              </View>
            </View>

            <Text style={styles.smallHelper}>
              Approving lets this driver sign in and start shifts.
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              disabled={saving}
              onPress={() => {
                void handleApproveReject(reviewingDriver, 'approved');
              }}
              style={styles.primaryBtn}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Approve driver</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              disabled={saving}
              onPress={() => {
                void handleApproveReject(reviewingDriver, 'rejected');
              }}
              style={styles.outlineRedBtn}
            >
              <Text style={styles.outlineRedText}>Reject registration</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheetModal>

      {/* BOARD 08 LEFT: EDIT DRIVER SHEET */}
      <BottomSheetModal
        visible={Boolean(editingDriver)}
        onClose={() => setEditingDriver(null)}
        maxWidth={480}
        contentContainerStyle={{ gap: 14 }}
      >
        {editingDriver && (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setEditingDriver(null)}
              style={styles.backNavRow}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.ink} />
              <Text style={styles.sheetHeaderLabel}>Drivers</Text>
            </TouchableOpacity>

            <View style={styles.topActionRow}>
              <Text style={styles.title}>Edit driver</Text>
              <View style={[styles.statusBadge, editingDriver.status === 'approved' ? styles.badgeGreen : styles.badgeGray]}>
                <Text style={[styles.statusBadgeText, editingDriver.status === 'approved' ? styles.badgeGreenText : styles.badgeGrayText]}>{editingDriver.status}</Text>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput
                accessibilityLabel="Full name"
                value={editName}
                onChangeText={setEditName}
                style={styles.textInput}
                placeholder="Full name"
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                accessibilityLabel="Email"
                value={editEmail}
                editable={false}
                style={styles.textInput}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.kvGroup}>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Route assignment</Text>
                <Text style={styles.kvValue}>
                  {editingDriver.unitCode
                    ? `${editingDriver.unitCode} · ${editingDriver.routeName || 'Route unavailable'}`
                    : 'Not assigned'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              disabled={saving}
              onPress={() => {
                void handleSaveDriverEdit();
              }}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Save changes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              disabled={Boolean(editingDriver.onShift)}
              onPress={() => {
                void handleHideRestore(editingDriver, true);
              }}
              style={[styles.outlineRedBtn, editingDriver.onShift && styles.disabledOutlineBtn]}
            >
              <Text style={[styles.outlineRedText, editingDriver.onShift && { color: Colors.subtleGray }]}>
                Hide driver
              </Text>
            </TouchableOpacity>
            {editingDriver.onShift && (
              <Text style={styles.smallHelper}>
                End this driver's active shifts before hiding their profile.
              </Text>
            )}
          </>
        )}
      </BottomSheetModal>

      {/* ADD DRIVER SHEET */}
      <BottomSheetModal
        visible={addingDriverOpen}
        onClose={() => setAddingDriverOpen(false)}
        maxWidth={480}
        contentContainerStyle={{ gap: 14 }}
      >
        <Text style={styles.title}>Driver roster</Text>
        <AdminRegistryManager kind="drivers" />
      </BottomSheetModal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. UNITS TAB (Board 03 right, Board 04 left, Board 08 right)
// ─────────────────────────────────────────────────────────────────────────────
export function AdminUnitsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh } = useOperationsData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'on_shift' | 'inactive'>('all');
  const [selectedUnitKey, setSelectedUnitKey] = useState<string>('');
  const [forceEndModalUnit, setForceEndModalUnit] = useState<UnifiedUnitRow | null>(null);
  const [editModalUnit, setEditModalUnit] = useState<UnifiedUnitRow | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [formBody, setFormBody] = useState('');
  const [formPlate, setFormPlate] = useState('');
  const [formCapacity, setFormCapacity] = useState('');
  const [saving, setSaving] = useState(false);
  const [registryMode, setRegistryMode] = useState<RegistryMode>('database');
  const [registryError, setRegistryError] = useState('');
  const [registryUnits, setRegistryUnits] = useState<ManagedUnit[]>([]);

  useEffect(() => {
    const adminId = user?.id || 'admin-preview';
    void loadRegistry('units', adminId).then((res) => {
      setRegistryMode(res.mode);
      setRegistryUnits(res.rows);
      setRegistryError('');
    }).catch(() => setRegistryError('Fleet registry unavailable.'));
  }, [user?.id]);

  const dbUnits = useMemo(() => summarizeUnits(data.shifts), [data.shifts]);
  const driversMap = useMemo(
    () => new Map(data.drivers.map((p) => [p.id, p.full_name || p.email || 'Driver'])),
    [data.drivers]
  );

  const combinedUnits = useMemo(
    () => mergeAdminUnits(dbUnits, driversMap, data.routes, registryUnits),
    [dbUnits, driversMap, data.routes, registryUnits]
  );

  const filteredUnits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combinedUnits.filter((u) => {
      if (filter === 'on_shift' && u.state === 'inactive') return false;
      if (filter === 'inactive' && !u.registryDeletedAt) return false;
      return `${u.body} ${u.plate} ${u.driverName}`.toLowerCase().includes(q);
    });
  }, [combinedUnits, filter, query]);

  const selectedUnit =
    combinedUnits.find((u) => u.key === selectedUnitKey) || filteredUnits[0] || combinedUnits[0];

  const handleConfirmForceEnd = async () => {
    if (!forceEndModalUnit) return;
    setSaving(true);
    try {
      if (forceEndModalUnit.activeShiftId) {
        await forceEndShift(forceEndModalUnit.activeShiftId);
        refresh();
      } else {
        throw new Error('No active shift is available to end.');
      }
      triggerHaptic('medium');
      setForceEndModalUnit(null);
    } catch (e: any) {
      Alert.alert('Could not force-end shift', e.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUnitForm = async (isNew: boolean) => {
    if (!formBody.trim()) return;
    setSaving(true);
    try {
      const adminId = user?.id || 'admin-preview';
      if (!isNew && !editModalUnit?.registryId) throw new Error('This shift has no editable registry entry.');
      const registry = registryUnits.find(unit => unit.id === editModalUnit?.registryId);
      if (!isNew && !registry) throw new Error('This registry entry is no longer available.');
      await saveRegistryRecord(
        'units',
        adminId,
        registryMode,
        {
          body_number: formBody.trim(),
          plate_number: formPlate.trim() || null,
          route_name: registry?.route_name || '',
          assigned_driver: registry?.assigned_driver ?? null,
          notes: formCapacity.trim() ? `${formCapacity} seats` : registry?.notes ?? null,
        },
        isNew ? undefined : editModalUnit?.registryId
      );
      const updated = await loadRegistry('units', adminId);
      setRegistryUnits(updated.rows);
      triggerHaptic('success');
      setEditModalUnit(null);
      setAddModalOpen(false);
    } catch (e: any) {
      Alert.alert('Could not save unit', e.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleUnitInactive = async (unit: UnifiedUnitRow, makeInactive: boolean) => {
    try {
      if (unit.registryId) {
        const adminId = user?.id || 'admin-preview';
        await setRegistryDeleted('units', adminId, registryMode, unit.registryId, makeInactive);
        const updated = await loadRegistry('units', adminId);
        setRegistryUnits(updated.rows);
      } else {
        throw new Error('This shift has no editable registry entry.');
      }
      triggerHaptic('medium');
      setEditModalUnit(null);
    } catch (e: any) {
      Alert.alert('Could not update unit', e.message || 'Try again.');
    }
  };

  if (loading) return <ScreenSkeleton preset="list" />;

  return (
    <View style={ops.page}>
      <ScrollView
        style={ops.page}
        contentContainerStyle={ops.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={ops.masthead}>
          <Text accessibilityRole="header" style={ops.mastheadTitle}>Units</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setFormBody('');
              setFormPlate('');
              setFormCapacity('');
              setAddModalOpen(true);
            }}
            style={styles.topAddBtn}
          >
            <Ionicons name="add" size={18} color={Colors.onDark} />
            <Text style={styles.topAddText}>Add unit</Text>
          </TouchableOpacity>
        </View>

        <View style={ops.panel}>
          <View style={ops.toolbar}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color={Colors.subtleGray} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                accessibilityLabel="Search units"
                placeholder="Search body, plate or driver"
                placeholderTextColor={Colors.subtleGray}
                style={styles.searchInput}
              />
            </View>

            <View style={ops.segmentBar}>
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'on_shift', label: 'On shift' },
                  { key: 'inactive', label: 'Inactive' },
                ] as const
              ).map((tab) => {
                const active = filter === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setFilter(tab.key)}
                    style={[ops.segmentBtn, active && ops.segmentBtnActive]}
                  >
                    <Text style={[ops.segmentText, active && ops.segmentTextActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {!!error && <Text accessibilityRole="alert" style={ops.errorBanner}>{error}</Text>}
          {!!registryError && <Text accessibilityRole="alert" style={ops.errorBanner}>{registryError}</Text>}

          {!error && !registryError && !filteredUnits.length && <Text style={ops.emptyState}>{query || filter !== 'all' ? 'No units match these filters.' : 'No fleet units.'}</Text>}
          {filteredUnits.map((u) => {
            const isSelected = selectedUnit?.key === u.key;
            return (
              <View key={u.key} style={[styles.listRow, isSelected && styles.selectedUnit]}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelectedUnitKey(u.key)}
                  style={styles.recordButton}
                >
                  <View
                    style={[
                      styles.initialsCircle,
                      u.state === 'stale' && { backgroundColor: Colors.warningBg },
                      u.state === 'inactive' && { backgroundColor: Colors.canvas },
                    ]}
                  >
                    <Ionicons
                      name="bus-outline"
                      size={20}
                      color={
                        u.state === 'stale'
                          ? Colors.warning
                          : u.state === 'inactive'
                            ? Colors.subtleGray
                            : Colors.brandGreen
                      }
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.recordHeading}>
                      <Text style={styles.rowTitle}>{u.body || 'Body unavailable'}</Text>
                      {u.state === 'on_shift' && (
                        <View style={[styles.statusBadge, styles.badgeGreen]}>
                          <Text style={[styles.statusBadgeText, styles.badgeGreenText]}>On shift</Text>
                        </View>
                      )}
                      {u.state === 'stale' && (
                        <View style={[styles.statusBadge, styles.badgeAmber]}>
                          <Text style={[styles.statusBadgeText, styles.badgeAmberText]}>
                            GPS stale · shift active
                          </Text>
                        </View>
                      )}
                      {u.state === 'inactive' && (
                        <View style={[styles.statusBadge, styles.badgeGray]}>
                          <Text style={[styles.statusBadgeText, styles.badgeGrayText]}>Off shift</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowSub}>
                      Plate {u.plate || 'unavailable'}
                      {u.state !== 'inactive' ? ` · ${u.driverName}` : ' · Historical records kept'}
                    </Text>
                    {!!u.registryDeletedAt && <Text style={styles.rowSub}>Inactive in registry · historical records kept</Text>}
                  </View>

                  <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={isSelected ? Colors.action : Colors.subtleGray} />
                </TouchableOpacity>
                {!!u.registryDeletedAt && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => {
                      void handleToggleUnitInactive(u, false);
                    }}
                    style={styles.restoreOutlineBtn}
                  >
                    <Text style={styles.restoreOutlineText}>Restore</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* BOTTOM SELECTED UNIT ACTION DOCK (Board 03 right) */}
      {selectedUnit && (
        <View style={styles.bottomActionDock}>
          <View style={styles.dockHeading}>
            <Ionicons name="bus-outline" size={18} color={Colors.ink} />
            <Text style={styles.dockSelectedLabel}>Selected unit · {selectedUnit.body}</Text>
          </View>
          <View style={styles.dockActions}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate('Fleet', {
                  trackUnitKey: selectedUnit.key,
                  trackUnitLabel: selectedUnit.body,
                  trackRequestId: Date.now(),
                })
              }
              style={[styles.primaryBtn, styles.dockButton]}
            >
              <Text style={styles.primaryBtnText}>Track on map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              disabled={!selectedUnit.registryId}
              onPress={() => {
                setFormBody(selectedUnit.body);
                setFormPlate(selectedUnit.plate ?? '');
                setFormCapacity('');
                setEditModalUnit(selectedUnit);
              }}
              style={[styles.outlineBtn, styles.dockButton, !selectedUnit.registryId && styles.disabledOutlineBtn]}
            >
              <Text style={[styles.outlineText, !selectedUnit.registryId && { color: Colors.subtleGray }]}>Edit unit</Text>
            </TouchableOpacity>
            {!!selectedUnit.activeShiftId && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setForceEndModalUnit(selectedUnit)}
                style={[styles.outlineRedBtn, styles.dockButton]}
              >
                <Text style={styles.outlineRedText}>Force-end shift</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* BOARD 04 LEFT: END STUCK SHIFT CONFIRMATION SHEET */}
      <BottomSheetModal
        visible={Boolean(forceEndModalUnit)}
        onClose={() => setForceEndModalUnit(null)}
        maxWidth={480}
        contentContainerStyle={{ gap: 14 }}
      >
        {forceEndModalUnit && (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setForceEndModalUnit(null)}
              style={styles.backNavRow}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.ink} />
              <Text style={styles.sheetHeaderLabel}>Units</Text>
            </TouchableOpacity>

            <Text style={styles.title}>End stuck shift</Text>

            <View style={{ alignItems: 'center', gap: 6, paddingVertical: 4 }}>
              <View style={[styles.initialsCircle, { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.warningBg }]}>
                <Ionicons name="warning-outline" size={28} color={Colors.warning} />
              </View>
              <Text style={[styles.rowTitle, { fontSize: 20 }]}>Force-end this shift?</Text>
              <Text style={[styles.rowSub, { textAlign: 'center' }]}>
                Use this when a unit remains active after a driver loses connection or forgets to end their shift.
              </Text>
            </View>

            <View style={styles.kvGroup}>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Unit</Text>
                <Text style={styles.kvValue}>
                  {forceEndModalUnit.body || 'Body unavailable'} · {forceEndModalUnit.plate || 'Plate unavailable'}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Driver</Text>
                <Text style={styles.kvValue}>{forceEndModalUnit.driverName}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Route</Text>
                <Text style={styles.kvValue}>{forceEndModalUnit.routeName}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Shift started</Text>
                <Text style={styles.kvValue}>{forceEndModalUnit.shiftStarted || 'Unavailable'}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Last GPS update</Text>
                <Text style={[styles.kvValue, { color: Colors.warning }]}>
                  {forceEndModalUnit.lastGps || 'Unavailable'}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Current speed</Text>
                <Text style={styles.kvValue}>—</Text>
              </View>
            </View>

            <View style={styles.staleBanner}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.warning} />
              <Text style={styles.staleBannerText}>
                Ending this shift removes the unit from live passenger and fleet maps.
              </Text>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setForceEndModalUnit(null)}
              style={styles.outlineDarkBtn}
            >
              <Text style={styles.outlineDarkText}>Keep shift active</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              disabled={saving}
              onPress={() => {
                void handleConfirmForceEnd();
              }}
              style={styles.solidRedBtn}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Force-end shift</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </BottomSheetModal>

      {/* BOARD 08 RIGHT: EDIT / ADD UNIT SHEET */}
      <BottomSheetModal
        visible={Boolean(editModalUnit) || addModalOpen}
        onClose={() => {
          setEditModalUnit(null);
          setAddModalOpen(false);
        }}
        maxWidth={480}
        contentContainerStyle={{ gap: 14 }}
      >
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            setEditModalUnit(null);
            setAddModalOpen(false);
          }}
          style={styles.backNavRow}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          <Text style={styles.sheetHeaderLabel}>Units</Text>
        </TouchableOpacity>

        <View style={styles.topActionRow}>
          <Text style={styles.title}>{editModalUnit ? 'Edit unit' : 'Add unit'}</Text>
          {editModalUnit && (
            <View style={[styles.statusBadge, editModalUnit.registryDeletedAt ? styles.badgeGray : styles.badgeGreen]}>
              <Text style={[styles.statusBadgeText, editModalUnit.registryDeletedAt ? styles.badgeGrayText : styles.badgeGreenText]}>
                {editModalUnit.registryDeletedAt ? 'Inactive in registry' : 'Active in registry'}
              </Text>
            </View>
          )}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Body number</Text>
          <TextInput
            accessibilityLabel="Body number"
            value={formBody}
            onChangeText={setFormBody}
            placeholder="Body number"
            style={styles.textInput}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Plate number</Text>
          <TextInput
            value={formPlate}
            onChangeText={setFormPlate}
            accessibilityLabel="Plate number"
            style={styles.textInput}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Seat capacity</Text>
          <TextInput
            value={formCapacity}
            onChangeText={setFormCapacity}
            keyboardType="number-pad"
            accessibilityLabel="Seat capacity"
            style={styles.textInput}
          />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={saving}
          onPress={() => {
            void handleSaveUnitForm(!editModalUnit);
          }}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>
            {editModalUnit ? 'Save changes' : 'Add unit'}
          </Text>
        </TouchableOpacity>

        {editModalUnit?.registryId && !editModalUnit.registryDeletedAt && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              void handleToggleUnitInactive(editModalUnit, true);
            }}
            style={styles.outlineRedBtn}
          >
            <Text style={styles.outlineRedText}>Mark unit inactive</Text>
          </TouchableOpacity>
        )}
      </BottomSheetModal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. REPORTS TAB (Board 04 middle & right)
// ─────────────────────────────────────────────────────────────────────────────
export function AdminReportsScreen() {
  const { user } = useAuth();
  const { data, loading, error } = useOperationsData();
  const [period, setPeriod] = useState<ReportingPeriod>(currentReportingPeriod('day'));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [readyPdf, setReadyPdf] = useState<PreparedAdminReport | null>(null);

  useEffect(() => () => {
    if (readyPdf) URL.revokeObjectURL(readyPdf.url);
  }, [readyPdf]);

  const stepPeriod = (delta: number) => {
    if (period.mode === 'day') {
      const d = new Date(`${period.key}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + delta);
      setPeriod({ mode: 'day', key: d.toISOString().slice(0, 10) });
    } else if (period.mode === 'week') {
      const d = new Date(`${period.key}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + delta * 7);
      setPeriod({ mode: 'week', key: d.toISOString().slice(0, 10) });
    } else if (period.mode === 'month') {
      const [y, m] = period.key.split('-').map(Number);
      const next = new Date(Date.UTC(y, (m || 1) - 1 + delta, 1));
      setPeriod({
        mode: 'month',
        key: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`,
      });
    } else {
      setPeriod({ mode: 'year', key: String(Number(period.key) + delta) });
    }
  };

  const shiftsCount = useMemo(
    () => data.shifts.filter((s) => periodContains(s.created_at, period)).length,
    [data.shifts, period]
  );
  const speedCount = useMemo(
    () => (data.speedEvents ?? []).filter((e) => periodContains(e.created_at, period)).length,
    [data.speedEvents, period]
  );
  const routeFlagsCount = useMemo(
    () => (data.tripViolations ?? []).filter((v) => periodContains(v.created_at, period)).length,
    [data.tripViolations, period]
  );
  const confirmedCutsCount = useMemo(
    () =>
      (data.tripViolations ?? []).filter(
        (v) => v.status === 'confirmed' && periodContains(v.created_at, period)
      ).length,
    [data.tripViolations, period]
  );

  const handleSavePdf = async () => {
    if (exporting || loading || error) return;
    setExporting(true);
    try {
      const prepared = await openAdminPeriodReport(period, null, user?.id || 'admin-preview');
      setReadyPdf(prepared);
      downloadAdminPeriodReport(prepared);
    } catch (e: any) {
      Alert.alert('Could not export PDF', e.message || 'Try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <ScrollView style={ops.page} contentContainerStyle={ops.content}>
        <View style={ops.masthead}>
          <View>
            <Text accessibilityRole="header" style={ops.mastheadTitle}>Fleet reports</Text>
            <Text style={ops.mastheadMeta}>All recorded routes</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={loading || !!error}
            accessibilityState={{ disabled: loading || !!error }}
            onPress={() => setPreviewOpen(true)}
            style={[styles.topAddBtn, (loading || !!error) && styles.disabledAction]}
          >
            <Ionicons name="document-text-outline" size={18} color={Colors.onDark} />
            <Text style={styles.topAddText}>Export PDF</Text>
          </TouchableOpacity>
        </View>
        {!!error && <Text accessibilityRole="alert" style={ops.errorBanner}>{error}</Text>}
        <View style={styles.reportLayout}>
          <View style={[ops.panel, styles.reportControls]}>
            <Text accessibilityRole="header" style={styles.panelTitle}>Reporting period</Text>
            <View style={ops.segmentBar}>
              {(
                [
                  { key: 'day', label: 'Day' },
                  { key: 'week', label: 'Week' },
                  { key: 'month', label: 'Month' },
                  { key: 'year', label: 'Year' },
                ] as const
              ).map((m) => {
                const active = period.mode === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setPeriod(currentReportingPeriod(m.key))}
                    style={[ops.segmentBtn, active && ops.segmentBtnActive]}
                  >
                    <Text style={[ops.segmentText, active && ops.segmentTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.selectorRowCard}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous reporting period" onPress={() => stepPeriod(-1)} style={styles.stepButton}>
                <Ionicons name="chevron-back" size={18} color={Colors.action} />
              </TouchableOpacity>
              <Text style={styles.selectorRowText}>{formatReportingPeriod(period)}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next reporting period" onPress={() => stepPeriod(1)} style={styles.stepButton}>
                <Ionicons name="chevron-forward" size={18} color={Colors.action} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[ops.panel, styles.reportSummary]}>
            <Text accessibilityRole="header" style={styles.panelTitle}>Report summary</Text>
            <View style={styles.kvGroup}>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Shifts started</Text>
                <Text style={styles.kvValue}>{loading || error ? 'Unavailable' : shiftsCount}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Speed offenses</Text>
                <Text style={styles.kvValue}>{loading || error || data.speedEvents === null ? 'Unavailable' : speedCount}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Route flags</Text>
                <Text style={styles.kvValue}>{loading || error || data.tripViolations === null ? 'Unavailable' : routeFlagsCount}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Confirmed cuts</Text>
                <Text style={styles.kvValue}>{loading || error || data.tripViolations === null ? 'Unavailable' : confirmedCutsCount}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Awaiting review</Text>
                <Text style={styles.kvValue}>{loading || error || data.tripViolations === null ? 'Unavailable' : data.tripViolations.filter(item => ['pending_review', 'flagged'].includes(item.status) && periodContains(item.created_at, period)).length}</Text>
              </View>
            </View>

            <Text style={styles.smallHelper}>
              Includes driver safety grades, speed offenses, and route flag status for the selected period.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* BOARD 04 RIGHT: PDF PREVIEW SHEET */}
      <BottomSheetModal
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        maxWidth={480}
        contentContainerStyle={{ gap: 14 }}
      >
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setPreviewOpen(false)}
          style={styles.backNavRow}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          <Text style={styles.sheetHeaderLabel}>PDF preview</Text>
        </TouchableOpacity>

        <Text style={styles.rowSub}>fleet-{period.key}.pdf</Text>

        <View style={styles.pdfSheetCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.ink }}>eSAKAY</Text>
            <Text style={styles.rowSub}>{period.key}</Text>
          </View>
          <Text style={[styles.rowTitle, { fontSize: 18 }]}>Fleet report</Text>
          <Text style={styles.rowSub}>All recorded routes</Text>

          <View style={styles.kvGroup}>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Shifts started</Text>
              <Text style={styles.kvValue}>{loading || error ? 'Unavailable' : shiftsCount}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Speed offenses</Text>
              <Text style={styles.kvValue}>{loading || error || data.speedEvents === null ? 'Unavailable' : speedCount}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Confirmed route cuts</Text>
              <Text style={styles.kvValue}>{loading || error || data.tripViolations === null ? 'Unavailable' : confirmedCutsCount}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Awaiting review</Text>
              <Text style={styles.kvValue}>{loading || error || data.tripViolations === null ? 'Unavailable' : data.tripViolations.filter(item => ['pending_review', 'flagged'].includes(item.status) && periodContains(item.created_at, period)).length}</Text>
            </View>
          </View>

          <Text style={styles.smallHelper}>The generated PDF includes safety grades calculated from the recorded events.</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={exporting}
          onPress={() => {
            void handleSavePdf();
          }}
          style={styles.primaryBtn}
        >
          {exporting ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.primaryBtnText}>Save PDF</Text>
          )}
        </TouchableOpacity>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  topActionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.ink,
    letterSpacing: -0.4,
  },
  topAddBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: Colors.onDarkMuted, backgroundColor: Colors.action },
  recordButton: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0, minHeight: 60, paddingVertical: 10, gap: 10 },
  recordHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  selectedUnit: { backgroundColor: Colors.actionTint, borderLeftWidth: 3, borderLeftColor: Colors.action },
  dockHeading: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, gap: 6 },
  dockActions: { flexDirection: 'row', flexWrap: 'wrap', flexGrow: 1, flexShrink: 1, gap: 6 },
  dockButton: { flexGrow: 1, minHeight: 44, paddingHorizontal: 8, paddingVertical: 6 },
  reportLayout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  reportControls: { flexGrow: 1, flexShrink: 1, flexBasis: 300, padding: 14, gap: 14 },
  reportSummary: { flexGrow: 2, flexShrink: 1, flexBasis: 360, padding: 14, gap: 10 },
  panelTitle: { fontSize: 18, fontWeight: '700', color: Colors.ink },
  stepButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disabledAction: { opacity: 0.6 },
  topAddText: { fontSize: 14, fontWeight: '700', color: Colors.onDark },
  searchBar: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: Colors.paper, borderRadius: 6, borderWidth: 1, borderColor: Colors.border },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.ink,
    paddingVertical: 10,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, borderTopWidth: 1, borderColor: Colors.border },
  initialsCircle: { width: 36, height: 36, borderRadius: 6, backgroundColor: Colors.mutedBackground, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 14, fontWeight: '800', color: Colors.midnight },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  rowSub: {
    fontSize: 13,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
  },
  badgeGreen: {
    backgroundColor: Colors.paleGreen,
  },
  badgeAmber: {
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
  },
  badgeGray: {
    backgroundColor: Colors.canvas,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeGreenText: {
    color: Colors.brandGreen,
  },
  badgeAmberText: {
    color: Colors.warning,
  },
  badgeGrayText: {
    color: Colors.subtleGray,
  },
  reviewBtn: { backgroundColor: Colors.action, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 5 },
  reviewText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
  },
  restoreOutlineBtn: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: Colors.action, paddingHorizontal: 10, borderRadius: 6 },
  restoreOutlineText: { fontSize: 13, fontWeight: '700', color: Colors.action },
  backNavRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sheetHeaderLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  kvGroup: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  kvRow: {
    gap: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  kvLabel: {
    fontSize: 14,
    color: Colors.subtleGray,
  },
  kvValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink,
  },
  textInput: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Colors.ink,
    backgroundColor: Colors.paper,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: Colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  solidRedBtn: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: Colors.primaryRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineRedBtn: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.primaryRed,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledOutlineBtn: {
    borderColor: Colors.border,
    backgroundColor: Colors.canvas,
  },
  outlineRedText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  outlineBtn: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.action,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.action,
  },
  outlineDarkBtn: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineDarkText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  smallHelper: {
    fontSize: 13,
    color: Colors.subtleGray,
    lineHeight: 18,
  },
  bottomActionDock: {
    width: '100%', maxWidth: 992, alignSelf: 'center',
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    gap: 8, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.paper, borderTopWidth: 2, borderTopColor: Colors.action,
  },
  dockSelectedLabel: { color: Colors.ink, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  staleBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.warning,
  },
  selectorRowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, borderRadius: 6 },
  selectorRowText: { flex: 1, textAlign: 'center', color: Colors.ink, fontSize: 15, fontWeight: '700' },
  pdfSheetCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 16,
    backgroundColor: Colors.paper,
    gap: 8,
  },
});
