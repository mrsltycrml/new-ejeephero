import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    // Parse request body
    const { message } = await req.json();
    if (!message) {
      throw new Error('Message is required');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: authHeader
        }
      }
    });

    // Verify user is authenticated
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      throw new Error(`Unauthorized: ${userError?.message || 'User not found in session'}`);
    }

    // Get Botpress credentials
    const webhookId = Deno.env.get('BOTPRESS_WEBHOOK_ID') ?? '';
    if (!webhookId) {
      throw new Error('Missing BOTPRESS_WEBHOOK_ID environment variable');
    }

    // Fetch user's Botpress session from database
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('botpress_user_key, botpress_conversation_id')
      .eq('id', user.id)
      .single();

    let userKey = profile?.botpress_user_key;
    let conversationId = profile?.botpress_conversation_id;

    const botpressBaseUrl = `https://chat.botpress.cloud/${webhookId}`;

    // If session doesn't exist, create it in Botpress and save to DB
    if (!userKey || !conversationId) {
      // 1. Create Botpress Chat User
      const userRes = await fetch(`${botpressBaseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const userData = await userRes.json();
      if (!userData.user || !userData.key) {
        throw new Error(`Botpress User Creation failed: ${userData.message || 'Unknown'}`);
      }

      userKey = userData.key;

      // 2. Create Botpress Conversation
      const convRes = await fetch(`${botpressBaseUrl}/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-key': userKey
        },
        body: JSON.stringify({})
      });
      const convData = await convRes.json();
      if (!convData.conversation) {
        throw new Error(`Botpress Conversation Creation failed: ${convData.message || 'Unknown'}`);
      }

      conversationId = convData.conversation.id;

      // 3. Save to Supabase profiles
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          botpress_user_key: userKey,
          botpress_conversation_id: conversationId
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to save Botpress session to DB:', updateError.message);
      }
    }

    // Fetch real-time routes and terminals from Supabase for context injection
    let contextText = '';
    try {
      const [{ data: routesData }, { data: terminalsData }] = await Promise.all([
        supabase.from('routes').select('*').order('name'),
        supabase.from('terminals').select('name, route_id, sequence_order').order('sequence_order')
      ]);

      if (routesData && terminalsData) {
        contextText = 'SYSTEM CONTEXT (Makati e-Jeepney Transit Directory Data):\n';
        routesData.forEach((route: any) => {
          const stops = terminalsData
            .filter((t: any) => t.route_id === route.id)
            .map((t: any) => t.name)
            .join(' ➔ ');
          
          contextText += `\n* Route: "${route.name}"\n  - Description: ${route.description}\n  - Operating Hours: ${route.operating_hours}\n  - Fares: Base fare is ₱${route.base_fare || 13} (first 4km), then ₱${route.per_km_rate || 1.8}/km thereafter.\n  - Stop Sequence: ${stops || 'None'}\n`;
        });
        contextText += '\nUse the above data to answer the user\'s transit question accurately. You are ONLY allowed to answer questions related to Makati e-Jeepneys, routes, terminals, fares, operating hours, transit tracking, and transit services. If the user asks an unrelated question (such as general knowledge, programming, cooking, trivia, personal advice, etc.), politely decline to answer, explaining that your only purpose is to help passengers with the Makati e-Jeepney Transit Tracker system. Keep responses concise, well-structured, and helpful in Taglish/English. Use bullet points (-) for lists with a blank line between each item to ensure readability on mobile screen layouts. Avoid long paragraphs and walls of text. Do not use markdown bolding or asterisks in your responses; return plain text only.';
      }
    } catch (dbErr) {
      console.error('Failed to load transit context from database:', dbErr.message);
    }

    // Decode Botpress User ID from the userKey JWT
    const payloadBase64 = userKey.split('.')[1];
    const payloadJson = JSON.parse(atob(payloadBase64));
    const botpressUserId = payloadJson.id;

    const fullMessage = contextText ? `${contextText}\n\nUser Message: ${message}` : message;

    // Send user message to Botpress
    const msgRes = await fetch(`${botpressBaseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-key': userKey
      },
      body: JSON.stringify({
        conversationId,
        payload: {
          type: 'text',
          text: fullMessage
        }
      })
    });
    const msgData = await msgRes.json();
    if (!msgData.message) {
      throw new Error(`Botpress Message Send failed: ${msgData.message || 'Unknown'}`);
    }

    // Poll for Botpress reply
    let reply = 'Sorry, the chatbot timed out waiting for a response.';
    const startTime = Date.now();
    const timeout = 7500; // 7.5 seconds timeout

    while (Date.now() - startTime < timeout) {
      const listRes = await fetch(`${botpressBaseUrl}/conversations/${conversationId}/messages`, {
        method: 'GET',
        headers: { 'x-user-key': userKey }
      });
      const listData = await listRes.json();

      if (listData.messages && listData.messages.length > 0) {
        // Since messages are ordered newest first, check the latest message
        const latest = listData.messages[0];
        if (latest && latest.userId !== botpressUserId) {
          // If the message is from a different user ID, it is the bot's response
          reply = (latest.payload?.text || 'Empty response')
            .replace(/\*/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          break;
        }
      }

      // Wait 500ms before polling again
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return new Response(JSON.stringify({ reply }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
});
