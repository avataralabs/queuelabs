-- Add webhook_call_id column for double-upload prevention
ALTER TABLE public.contents
ADD COLUMN IF NOT EXISTS webhook_call_id TEXT;

-- Add index for webhook_call_id
CREATE INDEX IF NOT EXISTS idx_contents_webhook_call_id
ON public.contents (webhook_call_id)
WHERE webhook_call_id IS NOT NULL;

-- Add missing indexes for foreign key columns (performance optimization)
CREATE INDEX IF NOT EXISTS idx_contents_assigned_profile_id
ON public.contents (assigned_profile_id)
WHERE assigned_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contents_scheduled_slot_id
ON public.contents (scheduled_slot_id)
WHERE scheduled_slot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contents_user_id
ON public.contents (user_id);

-- Add index for upload_history queries
CREATE INDEX IF NOT EXISTS idx_upload_history_content_id_status
ON public.upload_history (content_id, status);

-- Add index for schedule_slots queries
CREATE INDEX IF NOT EXISTS idx_schedule_slots_profile_platform
ON public.schedule_slots (profile_id, platform)
WHERE is_active = true;

-- Comment explaining webhook_call_id
COMMENT ON COLUMN public.contents.webhook_call_id IS 'Unique identifier for the webhook call that locked this content, used to prevent double uploads';
