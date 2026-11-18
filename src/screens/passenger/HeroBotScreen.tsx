import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { passengerStyles as s } from '../../components/PassengerUI';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type Message = { role: 'user' | 'assistant'; content: string };

export default function HeroBotScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const chat = useRef<React.ElementRef<typeof ScrollView>>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const SUGGESTIONS = [
    'Where do I board at MRT Buendia?',
    'Where can I check operating hours?',
    'How do I check the student fare?',
    'How do I find stops on a route?',
    'How does Emergency SOS work?',
  ];
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Ask me about using eSAKAY. Check Map for available stops and current vehicle locations, and Fare for a sourced fare quote. Missing information will be shown as unavailable.',
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
        { role: 'assistant', content: 'The commuter assistant is unavailable. Please try again shortly.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView ref={chat} style={{ flex: 1 }} contentContainerStyle={[s.content, styles.column]}
        keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
        onContentSizeChange={() => { if (messages.length > 1 && !showSuggestions) chat.current?.scrollToEnd({ animated: false }); }}>
        {messages.map((msg, index) => {
          const outgoing = msg.role === 'user';
          return (
            <View key={index} style={[styles.bubble, outgoing ? styles.outgoing : styles.incoming]}>
              <Text style={[s.label, outgoing ? styles.light : styles.sender]}>{outgoing ? 'You' : 'Commuter assistant'}</Text>
              <Text selectable style={[s.body, outgoing && styles.light]}>{msg.content}</Text>
            </View>
          );
        })}
        {loading && <View style={styles.status}>
          <ActivityIndicator size="small" color={Colors.action} />
          <Text accessibilityLiveRegion="polite" style={s.muted}>Waiting for a reply…</Text>
        </View>}
        {showSuggestions && <View style={s.section}>
          <Text accessibilityRole="header" style={s.sectionTitle}>Suggested questions</Text>
          {SUGGESTIONS.map(question => (
            <TouchableOpacity key={question} accessibilityRole="button" onPress={() => void sendMessage(question)} disabled={loading} style={styles.question}>
              <Text style={[s.link, { flex: 1 }]}>{question}</Text>
              <Ionicons aria-hidden name="arrow-forward" size={18} color={Colors.action} />
            </TouchableOpacity>
          ))}
        </View>}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <View style={styles.controls}>
          {messages.length > 1 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Suggested questions"
            accessibilityState={{ expanded: showSuggestions, disabled: loading }} disabled={loading} style={styles.iconButton}
            onPress={() => { setShowSuggestions(!showSuggestions); if (!showSuggestions) requestAnimationFrame(() => chat.current?.scrollToEnd({ animated: false })); }}>
            <Ionicons aria-hidden name="help-circle-outline" size={24} color={Colors.action} />
          </TouchableOpacity>}
          <TextInput style={[s.input, { flex: 1, minWidth: 0 }]} value={input} onChangeText={setInput} placeholder="Ask a question" placeholderTextColor={Colors.subtleGray}
            onSubmitEditing={() => void sendMessage()} returnKeyType="send" accessibilityLabel="Message the commuter assistant" maxLength={2000} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: loading || !input.trim() }}
            style={[styles.iconButton, styles.send, (loading || !input.trim()) && { opacity: 0.5 }]} onPress={() => void sendMessage()} disabled={loading || !input.trim()}>
            <Ionicons aria-hidden name="arrow-up" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: 640, gap: 12 },
  bubble: { gap: 6, padding: 14, maxWidth: '94%', borderRadius: 10 },
  incoming: { alignSelf: 'flex-start', backgroundColor: Colors.paper, borderLeftWidth: 3, borderColor: Colors.action },
  outgoing: { alignSelf: 'flex-end', backgroundColor: Colors.midnight },
  sender: { color: Colors.action },
  light: { color: Colors.onDark },
  status: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  question: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48, paddingVertical: 8, borderTopWidth: 1, borderColor: Colors.border },
  composer: { backgroundColor: Colors.paper, borderTopWidth: 1, borderColor: Colors.border, paddingTop: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', maxWidth: 640, paddingHorizontal: 16, alignSelf: 'center' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  send: { backgroundColor: Colors.action, borderRadius: 8 },
});
