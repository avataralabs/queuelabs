-- Add platform column to contents table for storing platform from assign-content request
ALTER TABLE public.contents ADD COLUMN platform text;