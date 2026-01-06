import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const webhookUrl = Deno.env.get('WEBHOOK_URL');
    console.log('WEBHOOK_URL exists:', !!webhookUrl);
    
    if (!webhookUrl) {
      console.error('WEBHOOK_URL not configured');
      throw new Error('Webhook URL not configured');
    }

    const { username } = await req.json();
    console.log('Creating profile with username:', username);

    // POST to webhook URL
    console.log('Sending POST to webhook...');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: 'create', username })
    });

    const responseData = await response.json();
    console.log('Webhook response status:', response.status);
    console.log('Webhook response data:', responseData);
    console.log('Response is array:', Array.isArray(responseData));

    // Response is an array, get first element
    const result = Array.isArray(responseData) ? responseData[0] : responseData;
    console.log('Parsed result:', result);

    // Check if response contains error object (e.g., 409 conflict, 403 limit reached)
    if (result?.error) {
      let errorMessage = 'Failed to create profile';
      let errorCode = 'ERROR';
      
      // Parse the nested error message from n8n format
      // Format: { "error": { "message": "403 - \"{\"success\":false,\"message\":\"You have reached the limit...\"}\n\"" } }
      const errorMsg = result.error.message || '';
      
      // Check if it's a 409 error - Username already in use
      if (errorMsg.includes('409')) {
        errorCode = 'USERNAME_EXISTS';
        try {
          const jsonMatch = errorMsg.match(/\{[^{}]*"message"\s*:\s*"[^"]*"[^{}]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.message || 'Username already in use';
          } else {
            errorMessage = 'Username already in use';
          }
        } catch {
          errorMessage = 'Username already in use';
        }
      }
      // Check if it's a 403 error - Profile limit reached
      else if (errorMsg.includes('403')) {
        errorCode = 'LIMIT_REACHED';
        try {
          const jsonMatch = errorMsg.match(/\{[^{}]*"message"\s*:\s*"[^"]*"[^{}]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.message || 'Profile limit reached for current plan';
          } else {
            errorMessage = 'Profile limit reached for current plan';
          }
        } catch {
          errorMessage = 'Profile limit reached for current plan';
        }
      }
      // Check if it's a 400 error - Invalid username format
      else if (errorMsg.includes('400')) {
        errorCode = 'INVALID_USERNAME';
        try {
          const jsonMatch = errorMsg.match(/\{[^{}]*"message"\s*:\s*"[^"]*"[^{}]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.message || 'Invalid username format';
          } else {
            errorMessage = 'Invalid username format';
          }
        } catch {
          errorMessage = 'Invalid username format';
        }
      }
      
      console.error('Webhook error:', { errorCode, errorMessage, error: result.error });
      
      // Return 200 with error in body so Supabase client can read it
      // (non-2xx status codes cause Supabase client to throw without reading body)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage, 
          code: errorCode 
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!response.ok) {
      console.error('Webhook error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseData
      });
      throw new Error(responseData?.message || 'Failed to create profile');
    }

    // Check success field
    if (result && result.success === false) {
      throw new Error(result.message || 'Failed to create profile');
    }

    if (!result?.success || !result?.access_url) {
      throw new Error('Invalid response from webhook');
    }

    // Calculate expires_at from duration (default 48h)
    const expiresAt = new Date();
    const durationMatch = result.duration?.match(/(\d+)h/);
    const hours = durationMatch ? parseInt(durationMatch[1]) : 48;
    expiresAt.setHours(expiresAt.getHours() + hours);

    console.log('Profile created successfully:', { 
      access_url: result.access_url,
      duration: result.duration,
      expires_at: expiresAt.toISOString()
    });

    return new Response(
      JSON.stringify({ 
        access_url: result.access_url,
        expires_at: expiresAt.toISOString()
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
