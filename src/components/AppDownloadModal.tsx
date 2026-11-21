import { Trans, useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { APK_DOWNLOAD_URL } from '../services/r2StorageService';
import { BottomSheetModal } from './AppUI';

interface AppDownloadModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AppDownloadModal({ visible, onClose }: AppDownloadModalProps) {
  const { t } = useTranslation();
  const [downloadError, setDownloadError] = useState('');
  const close = () => {
    setDownloadError('');
    onClose();
  };
  const handleDownloadApk = async () => {
    setDownloadError('');
    try {
      await Linking.openURL(APK_DOWNLOAD_URL);
    } catch {
      setDownloadError(t('passenger.install.failed'));
    }
  };

  return (
    <BottomSheetModal visible={visible} onClose={close} maxWidth={520}
      sheetStyle={styles.sheet} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>{t('passenger.install.title')}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.install.close')} onPress={close} style={styles.close}>
          <Ionicons name="close" color={Colors.onDark} size={24} />
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Ionicons aria-hidden name="logo-android" size={22} color={Colors.ink} />
            <Text accessibilityRole="header" style={styles.sectionTitle}>Android</Text>
          </View>
          <Text style={styles.description}>{t('passenger.install.androidHelp')}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={handleDownloadApk} style={styles.download}>
            <Text style={styles.downloadText}>{t('passenger.install.download')}</Text>
            <Ionicons aria-hidden name="download-outline" size={20} color={Colors.onDark} />
          </TouchableOpacity>
          {!!downloadError && <Text accessibilityRole="alert" style={styles.error}>{downloadError}</Text>}
        </View>
        <View style={[styles.section, styles.ios]}>
          <View style={styles.sectionHeading}>
            <Ionicons aria-hidden name="logo-apple" size={22} color={Colors.ink} />
            <Text accessibilityRole="header" style={styles.sectionTitle}>iPhone</Text>
          </View>
          <Text style={styles.description}>
            <Trans i18nKey="passenger.install.safari" components={{ menu: <Text style={styles.menuItem} /> }} />
          </Text>
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 0 },
  content: { gap: 0 },
  header: { backgroundColor: Colors.midnight, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12, paddingLeft: 24, paddingRight: 12, paddingVertical: 10 },
  title: { flex: 1, fontSize: 24, fontWeight: '800', letterSpacing: -0.7, color: Colors.onDark },
  close: { alignItems: 'center', justifyContent: 'center', width: 48, minHeight: 48 },
  body: { paddingHorizontal: 24, paddingTop: 22, gap: 22 },
  section: { gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.ink },
  ios: { borderTopWidth: 1, borderColor: Colors.border, paddingTop: 20 },
  description: { fontSize: 15, lineHeight: 22, color: Colors.subtleGray },
  menuItem: { color: Colors.ink, fontWeight: '700' },
  download: { minHeight: 50, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: Colors.action },
  downloadText: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: Colors.onDark },
  error: { color: Colors.primaryRed, fontSize: 14, lineHeight: 20 },
});
