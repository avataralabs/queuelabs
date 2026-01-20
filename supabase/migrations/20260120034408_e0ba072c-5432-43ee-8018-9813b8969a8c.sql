-- Add column to store Upload-Post request_id for async uploads
ALTER TABLE contents 
  ADD COLUMN IF NOT EXISTS uploadpost_request_id TEXT;

-- Add index for quick lookup of processing contents
CREATE INDEX IF NOT EXISTS idx_contents_processing 
  ON contents (status) WHERE status = 'processing';