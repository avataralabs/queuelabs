import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    // Parse multipart form data
    const formData = await req.formData();
    
    const username = formData.get('username') as string; // email
    const account = formData.get('account') as string; // @username
    const platform = formData.get('platform') as string;
    const caption = formData.get('caption') as string || '';
    const description = formData.get('description') as string || '';
    const videoFile = formData.get('video') as File;
    const scheduleDatetime = formData.get('schedule_datetime') as string | null;
    const isManualMode = !!scheduleDatetime;

    console.log('Received assign-content request:', { 
      username, account, platform,
      hasVideo: !!videoFile,
      videoName: videoFile?.name,
      videoSize: videoFile?.size,
      scheduleDatetime,
      mode: isManualMode ? 'manual' : 'auto',
      currentTimeUtc: new Date().toISOString()
    });

    // Validate required fields
    if (!username || !account || !platform) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: username, account, platform' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!videoFile) {
      return new Response(
        JSON.stringify({ success: false, error: 'No video file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Lookup user by email
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
      console.error('Error listing users:', userError);
      throw userError;
    }

    const user = userData.users.find(u => u.email === username);
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: `User not found: ${username}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found user:', user.id);

    // 2. Find profile with matching connected account
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id);

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      throw profileError;
    }

    // Normalize account username for comparison (handle @ prefix)
    const normalizedAccount = account.startsWith('@') ? account : `@${account}`;
    const normalizedAccountWithout = account.startsWith('@') ? account.substring(1) : account;

    let matchedProfile = null;
    for (const profile of profiles || []) {
      const connectedAccounts = profile.connected_accounts as Array<{ platform: string; username: string }> || [];
      const hasMatch = connectedAccounts.some(acc => {
        const accUsername = acc.username || '';
        const normalizedAcc = accUsername.startsWith('@') ? accUsername : `@${accUsername}`;
        const normalizedAccWithout = accUsername.startsWith('@') ? accUsername.substring(1) : accUsername;
        
        return acc.platform === platform && 
          (normalizedAcc === normalizedAccount || 
           normalizedAccWithout === normalizedAccountWithout ||
           accUsername === account);
      });
      
      if (hasMatch) {
        matchedProfile = profile;
        break;
      }
    }

    if (!matchedProfile) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Account not found: ${account} on ${platform}` 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found profile:', matchedProfile.id, matchedProfile.name);

    // 3. Upload video to storage FIRST (before slot assignment to avoid holding locks during upload)
    const fileExt = videoFile.name.split('.').pop() || 'mp4';
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    const arrayBuffer = await videoFile.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('content-files')
      .upload(fileName, fileBuffer, {
        contentType: videoFile.type || 'video/mp4',
        upsert: false
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      throw uploadError;
    }

    console.log('File uploaded:', fileName);

    // 4. Create content record FIRST (with pending status)
    const { data: content, error: contentError } = await supabase
      .from('contents')
      .insert({
        user_id: user.id,
        file_name: videoFile.name,
        file_url: fileName,
        file_size: videoFile.size,
        caption: caption,
        description: description,
        status: 'pending',
        platform: platform
      })
      .select()
      .single();

    if (contentError) {
      console.error('Error creating content:', contentError);
      throw contentError;
    }

    console.log('Content created with pending status:', content.id);

    // 5. Find schedule slot - conditional based on mode
    let scheduledAtUtc: Date;
    let manualWibDateStr: string = '';
    let slotId: string | null = null;
    let slotHour: number | null = null;
    let slotMinute: number | null = null;
    let scheduledDate: string | null = null;

    if (isManualMode) {
      // Manual mode: no slot needed, scheduling is based on schedule_datetime only
      console.log('Manual mode - no slot required, using schedule_datetime');
      
      // Parse schedule_datetime (assumed to be in WIB)
      const dateStr = scheduleDatetime!;
      const [datePart, timePart] = dateStr.includes('T') 
        ? dateStr.split('T') 
        : [dateStr.split(' ')[0], dateStr.split(' ')[1] || '00:00:00'];
      
      const [year, month, day] = datePart.split('-').map(Number);
      const timeClean = timePart.split('+')[0].split('Z')[0];
      const [hour, minute, second] = timeClean.split(':').map(s => parseInt(s) || 0);
      
      // Create UTC date: WIB - 7 hours
      scheduledAtUtc = new Date(Date.UTC(year, month - 1, day, hour - WIB_OFFSET_HOURS, minute, second));
      
      // Format WIB string for response
      manualWibDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;
      
      console.log('Manual mode - Input WIB:', dateStr, '-> UTC:', scheduledAtUtc.toISOString());

      // Update content with manual schedule
      const { error: updateError } = await supabase
        .from('contents')
        .update({
          status: 'assigned',
          assigned_profile_id: matchedProfile.id,
          scheduled_at: scheduledAtUtc.toISOString(),
          platform: platform
        })
        .eq('id', content.id);

      if (updateError) {
        console.error('Error updating content with manual schedule:', updateError);
        throw updateError;
      }

    } else {
      // Auto mode: Use atomic slot assignment function to prevent race conditions
      console.log('Auto mode - Using atomic slot assignment function');

      const { data: assignmentResult, error: rpcError } = await supabase.rpc('assign_next_available_slot', {
        p_profile_id: matchedProfile.id,
        p_platform: platform,
        p_content_id: content.id,
        p_user_id: user.id
      });

      if (rpcError) {
        console.error('Error calling assign_next_available_slot:', rpcError);
        
        // Clean up: delete the content since assignment failed
        await supabase.from('contents').delete().eq('id', content.id);
        
        throw rpcError;
      }

      console.log('Atomic assignment result:', assignmentResult);

      if (!assignmentResult?.success) {
        // Clean up: delete the content since no slot available
        await supabase.from('contents').delete().eq('id', content.id);
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: assignmentResult?.error || 'No available slot found' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extract slot info from assignment result
      slotId = assignmentResult.slot_id;
      slotHour = assignmentResult.hour;
      slotMinute = assignmentResult.minute;
      scheduledDate = assignmentResult.scheduled_date;
      scheduledAtUtc = new Date(assignmentResult.scheduled_at);

      console.log('Auto mode - Assigned slot:', slotId, 
        `${slotHour}:${String(slotMinute).padStart(2, '0')}`, 
        'on', scheduledDate,
        '-> UTC:', scheduledAtUtc.toISOString()
      );
    }

    // Build response based on mode
    const scheduleResponse = isManualMode 
      ? {
          scheduled_at: manualWibDateStr,
          mode: 'manual'
        }
      : {
          slot_id: slotId,
          hour: slotHour,
          minute: slotMinute,
          scheduled_at: formatWib(scheduledAtUtc),
          scheduled_date: scheduledDate,
          mode: 'auto'
        };

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          content_id: content.id,
          file_name: content.file_name,
          file_size: content.file_size,
          status: 'assigned',
          assigned_profile: {
            id: matchedProfile.id,
            name: matchedProfile.name,
            platform: platform
          },
          schedule: scheduleResponse
        }
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in assign-content:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
