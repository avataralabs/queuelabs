import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://queuelabs.avatara.id',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('UPLOADPOST_API_KEY');
    if (!apiKey) {
      console.error('UPLOADPOST_API_KEY not configured');
      throw new Error('Upload-Post API key not configured');
    }

    const { username } = await req.json();
    console.log('Getting Upload-Post accounts for:', username);

    // Get user profile with connected accounts from Upload-Post
    const res = await fetch(`https://api.upload-post.com/api/uploadposts/users/${username}`, {
      method: 'GET',
      headers: {
        'Authorization': `ApiKey ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();
    console.log('Get user response:', res.status, data);

    if (!res.ok) {
      throw new Error(data.message || 'Failed to get Upload-Post user');
    }

    // Extract connected accounts
    const connectedAccounts = data.connected_accounts || [];
    console.log('Connected accounts:', connectedAccounts);

    return new Response(
      JSON.stringify({ connected_accounts: connectedAccounts }), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in uploadpost-get-accounts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, connected_accounts: [] }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
