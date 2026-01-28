-- Add retry columns to contents table for Instagram retry mechanism
ALTER TABLE public.contents 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_retry_at timestamp with time zone;

-- Create index for retry queries
CREATE INDEX IF NOT EXISTS idx_contents_retry ON public.contents (next_retry_at) 
WHERE status = 'assigned' AND next_retry_at IS NOT NULL;

-- Create atomic slot assignment function with advisory locking
CREATE OR REPLACE FUNCTION public.assign_next_available_slot(
  p_profile_id UUID,
  p_platform TEXT,
  p_content_id UUID,
  p_user_id UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot RECORD;
  v_scheduled_at TIMESTAMPTZ;
  v_now_wib TIMESTAMPTZ;
  v_check_date DATE;
  v_day_of_week INTEGER;
  v_date_key TEXT;
  v_found BOOLEAN := FALSE;
  v_max_days INTEGER := 365;
  v_day_offset INTEGER := 0;
BEGIN
  -- Acquire advisory lock for this profile+platform combination
  -- This ensures only one request can find and assign a slot at a time
  PERFORM pg_advisory_xact_lock(hashtext(p_profile_id::text || p_platform));
  
  -- Calculate current time in WIB (UTC+7)
  v_now_wib := NOW() AT TIME ZONE 'Asia/Jakarta';
  
  -- Loop through days to find next available slot
  WHILE v_day_offset < v_max_days AND NOT v_found LOOP
    v_check_date := (v_now_wib::date) + v_day_offset;
    v_day_of_week := EXTRACT(DOW FROM v_check_date)::INTEGER;
    
    -- Find available slots for this day
    FOR v_slot IN 
      SELECT ss.id, ss.hour, ss.minute, ss.type, ss.week_days
      FROM schedule_slots ss
      WHERE ss.profile_id = p_profile_id
        AND ss.platform = p_platform
        AND ss.is_active = true
        AND ss.user_id = p_user_id
        -- Check weekly constraint
        AND (ss.type != 'weekly' OR ss.week_days IS NULL OR v_day_of_week = ANY(ss.week_days))
      ORDER BY ss.hour, ss.minute
    LOOP
      -- Calculate scheduled_at in UTC (store as UTC, display as WIB)
      v_scheduled_at := (v_check_date || ' ' || 
        LPAD(v_slot.hour::text, 2, '0') || ':' || 
        LPAD(v_slot.minute::text, 2, '0') || ':00')::timestamp 
        AT TIME ZONE 'Asia/Jakarta' AT TIME ZONE 'UTC';
      
      -- Skip if slot time has already passed today
      IF v_day_offset = 0 AND v_scheduled_at <= NOW() THEN
        CONTINUE;
      END IF;
      
      -- Check if this slot+datetime is already occupied
      IF NOT EXISTS (
        SELECT 1 FROM contents c
        WHERE c.scheduled_slot_id = v_slot.id
          AND c.scheduled_at = v_scheduled_at
          AND c.status IN ('assigned', 'scheduled')
      ) THEN
        -- Found available slot! Update the content
        UPDATE contents
        SET 
          scheduled_slot_id = v_slot.id,
          scheduled_at = v_scheduled_at,
          assigned_profile_id = p_profile_id,
          platform = p_platform,
          status = 'assigned'
        WHERE id = p_content_id
          AND user_id = p_user_id;
        
        v_found := TRUE;
        
        -- Return success with slot info
        RETURN json_build_object(
          'success', true,
          'slot_id', v_slot.id,
          'scheduled_at', v_scheduled_at,
          'hour', v_slot.hour,
          'minute', v_slot.minute,
          'scheduled_date', v_check_date::text
        );
      END IF;
    END LOOP;
    
    v_day_offset := v_day_offset + 1;
  END LOOP;
  
  -- No available slot found
  RETURN json_build_object(
    'success', false,
    'error', 'No available slot found in the next ' || v_max_days || ' days'
  );
END;
$$;

-- Create partial unique index to prevent slot stacking at database level (backup protection)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contents_unique_slot_datetime 
ON public.contents (scheduled_slot_id, scheduled_at) 
WHERE status IN ('assigned', 'scheduled') AND scheduled_slot_id IS NOT NULL AND scheduled_at IS NOT NULL;