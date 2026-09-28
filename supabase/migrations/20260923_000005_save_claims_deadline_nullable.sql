-- Save Side: allow claims without a known deadline (they rot visibly instead
-- of being un-loggable). Idempotent.
ALTER TABLE public.save_claims ALTER COLUMN deadline DROP NOT NULL;
