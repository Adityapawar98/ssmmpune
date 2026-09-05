DROP POLICY IF EXISTS "Approved users can view donations" ON public.donations;
CREATE POLICY "Collectors and admins can view donations"
ON public.donations
FOR SELECT
TO authenticated
USING (
  auth.uid() = collected_by
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Approved users can update donations" ON public.donations;
CREATE POLICY "Collectors and admins can update donations"
ON public.donations
FOR UPDATE
TO authenticated
USING (
  auth.uid() = collected_by
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  auth.uid() = collected_by
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);