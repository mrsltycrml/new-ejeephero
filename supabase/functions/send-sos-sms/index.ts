// Retired legacy endpoint. The passenger explicitly confirms sending in the
// phone's Messages app. Never accept a body user_id or dispatch background SMS.
Deno.serve((request: Request) => new Response(
  request.method === 'OPTIONS' ? null : JSON.stringify({ error: 'Use the eSAKAY Safety page to open Messages and confirm your emergency alert.' }),
  { status: request.method === 'OPTIONS' ? 204 : 410, headers: {
    'Content-Type':'application/json','Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store',
  } },
));
