-- Human review before visibility (beta fix 2026-09-24):
-- scraped opportunities default to pending_review, only promoted to live
-- after a human checks them. The app-facing view already filters status='live'.
ALTER TABLE live_opportunities DROP CONSTRAINT live_opportunities_status_check;
ALTER TABLE live_opportunities ADD CONSTRAINT live_opportunities_status_check
  CHECK (status IN ('live','expired','removed','pending_review'));
ALTER TABLE live_opportunities ALTER COLUMN status SET DEFAULT 'pending_review';
