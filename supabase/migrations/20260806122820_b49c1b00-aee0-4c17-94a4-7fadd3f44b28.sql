ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS txn_id text;

ALTER TABLE public.donations
  ADD CONSTRAINT donations_payment_mode_check CHECK (payment_mode IN ('cash','online'));

CREATE OR REPLACE FUNCTION public.set_donation_txn_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.txn_id IS NULL THEN
    NEW.txn_id := 'SSMM-' || to_char(COALESCE(NEW.created_at, now()), 'YYYY') || '-' || lpad(NEW.receipt_no::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS donations_set_txn_id ON public.donations;
CREATE TRIGGER donations_set_txn_id
BEFORE INSERT ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.set_donation_txn_id();

UPDATE public.donations
SET txn_id = 'SSMM-' || to_char(created_at, 'YYYY') || '-' || lpad(receipt_no::text, 6, '0')
WHERE txn_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS donations_txn_id_key ON public.donations (txn_id);