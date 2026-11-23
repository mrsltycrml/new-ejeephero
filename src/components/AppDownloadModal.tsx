import { Trans, useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color, type } from '../constants/theme';
import { APK_DOWNLOAD_URL } from '../services/r2StorageService';
import { Button, OverlaySheet } from './ui';

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
    <OverlaySheet visible={visible} onClose={close} title={t('passenger.install.title')} closeLabel={t('passenger.install.close')}>
      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Ionicons aria-hidden name="logo-android" size={22} color={color.ink} />
          <Text accessibilityRole="header" style={styles.sectionTitle}>Android</Text>
        </View>
        <Text style={styles.description}>{t('passenger.install.androidHelp')}</Text>
        <Button label={t('passenger.install.download')} onPress={() => { void handleDownloadApk(); }} icon="download-outline" />
        {!!downloadError && <Text accessibilityRole="alert" style={styles.error}>{downloadError}</Text>}
      </View>
      <View style={[styles.section, styles.ios]}>
        <View style={styles.sectionHeading}>
          <Ionicons aria-hidden name="logo-apple" size={22} color={color.ink} />
          <Text accessibilityRole="header" style={styles.sectionTitle}>iPhone</Text>
        </View>
        <Text style={styles.description}>
          <Trans i18nKey="passenger.install.safari" components={{ menu: <Text style={styles.menuItem} /> }} />
        </Text>
      </View>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { flex: 1, ...type.title, color: color.ink },
  ios: { borderTopWidth: 1, borderColor: color.border, paddingTop: 20 },
  description: { fontSize: 15, lineHeight: 22, color: color.inkMuted },
  menuItem: { color: color.ink, fontWeight: '700' },
  error: { color: color.ember, fontSize: 14, lineHeight: 20 },
});
