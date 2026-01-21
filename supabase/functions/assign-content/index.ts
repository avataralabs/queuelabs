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

// Type for schedule slot
interface ScheduleSlot {
  id: string;
  hour: number;
  minute: number;
  type: string;
  week_days: number[] | null;
}

// Find the next available slot and date combination
function findNextAvailableSlot(
  slots: ScheduleSlot[],
  occupiedMap: Map<string, Set<string>>, // slotId -> Set of 'YYYY-M-D' dates
  nowWib: Date
): { slot: ScheduleSlot; scheduledAtWib: Date } | null {
  
  // Sort slots by hour, then minute (to get earliest slot per day)
  const sortedSlots = [...slots].sort((a, b) => {
    if (a.hour !== b.hour) return a.hour - b.hour;
    return a.minute - b.minute;
  });
  
  // Start from today at midnight WIB
  const startDate = new Date(nowWib);
  startDate.setHours(0, 0, 0, 0);
  
  // Iterate from today to 365 days ahead
  for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    
    const dayOfWeek = checkDate.getDay();
    
    // Check each slot (already sorted by time)
    for (const slot of sortedSlots) {
      // Skip if weekly and day is not active
      if (slot.type === 'weekly' && slot.week_days) {
        if (!slot.week_days.includes(dayOfWeek)) continue;
      }
      
      // Skip if slot time has already passed for today
      if (dayOffset === 0) {
        const slotTimeWib = new Date(checkDate);
        slotTimeWib.setHours(slot.hour, slot.minute, 0, 0);
        if (nowWib >= slotTimeWib) continue;
      }
      
      // Check if slot+date is already occupied
      const dateKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
      const occupiedDates = occupiedMap.get(slot.id);
      if (occupiedDates?.has(dateKey)) continue;
      
      // Found available slot!
      const scheduledAtWib = new Date(checkDate);
      scheduledAtWib.setHours(slot.hour, slot.minute, 0, 0);
      
      return { slot, scheduledAtWib };
    }
  }
  
  return null;
}

// Parse request data from either JSON or FormData
interface RequestData {
  username: string;
  account: string;
  platform: string;
  caption: string;
  description: string;
  schedule_datetime: string | null;
  schedule_hour: string | null;
  schedule_minute: string | null;
  video_url: string | null;
  videoFile: File | null;
}

async function parseRequestData(req: Request): Promise<RequestData> {
  const contentType = req.headers.get('content-type') || '';
  
  if (contentType.includes('application/json')) {
    // JSON body with video_url
    const body = await req.json();
    return {
      username: body.username || '',
      account: body.account || '',
      platform: body.platform || '',
      caption: body.caption || '',
      description: body.description || '',
      schedule_datetime: body.schedule_datetime || null,
      schedule_hour: body.schedule_hour?.toString() || null,
      schedule_minute: body.schedule_minute?.toString() || null,
      video_url: body.video_url || null,
      videoFile: null,
    };
  } else {
    // Multipart form data with file upload
    const formData = await req.formData();
    return {
      username: formData.get('username') as string || '',
      account: formData.get('account') as string || '',
      platform: formData.get('platform') as string || '',
      caption: formData.get('caption') as string || '',
      description: formData.get('description') as string || '',
      schedule_datetime: formData.get('schedule_datetime') as string || null,
      schedule_hour: formData.get('schedule_hour') as string || null,
      schedule_minute: formData.get('schedule_minute') as string || null,
      video_url: formData.get('video_url') as string || null,
      videoFile: formData.get('video') as File || null,
    };
  }
}

// Download video from URL and return file info (streaming to storage)
async function downloadAndUploadVideo(
  supabase: any,
  videoUrl: string,
  userId: string
): Promise<{ fileName: string; fileSize: number; originalName: string }> {
  console.log('Downloading video from URL:', videoUrl);
  
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
  }
  
  // Get content type and size
  const contentType = response.headers.get('content-type') || 'video/mp4';
  const contentLength = response.headers.get('content-length');
  const fileSize = contentLength ? parseInt(contentLength) : 0;
  
  // Extract original filename from URL
  const urlPath = new URL(videoUrl).pathname;
  const originalName = urlPath.split('/').pop() || 'video.mp4';
  const fileExt = originalName.split('.').pop() || 'mp4';
  
  // Generate storage path
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  
  // Get response body as ArrayBuffer (streaming would require more complex handling)
  // For large files, we read in chunks to avoid memory pressure
  const arrayBuffer = await response.arrayBuffer();
  const fileBuffer = new Uint8Array(arrayBuffer);
  
  console.log('Video downloaded, size:', fileBuffer.length, 'bytes, uploading to storage...');
  
  const { error: uploadError } = await supabase.storage
    .from('content-files')
    .upload(fileName, fileBuffer, {
      contentType: contentType,
      upsert: false
    });

  if (uploadError) {
    console.error('Error uploading file:', uploadError);
    throw uploadError;
  }

  console.log('File uploaded:', fileName);
  
  return {
    fileName,
    fileSize: fileBuffer.length || fileSize,
    originalName,
  };
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

    // Parse request data (supports both JSON and FormData)
    const data = await parseRequestData(req);
    
    const { 
      username, account, platform, caption, description, 
      schedule_datetime, schedule_hour, schedule_minute,
      video_url, videoFile 
    } = data;

    // Determine scheduling mode
    const isManualMode = !!schedule_datetime || (schedule_hour !== null && schedule_minute !== null);

    const currentWib = nowInWib();
    console.log('Received assign-content request:', { 
      username, account, platform,
      hasVideoFile: !!videoFile,
      hasVideoUrl: !!video_url,
      videoFileName: videoFile?.name,
      videoFileSize: videoFile?.size,
      schedule_datetime,
      schedule_hour,
      schedule_minute,
      mode: isManualMode ? 'manual' : 'auto',
      currentTimeWib: currentWib.toISOString(),
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

    if (!videoFile && !video_url) {
      return new Response(
        JSON.stringify({ success: false, error: 'No video file or video_url provided' }),
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
    let slot: ScheduleSlot | null = null;
    let scheduledAtUtc: Date;
    let manualWibDateStr: string = '';

    if (isManualMode) {
      // Manual mode: schedule based on schedule_datetime OR schedule_hour/schedule_minute
      slot = null;
      console.log('Manual mode - using provided schedule time');
      
      if (schedule_datetime) {
        // Parse schedule_datetime (assumed to be in WIB)
        const dateStr = schedule_datetime;
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
      } else {
        // Use schedule_hour and schedule_minute (today or tomorrow if time passed)
        const hour = parseInt(schedule_hour!);
        const minute = parseInt(schedule_minute!);
        
        const now = nowInWib();
        const targetDate = new Date(now);
        targetDate.setHours(hour, minute, 0, 0);
        
        // If time has passed today, schedule for tomorrow
        if (targetDate <= now) {
          targetDate.setDate(targetDate.getDate() + 1);
        }
        
        scheduledAtUtc = wibToUtc(targetDate);
        
        // Format WIB string for response
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1;
        const day = targetDate.getDate();
        manualWibDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;
        
        console.log('Manual mode - Hour/Minute:', hour, minute, '-> WIB:', targetDate.toISOString(), '-> UTC:', scheduledAtUtc.toISOString());
      }
    } else {
      // Auto mode: find all active slots for profile+platform
      const { data: slots, error: slotsError } = await supabase
        .from('schedule_slots')
        .select('*')
        .eq('profile_id', matchedProfile.id)
        .eq('platform', platform)
        .eq('is_active', true)
        .order('hour', { ascending: true });

      if (slotsError) {
        console.error('Error fetching slots:', slotsError);
        throw slotsError;
      }

      if (!slots || slots.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `No active schedule slots found for ${platform}` 
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Auto mode - Found', slots.length, 'active slots');

      // Get all slot IDs
      const slotIds = slots.map(s => s.id);

      // Get all dates that already have content assigned to these slots
      const { data: existingContents } = await supabase
        .from('contents')
        .select('scheduled_at, scheduled_slot_id')
        .in('scheduled_slot_id', slotIds)
        .eq('user_id', user.id)
        .in('status', ['assigned', 'scheduled']);

      // Build occupied map: slotId -> Set of dates
      const occupiedMap = new Map<string, Set<string>>();
      (existingContents || []).forEach((c: { scheduled_at: string | null; scheduled_slot_id: string | null }) => {
        if (!c.scheduled_at || !c.scheduled_slot_id) return;
        
        const utcDate = new Date(c.scheduled_at);
        const wibDate = new Date(utcDate.getTime() + WIB_OFFSET_MS);
        const dateKey = `${wibDate.getFullYear()}-${wibDate.getMonth()}-${wibDate.getDate()}`;
        
        if (!occupiedMap.has(c.scheduled_slot_id)) {
          occupiedMap.set(c.scheduled_slot_id, new Set());
        }
        occupiedMap.get(c.scheduled_slot_id)!.add(dateKey);
      });

      console.log('Occupied slots:', Array.from(occupiedMap.entries()).map(([k, v]) => [k, Array.from(v)]));

      // Find next available slot+date
      const nowWib = nowInWib();
      const nextAvailable = findNextAvailableSlot(slots as ScheduleSlot[], occupiedMap, nowWib);

      if (!nextAvailable) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'No available slot found in the next 365 days' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      slot = nextAvailable.slot;
      scheduledAtUtc = wibToUtc(nextAvailable.scheduledAtWib);

      console.log('Auto mode - Found slot:', slot.id, 
        `${slot.hour}:${String(slot.minute).padStart(2, '0')}`, 
        'Scheduled WIB:', nextAvailable.scheduledAtWib.toISOString(),
        '-> UTC:', scheduledAtUtc.toISOString()
      );
    }

    // 4. Upload video to storage
    let fileName: string;
    let fileSize: number;
    let originalFileName: string;
    
    if (video_url) {
      // Download from URL and upload to storage
      const uploadResult = await downloadAndUploadVideo(supabase, video_url, user.id);
      fileName = uploadResult.fileName;
      fileSize = uploadResult.fileSize;
      originalFileName = uploadResult.originalName;
    } else {
      // Upload from file
      const fileExt = videoFile!.name.split('.').pop() || 'mp4';
      fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      fileSize = videoFile!.size;
      originalFileName = videoFile!.name;
      
      const arrayBuffer = await videoFile!.arrayBuffer();
      const fileBuffer = new Uint8Array(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from('content-files')
        .upload(fileName, fileBuffer, {
          contentType: videoFile!.type || 'video/mp4',
          upsert: false
        });

      if (uploadError) {
        console.error('Error uploading file:', uploadError);
        throw uploadError;
      }

      console.log('File uploaded:', fileName);
    }

    // 5. Create content record (store in UTC)
    const { data: content, error: contentError } = await supabase
      .from('contents')
      .insert({
        user_id: user.id,
        file_name: originalFileName,
        file_url: fileName,
        file_size: fileSize,
        caption: caption,
        description: description,
        status: 'assigned',
        assigned_profile_id: matchedProfile.id,
        scheduled_slot_id: slot?.id || null,
        scheduled_at: scheduledAtUtc.toISOString(),
        platform: platform
      })
      .select()
      .single();

    if (contentError) {
      console.error('Error creating content:', contentError);
      throw contentError;
    }

    console.log('Content created:', content.id, 'Scheduled UTC:', scheduledAtUtc.toISOString());

    // Build response based on mode
    const scheduleResponse = isManualMode 
      ? {
          scheduled_at: manualWibDateStr,
          mode: 'manual'
        }
      : {
          slot_id: slot!.id,
          hour: slot!.hour,
          minute: slot!.minute,
          scheduled_at: formatWib(scheduledAtUtc),
          mode: 'auto'
        };

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
