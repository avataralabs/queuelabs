-- Add is_approved column to user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- Create function to handle new user signup - auto insert user role
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, is_approved)
  VALUES (NEW.id, 'user', false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Create trigger for auto-insert role on signup
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Update existing admin to be approved
UPDATE public.user_roles SET is_approved = true WHERE role = 'admin';