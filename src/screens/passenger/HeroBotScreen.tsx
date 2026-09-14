import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { MAKATI_PRIMARY_ROUTE, MAKATI_OFFICIAL_TERMINALS } from '../../services/offlineTransitService';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  '🗺️ Buendia - Mandaluyong Route',
  '💵 Magkano ang pamasahe / Fares',
  '🛑 Mga legal na sakayan sa Makati',
  '🚨 Emergency & SOS Hotline',
  '🌙 Safe Stop Routing at night',
];

// Local Rule-Based Transit Knowledge Engine for instant/offline response (SO1)
function getOfflineTransitResponse(query: string): string | null {
  const q = query.toLowerCase();

  if (q.includes('fare') || q.includes('pamasahe') || q.includes('magkano') || q.includes('bayad') || q.includes('discount')) {
    return (
      "💵 **Official LTFRB Fare Matrix for Makati Modernized e-Jeepneys (2023):**\n\n" +
      "• **Regular Base Fare:** ₱14.00 (Unang 4 na kilometro)\n" +
      "• **Succeeding Distance:** +₱1.50 bawat sumusunod na kilometro\n" +
      "• **20% Mandatory Discount (Student, Senior Citizen, PWD):** ₱11.25 base fare, +₱1.20/km\n\n" +
      "Maaari mong subukan ang ating **Interactive Fare Calculator** sa Directory tab para makita ang eksaktong breakdown!"
    );
  }

  if (q.includes('route') || q.includes('ruta') || q.includes('buendia') || q.includes('mandaluyong')) {
    return (
      `🗺️ **${MAKATI_PRIMARY_ROUTE.name}**\n\n` +
      `• **Uri:** Modernized & Electric PJU Route\n` +
      `• **Oras ng Biyahe:** ${MAKATI_PRIMARY_ROUTE.operating_hours}\n` +
      `• **Pangunahing Daanan:** Sen. Gil Puyat (Buendia) ➔ Zodiac St. ➔ Jupiter St. ➔ Makati Avenue ➔ Lopez Drive / Estrella-Pantaleon Bridge ➔ Coronado ➔ Maysilo Circle.\n\n` +
      "Lahat ng unit ay equipped with real-time GPS tracking at passenger capacity sensors!"
    );
  }

  if (q.includes('sakayan') || q.includes('stop') || q.includes('terminal') || q.includes('babaan') || q.includes('legal') || q.includes('bays')) {
    const stopsList = MAKATI_OFFICIAL_TERMINALS.map((t, i) => `${i + 1}. **${t.name}** ${t.is_esakay_hub ? '⚡ (e-Sakay Hub)' : ''}`).join('\n');
    return (
      "🛑 **Official Designated Makati Loading / Unloading Bays:**\n\n" +
      stopsList + "\n\n" +
      "⚠️ Paalala: Ang pagsakay sa labas ng mga itinakdang bays ay illegal (No Loading Area) at may kaukulang multa sa ilalim ng Makati Traffic Code."
    );
  }

  if (q.includes('emergency') || q.includes('sos') || q.includes('pulis') || q.includes('police') || q.includes('c3') || q.includes('danger')) {
    return (
      "🚨 **Makati Emergency Hotlines (One-Touch Available sa SOS Button):**\n\n" +
      "• **Makati C3 Command Center:** 168 / (02) 8870-8000\n" +
      "• **PNP Makati Police:** (02) 8887-1798\n" +
      "• **Philippine National Emergency:** 911\n\n" +
      "Pindutin lamang ang pulang **SOS Button** sa map para agarang mai-broadcast ang iyong coordinates (<10m) at plaka ng e-Jeep!"
    );
  }

  if (q.includes('night') || q.includes('gabi') || q.includes('safe') || q.includes('ligtas') || q.includes('crowd')) {
    return (
      "🌙 **SO5 Dynamic Safe-Stop Routing (\"Safety in Numbers\"):**\n\n" +
      "Kapag gabi, ginagamit ng EjeepHero ang DBSCAN Spatial Density Clustering algorithm upang muling gabayan ang mga commuter palayo sa madidilim na eskinita patungo sa **mga well-lit at mataong hubs** gaya ng MRT Buendia Hub o Maysilo Circle.\n\n" +
      "I-toggle lamang ang **\"Safe Routing\"** sa ibabaw ng Mapa upang ma-activate ang live rerouting recommendations!"
    );
  }

  if (q.includes('esakay') || q.includes('e-sakay') || q.includes('charging') || q.includes('hub')) {
    return (
      "⚡ **Makati \"e-Sakay\" Hubs:**\n\n" +
      "Ito ang mga opisyal na specialized terminals para sa electric jeepneys na may charging stations, 24/7 CCTV, at covered waiting areas:\n" +
      "1. **MRT Buendia / Zodiac Terminal**\n" +
      "2. **Maysilo Circle Terminal Hub**\n\n" +
      "Tingnan ang 'e-Sakay' tab sa Directory para sa landmark photos at direksyon!"
    );
  }

  return null;
}

// Renders inline **bold** markdown into React Native <Text> segments
function renderMarkdown(text: string, baseStyle: object) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <Text style={baseStyle}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ fontWeight: 'bold' }}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

export default function HeroBotScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Kumusta! Ako si HeroBot, ang iyong AI transit assistant para sa Makati e-Jeepney network. 🚌\n\nMagtanong tungkol sa mga ruta, legal na sakayan, LTFRB fares, o emergency safety features!',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = async (textToSend?: any) => {
    const messageContent = typeof textToSend === 'string' ? textToSend : input;
    if (!messageContent.trim()) return;

    const userMsg: Message = { role: 'user', content: messageContent };
    setMessages(prev => [...prev, userMsg]);
    if (typeof textToSend !== 'string') {
      setInput('');
    }
    setLoading(true);

    // 1. Check local offline knowledge engine first (instant response)
    const localAnswer = getOfflineTransitResponse(messageContent);
    if (localAnswer) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'assistant', content: localAnswer }]);
        setLoading(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }, 400);
      return;
    }

    // 2. Query DeepSeek API if online
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey) {
      try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content:
                  'You are HeroBot, an AI assistant for EjeepHero, an e-Jeepney commuter application in Makati City, Philippines. Be friendly, helpful, and concise. You can speak English and Tagalog (Taglish). You know about MRT Buendia to Mandaluyong routes, legal loading bays, LTFRB 20% discounts for students/PWD/seniors (₱14 base, ₱1.50/km), and Makati C3 hotline 168.',
              },
              ...messages.map(m => ({ role: m.role, content: m.content })),
              { role: 'user', content: messageContent },
            ],
            temperature: 0.7,
            max_tokens: 350,
          }),
        });

        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.choices[0].message.content }]);
          setLoading(false);
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
          return;
        }
      } catch (e) {
        console.warn('DeepSeek query failed, using AI fallback:', e);
      }
    }

    // 3. Fallback friendly response
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            "Salamat sa tanong! Para sa pinakamabilis na transit navigation sa Makati:\n\n" +
            "• **Mapa:** Ipinapakita ang legal boarding bays (berdeng bilog) vs No Loading areas (pulang babala).\n" +
            "• **Directory Tab:** Subukan ang Fare Calculator gamit ang 20% Student/Senior/PWD discount.\n" +
            "• **SOS Button:** Pindutin sa oras ng emergency para sa mabilisang koneksyon sa Makati C3 (168).",
        },
      ]);
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, 500);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
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
                <Text style={styles.botIconText}>🤖</Text>
              </View>
            )}
            <View
              style={[
                styles.bubble,
                msg.role === 'user' ? styles.userBubble : styles.botBubble,
              ]}
            >
              {renderMarkdown(msg.content, msg.role === 'user' ? styles.userText : styles.botText)}
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
          placeholder="Tanungin si HeroBot (routes, fares, safety)..."
          placeholderTextColor="#888"
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={styles.sendButton}
          onPress={() => sendMessage()}
          disabled={loading || !input.trim()}
        >
          <Ionicons name="send" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  chatArea: { flex: 1 },
  bubbleContainer: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end', maxWidth: '88%' },
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
  },
  botIconText: { fontSize: 13 },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: Colors.primaryRed,
    borderBottomRightRadius: 2,
  },
  botBubble: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#E8DFD3',
  },
  userText: { color: Colors.white, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  botText: { color: Colors.darkText, fontSize: 14, lineHeight: 20 },
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
    fontSize: 13,
    color: '#666',
  },
  suggestionsWrapper: {
    backgroundColor: Colors.white,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: '#F0E6D8',
  },
  suggestionsContainer: {
    paddingHorizontal: 14,
    gap: 8,
    flexDirection: 'row',
  },
  suggestionChip: {
    backgroundColor: Colors.offWhite,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8DFD3',
  },
  suggestionText: {
    color: Colors.darkText,
    fontSize: 12,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderColor: '#E8DFD3',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.offWhite,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginRight: 8,
    fontSize: 14,
    color: Colors.darkText,
    borderWidth: 1,
    borderColor: '#E8DFD3',
  },
  sendButton: {
    backgroundColor: Colors.primaryRed,
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
