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
          open && { borderColor: Colors.brandMint, backgroundColor: Colors.paper },
          disabled && { opacity: 0.6 },
        ]}
      >
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: selectedLabel ? Colors.ink : Colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="location" size={15} color={selectedLabel ? Colors.brandMintLight : Colors.subtleGray} />
        </View>
        <Text style={[passengerStyles.body, { flex: 1, minWidth: 0, fontWeight: '600', color: selectedLabel ? Colors.ink : Colors.subtleGray }]}>
          {selectedLabel || 'Choose a stop'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.subtleGray} />
      </TouchableOpacity>
      {open && (
        <ScrollView
          style={{
            maxHeight: 240,
            borderWidth: 1.5,
            borderColor: Colors.ink,
            borderRadius: 14,
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
                minHeight: 48,
                backgroundColor: value === o.value ? Colors.ink : Colors.paper,
                opacity: o.disabled ? 0.55 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
              }}
            >
              <Text style={[passengerStyles.body, { flex: 1, fontWeight: '700', color: value === o.value ? Colors.white : Colors.ink }]}>
                {o.label}
              </Text>
              {value === o.value && <Ionicons name="checkmark-circle" color={Colors.brandMintLight} size={20} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export const passengerStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.canvas },
  content: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: 16, paddingBottom: 42, gap: 16 },
  heroBanner: {
    backgroundColor: Colors.ink,
    borderRadius: 22,
    padding: 22,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.brandSurfaceDark,
    shadowColor: '#071A17',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
  },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.brandMint },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8, color: Colors.ink },
  heroTitle: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8, color: Colors.white },
  subtitle: { fontSize: 14, lineHeight: 20, color: Colors.subtleGray, marginTop: 3 },
  heroSubtitle: { fontSize: 14, lineHeight: 20, color: '#A7F3D0', marginTop: 2 },
  section: {
    backgroundColor: Colors.paper,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
    shadowColor: '#071A17',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, color: Colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: Colors.ink },
  muted: { fontSize: 13, lineHeight: 19, color: Colors.subtleGray },
  label: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    minHeight: 50,
    backgroundColor: Colors.sand,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink,
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.ink,
  },
  buttonMint: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandMint,
  },
  buttonText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  secondary: { backgroundColor: Colors.sand, borderWidth: 1.5, borderColor: Colors.border },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.sand,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.brandSurfaceDark,
    borderWidth: 1,
    borderColor: '#1E463E',
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  divider: { height: 1, backgroundColor: Colors.border },
  link: { fontSize: 13, fontWeight: '800', color: Colors.brandMint },
});
