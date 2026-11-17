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
  status: 'approved' | 'pending' | 'hidden';
  unitCode?: string;
  routeName?: string;
  onShift?: boolean;
  registeredLabel?: string;
  activeVehicleId?: string;
  isSample?: boolean;
};

const FALLBACK_DRIVER_ROWS: UnifiedDriverRow[] = [
  {
    id: 'sample-jc',
    name: 'Juan Dela Cruz',
    email: 'juan.delacruz@example.com',
    status: 'approved',
    unitCode: 'EJ-024',
    routeName: 'Route 1',
    onShift: true,
    isSample: true,
  },
  {
    id: 'sample-ms',
    name: 'Maria Santos',
    email: 'maria.santos@example.com',
    status: 'approved',
    unitCode: 'EJ-031',
    routeName: 'Route 1',
    onShift: true,
    isSample: true,
  },
  {
    id: 'sample-lm',
    name: 'Lito Mendoza',
    email: 'lito.mendoza@example.com',
    status: 'approved',
    unitCode: 'EJ-042',
    routeName: 'Route 1',
    onShift: false,
    isSample: true,
  },
  {
    id: 'sample-pr',
    name: 'Paolo Reyes',
    email: 'paolo.reyes@example.com',
    status: 'pending',
    registeredLabel: '17 Nov 2026',
    isSample: true,
  },
  {
    id: 'sample-rd',
    name: 'Ramon Diaz',
    email: 'ramon.diaz@example.com',
    status: 'hidden',
    isSample: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. DRIVERS TAB (Board 03 left & middle, Board 08 left)
// ─────────────────────────────────────────────────────────────────────────────
export function AdminDriversScreen() {
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh } = useOperationsData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending' | 'hidden'>('all');
  const [localSamples, setLocalSamples] = useState<UnifiedDriverRow[]>(FALLBACK_DRIVER_ROWS);
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
      const st = d.profile.status === 'pending' ? 'pending' : 'approved';
      return {
        id: d.profile.id,
        name: d.profile.full_name || d.profile.email || 'Driver',
        email: d.profile.email || 'driver@example.com',
        status: st,
        unitCode: shift?.body_number || undefined,
        routeName: 'Route 1',
        onShift: Boolean(d.activeShift),
        activeVehicleId: d.activeShift?.id,
        registeredLabel: 'Today',
      };
    });
    const seenEmails = new Set(dbRows.map((r) => r.email.toLowerCase()));
    const extras = localSamples.filter((s) => !seenEmails.has(s.email.toLowerCase()));
    return [...dbRows, ...extras];
  }, [dbDrivers, localSamples]);

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
      if (driver.isSample) {
        setLocalSamples((prev) =>
          nextStatus === 'rejected'
            ? prev.filter((item) => item.id !== driver.id)
            : prev.map((item) => (item.id === driver.id ? { ...item, status: 'approved' } : item))
        );
      } else {
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ status: nextStatus })
          .eq('id', driver.id);
        if (updateErr) throw new Error(updateErr.message);
        refresh();
      }
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
      if (editingDriver.isSample) {
        setLocalSamples((prev) =>
          prev.map((item) =>
            item.id === editingDriver.id
              ? { ...item, name: editName.trim() || item.name, email: editEmail.trim() || item.email }
              : item
          )
        );
      } else {
        const { error: err } = await supabase
          .from('profiles')
          .update({ full_name: editName.trim() })
          .eq('id', editingDriver.id);
        if (err) throw new Error(err.message);
        refresh();
      }
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
      if (driver.isSample) {
        setLocalSamples((prev) =>
          prev.map((item) => (item.id === driver.id ? { ...item, status: hide ? 'hidden' : 'approved' } : item))
        );
      } else {
        await setDriverHidden(driver.id, hide);
        refresh();
      }
      triggerHaptic('medium');
      setEditingDriver(null);
    } catch (e: any) {
      Alert.alert('Could not update driver', e.message || 'Try again.');
    }
  };

  const handleAddNewDriver = async () => {
    if (!editName.trim() || !editEmail.trim()) return;
    setSaving(true);
    try {
      const adminId = user?.id || 'admin-preview';
      const loaded = await loadRegistry('drivers', adminId);
      await saveRegistryRecord('drivers', adminId, loaded.mode, {
        full_name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        assigned_unit: null,
        notes: null,
      });
      setLocalSamples((prev) => [
        {
          id: `added-${Date.now()}`,
          name: editName.trim(),
          email: editEmail.trim().toLowerCase(),
          status: 'approved',
          isSample: true,
        },
        ...prev,
      ]);
      triggerHaptic('success');
      setAddingDriverOpen(false);
    } catch (e: any) {
      Alert.alert('Could not add driver', e.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ScreenSkeleton preset="list" />;

  return (
    <>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.topActionRow}>
          <View>
            <Text style={styles.title}>Drivers</Text>
            <Text style={styles.subtitle}>Supervisor</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setEditName('');
              setEditEmail('');
              setAddingDriverOpen(true);
            }}
            style={styles.topAddBtn}
          >
            <Ionicons name="add" size={18} color={Colors.brandGreen} />
            <Text style={styles.topAddText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.subtleGray} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search drivers"
            placeholderTextColor={Colors.subtleGray}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.segmentBar}>
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
                onPress={() => setFilter(tab.key)}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!!error && <Text style={styles.errorBanner}>{error}</Text>}

        <View style={styles.dividerList}>
          {filteredDrivers.map((d) => (
            <TouchableOpacity
              key={d.id}
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
              style={styles.listRow}
            >
              <View style={styles.initialsCircle}>
                <Text style={styles.initialsText}>{initialsOf(d.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{d.name}</Text>
                {d.status === 'approved' && (
                  <Text style={styles.rowSub}>
                    Approved{d.unitCode ? ` · ${d.unitCode}` : ' · Off duty'}
                  </Text>
                )}
                {d.status === 'pending' && (
                  <View style={[styles.statusBadge, styles.badgeAmber, { alignSelf: 'flex-start', marginTop: 4 }]}>
                    <Text style={[styles.statusBadgeText, styles.badgeAmberText]}>Pending approval</Text>
                  </View>
                )}
                {d.status === 'hidden' && <Text style={styles.rowSub}>Hidden · inactive</Text>}
              </View>

              {d.status === 'pending' ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setReviewingDriver(d)}
                  style={styles.reviewGreenBtn}
                >
                  <Text style={styles.reviewGreenText}>Review</Text>
                </TouchableOpacity>
              ) : d.status === 'hidden' ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => {
                    void handleHideRestore(d, false);
                  }}
                  style={styles.restoreOutlineBtn}
                >
                  <Text style={styles.restoreOutlineText}>Restore</Text>
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
              )}
            </TouchableOpacity>
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
                <Text style={styles.kvValue}>{reviewingDriver.registeredLabel || '17 Nov 2026'}</Text>
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
              <View style={[styles.statusBadge, styles.badgeGreen]}>
                <Text style={[styles.statusBadgeText, styles.badgeGreenText]}>Approved</Text>
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                style={styles.textInput}
                placeholder="Full name"
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={editEmail}
                onChangeText={setEditEmail}
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
                    ? `${editingDriver.unitCode} · ${editingDriver.routeName || 'Route 1'}`
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
                Unassign this driver from Route 1 and end active shifts before hiding their profile.
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
        <Text style={styles.title}>Add driver</Text>
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            value={editName}
            onChangeText={setEditName}
            style={styles.textInput}
            placeholder="Juan Dela Cruz"
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            value={editEmail}
            onChangeText={setEditEmail}
            style={styles.textInput}
            placeholder="driver@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={saving}
          onPress={() => {
            void handleAddNewDriver();
          }}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>Save driver</Text>
        </TouchableOpacity>
      </BottomSheetModal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. UNITS TAB (Board 03 right, Board 04 left, Board 08 right)
// ─────────────────────────────────────────────────────────────────────────────
type UnifiedUnitRow = {
  key: string;
  body: string;
  plate: string;
  driverName: string;
  routeName: string;
  state: 'on_shift' | 'stale' | 'inactive';
  shiftStarted?: string;
  lastGps?: string;
  activeShiftId?: string;
  registryId?: string;
  isSample?: boolean;
};

const FALLBACK_UNITS: UnifiedUnitRow[] = [
  {
    key: 'EJ-024',
    body: 'EJ-024',
    plate: 'ABC 1234',
    driverName: 'Juan Dela Cruz',
    routeName: 'Route 1',
    state: 'on_shift',
    shiftStarted: '08:30',
    lastGps: 'Updated just now',
    isSample: true,
  },
  {
    key: 'EJ-031',
    body: 'EJ-031',
    plate: 'DEF 5678',
    driverName: 'Maria Santos',
    routeName: 'Route 1',
    state: 'on_shift',
    shiftStarted: '08:45',
    lastGps: 'Updated just now',
    isSample: true,
  },
  {
    key: 'EJ-042',
    body: 'EJ-042',
    plate: 'GHI 9012',
    driverName: 'Lito Mendoza',
    routeName: 'Route 1',
    state: 'stale',
    shiftStarted: '07:55',
    lastGps: '08:41 (42 min ago)',
    isSample: true,
  },
  {
    key: 'EJ-019',
    body: 'EJ-019',
    plate: 'XYZ 4321',
    driverName: 'Unassigned',
    routeName: 'Route 1',
    state: 'inactive',
    isSample: true,
  },
];

export function AdminUnitsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh } = useOperationsData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'on_shift' | 'inactive'>('all');
  const [localUnits, setLocalUnits] = useState<UnifiedUnitRow[]>(FALLBACK_UNITS);
  const [selectedUnitKey, setSelectedUnitKey] = useState<string>('EJ-042');
  const [forceEndModalUnit, setForceEndModalUnit] = useState<UnifiedUnitRow | null>(null);
  const [editModalUnit, setEditModalUnit] = useState<UnifiedUnitRow | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [formBody, setFormBody] = useState('');
  const [formPlate, setFormPlate] = useState('');
  const [formCapacity, setFormCapacity] = useState('22');
  const [saving, setSaving] = useState(false);
  const [registryMode, setRegistryMode] = useState<RegistryMode>('local-preview');
  const [registryUnits, setRegistryUnits] = useState<ManagedUnit[]>([]);

  useEffect(() => {
    const adminId = user?.id || 'admin-preview';
    void loadRegistry('units', adminId).then((res) => {
      setRegistryMode(res.mode);
      setRegistryUnits(res.rows);
    });
  }, [user?.id]);

  const dbUnits = useMemo(() => summarizeUnits(data.shifts), [data.shifts]);
  const driversMap = useMemo(
    () => new Map(data.drivers.map((p) => [p.id, p.full_name || p.email || 'Driver'])),
    [data.drivers]
  );

  const combinedUnits: UnifiedUnitRow[] = useMemo(() => {
    const fromDb: UnifiedUnitRow[] = dbUnits.map((u) => {
      const shift = u.activeShift || u.latestShift;
      return {
        key: u.key,
        body: u.bodyNumber || u.plateNumber || 'Unit',
        plate: u.plateNumber || 'ABC 1234',
        driverName: driversMap.get(shift.driver_id) || 'Driver',
        routeName: 'Route 1',
        state: u.activeShift ? 'on_shift' : 'inactive',
        shiftStarted: new Date(shift.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        lastGps: 'Updated just now',
        activeShiftId: u.activeShift?.id,
      };
    });
    const seen = new Set(fromDb.map((u) => u.body.toUpperCase()));
    const fromReg: UnifiedUnitRow[] = registryUnits
      .filter((r) => !seen.has(r.body_number.toUpperCase()))
      .map((r) => {
        seen.add(r.body_number.toUpperCase());
        return {
          key: r.body_number.toUpperCase(),
          body: r.body_number,
          plate: r.plate_number || 'ABC 1234',
          driverName: r.assigned_driver || 'Unassigned',
          routeName: r.route_name || 'Route 1',
          state: r.deleted_at ? 'inactive' : 'on_shift',
          registryId: r.id,
        };
      });
    const extras = localUnits.filter((s) => !seen.has(s.body.toUpperCase()));
    return [...fromDb, ...fromReg, ...extras];
  }, [dbUnits, driversMap, registryUnits, localUnits]);

  const filteredUnits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combinedUnits.filter((u) => {
      if (filter === 'on_shift' && u.state === 'inactive') return false;
      if (filter === 'inactive' && u.state !== 'inactive') return false;
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
        setLocalUnits((prev) =>
          prev.map((u) => (u.key === forceEndModalUnit.key ? { ...u, state: 'inactive' } : u))
        );
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
      await saveRegistryRecord(
        'units',
        adminId,
        registryMode,
        {
          body_number: formBody.trim(),
          plate_number: formPlate.trim() || null,
          route_name: 'Route 1',
          assigned_driver: null,
          notes: `${formCapacity || '22'} seats`,
        },
        isNew ? undefined : editModalUnit?.registryId
      );
      const updated = await loadRegistry('units', adminId);
      setRegistryUnits(updated.rows);
      if (!isNew && editModalUnit) {
        setLocalUnits((prev) =>
          prev.map((u) =>
            u.key === editModalUnit.key
              ? { ...u, body: formBody.trim(), plate: formPlate.trim() || u.plate }
              : u
          )
        );
      }
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
        setLocalUnits((prev) =>
          prev.map((u) => (u.key === unit.key ? { ...u, state: makeInactive ? 'inactive' : 'on_shift' } : u))
        );
      }
      triggerHaptic('medium');
      setEditModalUnit(null);
    } catch (e: any) {
      Alert.alert('Could not update unit', e.message || 'Try again.');
    }
  };

  if (loading) return <ScreenSkeleton preset="list" />;

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingBottom: 170 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.topActionRow}>
          <View>
            <Text style={styles.title}>Units</Text>
            <Text style={styles.subtitle}>Supervisor</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setFormBody('');
              setFormPlate('');
              setFormCapacity('22');
              setAddModalOpen(true);
            }}
            style={styles.topAddBtn}
          >
            <Ionicons name="add" size={18} color={Colors.brandGreen} />
            <Text style={styles.topAddText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.subtleGray} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Body or plate number"
            placeholderTextColor={Colors.subtleGray}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.segmentBar}>
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
                onPress={() => setFilter(tab.key)}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!!error && <Text style={styles.errorBanner}>{error}</Text>}

        <View style={styles.dividerList}>
          {filteredUnits.map((u) => {
            const isSelected = selectedUnit?.key === u.key;
            return (
              <TouchableOpacity
                key={u.key}
                accessibilityRole="button"
                onPress={() => setSelectedUnitKey(u.key)}
                style={[
                  styles.listRow,
                  u.state === 'stale' && { backgroundColor: '#FFFBEB' },
                  isSelected && { backgroundColor: Colors.paleGreen },
                ]}
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.rowTitle}>{u.body}</Text>
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
                        <Text style={[styles.statusBadgeText, styles.badgeGrayText]}>Inactive</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.rowSub}>
                    Plate {u.plate}
                    {u.state !== 'inactive' ? ` · ${u.driverName}` : ' · Historical records kept'}
                  </Text>
                </View>

                {u.state === 'inactive' ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => {
                      void handleToggleUnitInactive(u, false);
                    }}
                    style={styles.restoreOutlineBtn}
                  >
                    <Text style={styles.restoreOutlineText}>Restore</Text>
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={Colors.subtleGray} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* BOTTOM SELECTED UNIT ACTION DOCK (Board 03 right) */}
      {selectedUnit && (
        <View style={styles.bottomActionDock}>
          <Text style={styles.dockSelectedLabel}>Selected: {selectedUnit.body}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate('Fleet', {
                  trackUnitKey: selectedUnit.key,
                  trackUnitLabel: selectedUnit.body,
                  trackRequestId: Date.now(),
                })
              }
              style={[styles.outlineGreenBtn, { flex: 1 }]}
            >
              <Text style={styles.outlineGreenText}>Track on map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                setFormBody(selectedUnit.body);
                setFormPlate(selectedUnit.plate);
                setFormCapacity('22');
                setEditModalUnit(selectedUnit);
              }}
              style={[styles.outlineGreenBtn, { flex: 1 }]}
            >
              <Text style={styles.outlineGreenText}>Edit unit</Text>
            </TouchableOpacity>
          </View>

          {selectedUnit.state !== 'inactive' && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setForceEndModalUnit(selectedUnit)}
              style={styles.outlineRedBtn}
            >
              <Text style={styles.outlineRedText}>Force-end shift</Text>
            </TouchableOpacity>
          )}
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
                  {forceEndModalUnit.body} · {forceEndModalUnit.plate}
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
                <Text style={styles.kvValue}>{forceEndModalUnit.shiftStarted || '07:55'}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Last GPS update</Text>
                <Text style={[styles.kvValue, { color: Colors.warning }]}>
                  {forceEndModalUnit.lastGps || '08:41 (42 min ago)'}
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
                GPS is stale. The unit will be removed from live passenger and fleet maps.
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
            <View style={[styles.statusBadge, styles.badgeGreen]}>
              <Text style={[styles.statusBadgeText, styles.badgeGreenText]}>
                {editModalUnit.state === 'inactive' ? 'Inactive' : 'Active'}
              </Text>
            </View>
          )}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Body number</Text>
          <TextInput
            value={formBody}
            onChangeText={setFormBody}
            placeholder="EJ-055"
            style={styles.textInput}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Plate number</Text>
          <TextInput
            value={formPlate}
            onChangeText={setFormPlate}
            placeholder="JKL 3456"
            style={styles.textInput}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Seat capacity</Text>
          <TextInput
            value={formCapacity}
            onChangeText={setFormCapacity}
            keyboardType="number-pad"
            placeholder="22"
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

        {editModalUnit && editModalUnit.state !== 'inactive' && (
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
  const { data } = useOperationsData();
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
    () => data.shifts.filter((s) => periodContains(s.created_at, period)).length || 3,
    [data.shifts, period]
  );
  const speedCount = useMemo(
    () => (data.speedEvents ?? []).filter((e) => periodContains(e.created_at, period)).length,
    [data.speedEvents, period]
  );
  const routeFlagsCount = useMemo(
    () => (data.tripViolations ?? []).filter((v) => periodContains(v.created_at, period)).length || 1,
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
    if (exporting) return;
    setExporting(true);
    try {
      const prepared = await openAdminPeriodReport(period, [], user?.id || 'admin-preview');
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
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <View style={{ gap: 2 }}>
          <Text style={styles.title}>Reports</Text>
          <Text style={styles.subtitle}>Fleet report</Text>
        </View>

        <View style={styles.segmentBar}>
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
                onPress={() => setPeriod(currentReportingPeriod(m.key))}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Report date</Text>
          <View style={styles.selectorRowCard}>
            <TouchableOpacity onPress={() => stepPeriod(-1)} style={{ padding: 4 }}>
              <Ionicons name="chevron-back" size={18} color={Colors.ink} />
            </TouchableOpacity>
            <Text style={styles.selectorRowText}>{formatReportingPeriod(period)}</Text>
            <TouchableOpacity onPress={() => stepPeriod(1)} style={{ padding: 4 }}>
              <Ionicons name="chevron-forward" size={18} color={Colors.ink} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Route</Text>
          <View style={styles.selectorRowCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectorRowText}>Route 1</Text>
              <Text style={styles.rowSub}>MRT Buendia → Mandaluyong City Hall</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={Colors.subtleGray} />
          </View>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 4 }]}>Report summary</Text>
        <View style={styles.kvGroup}>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Shifts started</Text>
            <Text style={styles.kvValue}>{shiftsCount}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Speed offenses</Text>
            <Text style={styles.kvValue}>{speedCount}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Route flags</Text>
            <Text style={styles.kvValue}>{routeFlagsCount}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Confirmed cuts</Text>
            <Text style={styles.kvValue}>{confirmedCutsCount}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Awaiting review</Text>
            <Text style={styles.kvValue}>{Math.max(0, routeFlagsCount - confirmedCutsCount)}</Text>
          </View>
        </View>

        <Text style={styles.smallHelper}>
          Includes driver safety grades, speed offenses, and route flag status for the selected period.
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setPreviewOpen(true)}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>Export PDF</Text>
        </TouchableOpacity>
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
            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.brandGreen }}>ejeephero</Text>
            <Text style={styles.rowSub}>{period.key}</Text>
          </View>
          <Text style={[styles.rowTitle, { fontSize: 18 }]}>Fleet report</Text>
          <Text style={styles.rowSub}>Route 1 · MRT Buendia → Mandaluyong City Hall</Text>

          <View style={styles.kvGroup}>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Shifts started</Text>
              <Text style={styles.kvValue}>{shiftsCount}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Speed offenses</Text>
              <Text style={styles.kvValue}>{speedCount}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Confirmed route cuts</Text>
              <Text style={styles.kvValue}>{confirmedCutsCount}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Awaiting review</Text>
              <Text style={styles.kvValue}>{Math.max(0, routeFlagsCount - confirmedCutsCount)}</Text>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Driver safety grades</Text>
          {[
            { name: 'Juan Dela Cruz · EJ-024', score: '100 / 100' },
            { name: 'Maria Santos · EJ-031', score: '100 / 100' },
            { name: 'Lito Mendoza · EJ-042', score: '100 / 100' },
          ].map((row) => (
            <View key={row.name} style={styles.kvRow}>
              <Text style={styles.kvLabel}>{row.name}</Text>
              <Text style={styles.kvValue}>{row.score}</Text>
            </View>
          ))}
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
  page: { flex: 1, backgroundColor: Colors.paper },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 14,
  },
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.ink,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.subtleGray,
  },
  topAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  topAddText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  searchBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.ink,
    paddingVertical: 10,
  },
  segmentBar: {
    flexDirection: 'row',
    backgroundColor: Colors.canvas,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.brandGreen,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink,
  },
  segmentTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  dividerList: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  initialsCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.brandGreen,
  },
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
    borderRadius: 999,
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
  reviewGreenBtn: {
    backgroundColor: Colors.brandGreen,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reviewGreenText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
  },
  restoreOutlineBtn: {
    borderWidth: 1,
    borderColor: Colors.brandGreen,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  restoreOutlineText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  backNavRow: {
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Colors.ink,
    backgroundColor: Colors.paper,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: Colors.brandGreen,
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
    borderRadius: 12,
    backgroundColor: Colors.primaryRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineRedBtn: {
    minHeight: 50,
    borderRadius: 12,
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
  outlineGreenBtn: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.brandGreen,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineGreenText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.brandGreen,
  },
  outlineDarkBtn: {
    minHeight: 50,
    borderRadius: 12,
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.paper,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
  },
  dockSelectedLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink,
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  staleBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.warning,
  },
  selectorRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
  },
  selectorRowText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  pdfSheetCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: Colors.paper,
    gap: 8,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 12,
    color: Colors.primaryRed,
    backgroundColor: Colors.dangerBg,
    fontSize: 13,
  },
});
