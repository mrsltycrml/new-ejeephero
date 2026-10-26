import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import {
  loadRegistry, saveRegistryRecord, setRegistryDeleted,
  type DriverInput, type ManagedDriver, type ManagedUnit, type RegistryKind, type RegistryMode, type UnitInput,
} from '../services/fleetRegistryService';

const EMPTY_UNIT: UnitInput = { body_number: '', plate_number: '', route_name: 'MRT Buendia - Mandaluyong City Hall', assigned_driver: '', notes: '' };
const EMPTY_DRIVER: DriverInput = { full_name: '', email: '', assigned_unit: '', notes: '' };
type Row = ManagedUnit | ManagedDriver;

function FormField({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: 'email-address' | 'default';
}) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput
    value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8B9496"
    keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
    style={styles.input}
  /></View>;
}

function Action({ label, onPress, icon, danger = false, primary = false, iconOnly = false }: {
  label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; danger?: boolean; primary?: boolean; iconOnly?: boolean;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.action, primary && styles.actionPrimary, danger && styles.actionDanger]}>
    {icon && <Ionicons name={icon} size={15} color={primary ? '#fff' : danger ? Colors.ember : Colors.ink} />}
    {!iconOnly && <Text style={[styles.actionText, primary && styles.actionPrimaryText, danger && styles.actionDangerText]}>{label}</Text>}
  </TouchableOpacity>;
}

export default function AdminRegistryManager({ kind, refreshToken = 0, onRowsChange, excludeUnitKeys = [] }: { kind: RegistryKind; refreshToken?: number; onRowsChange?: (rows: Row[], mode: RegistryMode) => void; excludeUnitKeys?: string[] }) {
  const { user, isAdmin } = useAuth();
  const compact = useWindowDimensions().width < 700;
  const adminId = user?.id || 'admin-preview';
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<RegistryMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deletedView, setDeletedView] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState<UnitInput>(EMPTY_UNIT);
  const [driverForm, setDriverForm] = useState<DriverInput>(EMPTY_DRIVER);
  const isUnit = kind === 'units';
  const noun = isUnit ? 'unit' : 'driver';

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const result = kind === 'units' ? await loadRegistry('units', adminId) : await loadRegistry('drivers', adminId);
      setRows(result.rows);
      setMode(result.mode);
      onRowsChange?.(result.rows, result.mode);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not load ${kind}.`);
    } finally { setLoading(false); }
  }, [adminId, isAdmin, kind, onRowsChange]);

  useEffect(() => { void refresh(); }, [refresh, refreshToken]);
  const active = useMemo(() => rows.filter((row) => !row.deleted_at), [rows]);
  const deleted = useMemo(() => rows.filter((row) => row.deleted_at).sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || '')), [rows]);
  const excluded = new Set(excludeUnitKeys.map((value) => value.trim().toUpperCase()));
  const shown = deletedView ? deleted : active.filter((row) => !('body_number' in row && (excluded.has(row.body_number.trim().toUpperCase()) || (!!row.plate_number && excluded.has(row.plate_number.trim().toUpperCase())))));

  const resetForm = () => { setFormOpen(false); setEditingId(undefined); setUnitForm(EMPTY_UNIT); setDriverForm(EMPTY_DRIVER); };
  const beginAdd = () => { resetForm(); setDeletedView(false); setFormOpen(true); };
  const beginEdit = (row: Row) => {
    setEditingId(row.id);
    if ('body_number' in row) setUnitForm({ body_number: row.body_number, plate_number: row.plate_number || '', route_name: row.route_name, assigned_driver: row.assigned_driver || '', notes: row.notes || '' });
    else setDriverForm({ full_name: row.full_name, email: row.email, assigned_unit: row.assigned_unit || '', notes: row.notes || '' });
    setFormOpen(true);
  };
  const save = async () => {
    if (!mode || busy) return;
    const unitInput: UnitInput = {
      body_number: unitForm.body_number.trim(), plate_number: unitForm.plate_number?.trim() || null,
      route_name: unitForm.route_name.trim() || EMPTY_UNIT.route_name, assigned_driver: unitForm.assigned_driver?.trim() || null,
      notes: unitForm.notes?.trim() || null,
    };
    const driverInput: DriverInput = {
      full_name: driverForm.full_name.trim(), email: driverForm.email.trim().toLowerCase(),
      assigned_unit: driverForm.assigned_unit?.trim() || null, notes: driverForm.notes?.trim() || null,
    };
    if (isUnit && !unitInput.body_number) { setError('Enter a body number.'); return; }
    if (!isUnit && (!driverInput.full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driverInput.email))) { setError('Enter a name and valid email.'); return; }
    setBusy(true); setError('');
    try {
      if (kind === 'units') await saveRegistryRecord('units', adminId, mode, unitInput, editingId);
      else await saveRegistryRecord('drivers', adminId, mode, driverInput, editingId);
      resetForm();
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not save ${noun}.`); }
    finally { setBusy(false); }
  };
  const changeDeleted = async (row: Row, shouldDelete: boolean) => {
    if (!mode || busy) return;
    setBusy(true); setError('');
    try { await setRegistryDeleted(kind, adminId, mode, row.id, shouldDelete); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `Could not update ${noun}.`); }
    finally { setBusy(false); }
  };
  const confirmDelete = (row: Row) => {
    const name = 'body_number' in row ? row.body_number : row.full_name;
    const action = () => { void changeDeleted(row, true); };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Move ${name} to Recently deleted? You can restore it later.`)) action();
    } else Alert.alert(`Delete ${noun}?`, `${name} can be restored from Recently deleted.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: action }]);
  };

  if (!isAdmin) return null;
  return <View style={styles.shell}>
    <View style={styles.headingActions}><Action label={`Add ${noun}`} icon="add" primary onPress={beginAdd} /><Action label={deletedView ? `Active ${kind}` : 'Recently deleted'} icon={deletedView ? 'list-outline' : 'archive-outline'} onPress={() => { resetForm(); setDeletedView(!deletedView); }} /><Action label="Refresh" icon="refresh" iconOnly={compact} onPress={() => { void refresh(); }} /></View>
    {(formOpen || deletedView || shown.length > 0) && mode === 'local-preview' && <Text style={styles.previewNote}>Changes to this roster are saved on this device.</Text>}
    {formOpen && kind === 'drivers' && <Text style={styles.previewNote}>Adding a roster entry does not create a sign-in account. Drivers register and verify their email separately.</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {formOpen && <View style={styles.form}>
      <View style={styles.formHeading}><Text style={styles.formTitle}>{editingId ? `Edit ${noun}` : `Add ${noun}`}</Text><Action label="Cancel" onPress={resetForm} /></View>
      <View style={styles.fields}>
        {isUnit ? <>
          <FormField label="Body number *" value={unitForm.body_number} onChangeText={(value) => setUnitForm((old) => ({ ...old, body_number: value }))} placeholder="e.g. Unit 01" />
          <FormField label="Plate number" value={unitForm.plate_number || ''} onChangeText={(value) => setUnitForm((old) => ({ ...old, plate_number: value }))} placeholder="Vehicle plate" />
          <FormField label="Route" value={unitForm.route_name} onChangeText={(value) => setUnitForm((old) => ({ ...old, route_name: value }))} />
          <FormField label="Assigned driver" value={unitForm.assigned_driver || ''} onChangeText={(value) => setUnitForm((old) => ({ ...old, assigned_driver: value }))} placeholder="Driver name" />
          <FormField label="Notes" value={unitForm.notes || ''} onChangeText={(value) => setUnitForm((old) => ({ ...old, notes: value }))} />
        </> : <>
          <FormField label="Full name *" value={driverForm.full_name} onChangeText={(value) => setDriverForm((old) => ({ ...old, full_name: value }))} />
          <FormField label="Email *" value={driverForm.email} keyboardType="email-address" onChangeText={(value) => setDriverForm((old) => ({ ...old, email: value }))} />
          <FormField label="Assigned unit" value={driverForm.assigned_unit || ''} onChangeText={(value) => setDriverForm((old) => ({ ...old, assigned_unit: value }))} />
          <FormField label="Notes" value={driverForm.notes || ''} onChangeText={(value) => setDriverForm((old) => ({ ...old, notes: value }))} />
        </>}
      </View>
      <Action label={busy ? 'Saving…' : editingId ? 'Save changes' : `Add ${noun}`} icon="checkmark" primary onPress={() => { void save(); }} />
    </View>}
    {loading ? null : shown.length === 0 ? (deletedView ? <Text style={styles.empty}>No recently deleted {kind}.</Text> : null) : shown.map((row) => {
      const unit = 'body_number' in row ? row : null;
      const driver = 'full_name' in row ? row : null;
      const title = unit?.body_number || driver?.full_name || '';
      const sub = unit ? [unit.plate_number && `Plate ${unit.plate_number}`, unit.route_name].filter(Boolean).join(' · ') : driver?.email || '';
      return <View key={row.id} style={styles.row}>
        <View style={styles.rowTop}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSub}>{sub}</Text></View><View style={styles.rowActions}><Action label={expandedId === row.id ? 'Hide details' : 'View'} icon="eye-outline" onPress={() => setExpandedId(expandedId === row.id ? null : row.id)} />{deletedView ? <Action label="Restore" icon="arrow-undo-outline" onPress={() => { void changeDeleted(row, false); }} /> : <><Action label="Edit" icon="create-outline" onPress={() => beginEdit(row)} /><Action label="Delete" icon="trash-outline" danger onPress={() => confirmDelete(row)} /></>}</View></View>
        {expandedId === row.id && <View style={styles.details}><Text style={styles.detailText}>{unit ? `Assigned driver: ${unit.assigned_driver || 'Not assigned'}` : `Assigned unit: ${driver?.assigned_unit || 'Not assigned'}`}</Text><Text style={styles.detailText}>Notes: {row.notes || 'None'}</Text><Text style={styles.detailText}>Updated: {new Date(row.updated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</Text>{row.deleted_at && <Text style={styles.detailText}>Deleted: {new Date(row.deleted_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</Text>}</View>}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  shell: { gap: 10, marginTop: 12, marginBottom: 12 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  headingText: { flexGrow: 1 }, eyebrow: { color: Colors.ember, fontSize: 12, fontWeight: '600', letterSpacing: 1.3 }, title: { color: Colors.ink, fontSize: 19, fontWeight: '600', marginTop: 2 }, subtitle: { color: Colors.subtleGray, fontSize: 12, marginTop: 3 },
  headingActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, action: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderColor: Colors.border, borderWidth: 1, backgroundColor: Colors.paper }, actionPrimary: { backgroundColor: Colors.ink, borderColor: Colors.ink }, actionDanger: { backgroundColor: '#FFF2EE', borderColor: '#EAB9AF' }, actionText: { color: Colors.ink, fontSize: 12, fontWeight: '600' }, actionPrimaryText: { color: '#fff' }, actionDangerText: { color: Colors.ember },
  previewNote: { color: Colors.subtleGray, fontSize: 12, lineHeight: 16 }, error: { backgroundColor: '#FFF2EE', color: Colors.ember, padding: 10, borderRadius: 7, fontSize: 12 },
  form: { borderColor: Colors.border, borderWidth: 1, backgroundColor: Colors.paper, borderRadius: 8, padding: 13, gap: 10, alignItems: 'flex-start' }, formHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, formTitle: { color: Colors.ink, fontSize: 16, fontWeight: '600' }, fields: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { flexBasis: 205, flexGrow: 1, gap: 4 }, fieldLabel: { color: Colors.subtleGray, fontSize: 12, fontWeight: '600', textTransform: 'none', letterSpacing: 0.5 }, input: { minHeight: 39, borderRadius: 8, borderColor: Colors.border, borderWidth: 1, backgroundColor: '#FFFCF8', paddingHorizontal: 11, color: Colors.ink, fontSize: 13 },
  empty: { color: Colors.subtleGray, fontSize: 12, paddingVertical: 13 }, row: { backgroundColor: Colors.paper, borderColor: Colors.border, borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 }, rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, rowTitle: { color: Colors.ink, fontSize: 14, fontWeight: '600' }, rowSub: { color: Colors.subtleGray, fontSize: 12, marginTop: 3 }, rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, details: { backgroundColor: '#F6EFE7', borderRadius: 8, padding: 10, gap: 3 }, detailText: { color: Colors.ink, fontSize: 12 },
});
