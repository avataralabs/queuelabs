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

interface ScheduleSlot {
  id: string;
  hour: number;
  minute: number;
  type: string;
  week_days: number[] | null;
  profile_id: string;
  platform: string;
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

// Find the next available slot and date combination
function findNextAvailableSlot(
  slots: ScheduleSlot[],
  occupiedMap: Map<string, Set<string>>,
  nowWib: Date
): { slot: ScheduleSlot; scheduledAtWib: Date } | null {
  
  // Sort slots by hour, then minute
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

// Merge two occupied maps
function mergeOccupiedMaps(
  map1: Map<string, Set<string>>,
  map2: Map<string, Set<string>>
): Map<string, Set<string>> {
  const merged = new Map<string, Set<string>>();
  
  for (const [key, value] of map1) {
    merged.set(key, new Set(value));
  }
  
  for (const [key, value] of map2) {
    if (merged.has(key)) {
      for (const date of value) {
        merged.get(key)!.add(date);
      }
    } else {
      merged.set(key, new Set(value));
    }
  }
  
  return merged;
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

    const currentWib = nowInWib();
    console.log('Received batch-assign-content request:', { 
      user_id,
      accountsCount: queuelabs_accounts?.length,
      accounts: queuelabs_accounts,
      currentTimeWib: currentWib.toISOString(),
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

    // Fetch all active slots for this user
    const { data: allSlots, error: slotsError } = await supabase
      .from('schedule_slots')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true);

    if (slotsError) {
      console.error('Error fetching slots:', slotsError);
      throw slotsError;
    }

    console.log('Found active slots:', allSlots?.length);

    // Fetch existing assigned/scheduled contents
    const slotIds = (allSlots || []).map(s => s.id);
    const { data: existingContents } = await supabase
      .from('contents')
      .select('scheduled_at, scheduled_slot_id')
      .in('scheduled_slot_id', slotIds.length > 0 ? slotIds : ['_'])
      .eq('user_id', user_id)
      .in('status', ['assigned', 'scheduled']);

    // Build initial occupied map from database
    const dbOccupiedMap = new Map<string, Set<string>>();
    (existingContents || []).forEach((c: { scheduled_at: string | null; scheduled_slot_id: string | null }) => {
      if (!c.scheduled_at || !c.scheduled_slot_id) return;
      
      const utcDate = new Date(c.scheduled_at);
      const wibDate = new Date(utcDate.getTime() + WIB_OFFSET_MS);
      const dateKey = `${wibDate.getFullYear()}-${wibDate.getMonth()}-${wibDate.getDate()}`;
      
      if (!dbOccupiedMap.has(c.scheduled_slot_id)) {
        dbOccupiedMap.set(c.scheduled_slot_id, new Set());
      }
      dbOccupiedMap.get(c.scheduled_slot_id)!.add(dateKey);
    });

    console.log('DB Occupied slots:', Array.from(dbOccupiedMap.entries()).map(([k, v]) => [k, Array.from(v)]));

    // Track slots assigned in this batch
    const batchOccupiedMap = new Map<string, Set<string>>();
    
    // Process each account
    const assignments: AccountAssignment[] = [];
    const errors: { platform: string; username: string; error: string }[] = [];
    const nowWib = nowInWib();

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

      // Get slots for this profile+platform
      const platformSlots = (allSlots || []).filter(
        s => s.profile_id === matchedProfile.id && s.platform === platform
      ) as ScheduleSlot[];

      if (platformSlots.length === 0) {
        console.log(`No active slots for: ${platform} on profile ${matchedProfile.name}`);
        errors.push({
          platform,
          username,
          error: `No active schedule slots for ${platform}`
        });
        continue;
      }

      console.log(`Found ${platformSlots.length} slots for ${platform}`);

      // Merge DB occupied + batch occupied
      const combinedOccupied = mergeOccupiedMaps(dbOccupiedMap, batchOccupiedMap);

      // Find next available slot
      const nextAvailable = findNextAvailableSlot(platformSlots, combinedOccupied, nowWib);

      if (!nextAvailable) {
        console.log(`No available slot in next 365 days for: ${platform}`);
        errors.push({
          platform,
          username,
          error: `No available slot found in the next 365 days for ${platform}`
        });
        continue;
      }

      const { slot, scheduledAtWib } = nextAvailable;
      const scheduledAtUtc = wibToUtc(scheduledAtWib);

      // Mark this slot+date as occupied for subsequent accounts in this batch
      const dateKey = `${scheduledAtWib.getFullYear()}-${scheduledAtWib.getMonth()}-${scheduledAtWib.getDate()}`;
      if (!batchOccupiedMap.has(slot.id)) {
        batchOccupiedMap.set(slot.id, new Set());
      }
      batchOccupiedMap.get(slot.id)!.add(dateKey);

      // Format scheduled date for response
      const scheduledDateStr = `${scheduledAtWib.getFullYear()}-${String(scheduledAtWib.getMonth() + 1).padStart(2, '0')}-${String(scheduledAtWib.getDate()).padStart(2, '0')}`;

      console.log(`Assigned slot: ${slot.id} at ${slot.hour}:${String(slot.minute).padStart(2, '0')} on ${scheduledDateStr}`);

      assignments.push({
        platform,
        username,
        profile_id: matchedProfile.id,
        profile_name: matchedProfile.name,
        schedule_hour: slot.hour,
        schedule_minute: slot.minute,
        scheduled_at: formatWib(scheduledAtUtc),
        scheduled_date: scheduledDateStr,
        slot_id: slot.id,
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
