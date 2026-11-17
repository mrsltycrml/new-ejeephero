import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

export function PassengerSelect({
  label,
  value,
  options,
  onSelect,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label;
  return (
    <View style={{ gap: 7, flexShrink: 1, minWidth: 0, width: '100%' }}>
      <Text style={passengerStyles.label}>{label}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={[
          passengerStyles.input,
          { flexDirection: 'row', alignItems: 'center', gap: 10 },
          open && { borderColor: Colors.ink, backgroundColor: Colors.paper },
          disabled && { opacity: 0.6 },
        ]}
      >
        <Ionicons name="location-outline" size={18} color={selectedLabel ? Colors.ink : Colors.subtleGray} />
        <Text style={[passengerStyles.body, { flex: 1, minWidth: 0, color: selectedLabel ? Colors.ink : Colors.subtleGray }]}>
          {selectedLabel || 'Choose a stop'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={Colors.subtleGray} />
      </TouchableOpacity>
      {open && (
        <ScrollView
          style={{
            maxHeight: 230,
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 10,
            backgroundColor: Colors.paper,
          }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {options.map((o) => (
            <TouchableOpacity
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: value === o.value, disabled: o.disabled }}
              disabled={o.disabled}
              onPress={() => {
                onSelect(o.value);
                setOpen(false);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 13,
                minHeight: 46,
                backgroundColor: value === o.value ? Colors.sand : Colors.paper,
                opacity: o.disabled ? 0.55 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
              }}
            >
              <Text style={[passengerStyles.body, { flex: 1, fontWeight: value === o.value ? '600' : '400' }]}>
                {o.label}
              </Text>
              {value === o.value && <Ionicons name="checkmark-circle" color={Colors.ink} size={19} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export const passengerStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.canvas },
  content: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: 18, paddingBottom: 36, gap: 18 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: Colors.subtleGray },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.7, color: Colors.ink },
  subtitle: { fontSize: 14, lineHeight: 20, color: Colors.subtleGray, marginTop: 4 },
  section: {
    backgroundColor: Colors.paper,
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2, color: Colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: Colors.ink },
  muted: { fontSize: 13, lineHeight: 19, color: Colors.subtleGray },
  label: { fontSize: 13, fontWeight: '600', color: Colors.ink },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    backgroundColor: Colors.sand,
    fontSize: 15,
    color: Colors.ink,
  },
  button: {
    minHeight: 46,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.ink,
  },
  buttonText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  secondary: { backgroundColor: Colors.sand, borderWidth: 1, borderColor: Colors.border },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.sand,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  divider: { height: 1, backgroundColor: Colors.border },
  link: { fontSize: 13, fontWeight: '700', color: Colors.ink },
});
