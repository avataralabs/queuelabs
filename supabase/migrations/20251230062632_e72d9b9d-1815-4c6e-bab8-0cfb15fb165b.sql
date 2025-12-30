-- Add Upload-Post integration columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS uploadpost_username TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS connected_accounts JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS access_url TEXT,
ADD COLUMN IF NOT EXISTS access_url_expires_at TIMESTAMP WITH TIME ZONE;