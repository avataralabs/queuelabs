-- Drop existing unique constraint on user_id only
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_key;

-- Add composite unique constraint (user_id, role) to match the trigger
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role);

-- Insert role for existing user bobby@avataralabs.ai who was missing from user_roles
INSERT INTO public.user_roles (user_id, role, is_approved)
VALUES ('1e634363-f812-4544-aec1-34c37a2ef288', 'user', true)
ON CONFLICT (user_id, role) DO NOTHING;