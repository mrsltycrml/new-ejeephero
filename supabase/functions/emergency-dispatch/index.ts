import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    const jwt = authorization?.replace(/^Bearer\s+/i, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!jwt || !supabaseUrl || !anonKey) return json({ error: "Sign in is required." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !user) return json({ error: "Your session is not valid." }, 401);

    const { data: profile, error: profileError } = await userClient
      .from("profiles").select("status").eq("id", user.id).single();
    if (profileError || profile?.status !== "approved") return json({ error: "Your account is not approved to use SOS dispatch." }, 403);

    const body = await request.json();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = body.accuracy == null ? null : Number(body.accuracy);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return json({ error: "A valid GPS location is required." }, 400);
    }

    const { data: contacts, error: contactError } = await userClient
      .from("emergency_contacts").select("contact_name,phone_number,preset_message").eq("user_id", user.id);
    if (contactError || !contacts?.length) return json({ error: "Save a personal emergency contact first." }, 409);
    const recipients = contacts.map((contact) => ({
      ...contact,
      normalizedPhone: contact.phone_number.replace(/[\s()-]/g, ""),
    }));
    if (recipients.some((contact) => !/^\+[1-9]\d{7,14}$/.test(contact.normalizedPhone))) {
      return json({ error: "A saved contact number is invalid. Save mobile numbers in international format, such as +639XXXXXXXXX." }, 422);
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
    if (!accountSid || !authToken || !fromNumber) return json({ error: "Automated SMS is not configured; use the messaging app fallback." }, 503);

    const vehicleLabel = [body.vehicle_plate, body.vehicle_body_number].filter(Boolean).join(" / ") || "Vehicle details unavailable";
    const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
    const message = `${contacts[0]?.preset_message || "EMERGENCY! I need help. Please check on me."}\n\nEjeepHero SOS\nLocation: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}${accuracy == null ? "" : ` (±${Math.round(accuracy)}m)`}\nMap: ${mapsLink}\nVehicle: ${vehicleLabel}`;

    const eventResult = await userClient.from("sos_events").insert({
      user_id: user.id,
      latitude,
      longitude,
      gps_accuracy_meters: accuracy,
      vehicle_id: body.vehicle_id || null,
      vehicle_plate: body.vehicle_plate || null,
      vehicle_body_number: body.vehicle_body_number || null,
    });
    if (eventResult.error) return json({ error: "Could not securely save the SOS event." }, 500);

    const results = await Promise.allSettled(recipients.map(async (contact) => {
      const form = new URLSearchParams({ To: contact.normalizedPhone, From: fromNumber, Body: message });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      if (!response.ok) {
        console.error("Twilio SMS request failed with status", response.status);
        return null;
      }
      const queued = await response.json();
      return queued.status ?? "queued";
    }));
    const acceptedCount = results.filter((result) => result.status === "fulfilled" && Boolean(result.value)).length;
    if (acceptedCount === 0) return json({ error: "SMS gateway could not accept the alerts; use the messaging app fallback." }, 502);
    return json({
      accepted: true,
      acceptedCount,
      recipientCount: recipients.length,
      providerStatus: acceptedCount === recipients.length ? "queued" : "partial",
      message: `Alert accepted for ${acceptedCount} of ${recipients.length} contact(s); carrier delivery confirmation may take time.`,
    }, 202);
  } catch (error) {
    console.error("Emergency dispatch failed", error);
    return json({ error: "Could not dispatch the alert. Use a hotline or messaging app." }, 500);
  }
});
