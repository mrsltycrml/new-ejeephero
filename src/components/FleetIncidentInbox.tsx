import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { passengerStyles as s } from './PassengerUI';
import { Badge, type BadgeTone } from './ui/Badge';
import { color, radius, tapTarget } from '../constants/theme';
import { advanceFleetIncident, loadFleetIncidents, type FleetIncident, type FleetIncidentStatus } from '../services/fleetIncidents';

const nextStatus = { open: 'acknowledged', acknowledged: 'dispatched', dispatched: 'resolved' } as const;

const statusTone: Record<FleetIncidentStatus, BadgeTone> = {
  open: 'danger',
  acknowledged: 'warning',
  dispatched: 'info',
  resolved: 'success',
};

export default function FleetIncidentInbox() {
  const { t, i18n } = useTranslation();
  const [incidents, setIncidents] = useState<FleetIncident[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const writing = useRef(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    let pending = false;
    const read = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await loadFleetIncidents();
        if (active) { setIncidents(next); setLoadFailed(false); }
      } catch {
        if (active) setLoadFailed(true);
      } finally { pending = false; }
    };
    void read();
    const timer = setInterval(() => void read(), 10_000);
    return () => { active = false; clearInterval(timer); };
  }, [refresh]));

  const update = async (id: string, status: Exclude<FleetIncidentStatus, 'open'>) => {
    if (writing.current) return;
    writing.current = true;
    setUpdating(id);
    setActionFailed(false);
    try { await advanceFleetIncident(id, status); }
    catch { setActionFailed(true); }
    finally { writing.current = false; setUpdating(null); setRefresh(n => n + 1); }
  };

  return <View style={s.section}>
    <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.incident.inboxTitle')}</Text>
    {loadFailed ? <Text accessibilityRole="alert" style={s.body}>{t('passenger.incident.inboxUnavailable')}</Text>
      : !incidents?.length && <Text style={s.muted}>{t(incidents ? 'passenger.incident.inboxEmpty' : 'passenger.incident.inboxLoading')}</Text>}
    {actionFailed && <Text accessibilityRole="alert" style={s.body}>{t('passenger.incident.updateUnconfirmed')}</Text>}
    {incidents?.map(incident => {
      const next = incident.status === 'resolved' ? undefined : nextStatus[incident.status];
      const unit = [incident.vehicle_body_number, incident.vehicle_plate].filter(Boolean).join(' · ') || incident.vehicle_id;
      const captured = new Date(incident.captured_at).toLocaleString(i18n.language, { timeZone: 'Asia/Manila' });
      return <View key={incident.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={[s.label, styles.cardTitle]}>{t(`passenger.incident.${incident.incident_type}`)}</Text>
          <Badge label={t(`passenger.incident.${incident.status}`)} tone={statusTone[incident.status]} />
        </View>
        <Text style={s.body}>{unit ?? t('passenger.incident.locationOnly')}</Text>
        <Text selectable style={s.body}>{incident.latitude.toFixed(6)}, {incident.longitude.toFixed(6)}
          {incident.gps_accuracy_meters === null ? '' : ` · ±${Math.round(incident.gps_accuracy_meters)} m`}</Text>
        <Text style={s.muted}>{captured}</Text>
        {next && <TouchableOpacity accessibilityRole="button" accessibilityState={{ busy: updating === incident.id, disabled: updating !== null || loadFailed }}
          disabled={updating !== null || loadFailed} onPress={() => void update(incident.id, next)} style={styles.action}>
          <Text style={s.label}>{t(`passenger.incident.action_${next}`)}</Text>
        </TouchableOpacity>}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    backgroundColor: color.paper,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { flex: 1, minWidth: 0 },
  action: {
    alignSelf: 'flex-start',
    minHeight: tapTarget,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    backgroundColor: color.sand,
  },
});
