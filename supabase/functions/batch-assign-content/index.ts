import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://queuelabs.avatara.id',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// UTC+7 (WIB) timezone offset
const WIB_OFFSET_HOURS = 7;
const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

// Format date in WIB for display
function formatWib(date: Date): string {
  const wibDate = new Date(date.getTime() + WIB_OFFSET_MS);
  return wibDate.toISOString().replace('Z', '+07:00');
}

// Types
interface QueueLabsAccount {
  platform: string;
  username: string;
}

interface RequestBody {
  name?: string;
  script?: string;
  output_mode?: string;
  output_format?: string;
  voice_profile_id?: string;
  narration_style_id?: string;
  user_id: string;
  queuelabs_accounts: QueueLabsAccount[];
}

interface AccountAssignment {
  platform: string;
  username: string;
  profile_id: string;
  profile_name: string;
  schedule_hour: number;
  schedule_minute: number;
  scheduled_at: string;
  scheduled_date: string;
  slot_id: string;
  status: 'success' | 'error';
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse JSON body
    const body: RequestBody = await req.json();
    
    const { user_id, queuelabs_accounts } = body;

    console.log('Received batch-assign-content request:', { 
      user_id,
      accountsCount: queuelabs_accounts?.length,
      accounts: queuelabs_accounts,
      currentTimeUtc: new Date().toISOString()
    });

    // Validate required fields
    if (!user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!queuelabs_accounts || !Array.isArray(queuelabs_accounts) || queuelabs_accounts.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing or empty queuelabs_accounts array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user exists
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id);
    if (userError || !userData?.user) {
      console.error('User not found:', user_id, userError);
      return new Response(
        JSON.stringify({ success: false, error: `User not found: ${user_id}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found user:', userData.user.id, userData.user.email);

    // Fetch all profiles for this user
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user_id);

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      throw profileError;
    }

    console.log('Found profiles:', profiles?.length);

    // Process each account using atomic slot assignment
    const assignments: AccountAssignment[] = [];
    const errors: { platform: string; username: string; error: string }[] = [];

    for (const account of queuelabs_accounts) {
      const { platform, username } = account;
      
      // Normalize username
      const normalizedUsername = username.startsWith('@') ? username : `@${username}`;
      const normalizedUsernameWithout = username.startsWith('@') ? username.substring(1) : username;

      console.log(`Processing account: ${platform} / ${username}`);

      // Find profile with matching connected account
      let matchedProfile = null;
      for (const profile of profiles || []) {
        const connectedAccounts = profile.connected_accounts as Array<{ platform: string; username: string }> || [];
        const hasMatch = connectedAccounts.some(acc => {
          const accUsername = acc.username || '';
          const normalizedAcc = accUsername.startsWith('@') ? accUsername : `@${accUsername}`;
          const normalizedAccWithout = accUsername.startsWith('@') ? accUsername.substring(1) : accUsername;
          
          return acc.platform === platform && 
            (normalizedAcc === normalizedUsername || 
             normalizedAccWithout === normalizedUsernameWithout ||
             accUsername === username);
        });
        
        if (hasMatch) {
          matchedProfile = profile;
          break;
        }
      }

      if (!matchedProfile) {
        console.log(`Profile not found for: ${platform} / ${username}`);
        errors.push({
          platform,
          username,
          error: `Account not found: ${username} on ${platform}`
        });
        continue;
      }

      console.log(`Matched profile: ${matchedProfile.id} / ${matchedProfile.name}`);

      // Create a placeholder content record first
      const { data: content, error: contentError } = await supabase
        .from('contents')
        .insert({
          user_id: user_id,
          file_name: `batch_${Date.now()}_${platform}`,
          status: 'pending',
          platform: platform
        })
        .select()
        .single();

      if (contentError) {
        console.error(`Error creating content for ${platform}:`, contentError);
        errors.push({
          platform,
          username,
          error: `Failed to create content: ${contentError.message}`
        });
        continue;
      }

      // Use atomic slot assignment function
      const { data: assignmentResult, error: rpcError } = await supabase.rpc('assign_next_available_slot', {
        p_profile_id: matchedProfile.id,
        p_platform: platform,
        p_content_id: content.id,
        p_user_id: user_id
      });

      if (rpcError) {
        console.error(`Error in atomic assignment for ${platform}:`, rpcError);
        // Clean up the content
        await supabase.from('contents').delete().eq('id', content.id);
        errors.push({
          platform,
          username,
          error: `Slot assignment failed: ${rpcError.message}`
        });
        continue;
      }

      console.log(`Atomic assignment result for ${platform}:`, assignmentResult);

      if (!assignmentResult?.success) {
        // Clean up the content
        await supabase.from('contents').delete().eq('id', content.id);
        console.log(`No available slot for: ${platform}`);
        errors.push({
          platform,
          username,
          error: assignmentResult?.error || `No available slot found for ${platform}`
        });
        continue;
      }

      // Extract slot info from assignment result
      const scheduledAtUtc = new Date(assignmentResult.scheduled_at);

      console.log(`Assigned slot: ${assignmentResult.slot_id} at ${assignmentResult.hour}:${String(assignmentResult.minute).padStart(2, '0')} on ${assignmentResult.scheduled_date}`);

      assignments.push({
        platform,
        username,
        profile_id: matchedProfile.id,
        profile_name: matchedProfile.name,
        schedule_hour: assignmentResult.hour,
        schedule_minute: assignmentResult.minute,
        scheduled_at: formatWib(scheduledAtUtc),
        scheduled_date: assignmentResult.scheduled_date,
        slot_id: assignmentResult.slot_id,
        status: 'success'
      });
    }

    console.log(`Batch complete: ${assignments.length} successful, ${errors.length} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          total_accounts: queuelabs_accounts.length,
          successful: assignments.length,
          failed: errors.length,
          assignments,
          errors
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in batch-assign-content:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
