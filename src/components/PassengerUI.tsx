import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

export function PassengerSelect({ label, value, options, onSelect, disabled = false }: { label: string; value: string; options: { value: string; label: string; disabled?: boolean }[]; onSelect: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  return <View style={{ gap: 7, flexShrink: 1, minWidth: 0, width: '100%' }}>
    <Text style={passengerStyles.label}>{label}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(!open)} style={[passengerStyles.input, { flexDirection: 'row', alignItems: 'center', gap: 10 }, disabled && { opacity: 0.6 }]}>
      <Text style={[passengerStyles.body, { flex: 1, minWidth: 0 }]}>{options.find(o => o.value === value)?.label || 'Choose a stop'}</Text><Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={Colors.subtleGray} />
    </TouchableOpacity>
    {open && <ScrollView style={{ maxHeight: 225, borderWidth: 1, borderColor: Colors.border, borderRadius: 6 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {options.map(o => <TouchableOpacity key={o.value} accessibilityRole="button" accessibilityState={{ selected: value === o.value, disabled: o.disabled }} disabled={o.disabled} onPress={() => { onSelect(o.value); setOpen(false); }} style={{ padding: 13, minHeight: 44, backgroundColor: value === o.value ? Colors.sand : Colors.paper, opacity: o.disabled ? 0.55 : 1, flexDirection: 'row', gap: 8 }}><Text style={[passengerStyles.body, { flex: 1 }]}>{o.label}</Text>{value === o.value && <Ionicons name="checkmark" color={Colors.ink} size={18} />}</TouchableOpacity>)}
    </ScrollView>}
  </View>;
}

export const passengerStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.canvas },
  content: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: 20, paddingBottom: 32, gap: 24 },
  title: { fontSize: 24, fontWeight: '600', color: Colors.ink },
  subtitle: { fontSize: 14, lineHeight: 21, color: Colors.subtleGray, marginTop: 5 },
  section: { backgroundColor: Colors.paper, padding: 20, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: Colors.ink },
  muted: { fontSize: 13, lineHeight: 20, color: Colors.subtleGray },
  label: { fontSize: 13, fontWeight: '600', color: Colors.ink },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 13, paddingVertical: 12, minHeight: 46, backgroundColor: Colors.paper, fontSize: 15, color: Colors.ink },
  button: { minHeight: 44, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.ink },
  buttonText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  secondary: { backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  divider: { height: 1, backgroundColor: Colors.border },
  link: { fontSize: 13, fontWeight: '600', color: Colors.ink },
});
