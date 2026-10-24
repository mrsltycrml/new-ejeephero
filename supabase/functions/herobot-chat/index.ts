import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    const jwt = authorization?.replace(/^Bearer\s+/i, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!jwt || !supabaseUrl || !anonKey) return json({ error: "Sign in is required." }, 401);
    if (!deepseekKey) return json({ error: "The transit assistant is not configured yet." }, 503);

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await client.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Your session is not valid." }, 401);
    const { data: profile } = await client.from("profiles").select("status").eq("id", user.id).single();
    if (profile?.status !== "approved") return json({ error: "Your account is awaiting approval." }, 403);

    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
    if (!message) return json({ error: "A question is required." }, 400);
    const history = Array.isArray(body.history)
      ? body.history.slice(-12).flatMap((item: any) =>
          (item?.role === "user" || item?.role === "assistant") && typeof item?.content === "string"
            ? [{ role: item.role, content: item.content.slice(0, 2000) }]
            : [])
      : [];

    const [{ data: routes }, { data: stops }] = await Promise.all([
      client.from("routes").select("id,name,description,operating_hours,base_fare,per_km_rate,base_distance_km,fare_effective_date,fare_source_url").order("name").limit(20),
      client.from("terminals").select("name,route_id,sequence_order,regular_fare,student_fare,elderly_fare,disabled_fare").order("sequence_order").limit(100),
    ]);
    const routeContext = (routes ?? []).map((route: any) => {
      const routeStops = (stops ?? []).filter((stop: any) => stop.route_id === route.id).map((stop: any) => stop.name).join(" → ");
      return `Route: ${route.name}; hours: ${route.operating_hours}; configured base fare ₱${route.base_fare}, additional ₱${route.per_km_rate}/km after ${route.base_distance_km ?? 4} km; fare effective date: ${route.fare_effective_date ?? "not provided"}; source: ${route.fare_source_url ?? "not provided"}; stops: ${routeStops || "not listed"}.`;
    }).join("\n");

    const systemPrompt = [
      "You are HeroBot, a concise transit assistant for the EjeepHero commuter app.",
      "Answer questions about the app's routes, stops, configured fares, operating hours, and safe boarding using the provided database context.",
      "Treat database values as estimates unless a fare effective date and official source are present. Never invent live vehicle positions, official loading zones, schedules, legal rules, or hotline numbers.",
      "If the context does not contain the answer, say what is missing and direct the user to confirm with the operator. Do not provide unrelated advice.",
      `Current directory data:\n${routeContext || "No route data is configured yet."}`,
    ].join("\n\n");

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${deepseekKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }],
        max_tokens: 500,
        stream: false,
      }),
    });
    if (!response.ok) {
      console.error("DeepSeek returned status", response.status);
      return json({ error: "HeroBot is temporarily unavailable. Please try again." }, 502);
    }
    const result = await response.json();
    const reply = result?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) return json({ error: "HeroBot returned an empty reply." }, 502);
    return json({ reply: reply.trim() });
  } catch (error) {
    console.error("HeroBot request failed", error);
    return json({ error: "HeroBot is temporarily unavailable. Please try again." }, 500);
  }
});
