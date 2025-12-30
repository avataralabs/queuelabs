const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get('WEBHOOK_URL');
    console.log('WEBHOOK_URL exists:', !!webhookUrl);
    
    if (!webhookUrl) {
      console.error('WEBHOOK_URL not configured');
      throw new Error('WEBHOOK_URL not configured');
    }

    const { username } = await req.json();
    
    if (!username) {
      console.error('Username is required');
      throw new Error('Username is required');
    }

    console.log('Connect account for username:', username);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: 'connect', username })
    });

    const responseData = await response.json();
    console.log('Webhook response status:', response.status);
    console.log('Webhook response data:', responseData);

    const result = Array.isArray(responseData) ? responseData[0] : responseData;
    console.log('Parsed result:', result);

    // Check if response contains error
    if (result?.error) {
      const errorMsg = result.error.message || result.error || 'Failed to connect account';
      console.error('Webhook error:', errorMsg);
      throw new Error(errorMsg);
    }

    if (!response.ok) {
      console.error('Webhook error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseData
      });
      throw new Error(result?.message || 'Failed to connect account');
    }

    if (!result?.success || !result?.access_url) {
      throw new Error('Invalid response from webhook');
    }

    // Calculate expires_at from duration (default 48h)
    const expiresAt = new Date();
    const durationMatch = result.duration?.match(/(\d+)h/);
    const hours = durationMatch ? parseInt(durationMatch[1]) : 48;
    expiresAt.setHours(expiresAt.getHours() + hours);

    // Parse connected platforms from social_accounts
    const socialAccounts = result.profile?.social_accounts || {};
    const connectedPlatforms: string[] = [];
    const platformOrder = ['tiktok', 'instagram', 'youtube'];
    
    for (const platform of platformOrder) {
      const accountData = socialAccounts[platform];
      // Check if platform has actual data (not empty string, not null/undefined)
      if (accountData && typeof accountData === 'object' && Object.keys(accountData).length > 0) {
        connectedPlatforms.push(platform);
      }
    }

    console.log('Connect account successful:', {
      access_url: result.access_url,
      duration: result.duration,
      expires_at: expiresAt.toISOString(),
      connected_platforms: connectedPlatforms
    });

    return new Response(
      JSON.stringify({
        access_url: result.access_url,
        expires_at: expiresAt.toISOString(),
        connected_platforms: connectedPlatforms
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in uploadpost-connect-account:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
