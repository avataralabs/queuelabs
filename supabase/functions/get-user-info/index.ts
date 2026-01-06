import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const username = url.searchParams.get('username');
    
    if (!username) {
      return new Response(
        JSON.stringify({ success: false, error: 'Username parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching user info for:', username);

    // Create Supabase client with service role for admin access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Find user by email
    const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      console.error('Error listing users:', userError);
      throw userError;
    }
    
    const user = users?.find(u => u.email === username);
    
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found user:', user.id);

    // 2. Get user role
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role, is_approved')
      .eq('user_id', user.id)
      .maybeSingle();

    // 3. Get profiles with connected accounts
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', user.id);

    // 4. Get schedule slots
    const { data: scheduleSlots } = await supabaseAdmin
      .from('schedule_slots')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('hour', { ascending: true });

    // 5. Get contents summary
    const { data: contents } = await supabaseAdmin
      .from('contents')
      .select('id, status')
      .eq('user_id', user.id);

    // 6. Get scheduled contents (upcoming)
    const { data: scheduledContents } = await supabaseAdmin
      .from('scheduled_contents')
      .select('*')
      .eq('user_id', user.id)
      .gte('scheduled_date', new Date().toISOString())
      .order('scheduled_date', { ascending: true })
      .limit(10);

    // 7. Get upload history summary
    const { data: uploadHistory } = await supabaseAdmin
      .from('upload_history')
      .select('id, status')
      .eq('user_id', user.id);

    // Build accounts array with schedule slots (matching screenshot format)
    const accounts: Array<{
      platform: string;
      username: string;
      profile_name: string;
      schedule_slots: Array<{ hour: number; minute: number; type: string }>;
    }> = [];

    // Process each profile and its connected accounts
    for (const profile of profiles || []) {
      const connectedAccounts = profile.connected_accounts || [];
      
      for (const account of connectedAccounts) {
        // Get slots for this profile and platform
        const platformSlots = (scheduleSlots || [])
          .filter(slot => slot.profile_id === profile.id && slot.platform === account.platform)
          .map(slot => ({
            hour: slot.hour,
            minute: slot.minute,
            type: slot.type || 'daily'
          }));

        accounts.push({
          platform: account.platform,
          username: account.username || account.display_name || '',
          profile_name: profile.name,
          schedule_slots: platformSlots
        });
      }
    }

    // Build contents by status
    const contentsByStatus = (contents || []).reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const response = {
      success: true,
      data: {
        user: {
          email: user.email,
          last_sign_in: user.last_sign_in_at,
          role: userRoles?.role || 'user',
          is_approved: userRoles?.is_approved || false
        },
        profiles: (profiles || []).map(p => ({
          id: p.id,
          name: p.name,
          platform: p.platform,
          created_at: p.created_at,
          connected_accounts: p.connected_accounts || []
        })),
        accounts,
        contents: {
          total: contents?.length || 0,
          by_status: contentsByStatus
        },
        schedule_slots: {
          total: scheduleSlots?.length || 0,
          active: scheduleSlots?.filter(s => s.is_active).length || 0
        },
        scheduled_contents: {
          total: scheduledContents?.length || 0,
          upcoming: scheduledContents || []
        },
        upload_history: {
          total: uploadHistory?.length || 0,
          success_count: uploadHistory?.filter(h => h.status === 'success').length || 0,
          failed_count: uploadHistory?.filter(h => h.status === 'failed').length || 0
        }
      }
    };

    console.log('Returning user info with', accounts.length, 'accounts');

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
