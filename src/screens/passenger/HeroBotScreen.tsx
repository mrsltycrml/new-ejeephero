import { useTranslation } from 'react-i18next';
import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { passengerStyles as s } from '../../components/PassengerUI';
import { color, radius, tapTarget } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type Message = { role: 'user' | 'assistant'; content: string };

export default function HeroBotScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const chat = useRef<React.ElementRef<typeof ScrollView>>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const SUGGESTIONS = [
    t('passenger.assistant.board'),
    t('passenger.assistant.hours'),
    t('passenger.assistant.student'),
    t('passenger.assistant.stops'),
    t('passenger.assistant.sos'),
  ];
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: t('passenger.assistant.intro'),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (textToSend?: any) => {
    const messageContent = typeof textToSend === 'string' ? textToSend : input;
    if (!messageContent.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: messageContent };
    setMessages((prev) => [...prev, userMsg]);
    if (typeof textToSend !== 'string') {
      setInput('');
    }
    setShowSuggestions(false);
    setLoading(true);

    try {
      if (!user?.id) throw new Error('Not logged in');

      const { data, error } = await supabase.functions.invoke('herobot-chat', {
        body: { message: userMsg.content, history: messages.slice(-10) },
      });
      if (error) throw error;
      if (!data.reply) throw new Error('No reply received from ejeepherobot.');

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: t('passenger.assistant.unavailable') },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView ref={chat} style={{ flex: 1 }} contentContainerStyle={[s.content, styles.column]}
        keyboardShouldPersistTaps="always" automaticallyAdjustKeyboardInsets
        onContentSizeChange={() => { if (messages.length > 1 && !showSuggestions) chat.current?.scrollToEnd({ animated: false }); }}>
        {messages.map((msg, index) => {
          const outgoing = msg.role === 'user';
          return (
            <View key={index} style={[styles.bubble, outgoing ? styles.outgoing : styles.incoming]}>
              <Text style={[s.label, outgoing ? styles.light : styles.sender]}>{outgoing ? t('passenger.assistant.you') : t('passenger.nav.assistant')}</Text>
              <Text selectable style={[s.body, outgoing && styles.light]}>{msg.content}</Text>
            </View>
          );
        })}
        {loading && <View style={styles.status}>
          <ActivityIndicator size="small" color={color.action} />
          <Text accessibilityLiveRegion="polite" style={s.muted}>{t('passenger.assistant.waiting')}</Text>
        </View>}
        {showSuggestions && <View style={s.section}>
          <Text accessibilityRole="header" style={s.sectionTitle}>{t('passenger.assistant.suggestions')}</Text>
          {SUGGESTIONS.map(question => (
            <TouchableOpacity key={question} accessibilityRole="button" onPress={() => void sendMessage(question)} disabled={loading} style={styles.question}>
              <Text style={[s.link, { flex: 1 }]}>{question}</Text>
              <Ionicons aria-hidden name="arrow-forward" size={18} color={color.action} />
            </TouchableOpacity>
          ))}
        </View>}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <View style={styles.controls}>
          {messages.length > 1 && <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.assistant.suggestions')}
            accessibilityState={{ expanded: showSuggestions, disabled: loading }} disabled={loading} style={styles.iconButton}
            onPress={() => { setShowSuggestions(!showSuggestions); if (!showSuggestions) requestAnimationFrame(() => chat.current?.scrollToEnd({ animated: false })); }}>
            <Ionicons aria-hidden name="help-circle-outline" size={24} color={color.action} />
          </TouchableOpacity>}
          <TextInput style={[s.input, { flex: 1, minWidth: 0 }]} value={input} onChangeText={setInput} placeholder={t('passenger.assistant.ask')} placeholderTextColor={color.inkMuted}
            onSubmitEditing={() => void sendMessage()} returnKeyType="send" accessibilityLabel={t('passenger.assistant.message')} maxLength={2000} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('passenger.assistant.send')} accessibilityState={{ disabled: loading || !input.trim() }}
            style={[styles.iconButton, styles.send, (loading || !input.trim()) && { opacity: 0.5 }]} onPress={() => void sendMessage()} disabled={loading || !input.trim()}>
            <Ionicons aria-hidden name="arrow-up" size={22} color={color.onDark} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: 640, gap: 12 },
  bubble: { gap: 6, padding: 14, maxWidth: '94%', borderRadius: radius.lg },
  incoming: { alignSelf: 'flex-start', backgroundColor: color.paper, borderWidth: 1, borderColor: color.border },
  outgoing: { alignSelf: 'flex-end', backgroundColor: color.ink },
  sender: { color: color.action },
  light: { color: color.onDark },
  status: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  question: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: tapTarget, paddingVertical: 8, borderTopWidth: 1, borderColor: color.border },
  composer: { backgroundColor: color.paper, borderTopWidth: 1, borderColor: color.border, paddingTop: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', maxWidth: 640, paddingHorizontal: 16, alignSelf: 'center' },
  iconButton: { width: tapTarget, height: tapTarget, alignItems: 'center', justifyContent: 'center' },
  send: { backgroundColor: color.action, borderRadius: radius.md },
});
