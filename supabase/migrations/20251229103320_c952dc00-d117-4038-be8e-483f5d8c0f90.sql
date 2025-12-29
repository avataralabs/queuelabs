-- Function to get user's last sign in from auth.users
CREATE OR REPLACE FUNCTION public.get_user_last_sign_in(_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT last_sign_in_at
  FROM auth.users
  WHERE id = _user_id
$$;