import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

type Props = { body: string; plate: string; driver: string; route: string; trips: number; total: number; started: string; ended: string; status: string; onTrack: () => void; onDelete?: () => void };
export default function FleetRosterRow(props: Props) {
  const [open, setOpen] = useState(false);
  const wide = useWindowDimensions().width >= 760;
  return <View style={styles.row}>
    <View style={styles.top}>
      <View style={styles.identity}><Text style={styles.name}>{props.body}</Text><Text style={styles.meta}>Plate {props.plate || '—'}</Text></View>
      {wide && <View style={styles.assignment}><Text style={styles.value}>{props.driver}</Text><Text style={styles.meta} numberOfLines={1}>{props.route}</Text></View>}
      {wide && <View style={styles.quantity}><Text style={styles.count}>{props.trips}</Text><Text style={styles.meta}>trips today</Text></View>}
      <Text style={styles.status}>{props.status}</Text>
      {wide && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Track ${props.body}`} onPress={props.onTrack} style={styles.action}><Ionicons name="navigate-outline" size={16} color={Colors.ink}/><Text style={styles.actionText}>Track unit</Text></TouchableOpacity>}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Details for ${props.body}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.expand}><Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.subtleGray}/></TouchableOpacity>
    </View>
    {!wide && <View style={styles.mobileSub}><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.meta}>{props.driver}</Text><Text style={styles.meta}>{props.trips} trips today</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Track ${props.body}`} onPress={props.onTrack} style={styles.action}><Ionicons name="navigate-outline" size={16} color={Colors.ink}/><Text style={styles.actionText}>Track unit</Text></TouchableOpacity></View>}
    {open && <View style={styles.detail}>
      <Pair label="Route" value={props.route}/><Pair label="Last trip" value={props.started}/><Pair label="Shift ended" value={props.ended}/><Pair label="Total trips" value={String(props.total)}/>
      {props.onDelete && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete unit ${props.body}`} onPress={props.onDelete} style={styles.delete}><Ionicons name="trash-outline" size={16} color={Colors.primaryRed}/><Text style={{ color: Colors.primaryRed, fontSize: 13 }}>Delete unit</Text></TouchableOpacity>}
    </View>}
  </View>;
}
function Pair({ label, value }: { label: string; value: string }) { return <View style={styles.pair}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles=StyleSheet.create({
  row: { backgroundColor: Colors.paper, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: Colors.border },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identity: { flex: 1.4, minWidth: 0 }, name: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  assignment: { flex: 2, minWidth: 0 }, quantity: { alignItems: 'flex-end', minWidth: 58 }, count: { fontSize: 16, fontWeight: '500', color: Colors.ink, fontVariant: ['tabular-nums'] },
  meta: { color: Colors.subtleGray, fontSize: 12, lineHeight: 18 }, value: { color: Colors.ink, fontSize: 14, lineHeight: 20 },
  status: { color: Colors.subtleGray, fontSize: 12, maxWidth: 95 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }, actionText: { color: Colors.ink, fontSize: 13, fontWeight: '500' },
  expand: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  mobileSub: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 3 },
  detail: { borderTopWidth: 1, borderColor: Colors.border, paddingTop: 16, marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  pair: { flexGrow: 1, flexBasis: 180, minWidth: 0, gap: 3 }, delete: { minHeight: 44, flexDirection: 'row', gap: 7, alignItems: 'center' },
});
