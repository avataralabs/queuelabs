-- Drop existing policies
DROP POLICY IF EXISTS "Users can update own contents" ON public.contents;
DROP POLICY IF EXISTS "Users can delete own contents" ON public.contents;

-- Create new policies with admin access
CREATE POLICY "Users can update own contents or admin"
  ON public.contents FOR UPDATE
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own contents or admin"
  ON public.contents FOR DELETE
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));