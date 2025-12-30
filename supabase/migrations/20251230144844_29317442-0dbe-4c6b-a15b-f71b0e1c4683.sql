-- Drop existing constraints and recreate with ON DELETE CASCADE

-- profiles
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- contents
ALTER TABLE public.contents
DROP CONSTRAINT IF EXISTS contents_user_id_fkey;

ALTER TABLE public.contents
ADD CONSTRAINT contents_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- schedule_slots
ALTER TABLE public.schedule_slots
DROP CONSTRAINT IF EXISTS schedule_slots_user_id_fkey;

ALTER TABLE public.schedule_slots
ADD CONSTRAINT schedule_slots_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- scheduled_contents
ALTER TABLE public.scheduled_contents
DROP CONSTRAINT IF EXISTS scheduled_contents_user_id_fkey;

ALTER TABLE public.scheduled_contents
ADD CONSTRAINT scheduled_contents_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- upload_history
ALTER TABLE public.upload_history
DROP CONSTRAINT IF EXISTS upload_history_user_id_fkey;

ALTER TABLE public.upload_history
ADD CONSTRAINT upload_history_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_roles
ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;