import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from './AppUI';
import { passengerStyles as s } from './PassengerUI';
import { color, radius, tapTarget } from '../constants/theme';
import { requestEmergencyFix } from '../services/emergencyLocation';
import { reportFleetIncident, type FleetIncidentType } from '../services/fleetIncidents';
import type { PassengerFix } from '../services/passengerSafety';

type Draft = { kind: FleetIncidentType; requestId: string; vehicleId?: string };

const kinds = [
  { kind: 'accident' as const, icon: 'warning-outline' as const },
  { kind: 'breakdown' as const, icon: 'construct-outline' as const },
];

export default function FleetIncidentReporter({ vehicleId }: { vehicleId?: string }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const sending = useRef(false);
  const active = useRef(true);
  const sharedFix = useRef<PassengerFix | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const submit = async () => {
    if (!draft || sending.current) return;
    sending.current = true;
    setBusy(true);
    setFeedback('');
    try {
      const fix = sharedFix.current ?? await requestEmergencyFix();
      if (!active.current) return;
      if (!fix) { setFeedback('locationUnavailable'); return; }
      sharedFix.current = fix;
      const result = await reportFleetIncident(draft.requestId, draft.kind, fix, draft.vehicleId);
      if (active.current) {
        sharedFix.current = null;
        if (result.status === 'locationRequired') { setFeedback('locationExpired'); return; }
        setDraft(null);
        setFeedback(result.vehicleId ? 'submitted' : 'submittedWithoutUnit');
      }
    } catch {
      if (active.current) setFeedback('submitUnconfirmed');
    } finally {
      sending.current = false;
      if (active.current) setBusy(false);
    }
  };
  const close = () => {
    if (!sending.current) { sharedFix.current = null; setDraft(null); setFeedback(''); }
  };
  const feedbackLine = feedback ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.body}>
    {t(`passenger.incident.${feedback}`)}
  </Text> : null;

  return <View style={s.section}>
    <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.incident.reportTitle')}</Text>
    <Text style={s.body}>{t('passenger.incident.reportHint')}</Text>
    <View style={styles.list}>
      {kinds.map(({ kind, icon }, index) => <TouchableOpacity key={kind} accessibilityRole="button"
        onPress={() => { setFeedback(''); setDraft({ kind, requestId: randomUUID(), vehicleId }); }}
        style={[styles.row, index > 0 && styles.rowRule]}>
        <Ionicons aria-hidden name={icon} size={22} color={color.ember} />
        <Text style={[s.label, styles.rowLabel]}>{t(`passenger.incident.${kind}`)}</Text>
        <Ionicons aria-hidden name="chevron-forward" size={18} color={color.inkMuted} />
      </TouchableOpacity>)}
    </View>
    {!draft && feedbackLine}
    <BottomSheetModal visible={draft !== null} onClose={close}>
      {draft && <>
        <Text accessibilityRole="header" style={s.sectionTitle}>{t(`passenger.incident.${draft.kind}`)}</Text>
        <Text style={s.body}>{t(draft.vehicleId ? 'passenger.incident.shareVehicle' : 'passenger.incident.shareLocation')}</Text>
        {feedbackLine}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy}
          onPress={() => void submit()} style={s.button}>
          <Text style={s.buttonText}>{t(busy ? 'passenger.incident.sending' : 'passenger.incident.send')}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={close} style={[s.button, s.secondary]}>
          <Text style={s.label}>{t(sharedFix.current ? 'passenger.incident.close' : 'passenger.safety.cancel')}</Text>
        </TouchableOpacity>
      </>}
    </BottomSheetModal>
  </View>;
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: color.border, borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.paper },
  row: { minHeight: tapTarget, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  rowLabel: { flex: 1, minWidth: 0 },
});
