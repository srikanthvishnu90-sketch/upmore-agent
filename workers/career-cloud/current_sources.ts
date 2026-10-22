// Live authorization for one already-claimed, card-bound application. Credentials remain in the parent worker.
// Preparation's snapshot is evidence of what was approved, never proof that the source is still confirmed now.
import { trustedManifest, type TrustedFact } from "../../extension/src/apply_core.ts";
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";
import { assertApprovedPayload, factsFromPayload } from "../career-browser/approve-first.ts";
import { readEngineInput, type EngineInput } from "./engine_input.ts";

export interface CardCloudJob {
  id: string;
  lease_token: string;
  user_id: string;
  company: string;
  url: string;
  payload: any;
  payload_hash?: string;
  approval_hash?: string;
}
export type AuthorizationPhase = "before_engine" | "before_effect";
export type CardCloudRpc = (name: string, body: Record<string, unknown>) => Promise<any>;
const SHA = /^[a-f0-9]{64}$/;
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const deny = (reason: string): never => { throw Object.assign(Error(reason), { code: reason }); };

export async function assertCloudJobIdentity(job: CardCloudJob): Promise<void> {
  const p = job.payload;
  if (!object(p) || p.user_id !== job.user_id || p.url !== job.url || p.company !== job.company ||
    !SHA.test(String(job.payload_hash)) || job.payload_hash !== job.approval_hash ||
    await hashApplyPayload(p) !== job.payload_hash) deny("APPROVED_APPLICATION_CHANGED");
  await assertApprovedPayload(p, { user_id: job.user_id, url: job.url });
  // Messages cloud cards require the modern source/schema contract, never the legacy engine-only hash.
  if (!SHA.test(String(p.manifest_hash)) || !SHA.test(String(p.schema_hash)) ||
    !Array.isArray(p.replay_sources)) deny("INVALID_APPROVED_SCHEMA");
}

const identity = (f: TrustedFact) => JSON.stringify([
  f.table, f.key, f.value, f.factId, f.event, f.provenance, f.authorizes,
]);

// Use the existing canonical projection on BOTH sides. Replaying approved facts alone would miss a later withdrawal.
// The resume is supplied separately and rehashed by the worker. Unrelated additions cannot authorize changed answers.
export function assertCurrentApprovedSources(payload: any, current: EngineInput): void {
  if (current.facts.user_id !== payload.user_id) deny("FACT_OWNER_MISMATCH");
  const frozen = factsFromPayload(payload);
  const before = trustedManifest({ owner: payload.user_id, file: frozen, rows: frozen.text_answers ?? [],
    resume: { sha256: payload.resume_sha256 } });
  const live = trustedManifest({ owner: payload.user_id, file: current.facts, rows: current.facts.text_answers,
    resume: { sha256: payload.resume_sha256 } });
  if (before.hash !== payload.manifest_hash || before.version !== live.version) deny("APPROVED_MANIFEST_CHANGED");
  for (const original of Object.values(before.byFactId)) {
    const now = live.byFactId[original.factId];
    if (!now || identity(now) !== identity(original)) deny("APPROVED_SOURCE_WITHDRAWN");
    // A duplicate fact id at another coordinate must not be treated as the source the person approved.
    const answer = original.table === "answers" ? live.answers[original.key] : live.saved[original.key];
    if (!answer || answer.factId !== original.factId || answer.value !== original.value) deny("APPROVED_SOURCE_WITHDRAWN");
  }
}

export async function authorizeCurrentCloudJob(job: CardCloudJob, phase: AuthorizationPhase,
  deps: { rpc: CardCloudRpc }): Promise<void> {
  if (phase !== "before_engine" && phase !== "before_effect") deny("INVALID_CLOUD_AUTHORIZATION_PHASE");
  await assertCloudJobIdentity(job);
  let snapshot: any;
  try { snapshot = await deps.rpc("career_apply_message_cloud_sources", { p_user: job.user_id }); }
  catch { deny("CARD_CLOUD_SOURCE_READ_FAILED"); }
  if (!object(snapshot) || !Object.hasOwn(snapshot, "profile") || !Array.isArray(snapshot.rows) ||
    !SHA.test(String(snapshot.digest))) deny("CARD_CLOUD_SOURCE_READ_FAILED");
  if (snapshot.user_id !== job.user_id) deny("FACT_OWNER_MISMATCH");
  if (await hashApplyPayload({ user_id: job.user_id, profile: snapshot.profile, rows: snapshot.rows }) !== snapshot.digest)
    deny("CARD_CLOUD_SOURCE_READ_FAILED");
  const input = await readEngineInput({
    latestProfile: async (owner) => owner === job.user_id ? snapshot.profile : deny("FACT_OWNER_MISMATCH"),
    answeredRows: async (owner) => owner === job.user_id ? snapshot.rows : deny("FACT_OWNER_MISMATCH"),
  }, job.user_id, job.payload.resume_sha256);
  assertCurrentApprovedSources(job.payload, input);
  // SQL rechecks the same snapshot digest under the person lock as well as the binding, deadline, switches,
  // opt-in, pause and lease. A changed source snapshot between these calls refuses; no cached authorization.
  const result = await deps.rpc("career_apply_message_cloud_authorize", {
    p_id: job.id, p_lease: job.lease_token, p_hash: job.payload_hash, p_source_digest: snapshot.digest,
  });
  // No transport success, empty object or client echo can stand in for the server's explicit authorization.
  if (!object(result) || result.authorized !== true || result.job_id !== job.id ||
    result.lease_token !== job.lease_token || result.payload_hash !== job.payload_hash) deny("CARD_CLOUD_AUTHORIZATION_REFUSED");
}
