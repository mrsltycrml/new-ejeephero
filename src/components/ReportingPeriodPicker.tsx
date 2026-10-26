import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { currentReportingPeriod, formatReportingPeriod, weekStartKey, type ReportingPeriod } from '../utils/reportingPeriod';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value: number) => String(value).padStart(2, '0');
const MODES = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
] as const;

export default function ReportingPeriodPicker({ value, onChange, label = 'Reporting period', onExpandedChange }: {
  value: ReportingPeriod;
  onChange: (value: ReportingPeriod) => void;
  label?: string;
  onExpandedChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { onExpandedChange?.(open); }, [open, onExpandedChange]);
  const { width } = useWindowDimensions();
  const [shownYear, setShownYear] = useState(Number(value.key.slice(0, 4)));
  const [shownMonth, setShownMonth] = useState(Number(value.key.slice(5, 7)) || 1);

  useEffect(() => {
    setShownYear(Number(value.key.slice(0, 4)));
    setShownMonth(Number(value.key.slice(5, 7)) || 1);
  }, [value.key]);

  const dayCells = useMemo(() => {
    const leading = (new Date(Date.UTC(shownYear, shownMonth - 1, 1)).getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(shownYear, shownMonth, 0)).getUTCDate();
    return [...Array(leading).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)] as (number | null)[];
  }, [shownYear, shownMonth]);
  const yearPageStart = Math.floor(shownYear / 12) * 12;

  const move = (step: number) => {
    if (value.mode === 'month') { setShownYear((year) => year + step); return; }
    if (value.mode === 'year') { setShownYear((year) => year + step * 12); return; }
    const next = new Date(Date.UTC(shownYear, shownMonth - 1 + step, 1));
    setShownYear(next.getUTCFullYear());
    setShownMonth(next.getUTCMonth() + 1);
  };

  const setMode = (mode: ReportingPeriod['mode']) => {
    onChange(currentReportingPeriod(mode));
    setOpen(false);
  };
  const chooseDay = (day: number) => {
    const key = `${shownYear}-${pad(shownMonth)}-${pad(day)}`;
    onChange({ mode: value.mode, key: value.mode === 'week' ? weekStartKey(key) : key });
    setOpen(false);
  };
  const isSelectedDay = (day: number) => {
    const key = `${shownYear}-${pad(shownMonth)}-${pad(day)}`;
    return value.mode === 'week' ? weekStartKey(key) === value.key : key === value.key;
  };
  const calendarLabel = value.mode === 'year' ? 'Choose year' : value.mode === 'month' ? 'Choose month' : value.mode === 'week' ? 'Choose week' : 'Choose date';

  return <View style={styles.shell}>
    <View style={styles.topRow}>
      {width < 700 ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${calendarLabel}: ${formatReportingPeriod(value)}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(current => !current)} style={styles.compactDate}>
        <Ionicons name="calendar-outline" size={17} color={Colors.subtleGray} />
        <Text style={[styles.value, { flex: 1, marginTop: 0 }]}>{formatReportingPeriod(value)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.ink} />
      </TouchableOpacity> : <><View style={styles.titleBlock}>
        <Ionicons name="calendar-outline" size={18} color={Colors.subtleGray} />
        <View><Text style={styles.label}>{label}</Text><Text style={styles.value}>{formatReportingPeriod(value)}</Text></View>
      </View>
      <View style={[styles.actions, width < 700 && styles.actionsCompact]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={calendarLabel} accessibilityState={{ expanded: open }} onPress={() => setOpen((current) => !current)} style={styles.calendarButton}>
          <Text style={styles.calendarButtonText}>{calendarLabel}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.ink} />
        </TouchableOpacity>
      </View></>}
    </View>
    {open && <View style={[styles.calendar, width >= 700 && styles.calendarFloating]}>
      <View style={[styles.modeGroup, { marginBottom: 12 }]}>
        {MODES.map(mode => <TouchableOpacity key={mode.key} accessibilityRole="button" accessibilityState={{ selected: value.mode === mode.key }} onPress={() => setMode(mode.key)} style={[styles.modeButton, value.mode === mode.key && styles.modeActive]}><Text style={[styles.modeText, value.mode === mode.key && styles.modeTextActive]}>{mode.label}</Text></TouchableOpacity>)}
      </View>
      <View style={styles.calendarHeading}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={value.mode === 'year' ? 'Previous years' : value.mode === 'month' ? 'Previous year' : 'Previous month'} onPress={() => move(-1)} style={styles.arrow}><Ionicons name="chevron-back" size={18} color={Colors.ink} /></TouchableOpacity>
        <Text style={styles.calendarTitle}>{value.mode === 'year' ? `${yearPageStart}–${yearPageStart + 11}` : value.mode === 'month' ? shownYear : `${MONTHS[shownMonth - 1]} ${shownYear}`}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={value.mode === 'year' ? 'Next years' : value.mode === 'month' ? 'Next year' : 'Next month'} onPress={() => move(1)} style={styles.arrow}><Ionicons name="chevron-forward" size={18} color={Colors.ink} /></TouchableOpacity>
      </View>
      {(value.mode === 'day' || value.mode === 'week') ? <View style={styles.dayGrid}>
        {WEEKDAYS.map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}
        {dayCells.map((day, index) => day === null ? <View key={`blank-${index}`} style={styles.dayCell} /> : <TouchableOpacity key={`day-${day}`} accessibilityRole="button" accessibilityLabel={`${MONTHS[shownMonth - 1]} ${day}, ${shownYear}`} accessibilityState={{ selected: isSelectedDay(day) }} onPress={() => chooseDay(day)} style={[styles.dayCell, isSelectedDay(day) && styles.selectedCell]}><Text style={[styles.dayText, isSelectedDay(day) && styles.selectedText]}>{day}</Text></TouchableOpacity>)}
      </View> : value.mode === 'month' ? <View style={styles.monthGrid}>
        {MONTHS.map((month, index) => <TouchableOpacity key={month} accessibilityRole="button" accessibilityLabel={`${month} ${shownYear}`} accessibilityState={{ selected: value.key === `${shownYear}-${pad(index + 1)}` }} onPress={() => { onChange({ mode: 'month', key: `${shownYear}-${pad(index + 1)}` }); setOpen(false); }} style={[styles.monthCell, value.key === `${shownYear}-${pad(index + 1)}` && styles.selectedCell]}><Text style={[styles.dayText, value.key === `${shownYear}-${pad(index + 1)}` && styles.selectedText]}>{month}</Text></TouchableOpacity>)}
      </View> : <View style={styles.monthGrid}>
        {Array.from({ length: 12 }, (_, index) => yearPageStart + index).map((year) => <TouchableOpacity key={year} accessibilityRole="button" accessibilityLabel={String(year)} accessibilityState={{ selected: value.key === String(year) }} onPress={() => { onChange({ mode: 'year', key: String(year) }); setOpen(false); }} style={[styles.monthCell, value.key === String(year) && styles.selectedCell]}><Text style={[styles.dayText, value.key === String(year) && styles.selectedText]}>{year}</Text></TouchableOpacity>)}
      </View>}
      <TouchableOpacity accessibilityRole="button" onPress={() => { onChange(currentReportingPeriod(value.mode)); setOpen(false); }} style={styles.currentButton}><Text style={styles.currentText}>{value.mode === 'day' ? 'Go to today' : value.mode === 'week' ? 'Go to this week' : value.mode === 'month' ? 'Go to this month' : 'Go to this year'}</Text></TouchableOpacity>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  shell: { backgroundColor: Colors.paper, borderColor: Colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, zIndex: 20, overflow: 'visible' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  compactDate: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  titleBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.subtleGray },
  value: { fontSize: 15, fontWeight: '700', color: Colors.ink, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, maxWidth: '100%', minWidth: 0 },
  actionsCompact: { flexShrink: 1 },
  modeGroup: { flexDirection: 'row', gap: 3, borderRadius: 8, padding: 3, backgroundColor: Colors.offWhite },
  modeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 7 },
  modeActive: { backgroundColor: Colors.paper, shadowColor: Colors.ink, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  modeText: { color: Colors.ink, fontSize: 12, fontWeight: '600' },
  modeTextActive: { color: Colors.ink },
  calendarButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, minHeight: 44, backgroundColor: Colors.paper, borderColor: Colors.border, borderWidth: 1, borderRadius: 8 },
  calendarButtonText: { color: Colors.ink, fontSize: 12, fontWeight: '700' },
  calendar: { alignSelf: 'flex-end', width: '100%', maxWidth: 340, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  calendarFloating: { position: 'absolute', top: 56, right: 14, width: 340, marginTop: 0, padding: 14, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, backgroundColor: Colors.paper, shadowColor: Colors.ink, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },
  calendarHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calendarTitle: { color: Colors.ink, fontWeight: '600', fontSize: 15 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.sand, borderRadius: 8 },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.285%', textAlign: 'center', color: Colors.subtleGray, fontSize: 12, fontWeight: '600', paddingVertical: 7 },
  dayCell: { width: '14.285%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  dayText: { color: Colors.ink, fontSize: 12, fontWeight: '700' },
  selectedCell: { backgroundColor: Colors.ink },
  selectedText: { color: Colors.paper },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  monthCell: { width: '31%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: Colors.offWhite },
  currentButton: { alignSelf: 'flex-end', paddingVertical: 9, paddingHorizontal: 4 },
  currentText: { color: Colors.ink, fontSize: 12, fontWeight: '600' },
});
