import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    const { username, platform, redirect_url } = await req.json();
    console.log('Creating Upload-Post profile:', { username, platform, redirect_url });

    // Step 1: Create User Profile on Upload-Post
    console.log('Step 1: Creating user on Upload-Post...');
    const createRes = await fetch('https://api.upload-post.com/api/uploadposts/users', {
      method: 'POST',
      headers: {
        'Authorization': `ApiKey ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username })
    });

    const createData = await createRes.json();
    console.log('Create user response:', createRes.status, createData);

    // If user already exists, that's okay - continue to generate JWT
    if (!createRes.ok && createRes.status !== 409) {
      throw new Error(createData.message || 'Failed to create Upload-Post user');
    }

    // Step 2: Generate JWT URL for connecting social account
    console.log('Step 2: Generating JWT URL...');
    const jwtRes = await fetch('https://api.upload-post.com/api/uploadposts/users/generate-jwt', {
      method: 'POST',
      headers: {
        'Authorization': `ApiKey ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        redirect_url,
        platforms: [platform],
        connect_title: 'Connect your account',
        connect_description: 'Link your social media account to manage your content'
      })
    });

    const jwtData = await jwtRes.json();
    console.log('Generate JWT response:', jwtRes.status, jwtData);

    if (!jwtRes.ok) {
      throw new Error(jwtData.message || 'Failed to generate Upload-Post JWT');
    }

    return new Response(
      JSON.stringify({ 
        access_url: jwtData.access_url,
        expires_at: jwtData.expires_at 
      }), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in uploadpost-create-profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
