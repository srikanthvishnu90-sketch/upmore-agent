// extension-sync: the Trainee assisted-apply extension's saved-answers
// sync + employer-confirmation report endpoint (SAVED-ANSWERS SYNC
// lane, 2026-10-20). Thin wrapper: all logic lives in
// ../_shared/extension_sync.js (node-tested); the domain modules ride
// the generated bundle ../_shared/extension_domain.js
// (scripts/build-extension-sync.py — edit packages/domain, never the
// bundle).
//
//   GET  /functions/v1/extension-sync/saved-answers
//        -> the caller's own saved answers (module 149's derivation
//           over their confirmed 122 profile). JWT-verified here via
//           GoTrue (the delete-account pattern); the read is keyed by
//           the verified user id and no request field can name another
//           user.
//   POST /functions/v1/extension-sync/application-proofs
//        -> an employer-confirmation report from the extension after
//           the USER's own submit. Recorded in
//           public.extension_submission_reports as an employer-record-
//           class tracker entry, only when the carried confirmation
//           excerpt re-parses to the claimed confirmation (module
//           150's rules, server-side).
//
// Deploy posture: NOT deployed by the build lane. The migration
// 20261020010001_extension_submission_reports.sql must be applied with
// the rollout (operator, owner's word — the channel_artifacts
// precedent). The function verifies JWTs itself, so the gateway
// verify_jwt setting is not load-bearing.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { ExtensionSync } from "../_shared/extension_sync.js";
import { CareerPortalApply, CareerTrack } from "../_shared/extension_domain.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// Verify the caller's JWT against GoTrue and resolve THEIR user id
// (delete-account/index.ts precedent). Nothing about the caller is
// ever taken from the request body or query.
async function verifyToken(jwt: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return null;
  const me = await res.json();
  return me && me.id ? { id: me.id, email: me.email || null } : null;
}

// The caller's own flow-state snapshots, freshest first — the same
// read the batch worker performs (production-sources.cjs), scoped to
// the verified user id by the query itself.
async function readFlowRows(userId: string) {
  const { data, error } = await admin
    .from("agent_flow_state")
    .select("state, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(25);
  if (error) throw Object.assign(new Error("flow_state_read_failed"), { code: "storage_unavailable" });
  return data || [];
}

async function findReportByConfirmation(userId: string, confirmationId: string) {
  const { data, error } = await admin
    .from("extension_submission_reports")
    .select("id, reported_at")
    .eq("user_id", userId)
    .eq("confirmation_id", confirmationId)
    .limit(1);
  if (error) throw Object.assign(new Error("report_lookup_failed"), { code: "storage_unavailable" });
  return (data && data[0]) || null;
}

async function insertReport(row: Record<string, unknown>) {
  const { data, error } = await admin
    .from("extension_submission_reports")
    .insert(row)
    .select("id, reported_at")
    .single();
  if (error) {
    // Unique (user_id, confirmation_id) race: the twin insert already
    // recorded this confirmation — answer with its receipt.
    if ((error as { code?: string }).code === "23505" && row.confirmation_id) {
      const existing = await findReportByConfirmation(String(row.user_id), String(row.confirmation_id));
      if (existing) return existing;
    }
    throw Object.assign(new Error("report_insert_failed"), { code: "storage_unavailable" });
  }
  return data;
}

// The database's own check (trainee_may_act, 20261026230000): the extension serves a person only once Trainee has let them in.
async function mayAct(userId: string) {
  const { data, error } = await admin.rpc("trainee_may_act", { p_user: userId });
  return !error && data === true;
}

const service = ExtensionSync.createExtensionSyncService({
  mayAct,
  portalApply: CareerPortalApply,
  track: CareerTrack,
  verifyToken,
  readFlowRows,
  findReportByConfirmation,
  insertReport,
  now: () => Date.now(),
});

serve((req) => ExtensionSync.handleRequest(req, service));
