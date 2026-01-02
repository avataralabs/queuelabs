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

    console.log('Refresh accounts for username:', username);

    // Send refresh request to webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: 'refresh', username })
    });

    const responseData = await response.json();
    console.log('Webhook response status:', response.status);
    console.log('Webhook response data:', responseData);

    const result = Array.isArray(responseData) ? responseData[0] : responseData;
    console.log('Parsed result:', result);

    // Check if response contains error
    if (result?.error) {
      const errorMsg = result.error.message || result.error || 'Failed to refresh accounts';
      console.error('Webhook error:', errorMsg);
      throw new Error(errorMsg);
    }

    if (!response.ok) {
      console.error('Webhook error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseData
      });
      throw new Error(result?.message || 'Failed to refresh accounts');
    }

    // Parse connected accounts from social_accounts
    const socialAccounts = result?.profile?.social_accounts || result?.social_accounts || {};
    const connectedAccounts: Array<{ platform: string; username: string; display_name?: string; profile_picture?: string; connected_at: string }> = [];
    const platformOrder = ['tiktok', 'instagram', 'youtube'];
    
    for (const platform of platformOrder) {
      const accountData = socialAccounts[platform];
      // Check if platform has actual data (not empty string, not null/undefined)
      if (accountData && typeof accountData === 'object' && Object.keys(accountData).length > 0) {
        // Get display name based on platform
        let displayName = '';
        if (platform === 'instagram') {
          displayName = accountData.display_name || accountData.handle || '';
        } else if (platform === 'youtube') {
          displayName = accountData.title || accountData.handle || '';
        } else if (platform === 'tiktok') {
          displayName = accountData.display_name || accountData.name || '';
        }
        
        connectedAccounts.push({
          platform,
          username: accountData.username || accountData.id || '',
          display_name: displayName,
          profile_picture: accountData.profile_picture || accountData.avatar || '',
          connected_at: new Date().toISOString()
        });
      }
    }

    console.log('Parsed connected accounts:', connectedAccounts);

    return new Response(
      JSON.stringify({
        success: true,
        connected_accounts: connectedAccounts
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in uploadpost-refresh-accounts:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
