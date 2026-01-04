-- Add columns for tracking upload status and locking
ALTER TABLE contents ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS upload_attempted_at timestamp with time zone;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS webhook_response jsonb;