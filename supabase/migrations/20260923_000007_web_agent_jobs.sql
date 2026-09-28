-- Web agent jobs: "Do it for me" — the agent drives a real browser for the
-- user, fills everything it safely can, and stops before the final submit.
-- HARD RULES (enforced in the worker, mirrored here as documentation):
--   * only runs on the user's explicit tap, one job at a time per user
--   * NEVER clicks submit/accept/agree/continue/pay
--   * NEVER fills password, SSN, DOB, payment, or security-question fields
--   * user watches via screenshots and can cancel anytime
CREATE TABLE IF NOT EXISTS web_agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id text NOT NULL,
  target_url text NOT NULL,
  goal text NOT NULL DEFAULT 'Fill the signup form with my details; stop before submitting.',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','working','waiting_user','done','failed','cancelled')),
  -- screenshots: [{at: timestamptz, note: text, image: data-url}] newest last
  screenshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  agent_note text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE web_agent_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_agent_jobs_own ON web_agent_jobs;
-- Users can create/cancel/read their own jobs. The worker uses service_role
-- (bypasses RLS) to update status/screenshots. Users can NEVER update a job
-- directly: status transitions are worker-only, so a user can't fake "done".
CREATE POLICY web_agent_jobs_own ON web_agent_jobs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Clients need read + insert + delete (cancel). Updates are worker-only, so
-- split the policy: allow SELECT/INSERT/DELETE, deny UPDATE.
DROP POLICY IF EXISTS web_agent_jobs_own ON web_agent_jobs;
CREATE POLICY web_agent_jobs_read ON web_agent_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY web_agent_jobs_insert ON web_agent_jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY web_agent_jobs_cancel ON web_agent_jobs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
