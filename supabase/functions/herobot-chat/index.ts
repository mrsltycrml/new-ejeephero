import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildTransitChatContext } from './context.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      const [routes, terminals] = await Promise.all([
        supabase
          .from("routes")
          .select('*')
          .order("is_coming_soon", { ascending: true }),
        supabase
          .from("terminals")
          .select('*')
          .order("sequence_order"),
      ]);
      contextText = buildTransitChatContext(routes.error ? null : routes.data, terminals.error ? null : terminals.data);
    } catch { /* Keep the unavailable context when reference reads fail. */ }

    const webhookId = Deno.env.get("BOTPRESS_WEBHOOK_ID") ?? "";
    const deepseekApiKey = Deno.env.get("DEEPSEEK_API_KEY") ?? "";

    // Primary: Botpress Chat API (Gemini-powered agent in Botpress)
    if (webhookId) {
      let userKey: string | undefined;
      let conversationId: string | undefined;

      if (resolvedUserId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("botpress_user_key, botpress_conversation_id")
          .eq("id", resolvedUserId)
          .maybeSingle();
        userKey = profile?.botpress_user_key;
        conversationId = profile?.botpress_conversation_id;
      }

      const botpressBaseUrl = `https://chat.botpress.cloud/${webhookId}`;

      if (!userKey || !conversationId) {
        const userRes = await fetch(`${botpressBaseUrl}/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const userData = await userRes.json();
        if (!userData.user || !userData.key) {
          throw new Error(`Botpress User Creation failed: ${userData.message || "Unknown"}`);
        }
        userKey = userData.key;

        const convRes = await fetch(`${botpressBaseUrl}/conversations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-key": userKey!,
          },
          body: JSON.stringify({}),
        });
        const convData = await convRes.json();
        if (!convData.conversation) {
          throw new Error(`Botpress Conversation Creation failed: ${convData.message || "Unknown"}`);
        }
        conversationId = convData.conversation.id;

        if (resolvedUserId) {
          await supabase
            .from("profiles")
            .update({
              botpress_user_key: userKey,
              botpress_conversation_id: conversationId,
            })
            .eq("id", resolvedUserId);
        }
      }

      const payloadBase64 = userKey!.split(".")[1];
      const payloadJson = JSON.parse(atob(payloadBase64));
      const botpressUserId = payloadJson.id;

      const fullMessage = `${contextText}\n\nUser Message: ${trimmedMessage}`;

      const msgRes = await fetch(`${botpressBaseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-key": userKey!,
        },
        body: JSON.stringify({
          conversationId,
          payload: {
            type: "text",
            text: fullMessage,
          },
        }),
      });
      const msgData = await msgRes.json();
      if (!msgData.message) {
        throw new Error(`Botpress Message Send failed: ${msgData.message || "Unknown"}`);
      }

      let reply = "esakaybot took too long to reply. Please try again.";
      const startTime = Date.now();
      const timeout = 8000;

      while (Date.now() - startTime < timeout) {
        const listRes = await fetch(`${botpressBaseUrl}/conversations/${conversationId}/messages`, {
          method: "GET",
          headers: { "x-user-key": userKey! },
        });
        const listData = await listRes.json();

        if (listData.messages && listData.messages.length > 0) {
          const latest = listData.messages[0];
          if (latest && latest.userId !== botpressUserId) {
            reply = (latest.payload?.text || "Empty response")
              .replace(/\*/g, "")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
            break;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      return new Response(JSON.stringify({ reply }), {
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
