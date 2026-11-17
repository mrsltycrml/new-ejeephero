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
    <View style={{ gap: 6, flexShrink: 1, minWidth: 0, width: '100%' }}>
      {!!label && <Text style={passengerStyles.label}>{label}</Text>}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label || 'Select option'}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={[
          passengerStyles.input,
          { flexDirection: 'row', alignItems: 'center', gap: 10 },
          open && { borderColor: Colors.brandGreen, backgroundColor: Colors.paper },
          disabled && { opacity: 0.6 },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            passengerStyles.body,
            { flex: 1, minWidth: 0, fontWeight: '600', color: selectedLabel ? Colors.ink : Colors.subtleGray },
          ]}
        >
          {selectedLabel || 'Choose an option'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.subtleGray} />
      </TouchableOpacity>
      {open && (
        <ScrollView
          style={{
            maxHeight: 240,
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 12,
            backgroundColor: Colors.paper,
          }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {options.map((o) => {
            const isSelected = value === o.value;
            return (
              <TouchableOpacity
                key={o.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: o.disabled }}
                disabled={o.disabled}
                onPress={() => {
                  onSelect(o.value);
                  setOpen(false);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  minHeight: 48,
                  backgroundColor: isSelected ? Colors.paleGreen : Colors.paper,
                  opacity: o.disabled ? 0.55 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.border,
                }}
              >
                <Text
                  style={[
                    passengerStyles.body,
                    { flex: 1, fontWeight: isSelected ? '700' : '500', color: Colors.ink },
                  ]}
                >
                  {o.label}
                </Text>
                {isSelected && <Ionicons name="checkmark-circle" color={Colors.brandGreen} size={20} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

export const passengerStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.paper },
  content: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, gap: 16 },
  heroBanner: {
    backgroundColor: Colors.paper,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: Colors.brandGreen },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: Colors.ink },
  heroTitle: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: Colors.ink },
  subtitle: { fontSize: 15, lineHeight: 21, color: Colors.subtleGray, marginTop: 2 },
  heroSubtitle: { fontSize: 15, lineHeight: 21, color: Colors.subtleGray, marginTop: 2 },
  section: {
    backgroundColor: Colors.paper,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2, color: Colors.ink },
  body: { fontSize: 16, lineHeight: 22, color: Colors.ink },
  muted: { fontSize: 13, lineHeight: 19, color: Colors.subtleGray },
  label: { fontSize: 14, fontWeight: '600', color: Colors.ink },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 50,
    backgroundColor: Colors.paper,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.ink,
  },
  button: {
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandGreen,
  },
  buttonMint: {
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandGreen,
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  secondary: { backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.paleGreen,
  },
  pillDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.paleGreen,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  divider: { height: 1, backgroundColor: Colors.border },
  link: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
});
