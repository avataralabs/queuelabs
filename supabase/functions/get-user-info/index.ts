import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// WIB timezone utilities (consistent with assign-content API)
const WIB_OFFSET_HOURS = 7;
const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

function nowInWib(): Date {
  const now = new Date();
  return new Date(now.getTime() + WIB_OFFSET_MS);
}

function formatWib(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19) + ' WIB';
}

interface Slot {
  id: string;
  hour: number;
  minute: number;
  type: string;
  week_days: number[] | null;
  profile_id: string;
  platform: string;
}

interface ScheduledContent {
  scheduled_at: string;
  scheduled_slot_id: string;
}

// Find next available slot+date (consistent with assign-content API)
function findNextAvailableSlot(
  slots: Slot[],
  occupiedMap: Map<string, Set<string>>,
  nowWib: Date
): { slot: Slot; scheduledAtWib: Date } | null {
  
  const sortedSlots = [...slots].sort((a, b) => {
    if (a.hour !== b.hour) return a.hour - b.hour;
    return a.minute - b.minute;
  });
  
  for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
    const checkDate = new Date(nowWib);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    checkDate.setHours(0, 0, 0, 0);
    
    const dayOfWeek = checkDate.getDay();
    
    for (const slot of sortedSlots) {
      if (slot.type === 'weekly' && slot.week_days) {
        if (!slot.week_days.includes(dayOfWeek)) continue;
      }
      
      if (dayOffset === 0) {
        const slotTimeWib = new Date(checkDate);
        slotTimeWib.setHours(slot.hour, slot.minute, 0, 0);
        if (nowWib >= slotTimeWib) continue;
      }
      
      const dateKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
      const occupiedDates = occupiedMap.get(slot.id);
      if (occupiedDates?.has(dateKey)) continue;
      
      const scheduledAtWib = new Date(checkDate);
      scheduledAtWib.setHours(slot.hour, slot.minute, 0, 0);
      
      return { slot, scheduledAtWib };
    }
  }
  
  return null;
}

serve(async (req) => {
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

    const isAdmin = userRoles?.role === 'admin';
    console.log('User role:', userRoles?.role, 'isAdmin:', isAdmin);

    // 3. Get profiles with connected accounts (admin sees ALL, user sees own)
    let profilesQuery = supabaseAdmin.from('profiles').select('*');
    if (!isAdmin) {
      profilesQuery = profilesQuery.eq('user_id', user.id);
    }
    const { data: profiles } = await profilesQuery;

    console.log('Fetched profiles count:', profiles?.length || 0);

    // 4. Get ALL schedule slots (admin sees ALL, user sees own)
    let slotsQuery = supabaseAdmin
      .from('schedule_slots')
      .select('*')
      .eq('is_active', true)
      .order('hour', { ascending: true });
    if (!isAdmin) {
      slotsQuery = slotsQuery.eq('user_id', user.id);
    }
    const { data: scheduleSlots } = await slotsQuery;

    // 5. Get contents summary (admin sees ALL, user sees own)
    let contentsQuery = supabaseAdmin
      .from('contents')
      .select('id, status, scheduled_at, scheduled_slot_id');
    if (!isAdmin) {
      contentsQuery = contentsQuery.eq('user_id', user.id);
    }
    const { data: contents } = await contentsQuery;

    // 6. Get scheduled contents (upcoming) (admin sees ALL, user sees own)
    let scheduledQuery = supabaseAdmin
      .from('scheduled_contents')
      .select('*')
      .gte('scheduled_date', new Date().toISOString())
      .order('scheduled_date', { ascending: true });
    if (!isAdmin) {
      scheduledQuery = scheduledQuery.eq('user_id', user.id);
    }
    const { data: scheduledContents } = await scheduledQuery
      .limit(10);

    // 7. Get upload history summary (admin sees ALL, user sees own)
    let historyQuery = supabaseAdmin
      .from('upload_history')
      .select('id, status');
    if (!isAdmin) {
      historyQuery = historyQuery.eq('user_id', user.id);
    }
    const { data: uploadHistory } = await historyQuery;

    // Build occupied map for all slots (scheduled content)
    const occupiedMap = new Map<string, Set<string>>();
    (contents || []).forEach(c => {
      if (!c.scheduled_at || !c.scheduled_slot_id) return;
      if (!['assigned', 'scheduled'].includes(c.status)) return;
      
      const utcDate = new Date(c.scheduled_at);
      const wibDate = new Date(utcDate.getTime() + WIB_OFFSET_MS);
      const dateKey = `${wibDate.getFullYear()}-${wibDate.getMonth()}-${wibDate.getDate()}`;
      
      if (!occupiedMap.has(c.scheduled_slot_id)) {
        occupiedMap.set(c.scheduled_slot_id, new Set());
      }
      occupiedMap.get(c.scheduled_slot_id)!.add(dateKey);
    });

    const nowWib = nowInWib();

    // Build accounts array with schedule slots AND next available slot
    const accounts: Array<{
      platform: string;
      username: string;
      profile_name: string;
      profile_id: string;
      schedule_slots: Array<{ id: string; hour: number; minute: number; type: string; week_days: number[] | null }>;
      next_available_slot: {
        slot_id: string;
        hour: number;
        minute: number;
        scheduled_at_wib: string;
        scheduled_at_utc: string;
      } | null;
    }> = [];

    // Process each profile and its connected accounts
    for (const profile of profiles || []) {
      const connectedAccounts = profile.connected_accounts || [];
      
      for (const account of connectedAccounts) {
        // Get slots for this profile and platform
        const platformSlots = (scheduleSlots || [])
          .filter(slot => slot.profile_id === profile.id && slot.platform === account.platform);

        const slotsFormatted = platformSlots.map(slot => ({
          id: slot.id,
          hour: slot.hour,
          minute: slot.minute,
          type: slot.type || 'daily',
          week_days: slot.week_days
        }));

        // Find next available slot for this profile+platform
        let nextAvailable: {
          slot_id: string;
          hour: number;
          minute: number;
          scheduled_at_wib: string;
          scheduled_at_utc: string;
        } | null = null;

        if (platformSlots.length > 0) {
          const result = findNextAvailableSlot(platformSlots as Slot[], occupiedMap, nowWib);
          if (result) {
            const utcDate = new Date(result.scheduledAtWib.getTime() - WIB_OFFSET_MS);
            nextAvailable = {
              slot_id: result.slot.id,
              hour: result.slot.hour,
              minute: result.slot.minute,
              scheduled_at_wib: formatWib(result.scheduledAtWib),
              scheduled_at_utc: utcDate.toISOString()
            };
          }
        }

        accounts.push({
          platform: account.platform,
          username: account.username || account.display_name || '',
          profile_name: profile.name,
          profile_id: profile.id,
          schedule_slots: slotsFormatted,
          next_available_slot: nextAvailable
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
        },
        server_time: {
          utc: new Date().toISOString(),
          wib: formatWib(nowWib)
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
