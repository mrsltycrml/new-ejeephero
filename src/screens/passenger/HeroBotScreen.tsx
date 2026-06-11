import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  '🗺️ Makati Loop Route',
  '💵 How much is the fare?',
  '📍 Where is the nearest terminal?',
  '🕒 What are the operating hours?',
  '⚡ Are e-Jeepneys active now?'
];

export default function HeroBotScreen() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Kumusta! I am HeroBot, your e-Jeepney AI assistant. 🚌\n\nAsk me about routes, terminals, or fares in Makati!' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (textToSend?: any) => {
    const messageContent = typeof textToSend === 'string' ? textToSend : input;
    if (!messageContent.trim()) return;
    
    const userMsg: Message = { role: 'user', content: messageContent };
    setMessages(prev => [...prev, userMsg]);
    if (typeof textToSend !== 'string') {
      setInput('');
    }
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not logged in');

      const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/herobot-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          message: userMsg.content,
          history: messages.slice(1) // exclude initial greeting
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'API Error');
      if (!data.reply) throw new Error('No reply received from HeroBot.');

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (error: any) {
      const errMsg = error?.message || 'Unknown error';
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong: ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView 
        style={styles.chatArea} 
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg, i) => (
          <View key={i} style={[styles.bubbleContainer, msg.role === 'user' ? styles.userBubbleContainer : styles.botBubbleContainer]}>
            {msg.role === 'assistant' && (
              <View style={styles.botIcon}>
                <Text style={styles.botIconText}>🤖</Text>
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
            <Text style={styles.loadingText}>HeroBot is thinking...</Text>
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
          placeholder="Ask about routes, fares, terminals..."
          placeholderTextColor="#888"
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage()} disabled={loading || !input.trim()}>
          <Ionicons name="send" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  chatArea: { flex: 1 },
  bubbleContainer: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end', maxWidth: '85%' },
  userBubbleContainer: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  botBubbleContainer: { alignSelf: 'flex-start', justifyContent: 'flex-start' },
  botIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryYellow,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  botIconText: { fontSize: 14 },
  bubble: { 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderRadius: 18, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, 
    shadowRadius: 2, 
    elevation: 1 
  },
  userBubble: { 
    backgroundColor: Colors.primaryRed, 
    borderBottomRightRadius: 2, 
    borderWidth: 1,
    borderColor: Colors.primaryRed
  },
  botBubble: { 
    backgroundColor: Colors.white, 
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#E8DFD3'
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
    borderColor: '#E8DFD3',
    marginLeft: 36,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  inputContainer: { 
    flexDirection: 'row', 
    paddingHorizontal: 16, 
    paddingVertical: 12,
    backgroundColor: Colors.white, 
    borderTopWidth: 1, 
    borderColor: '#E8DFD3',
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
    borderColor: '#E8DFD3',
  },
  sendButton: { 
    backgroundColor: Colors.primaryRed, 
    width: 44,
    height: 44,
    borderRadius: 22, 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  suggestionsWrapper: {
    backgroundColor: Colors.white,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: '#F0E6D8',
  },
  suggestionsContainer: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  suggestionChip: {
    backgroundColor: Colors.offWhite,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8DFD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: {
    color: Colors.darkText,
    fontSize: 14,
    fontWeight: '600',
  }
});
