import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

interface RouteComingSoonScreenProps {
  visible: boolean;
  onClose: () => void;
  routeName?: string;
}

const NOTIFY_STORAGE_KEY = '@ejeephero_route2_notify';

const PLANNED_ROUTE_2_STOPS = [
  { name: 'One Ayala Public Transport Hub', tag: 'Main eSakay Terminal · CCTV + Lighting' },
  { name: 'Paseo de Roxas / Ayala Triangle Stop', tag: 'CBD Loading Bay · CCTV Monitored' },
  { name: 'PBCom Tower / RCBC Plaza Stop', tag: 'Ayala Ave Corridor · Well-Lit Stop' },
  { name: 'Maysilo Circle / Makati City Hall', tag: 'Civic Center Transfer Point' },
  { name: 'Chino Roces / Gil Puyat Ave Hub', tag: 'Intermodal eSakay Hub' },
  { name: 'Circuit Makati Transport Terminal', tag: 'Northern Loop Endpoint · Staffed Hub' },
];

export default function RouteComingSoonScreen({
  visible,
  onClose,
  routeName = 'Route 2: Coming soon',
}: RouteComingSoonScreenProps) {
  const [notifyEnabled, setNotifyEnabled] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIFY_STORAGE_KEY)
      .then((val) => setNotifyEnabled(val === 'true'))
      .catch(() => {});
  }, []);

  const toggleNotify = async () => {
    const next = !notifyEnabled;
    setNotifyEnabled(next);
    try {
      await AsyncStorage.setItem(NOTIFY_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage error
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.comingSoonPill}>
              <Ionicons name="sparkles" size={14} color={Colors.primaryYellow} />
              <Text style={styles.comingSoonPillText}>ROUTE 2 · COMING SOON</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.heroCard}>
              <View style={styles.iconCircle}>
                <Ionicons name="bus" size={36} color={Colors.primaryRed} />
              </View>
              <Text style={styles.routeTitle}>{routeName}</Text>
              <Text style={styles.routeSubtitle}>
                eSAKAY's second modernized electric jeepney corridor is currently being prepared for live GPS telemetry and commuter dispatch.
              </Text>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>6+</Text>
                  <Text style={styles.statLabel}>Planned Stops</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>₱15.00</Text>
                  <Text style={styles.statLabel}>Target Base Fare</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>20%</Text>
                  <Text style={styles.statLabel}>Student/PWD/Sr</Text>
                </View>
              </View>
            </View>

            {/* Planned Features */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>What's Coming on Route 2</Text>
              <View style={styles.featureRow}>
                <Ionicons name="navigate-circle" size={22} color={Colors.primaryRed} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>Cloudflare R2 High-Res Route Geometry</Text>
                  <Text style={styles.featureDesc}>
                    Full street-level polyline caching for instant offline and online map rendering.
                  </Text>
                </View>
              </View>
              <View style={styles.featureRow}>
                <Ionicons name="shield-checkmark" size={22} color="#2E7D32" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>Verified Safe Night Stops</Text>
                  <Text style={styles.featureDesc}>
                    CCTV-monitored and well-lit loading bays for late-night commuters between 8 PM and 5 AM.
                  </Text>
                </View>
              </View>
              <View style={styles.featureRow}>
                <Ionicons name="calculator" size={22} color={Colors.navy} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>Walk & Save Fare Optimization</Text>
                  <Text style={styles.featureDesc}>
                    Automatic LTFRB quarter-peso fare calculation and nearby stop savings tips.
                  </Text>
                </View>
              </View>
            </View>

            {/* Planned Stops Timeline */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Preview of Planned Stops</Text>
              {PLANNED_ROUTE_2_STOPS.map((stop, index) => (
                <View key={stop.name} style={styles.stopRow}>
                  <View style={styles.timelineCol}>
                    <View style={styles.stopDot} />
                    {index < PLANNED_ROUTE_2_STOPS.length - 1 && <View style={styles.stopLine} />}
                  </View>
                  <View style={styles.stopInfo}>
                    <Text style={styles.stopName}>{stop.name}</Text>
                    <Text style={styles.stopTag}>{stop.tag}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Notify Me CTA */}
            <TouchableOpacity
              style={[styles.notifyButton, notifyEnabled && styles.notifyButtonActive]}
              onPress={toggleNotify}
            >
              <Ionicons
                name={notifyEnabled ? 'notifications' : 'notifications-outline'}
                size={20}
                color={Colors.white}
              />
              <Text style={styles.notifyButtonText}>
                {notifyEnabled
                  ? 'You Will Be Notified When Route 2 Launches!'
                  : 'Notify Me When Route 2 Launches'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backToRoute1Btn} onPress={onClose}>
              <Text style={styles.backToRoute1Text}>Back to Route 1 (Active)</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.offWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  header: {
    backgroundColor: Colors.navy,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  comingSoonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  comingSoonPillText: {
    color: Colors.primaryYellow,
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  heroCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  routeTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.darkText,
    textAlign: 'center',
  },
  routeSubtitle: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 18,
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: Colors.offWhite,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primaryRed,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.darkText,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.darkText,
  },
  featureDesc: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
    marginTop: 2,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineCol: {
    width: 24,
    alignItems: 'center',
  },
  stopDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: Colors.navy,
    backgroundColor: Colors.white,
    marginTop: 3,
  },
  stopLine: {
    width: 2,
    height: 28,
    backgroundColor: Colors.border,
  },
  stopInfo: {
    flex: 1,
    paddingBottom: 10,
  },
  stopName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.darkText,
  },
  stopTag: {
    fontSize: 12,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  notifyButton: {
    backgroundColor: Colors.ink,
    borderRadius: 8,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  notifyButtonActive: {
    backgroundColor: '#2E7D32',
  },
  notifyButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  backToRoute1Btn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backToRoute1Text: {
    color: Colors.navy,
    fontSize: 14,
    fontWeight: '700',
  },
});
