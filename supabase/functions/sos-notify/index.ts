import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { vehicleId, latitude, longitude, driverId } = await req.json();

    console.log(`EMERGENCY SOS triggered by Vehicle ${vehicleId} at ${latitude}, ${longitude}`);

    // Create Supabase client with admin privileges
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Broadcast an emergency announcement
    await supabase.from('announcements').insert({
      title: 'EMERGENCY: Vehicle in Distress',
      body: `SOS signal received from a vehicle near coordinates: ${latitude}, ${longitude}. Please avoid the area and watch out for emergency vehicles.`,
      type: 'alert'
    })

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
