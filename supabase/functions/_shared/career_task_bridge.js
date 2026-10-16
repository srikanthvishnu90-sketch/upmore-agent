import { normalizeResearchRequest } from "./career_research_policy.js";
// Intent planning only. SQL commits this intent with the reply receipt.
// No HTTP worker transport or browser effect is permitted in a chat turn.
const VERSION = "career_task_intent/v1";
const fail = () => { throw Object.assign(new Error("invalid_career_task"), { code: "invalid_career_task" }); };
const hash64 = v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const id32 = v => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
export function normalizeCareerTaskRequest(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return fail();
  const fields = {
    research: ["action", "version", "eventId", "url", "question"],
    prepare: ["action", "version", "eventId", "artifactId", "resumeSha256"],
    approve: ["action", "version", "eventId", "taskId", "payloadSha256", "resumeSha256", "profileSha256", "destination"],
    status: ["action", "version", "taskId", "intentId"],
    reconcile: ["action", "version", "eventId", "taskId"],
  }[value.action];
  if (!fields || Object.keys(value).some(k => !fields.includes(k)) || (value.version && value.version !== VERSION)) return fail();
  const out = { version: VERSION, action: value.action };
  for (const key of fields) if (key !== "version" && value[key] !== undefined) out[key] = value[key];
  if (out.action !== "status" && (typeof out.eventId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(out.eventId))) return fail();
  if (out.action === "research") Object.assign(out, normalizeResearchRequest(out));
  if (out.action === "prepare" && (!/^[A-Za-z0-9_-]{1,160}$/.test(out.artifactId || "") || !hash64(out.resumeSha256))) return fail();
  if (["approve", "reconcile"].includes(out.action) && !id32(out.taskId)) return fail();
  if (out.action === "status" && ((!id32(out.taskId) && !hash64(out.intentId)) || (out.taskId && out.intentId))) return fail();
  if (out.action === "approve") {
    if (!hash64(out.payloadSha256) || !hash64(out.resumeSha256) || (out.profileSha256 != null && !hash64(out.profileSha256))) return fail();
    let url; try { url = new URL(out.destination); } catch (_) { return fail(); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || url.href !== out.destination) return fail();
  }
  return out;
}
export async function planCareerTaskIntent({ taskRequest, message, userId, threadId, turnKey, requestHash, ctx, accountVersion, account, persistence }) {
  const reply = (text, status, task = null) => ({ reply: text, intent: "career_browser_task", resultStatus: status,
    contained: false, task, capabilities: ctx.workerCapabilities, result: { task, sends: 0 } });
  if (taskRequest.action === "status") {
    const task = await persistence.readTask({ userId, taskId: taskRequest.taskId || null, intentId: taskRequest.intentId || null });
    if (task?.result?.kind === "public_research_result") {
      const a = task.result.artifact, source = a.source;
      return { intent: null, out: reply(`Public source capture: ${source.title} — ${source.url} (captured ${source.capturedAt}). Untrusted source excerpt: ${JSON.stringify(a.capture.text.slice(0,80))}. The question still requires review; correlated source evidence is attached.`, task.status, task) };
    }
    return { intent: null, out: reply(task ? (task.blocker ? `The browser task is blocked: ${task.blocker}. No completed research answer is claimed. Saved task evidence is attached.` : "The owned browser task's saved evidence is attached. No new browser action was started.") : "No owned task evidence is available for that reference.", task?.status || "awaiting_user", task) };
  }
  if (taskRequest.action === "approve" && message !== "Approve browser task " + taskRequest.taskId) {
    return { intent: null, out: reply("Approve the specific browser task explicitly from its exact review; a bare yes authorizes nothing.", "awaiting_user") };
  }
  if (taskRequest.action === "prepare" && (!ctx.posting?.url || !ctx.posting?.canonicalKey)) {
    return { intent: null, out: reply("Choose the posting and existing owned resume artifact before queuing browser preparation.", "awaiting_user") };
  }
  const bytes = new TextEncoder().encode(JSON.stringify([VERSION, userId, threadId, turnKey, requestHash]));
  const intentId = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
  const intent = { version: VERSION, intent_id: intentId, user_id: userId, thread_id: threadId, turn_key: turnKey,
    request_hash: requestHash, action: taskRequest.action, task_id: taskRequest.taskId || null, event_id: taskRequest.eventId,
    artifact_id: taskRequest.artifactId || null, resume_sha256: taskRequest.resumeSha256 || null,
    payload_sha256: taskRequest.payloadSha256 || null, profile_sha256: taskRequest.profileSha256 || null,
    destination: taskRequest.action === "research" ? taskRequest.url : taskRequest.action === "prepare" ? ctx.posting.url : taskRequest.destination || null,
    ...(taskRequest.action === "research" ? { research: { url: taskRequest.url, question: taskRequest.question } } : {}),
    authority_account_version: accountVersion + 1, privacy_epoch: account.epoch || 0 };
  const task = { version: VERSION, id: intent.task_id, userId, status: "queued", kind: "pending_task_intent",
    intent_id: intentId, bindings: intent, provenance: { source: "atomic_career_task_intent", threadId, turnKey } };
  return { intent, out: reply((taskRequest.action === "research" ? `Public read-only research is queued. No browser outcome is claimed yet. Ask Research status ${intentId} for saved evidence after the worker runs. ` : "") + "The browser task intent is queued for a separate worker. No browser action is claimed by this chat reply; its immutable intent reference is attached.", "queued", task) };
}
