-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create contents table
CREATE TABLE public.contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  caption TEXT,
  file_size BIGINT DEFAULT 0,
  file_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  scheduled_slot_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'scheduled', 'uploaded', 'failed', 'removed')),
  removed_at TIMESTAMPTZ,
  removed_from_profile_id UUID,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create schedule_slots table
CREATE TABLE public.schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  minute INTEGER NOT NULL DEFAULT 0 CHECK (minute >= 0 AND minute <= 59),
  is_active BOOLEAN DEFAULT true,
  type TEXT NOT NULL DEFAULT 'daily' CHECK (type IN ('daily', 'weekly')),
  week_days INTEGER[],
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create scheduled_contents table
CREATE TABLE public.scheduled_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES public.schedule_slots(id) ON DELETE CASCADE,
  scheduled_date TIMESTAMPTZ NOT NULL,
  hour INTEGER NOT NULL,
  minute INTEGER NOT NULL DEFAULT 0,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create upload_history table
CREATE TABLE public.upload_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES public.contents(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view own profiles" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own profiles" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profiles" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own profiles" ON public.profiles FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for contents
CREATE POLICY "Users can view own contents" ON public.contents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own contents" ON public.contents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contents" ON public.contents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own contents" ON public.contents FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for schedule_slots
CREATE POLICY "Users can view own schedule_slots" ON public.schedule_slots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own schedule_slots" ON public.schedule_slots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own schedule_slots" ON public.schedule_slots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own schedule_slots" ON public.schedule_slots FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for scheduled_contents
CREATE POLICY "Users can view own scheduled_contents" ON public.scheduled_contents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own scheduled_contents" ON public.scheduled_contents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scheduled_contents" ON public.scheduled_contents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own scheduled_contents" ON public.scheduled_contents FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for upload_history
CREATE POLICY "Users can view own upload_history" ON public.upload_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own upload_history" ON public.upload_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create storage bucket for content files
INSERT INTO storage.buckets (id, name, public) VALUES ('content-files', 'content-files', false);

-- Create storage policies
CREATE POLICY "Users can view own content files" ON storage.objects FOR SELECT USING (bucket_id = 'content-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can upload own content files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'content-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own content files" ON storage.objects FOR UPDATE USING (bucket_id = 'content-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own content files" ON storage.objects FOR DELETE USING (bucket_id = 'content-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create indexes for better query performance
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_contents_user_id ON public.contents(user_id);
CREATE INDEX idx_contents_assigned_profile ON public.contents(assigned_profile_id);
CREATE INDEX idx_contents_status ON public.contents(status);
CREATE INDEX idx_schedule_slots_profile_id ON public.schedule_slots(profile_id);
CREATE INDEX idx_schedule_slots_user_id ON public.schedule_slots(user_id);
CREATE INDEX idx_scheduled_contents_user_id ON public.scheduled_contents(user_id);
CREATE INDEX idx_scheduled_contents_scheduled_date ON public.scheduled_contents(scheduled_date);
CREATE INDEX idx_upload_history_user_id ON public.upload_history(user_id);