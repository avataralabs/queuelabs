import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const scheduleHour = parseInt(formData.get('schedule_hour') as string);
    const scheduleMinute = parseInt(formData.get('schedule_minute') as string || '0');
    const caption = formData.get('caption') as string || '';
    const description = formData.get('description') as string || '';
    const videoFile = formData.get('video') as File;

    console.log('Received assign-content request:', { 
      username, account, platform, scheduleHour, scheduleMinute, 
      hasVideo: !!videoFile,
      videoName: videoFile?.name,
      videoSize: videoFile?.size
    });

    // Validate required fields
    if (!username || !account || !platform || isNaN(scheduleHour)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: username, account, platform, schedule_hour' 
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

    // 3. Find matching schedule slot
    const { data: slots, error: slotsError } = await supabase
      .from('schedule_slots')
      .select('*')
      .eq('profile_id', matchedProfile.id)
      .eq('platform', platform)
      .eq('hour', scheduleHour)
      .eq('minute', scheduleMinute)
      .eq('is_active', true);

    if (slotsError) {
      console.error('Error fetching slots:', slotsError);
      throw slotsError;
    }

    if (!slots || slots.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Schedule slot not found for ${scheduleHour}:${scheduleMinute.toString().padStart(2, '0')} on ${platform}` 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const slot = slots[0];
    console.log('Found slot:', slot.id);

    // 4. Upload video to storage
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

    // 5. Calculate next scheduled_at based on slot
    const now = new Date();
    const scheduledAt = new Date();
    scheduledAt.setHours(scheduleHour, scheduleMinute, 0, 0);
    
    // If time has passed today, schedule for tomorrow
    if (scheduledAt <= now) {
      scheduledAt.setDate(scheduledAt.getDate() + 1);
    }

    // 6. Create content record
    const { data: content, error: contentError } = await supabase
      .from('contents')
      .insert({
        user_id: user.id,
        file_name: videoFile.name,
        file_url: fileName,
        file_size: videoFile.size,
        caption: caption,
        description: description,
        status: 'assigned',
        assigned_profile_id: matchedProfile.id,
        scheduled_slot_id: slot.id,
        scheduled_at: scheduledAt.toISOString()
      })
      .select()
      .single();

    if (contentError) {
      console.error('Error creating content:', contentError);
      throw contentError;
    }

    console.log('Content created:', content.id);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          content_id: content.id,
          file_name: content.file_name,
          file_size: content.file_size,
          status: content.status,
          assigned_profile: {
            id: matchedProfile.id,
            name: matchedProfile.name,
            platform: platform
          },
          schedule: {
            slot_id: slot.id,
            hour: slot.hour,
            minute: slot.minute,
            scheduled_at: scheduledAt.toISOString()
          }
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
