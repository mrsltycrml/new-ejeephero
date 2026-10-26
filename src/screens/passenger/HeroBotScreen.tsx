import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type Message = { role: 'user' | 'assistant'; content: string };

export default function HeroBotScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const SUGGESTIONS = [
    t('herobot.suggestionMakatiLoop'),
    t('herobot.suggestionFareInfo'),
    t('herobot.suggestionNearestTerminal'),
    t('herobot.suggestionOperatingHours'),
    t('herobot.suggestionActiveJeeps')
  ];
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t('herobot.greeting') }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (textToSend?: any) => {
    const messageContent = typeof textToSend === 'string' ? textToSend : input;
    if (!messageContent.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: messageContent };
    setMessages(prev => [...prev, userMsg]);
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
      if (!data.reply) throw new Error('No reply received from esakaybot.');

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'esakaybot is unavailable right now. Please try again shortly.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView
        style={styles.chatArea}
        contentContainerStyle={{ padding: 18, paddingBottom: 26, width: '100%', maxWidth: 900, alignSelf: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg, i) => (
          <View key={i} style={[styles.bubbleContainer, msg.role === 'user' ? styles.userBubbleContainer : styles.botBubbleContainer]}>
            {msg.role === 'assistant' && (
              <View style={styles.botIcon}>
                <Ionicons name="chatbubble-ellipses" size={15} color={Colors.navy} />
              </View>
            )}
            <View style={[
              styles.bubble,
              msg.role === 'user' ? styles.userBubble : styles.botBubble
            ]}>
              <Text style={msg.role === 'user' ? styles.userText : styles.botText}>
                {msg.content}
              </Text>
            </View>
          </View>
        ))}
        {loading && (
          <View style={styles.loadingBubble}>
            <ActivityIndicator size="small" color={Colors.primaryRed} />
            <Text style={styles.loadingText}>{t('herobot.thinking')}</Text>
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

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={t('herobot.inputPlaceholder')}
          placeholderTextColor="#888"
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
          accessibilityLabel="Message esakaybot"
          maxLength={2000}
        />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send message" style={[styles.sendButton, (loading || !input.trim()) && { opacity: 0.45 }]} onPress={() => sendMessage()} disabled={loading || !input.trim()}>
          <Ionicons name="send" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  chatArea: { flex: 1 },
  bubbleContainer: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end', maxWidth: '100%', minWidth: 0 },
  userBubbleContainer: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  botBubbleContainer: { alignSelf: 'flex-start', justifyContent: 'flex-start' },
  botIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.mutedBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubble: {
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  userBubble: {
    backgroundColor: Colors.navy,
    borderBottomRightRadius: 2,
    borderWidth: 1,
    borderColor: Colors.navy
  },
  botBubble: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 3,
    borderWidth: 1,
    borderColor: Colors.border
  },
  userText: { color: Colors.white, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  botText: { color: Colors.darkText, fontSize: 15, lineHeight: 20 },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginLeft: 36,
    gap: 8,
  },
  loadingText: { fontSize: 14, color: '#53666A' },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.offWhite,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 10,
    fontSize: 15,
    color: Colors.darkText,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    backgroundColor: Colors.ink,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsWrapper: {
    backgroundColor: Colors.white,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  suggestionsContainer: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  suggestionChip: {
    minHeight: 44,
    backgroundColor: Colors.offWhite,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: {
    color: Colors.darkText,
    fontSize: 14,
    fontWeight: '600',
  }
});
