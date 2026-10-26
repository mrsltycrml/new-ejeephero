import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { APK_DOWNLOAD_URL } from '../services/r2StorageService';

interface AppDownloadModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AppDownloadModal({ visible, onClose }: AppDownloadModalProps) {
  const handleDownloadApk = () => {
    Linking.openURL(APK_DOWNLOAD_URL).catch(() => {});
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.headerBadge}>
              <Ionicons name="download-outline" size={20} color={Colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Get eSAKAY</Text>
              <Text style={styles.subtitle}>Choose how to use the app on your phone.</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.darkText} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {/* Android Direct APK Download */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="logo-android" size={24} color="#2E7D32" />
                <Text style={styles.cardTitle}>Android</Text>
              </View>
              <Text style={styles.cardDesc}>
                Download the app file and open it on your phone.
              </Text>
              <View style={styles.stepsList}>
                <Text style={styles.stepItem}>1. Download the Android app.</Text>
                <Text style={styles.stepItem}>2. Open the downloaded file.</Text>
                <Text style={styles.stepItem}>3. Allow "Install from this source" if prompted by Android.</Text>
              </View>
              <TouchableOpacity style={styles.apkBtn} onPress={handleDownloadApk}>
                <Ionicons name="cloud-download-outline" size={20} color={Colors.white} />
                <Text style={styles.apkBtnText}>Download Android app</Text>
              </TouchableOpacity>
            </View>

            {/* iOS Safari Add to Home Screen Guide */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="logo-apple" size={24} color={Colors.navy} />
                <Text style={styles.cardTitle}>iPhone</Text>
              </View>
              <Text style={styles.cardDesc}>
                Add the eSAKAY website to your Home Screen from Safari.
              </Text>
              <View style={styles.stepsList}>
                <Text style={styles.stepItem}>1. Open eSAKAY in Safari.</Text>
                <Text style={styles.stepItem}>2. Tap Share, then Add to Home Screen.</Text>
              </View>
              {Platform.OS === 'web' && (
                <View style={styles.webActiveBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#1B5E20" />
                  <Text style={styles.webActiveText}>
                    On iPhone, use Safari’s Share menu to add this app to your Home Screen.
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.offWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '86%',
    paddingTop: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.darkText,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.subtleGray,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.darkText,
  },
  cardDesc: {
    fontSize: 13,
    color: '#555',
    lineHeight: 19,
    marginBottom: 12,
  },
  stepsList: {
    backgroundColor: Colors.offWhite,
    borderRadius: 6,
    padding: 12,
    gap: 6,
    marginBottom: 14,
  },
  stepItem: {
    fontSize: 12,
    color: Colors.darkText,
    fontWeight: '600',
    lineHeight: 18,
  },
  apkBtn: {
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  apkBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  urlHint: {
    fontSize: 12,
    color: Colors.subtleGray,
    textAlign: 'center',
    marginTop: 8,
  },
  webActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    padding: 10,
  },
  webActiveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1B5E20',
    flex: 1,
  },
});
