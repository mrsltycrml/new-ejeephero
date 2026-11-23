import { useTranslation } from 'react-i18next';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color, radius, tapTarget, type } from '../constants/theme';
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
      style={[passengerStyles.input, { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: tapTarget, flexShrink: 1 },
        selected && passengerStyles.selected, (disabled || o.disabled) && { opacity: 0.55 }]}>
      <Text style={[passengerStyles.label, { flexShrink: 1 }, selected && passengerStyles.selectedText]}>{o.label}</Text>
      {selected && <Ionicons aria-hidden name="checkmark" size={16} color={color.ink} />}
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
          open && { borderColor: color.action },
          disabled && { opacity: 0.6 },
        ]}
      >
        <Text
          style={[
            passengerStyles.body,
            { flex: 1, minWidth: 0, fontWeight: '600', color: selectedLabel ? color.ink : color.inkMuted },
          ]}
        >
          {selectedLabel || t('passenger.select.choose')}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={color.inkMuted} />
      </TouchableOpacity>
      {open && !disabled && (
        <ScrollView
          style={{
            maxHeight: 240,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: radius.pill,
            backgroundColor: color.paper,
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
  eyebrow: { ...type.kicker, color: color.actionPressed },
  title: { ...type.display, color: color.ink },
  heroTitle: transitStyles.heading,
  subtitle: { fontSize: 15, lineHeight: 22, color: color.inkMuted, marginTop: 2 },
  heroSubtitle: transitStyles.description,
  section: {
    ...transitStyles.panel,
    padding: 18,
    gap: 12,
  },
  sectionTitle: { ...type.title, color: color.ink },
  body: { ...type.body, fontSize: 16, lineHeight: 22, color: color.ink },
  muted: { fontSize: 14, lineHeight: 20, color: color.inkMuted },
  label: { ...type.label, color: color.ink },
  input: {
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: tapTarget,
    backgroundColor: color.paper,
    fontSize: 16,
    fontWeight: '500',
    color: color.ink,
  },
  button: transitStyles.primaryButton,
  buttonMint: transitStyles.primaryButton,
  buttonText: transitStyles.primaryText,
  selected: transitStyles.selected,
  selectedText: transitStyles.selectedText,
  secondary: { backgroundColor: color.paper, borderWidth: 1, borderColor: color.border },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: color.actionTint,
  },
  pillDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: color.actionTint,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  divider: { height: 1, backgroundColor: color.border },
  link: { fontSize: 14, fontWeight: '700', color: color.action },
});
