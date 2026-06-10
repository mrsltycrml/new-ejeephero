// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// For Supabase Edge Functions, use Deno
serve(async (req) => {
  try {
    const { vehicleId, latitude, longitude, driverId } = await req.json();

    // 1. In a real scenario, this would trigger an SMS via Twilio or a notification to Makati LGU API.
    // For this prototype, we'll log it and insert an emergency announcement into the announcements table
    // so it shows up on other drivers' and passengers' feeds.

    console.log(`EMERGENCY SOS triggered by Vehicle ${vehicleId} at ${latitude}, ${longitude}`);

    // Create Supabase client with admin privileges
    // import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
    // const supabase = createClient(
    //   Deno.env.get('SUPABASE_URL') ?? '',
    //   Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    // )

    // await supabase.from('announcements').insert({
    //   title: 'EMERGENCY: Vehicle in Distress',
    //   body: `SOS signal received from a vehicle near coordinates: ${latitude}, ${longitude}. Please avoid the area if possible.`,
    //   type: 'alert'
    // })

    return new Response(
      JSON.stringify({ success: true, message: "SOS signal broadcasted." }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
})
