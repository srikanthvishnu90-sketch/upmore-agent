-- Live opportunities: fresh money-making posts found by the scraping workers.
-- Read-only for clients (service_role writes). Dedupe key: source + source_id.
CREATE TABLE IF NOT EXISTS live_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,              -- e.g. 'hackernews'
  source_id text NOT NULL,           -- upstream id (HN item id, etc.)
  title text NOT NULL,
  url text NOT NULL,
  snippet text,
  pay_hint text,                     -- extracted pay signal, if any
  posted_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','expired','removed')),
  UNIQUE (source, source_id)
);
ALTER TABLE live_opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS live_opps_read ON live_opportunities;
CREATE POLICY live_opps_read ON live_opportunities FOR SELECT TO authenticated
  USING (status = 'live');
CREATE POLICY live_opps_read_anon ON live_opportunities FOR SELECT TO anon
  USING (status = 'live');
