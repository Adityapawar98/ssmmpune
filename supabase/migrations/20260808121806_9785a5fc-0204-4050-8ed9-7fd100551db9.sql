-- Donations: restrict reads to collector or admin
DROP POLICY IF EXISTS "Signed in users can view donations" ON public.donations;
CREATE POLICY "Collector or admin can view donations"
ON public.donations FOR SELECT TO authenticated
USING (auth.uid() = collected_by OR public.has_role(auth.uid(), 'admin'::app_role));

-- User roles: restrict reads to own row or admin
DROP POLICY IF EXISTS "Signed in users can view roles" ON public.user_roles;
CREATE POLICY "Own roles or admin can view roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger-only SECURITY DEFINER functions must not be callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_donation_txn_id() FROM PUBLIC, anon, authenticated;
