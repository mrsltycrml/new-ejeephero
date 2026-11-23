import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildTransitChatContext } from './context.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function botpressMessage(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const { id, userId, conversationId, createdAt, payload } = value as Record<string, unknown>;
  const time = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
  if (typeof id !== 'string' || !id || typeof userId !== 'string' || !userId
    || typeof conversationId !== 'string' || !conversationId || !Number.isFinite(time)) return null;
  return { id, userId, conversationId, time, payload };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (Number(req.headers.get('Content-Length') || 0) > 16000) return new Response('Request too large', { status: 413, headers: corsHeaders });
    const { message, history } = await req.json();
    const trimmedMessage = String(message ?? "").trim();
    const recentHistory = Array.isArray(history)
      ? history
          .slice(-6)
          .filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
          .map((item: any) => ({ role: item.role as 'user' | 'assistant', content: item.content.trim().slice(0, 600) }))
          .filter((item) => item.content.length > 0)
      : [];
    if (!trimmedMessage || trimmedMessage.length > 2000) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseServiceKey) throw new Error("Supabase service role is unavailable.");
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // PostgREST verifies the signed Clerk/Supabase JWT. Never trust a caller's
    // body userId or decode an unsigned token as proof of identity.
    const sessionDb = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const identity = await sessionDb.rpc('current_profile_id');
    const resolvedUserId = identity.error ? null : identity.data;
    if (!resolvedUserId) return new Response(JSON.stringify({ error: 'Sign in to use esakaybot.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const account = await sessionDb.from('profiles').select('status').eq('id', resolvedUserId).single();
    if (account.data?.status !== 'approved') return new Response(JSON.stringify({ error: 'Your account is not active.' }), { status: 403, headers: corsHeaders });
    const budget = await supabase.rpc('claim_chat_request', { p_user_id: resolvedUserId });
    if (budget.error || budget.data !== true) return new Response(JSON.stringify({ error: 'Please wait a minute before sending another message.' }), { status: 429, headers: corsHeaders });

    let contextText = buildTransitChatContext(null, null);
    try {
      const [routes, terminals, fareMatrices, rideSegments, fleet] = await Promise.all([
        sessionDb
          .from("routes")
          .select('*')
          .order("is_coming_soon", { ascending: true })
          .limit(21),
        sessionDb
          .from("terminals")
          .select('*')
          .order("sequence_order")
          .limit(201),
        sessionDb.from('passenger_fare_matrices').select('*').order('id').limit(201),
        sessionDb.from('passenger_route_segments').select('*').order('id').limit(501),
        sessionDb.rpc('get_passenger_fleet_snapshot'),
      ]);
      contextText = buildTransitChatContext(
        !routes.error && routes.data.length <= 20 ? routes.data : null,
        !terminals.error && terminals.data.length <= 200 ? terminals.data : null,
        {
          fareMatrices: !fareMatrices.error && fareMatrices.data.length <= 200 ? fareMatrices.data : [],
          rideSegments: !rideSegments.error && rideSegments.data.length <= 500 ? rideSegments.data : [],
          vehicles: !fleet.error && Array.isArray(fleet.data?.vehicles) ? fleet.data.vehicles : [],
        },
      );
    } catch { /* Keep the unavailable context when reference reads fail. */ }

    const webhookId = Deno.env.get("BOTPRESS_WEBHOOK_ID") ?? "";
    const deepseekApiKey = Deno.env.get("DEEPSEEK_API_KEY") ?? "";

    // Primary: Botpress Chat API (Gemini-powered agent in Botpress)
    if (webhookId) {
      const readSession = async () => {
        const { data, error } = await supabase.from("herobot_botpress_sessions")
          .select("user_key, conversation_id")
          .eq("profile_id", resolvedUserId)
          .maybeSingle();
        if (error) throw new Error("HeroBot session could not be read.");
        return data;
      };
      let session = await readSession();
      const botpressBaseUrl = `https://chat.botpress.cloud/${webhookId}`;
      const createConversation = async (userKey: string): Promise<string> => {
        const response = await fetch(`${botpressBaseUrl}/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-key': userKey },
          body: '{}',
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('Botpress conversation creation failed.');
        const { conversation } = await response.json();
        if (typeof conversation?.id !== 'string' || !conversation.id) throw new Error('Botpress returned no conversation ID.');
        return conversation.id;
      };
      let conversationId: string | undefined;

      if (!session) {
        const userRes = await fetch(`${botpressBaseUrl}/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{}',
          signal: AbortSignal.timeout(8000),
        });
        if (!userRes.ok) throw new Error('Botpress user creation failed.');
        const { user, key } = await userRes.json();
        if (!user?.id || typeof key !== 'string' || !key) throw new Error('Botpress returned no user key.');
        const createdConversation = await createConversation(key);
        const { data, error } = await supabase.from("herobot_botpress_sessions")
          .upsert({
            profile_id: resolvedUserId,
            user_key: key,
            conversation_id: createdConversation,
          }, { onConflict: "profile_id", ignoreDuplicates: true })
          .select("user_key, conversation_id").maybeSingle();
        if (error) throw new Error("HeroBot session could not be saved.");
        // A concurrent request may own the stored user's first conversation.
        if (data?.user_key === key && data.conversation_id === createdConversation) conversationId = createdConversation;
        session = data ?? await readSession();
        if (!session) throw new Error("HeroBot session is unavailable.");
      }

      const { user_key: userKey } = session;
      conversationId ??= await createConversation(userKey);
      const fullMessage = `${contextText}\n\nRecent conversation (for context only; previous replies are not operational evidence): ${JSON.stringify(recentHistory)}\n\nUser Message: ${trimmedMessage}`;

      const msgRes = await fetch(`${botpressBaseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-key": userKey,
        },
        body: JSON.stringify({
          conversationId,
          payload: {
            type: "text",
            text: fullMessage,
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!msgRes.ok) throw new Error('Botpress message creation failed.');
      const sent = botpressMessage((await msgRes.json()).message);
      if (!sent || sent.conversationId !== conversationId) throw new Error('Botpress did not acknowledge this message.');

      let reply: string | undefined;
      const pollDeadline = Date.now() + 8000;
      const signal = AbortSignal.timeout(8000);
      while (Date.now() < pollDeadline) {
        try {
          const listRes = await fetch(`${botpressBaseUrl}/conversations/${encodeURIComponent(conversationId)}/messages`, {
            headers: { 'x-user-key': userKey }, signal,
          });
          if (!listRes.ok) throw new Error('Botpress message lookup failed.');
          const { messages } = await listRes.json();
          const page = (Array.isArray(messages) ? messages as unknown[] : []).flatMap(value => {
            const message = botpressMessage(value);
            return message?.conversationId === conversationId ? [message] : [];
          });
          if (page.some(message => message.id === sent.id && message.userId === sent.userId && message.time === sent.time)) {
            const answers = page.filter(message => message.id !== sent.id && message.userId !== sent.userId && message.time >= sent.time)
              .sort((a, b) => b.time - a.time);
            for (const answer of answers) {
              const payload = answer.payload as { type?: unknown; text?: unknown } | null;
              if (payload?.type !== 'text' || typeof payload.text !== 'string') continue;
              const text = payload.text.replace(/\*/g, '').replace(/\n{3,}/g, '\n\n').trim();
              if (text) { reply = text; break; }
            }
            if (reply) break;
          }
        } catch (error) {
          if (signal.aborted) break;
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(500, Math.max(0, pollDeadline - Date.now()))));
      }

      return new Response(JSON.stringify({ reply: reply ?? 'esakaybot took too long to reply. Please try again.' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: DeepSeek Chat API if BOTPRESS_WEBHOOK_ID is not configured
    if (deepseekApiKey) {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0.2,
          messages: [
            { role: "system", content: contextText },
            ...recentHistory,
            { role: "user", content: trimmedMessage },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI provider returned status ${response.status}`);
      }
      const data = await response.json();
      const reply = String(data.choices?.[0]?.message?.content ?? "")
        .replace(/[*#`]/g, "")
        .trim();

      return new Response(JSON.stringify({ reply: reply || "No response received." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Neither BOTPRESS_WEBHOOK_ID nor DEEPSEEK_API_KEY is configured.");
  } catch {
    return new Response(JSON.stringify({ error: 'esakaybot is temporarily unavailable. Please try again.' }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
