const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username } = await req.json();
    const webhookUrl = Deno.env.get('WEBHOOK_URL');
    
    if (!webhookUrl) {
      console.error('WEBHOOK_URL not configured');
      throw new Error('WEBHOOK_URL not configured');
    }

    if (!username) {
      console.error('Username is required');
      throw new Error('Username is required');
    }

    console.log('Sending DELETE request to webhook for username:', username);

    const response = await fetch(webhookUrl, {
      method: 'DELETE',
      body: JSON.stringify({ username })
    });

    console.log('Webhook response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webhook error response:', errorText);
      throw new Error(`Webhook returned ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('Webhook response data:', responseData);

    return new Response(JSON.stringify({ success: true, data: responseData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in uploadpost-delete-profile:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
