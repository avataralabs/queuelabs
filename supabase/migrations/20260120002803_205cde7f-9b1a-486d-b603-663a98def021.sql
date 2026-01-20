-- 1. Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view own schedule_slots" ON public.schedule_slots;
DROP POLICY IF EXISTS "Users can view own scheduled_contents" ON public.scheduled_contents;
DROP POLICY IF EXISTS "Users can view own contents" ON public.contents;

-- 2. Create new SELECT policies that allow admin access
CREATE POLICY "Users can view schedule_slots"
ON public.schedule_slots FOR SELECT
USING (
  (auth.uid() = user_id) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can view scheduled_contents"
ON public.scheduled_contents FOR SELECT
USING (
  (auth.uid() = user_id) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can view contents"
ON public.contents FOR SELECT
USING (
  (auth.uid() = user_id) OR 
  has_role(auth.uid(), 'admin'::app_role)
);