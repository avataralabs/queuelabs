-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view own upload_history" ON public.upload_history;

-- Create new SELECT policy that includes admin access
CREATE POLICY "Users can view upload_history" 
ON public.upload_history 
FOR SELECT 
TO authenticated 
USING (
  (auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)
);