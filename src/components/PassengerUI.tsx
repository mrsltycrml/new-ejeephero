import { useTranslation } from 'react-i18next';
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
  inline = false,
  emptyLabel,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  inline?: boolean;
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label;
  const choices = (inline || open) && options.map(o => {
    const selected = o.value === value;
    return <TouchableOpacity key={o.value} accessibilityRole="button" accessibilityLabel={o.label}
      accessibilityState={{ selected, disabled: disabled || !!o.disabled }} disabled={disabled || o.disabled}
      onPress={() => { onSelect(o.value); setOpen(false); }}
      style={[passengerStyles.input, { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, flexShrink: 1 },
        selected && passengerStyles.selected, (disabled || o.disabled) && { opacity: 0.55 }]}>
      <Text style={[passengerStyles.label, { flexShrink: 1 }, selected && passengerStyles.selectedText]}>{o.label}</Text>
      {selected && <Ionicons aria-hidden name="checkmark" size={16} color={Colors.ink} />}
    </TouchableOpacity>;
  });
  return (
    <View style={{ gap: 6, flexShrink: 1, minWidth: 0, width: '100%' }}>
      {!!label && <Text style={passengerStyles.label}>{label}</Text>}
      {!options.length ? <Text accessibilityLiveRegion="polite" style={passengerStyles.muted}>{emptyLabel ?? t('passenger.select.noOptions')}</Text>
        : inline ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{choices}</View> : <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label || t('passenger.select.select')}
        accessibilityValue={{ text: selectedLabel || t('passenger.select.choose') }}
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
          {selectedLabel || t('passenger.select.choose')}
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
          keyboardShouldPersistTaps="always"
        >
          {choices}
        </ScrollView>
      )}
      </>}
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
