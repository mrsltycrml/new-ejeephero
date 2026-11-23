import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { BottomSheetModal } from './AppUI';
import { passengerStyles as s } from './PassengerUI';
import { requestEmergencyFix } from '../services/emergencyLocation';
import { reportFleetIncident, type FleetIncidentType } from '../services/fleetIncidents';
import type { PassengerFix } from '../services/passengerSafety';

type Draft = { kind: FleetIncidentType; requestId: string; vehicleId?: string };

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
    {(['accident', 'breakdown'] as const).map(kind => <TouchableOpacity key={kind} accessibilityRole="button"
      onPress={() => { setFeedback(''); setDraft({ kind, requestId: randomUUID(), vehicleId }); }} style={[s.button, s.secondary]}>
      <Text style={s.label}>{t(`passenger.incident.${kind}`)}</Text>
    </TouchableOpacity>)}
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
