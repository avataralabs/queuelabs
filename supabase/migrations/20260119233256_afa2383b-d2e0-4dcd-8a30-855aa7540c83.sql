-- Drop policy lama
DROP POLICY IF EXISTS "Users can view own profiles" ON public.profiles;

-- Buat policy baru: user lihat milik sendiri, admin lihat semua
CREATE POLICY "Users can view profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin')
);