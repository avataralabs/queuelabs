CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, is_approved)
  VALUES (NEW.id, 'user', false)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;