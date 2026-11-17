import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type Message = { role: 'user' | 'assistant'; content: string };

export default function HeroBotScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const SUGGESTIONS = [
    'Where do I board at MRT Buendia?',
    'Operating hours',
    'Student discount',
    'Route 1 stops',
    'How does Emergency SOS work?',
  ];
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Use the marked loading bay near the station exit. Check the map in ejeephero to confirm the stop before boarding.',
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
        { role: 'assistant', content: 'ejeepherobot is unavailable right now. Please try again shortly.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.helperStrip}>
        <Text style={styles.helperStripText}>Commuter assistant · Ask about routes, stops and using ejeephero.</Text>
      </View>

      <ScrollView
        style={styles.chatArea}
        contentContainerStyle={{ padding: 20, paddingBottom: 26, width: '100%', maxWidth: 680, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg, i) => (
          <View
            key={i}
            style={[
              styles.bubbleContainer,
              msg.role === 'user' ? styles.userBubbleContainer : styles.botBubbleContainer,
            ]}
          >
            {msg.role === 'assistant' && (
              <View style={styles.botIcon}>
                <Ionicons name="chatbubble-outline" size={16} color={Colors.brandGreen} />
              </View>
            )}
            <View style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.botBubble]}>
              <Text style={msg.role === 'user' ? styles.userText : styles.botText}>{msg.content}</Text>
            </View>
          </View>
        ))}
        {loading && (
          <View style={styles.loadingBubble}>
            <ActivityIndicator size="small" color={Colors.brandGreen} />
            <Text style={styles.loadingText}>Thinking…</Text>
          </View>
        )}
      </ScrollView>

      {/* Suggestion Chips */}
      <View style={styles.suggestionsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsContainer}
        >
          {SUGGESTIONS.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionChip}
              onPress={() => sendMessage(suggestion)}
              disabled={loading}
              accessibilityRole="button"
            >
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.inputContainer, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask ejeepherobot..."
          placeholderTextColor={Colors.subtleGray}
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
          accessibilityLabel="Message ejeepherobot"
          maxLength={2000}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={[styles.sendButton, (loading || !input.trim()) && { opacity: 0.45 }]}
          onPress={() => sendMessage()}
          disabled={loading || !input.trim()}
        >
          <Ionicons name="arrow-up" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  helperStrip: {
    backgroundColor: Colors.canvas,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  helperStripText: {
    fontSize: 13,
    color: Colors.subtleGray,
    fontWeight: '500',
  },
  chatArea: { flex: 1 },
  bubbleContainer: {
    flexDirection: 'row',
    marginBottom: 14,
    alignItems: 'flex-start',
    maxWidth: '100%',
    minWidth: 0,
  },
  userBubbleContainer: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  botBubbleContainer: { alignSelf: 'flex-start', justifyContent: 'flex-start' },
  botIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.paleGreen,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  bubble: {
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  userBubble: {
    backgroundColor: Colors.paleGreen,
    borderWidth: 1,
    borderColor: Colors.brandGreen,
  },
  botBubble: {
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userText: { color: Colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '500' },
  botText: { color: Colors.ink, fontSize: 15, lineHeight: 21 },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.canvas,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginLeft: 38,
    gap: 8,
  },
  loadingText: { fontSize: 14, color: Colors.subtleGray },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.paper,
    borderTopWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 48,
    backgroundColor: Colors.paper,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.ink,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    backgroundColor: Colors.brandGreen,
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsWrapper: {
    backgroundColor: Colors.paper,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  suggestionsContainer: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: 'row',
  },
  suggestionChip: {
    minHeight: 38,
    backgroundColor: Colors.canvas,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
});
