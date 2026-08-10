DO $$ BEGIN
  CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status public.approval_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

UPDATE public.profiles p
SET approval_status = 'approved', approved_at = now()
WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin');

CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND approval_status = 'approved'
  );
$$;

REVOKE ALL ON FUNCTION public.is_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_first boolean;
BEGIN
  is_first := NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin');

  INSERT INTO public.profiles (id, full_name, email, approval_status, approved_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    CASE WHEN is_first THEN 'approved'::public.approval_status ELSE 'pending'::public.approval_status END,
    CASE WHEN is_first THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;

  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- profiles: admins manage approval
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- donations: shared read/edit for approved users
DROP POLICY IF EXISTS "Collector or admin can view donations" ON public.donations;
DROP POLICY IF EXISTS "Owner or admin can update donations" ON public.donations;
DROP POLICY IF EXISTS "Signed in users can record donations" ON public.donations;

CREATE POLICY "Approved users can view donations"
ON public.donations FOR SELECT TO authenticated
USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can update donations"
ON public.donations FOR UPDATE TO authenticated
USING (public.is_approved(auth.uid()))
WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can record donations"
ON public.donations FOR INSERT TO authenticated
WITH CHECK (public.is_approved(auth.uid()) AND auth.uid() = collected_by);

-- receipt settings: approved users only
DROP POLICY IF EXISTS "Signed in users can view receipt settings" ON public.receipt_settings;
CREATE POLICY "Approved users can view receipt settings"
ON public.receipt_settings FOR SELECT TO authenticated
USING (public.is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- audit log: approved users only
DROP POLICY IF EXISTS "Signed in users record their own actions" ON public.audit_log;
CREATE POLICY "Approved users record their own actions"
ON public.audit_log FOR INSERT TO authenticated
WITH CHECK (auth.uid() = actor_id AND public.is_approved(auth.uid()));

-- realtime
ALTER TABLE public.donations REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.donations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;