import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// UTC+7 (WIB) timezone offset
const WIB_OFFSET_HOURS = 7;
const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

// Convert WIB time to UTC for storage
function wibToUtc(date: Date): Date {
  return new Date(date.getTime() - WIB_OFFSET_MS);
}

// Get current time in WIB
function nowInWib(): Date {
  const now = new Date();
  return new Date(now.getTime() + WIB_OFFSET_MS);
}

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
    const scheduleHour = parseInt(formData.get('schedule_hour') as string);
    const scheduleMinute = parseInt(formData.get('schedule_minute') as string || '0');
    const caption = formData.get('caption') as string || '';
    const description = formData.get('description') as string || '';
    const videoFile = formData.get('video') as File;
    const scheduleDatetime = formData.get('schedule_datetime') as string | null;
    const isManualMode = !!scheduleDatetime;

    const currentWib = nowInWib();
    console.log('Received assign-content request:', { 
      username, account, platform, scheduleHour, scheduleMinute, 
      hasVideo: !!videoFile,
      videoName: videoFile?.name,
      videoSize: videoFile?.size,
      scheduleDatetime,
      mode: isManualMode ? 'manual' : 'auto',
      currentTimeWib: currentWib.toISOString(),
      currentTimeUtc: new Date().toISOString()
    });

    // Validate required fields - schedule_hour only required for auto mode
    if (!username || !account || !platform) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: username, account, platform' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // schedule_hour is required only for auto mode
    if (!isManualMode && isNaN(scheduleHour)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required field: schedule_hour (required for auto mode)' 
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

    // 3. Find schedule slot - conditional based on mode
    let slot: { id: string; hour: number; minute: number; type: string; week_days: number[] | null } | null = null;

    if (isManualMode) {
      // Manual mode: slot is optional, just find any active slot for this profile/platform
      const { data: slots, error: slotsError } = await supabase
        .from('schedule_slots')
        .select('*')
        .eq('profile_id', matchedProfile.id)
        .eq('platform', platform)
        .eq('is_active', true)
        .limit(1);

      if (slotsError) {
        console.error('Error fetching slots:', slotsError);
        throw slotsError;
      }

      slot = slots?.[0] || null;
      console.log('Manual mode - slot optional, found:', slot?.id || 'none');
    } else {
      // Auto mode: slot is required with matching hour/minute
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

      slot = slots[0];
      console.log('Auto mode - slot required, found:', slot!.id);
    }

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

    // 5. Calculate scheduled_at based on mode (auto or manual)
    // All times are handled in WIB (UTC+7) and converted to UTC for storage
    let scheduledAtUtc: Date;
    let scheduledAtWib: Date;
    let scheduleMode: string;

    if (isManualMode) {
      // Manual mode: assume schedule_datetime is in WIB, convert to UTC
      const wibTime = new Date(scheduleDatetime!);
      scheduledAtWib = wibTime;
      scheduledAtUtc = wibToUtc(wibTime);
      scheduleMode = 'manual';
      console.log('Manual mode - WIB:', wibTime.toISOString(), '-> UTC:', scheduledAtUtc.toISOString());
    } else {
      // Auto mode: find next available slot that is > now (in WIB context)
      const nowWib = nowInWib();
      console.log('Auto mode - Current time WIB:', nowWib.toISOString());
      
      // Start from today at midnight WIB
      const startDate = new Date(nowWib);
      startDate.setHours(0, 0, 0, 0);

      // Check if slot time has already passed today (in WIB)
      const todaySlotTime = new Date(nowWib);
      todaySlotTime.setHours(scheduleHour, scheduleMinute, 0, 0);

      console.log('Today slot time WIB:', todaySlotTime.toISOString(), 'Now WIB:', nowWib.toISOString());

      // If slot time already passed today, start from tomorrow
      if (nowWib > todaySlotTime) {
        startDate.setDate(startDate.getDate() + 1);
        console.log('Slot time passed today, starting from tomorrow');
      }

      // Get all dates that already have content assigned to this slot
      const { data: existingContents } = await supabase
        .from('contents')
        .select('scheduled_at')
        .eq('scheduled_slot_id', slot!.id)
        .eq('user_id', user.id)
        .in('status', ['assigned', 'scheduled']);

      // Convert existing scheduled_at (UTC) to WIB for comparison
      const occupiedDates = (existingContents || [])
        .map((c: { scheduled_at: string | null }) => {
          if (!c.scheduled_at) return null;
          // Convert UTC to WIB for date comparison
          const utcDate = new Date(c.scheduled_at);
          const wibDate = new Date(utcDate.getTime() + WIB_OFFSET_MS);
          return `${wibDate.getFullYear()}-${wibDate.getMonth()}-${wibDate.getDate()}`;
        })
        .filter(Boolean);

      console.log('Occupied dates for slot (WIB):', occupiedDates);

      // Find the first available date (working in WIB)
      scheduledAtWib = new Date(startDate);
      for (let i = 0; i < 365; i++) {
        const checkDate = new Date(startDate);
        checkDate.setDate(checkDate.getDate() + i);

        // For weekly slots, check if this day of week is active
        if (slot!.type === 'weekly' && slot!.week_days) {
          if (!slot!.week_days.includes(checkDate.getDay())) {
            continue;
          }
        }

        const dateKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
        if (!occupiedDates.includes(dateKey)) {
          scheduledAtWib = checkDate;
          break;
        }
      }

      // Set the time to the slot's hour and minute (WIB)
      scheduledAtWib.setHours(scheduleHour, scheduleMinute, 0, 0);
      
      // Convert WIB to UTC for storage
      scheduledAtUtc = wibToUtc(scheduledAtWib);
      scheduleMode = 'auto';
      
      console.log('Auto mode - Scheduled WIB:', scheduledAtWib.toISOString(), '-> UTC:', scheduledAtUtc.toISOString());
    }

    // 6. Create content record (store in UTC)
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
        scheduled_slot_id: slot?.id || null,
        scheduled_at: scheduledAtUtc.toISOString()
      })
      .select()
      .single();

    if (contentError) {
      console.error('Error creating content:', contentError);
      throw contentError;
    }

    console.log('Content created:', content.id, 'Scheduled UTC:', scheduledAtUtc.toISOString());

    // Extract hour/minute from scheduledAtWib for response
    const responseHour = slot?.hour ?? scheduledAtWib.getHours();
    const responseMinute = slot?.minute ?? scheduledAtWib.getMinutes();

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
            slot_id: slot?.id || null,
            hour: responseHour,
            minute: responseMinute,
            scheduled_at_utc: scheduledAtUtc.toISOString(),
            scheduled_at_wib: formatWib(scheduledAtUtc),
            timezone: 'UTC+7 (WIB)',
            mode: scheduleMode
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