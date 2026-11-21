import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { transitStyles } from '../constants/transitStyles';

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
        accessibilityValue={{ text: selectedLabel || 'Choose an option' }}
        accessibilityState={{ expanded: open && !disabled, disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={[
          passengerStyles.input,
          { flexDirection: 'row', alignItems: 'center', gap: 10 },
          open && { borderColor: Colors.brandGreen },
          disabled && { opacity: 0.6 },
        ]}
      >
        <Text
          style={[
            passengerStyles.body,
            { flex: 1, minWidth: 0, fontWeight: '600', color: selectedLabel ? Colors.ink : Colors.subtleGray },
          ]}
        >
          {selectedLabel || 'Choose an option'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.subtleGray} />
      </TouchableOpacity>
      {open && !disabled && (
        <ScrollView
          style={{
            maxHeight: 240,
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 10,
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
                {isSelected && <Ionicons aria-hidden name="checkmark-circle" color={Colors.brandGreen} size={20} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

export const passengerStyles = StyleSheet.create({
  screen: transitStyles.page,
  content: { ...transitStyles.content, maxWidth: 920 },
  heroBanner: transitStyles.masthead,
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: Colors.action },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.95, color: Colors.ink },
  heroTitle: transitStyles.heading,
  subtitle: { fontSize: 15, lineHeight: 21, color: Colors.subtleGray, marginTop: 2 },
  heroSubtitle: transitStyles.description,
  section: {
    ...transitStyles.panel,
    padding: 18,
    gap: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.45, color: Colors.ink },
  body: { fontSize: 16, lineHeight: 22, color: Colors.ink },
  muted: { fontSize: 14, lineHeight: 20, color: Colors.subtleGray },
  label: { fontSize: 14, fontWeight: '600', color: Colors.ink },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 50,
    backgroundColor: Colors.paper,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.ink,
  },
  button: transitStyles.primaryButton,
  buttonMint: transitStyles.primaryButton,
  buttonText: transitStyles.primaryText,
  selected: transitStyles.selected,
  selectedText: transitStyles.selectedText,
  secondary: { backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.actionTint,
  },
  pillDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.actionTint,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  divider: { height: 1, backgroundColor: Colors.border },
  link: { fontSize: 14, fontWeight: '700', color: Colors.brandGreen },
});
