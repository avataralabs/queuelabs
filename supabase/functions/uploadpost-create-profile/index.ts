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
      body: JSON.stringify({ username })
    });

    const responseData = await response.json();
    console.log('Webhook response status:', response.status);
    console.log('Webhook response data:', responseData);
    console.log('Response is array:', Array.isArray(responseData));

    // Response is an array, get first element
    const result = Array.isArray(responseData) ? responseData[0] : responseData;
    console.log('Parsed result:', result);

    // Check if response contains error object (e.g., 409 conflict)
    if (result?.error) {
      let errorMessage = 'Failed to create profile';
      let statusCode = 500;
      
      // Parse the nested error message from n8n format
      // Format: "409 - \"{\"success\":false,\"message\":\"Username already in use\"}\n\""
      if (result.error.status === 409) {
        statusCode = 409;
        try {
          const errorString = result.error.message;
          const jsonMatch = errorString.match(/\{.*\}/);
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
      
      console.error('Webhook error:', { statusCode, errorMessage, error: result.error });
      
      return new Response(
        JSON.stringify({ error: errorMessage, code: statusCode === 409 ? 'USERNAME_EXISTS' : 'ERROR' }),
        { 
          status: statusCode,
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
