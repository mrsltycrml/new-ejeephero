import { supabase } from '../lib/supabase';

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export const sendMessageToHeroBot = async (
  message: string,
  history: ChatMessage[]
): Promise<string> => {
  try {
    // 1. Fetch current route context
    const { data: routes } = await supabase.from('routes').select('*');
    const { data: terminals } = await supabase.from('terminals').select('*, routes(name)');
    
    // 2. Build system prompt with context
    const systemPrompt = `You are HeroBot, a navigational assistant for Makati City e-jeepney commuters. 
You answer in English, Tagalog, or Taglish depending on how the user writes. 
You only answer questions about Makati e-jeepney routes, terminals, navigation, and fares. 
Use landmark names familiar to Makati commuters.
Base fare is ₱15 for the first 4km, +₱2.20 per km after.

CURRENT ROUTE DATA:
${JSON.stringify(routes, null, 2)}

TERMINALS:
${JSON.stringify(terminals, null, 2)}`;

    // 3. Format history for Anthropic API
    const messages = history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // Add current message
    messages.push({ role: 'user', content: message });

    // 4. Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Anthropic API error:', errorData);
      return 'Pasensya na, may error sa aking system ngayon. Please try again later.';
    }

    const data = await response.json();
    return data.content[0].text;
    
  } catch (error) {
    console.error('Error in HeroBot:', error);
    return 'Pasensya na, hindi ako maka-connect sa network. Check your internet connection.';
  }
};
