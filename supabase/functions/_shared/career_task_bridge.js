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
    prepare: ["action", "version", "eventId", "artifactId", "resumeSha256"],
    approve: ["action", "version", "eventId", "taskId", "payloadSha256", "resumeSha256", "profileSha256", "destination"],
    status: ["action", "version", "taskId", "intentId"],
    reconcile: ["action", "version", "eventId", "taskId"],
  }[value.action];
  if (!fields || Object.keys(value).some(k => !fields.includes(k)) || (value.version && value.version !== VERSION)) return fail();
  const out = { version: VERSION, action: value.action };
  for (const key of fields) if (key !== "version" && value[key] !== undefined) out[key] = value[key];
  if (out.action !== "status" && (typeof out.eventId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(out.eventId))) return fail();
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
    return { intent: null, out: reply(task ? "The owned browser task's saved evidence is attached. No new browser action was started." : "No owned task evidence is available for that reference.", task?.status || "awaiting_user", task) };
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
    destination: taskRequest.action === "prepare" ? ctx.posting.url : taskRequest.destination || null,
    authority_account_version: accountVersion + 1, privacy_epoch: account.epoch || 0 };
  const task = { version: VERSION, id: intent.task_id, userId, status: "queued", kind: "pending_task_intent",
    intent_id: intentId, bindings: intent, provenance: { source: "atomic_career_task_intent", threadId, turnKey } };
  return { intent, out: reply("The browser task intent is queued for a separate worker. No browser action is claimed by this chat reply; its immutable intent reference is attached.", "queued", task) };
}

// ---------------------------------------------------------------------------
// J8 (LOOP ACCEPTANCE tier-1 join, Crew B 2026-10-15): board resolution
// for the batch-apply drive stage (module 155). 155's deps take a
// SYNCHRONOUS boardFor(posting) -> board | null, where a board is
// module 149's contract — the methods open/form/fill/answers/atReview/
// submit — and null is the named stop BOARD_NOT_WIRED.
//
// The owned browser worker supplies board sessions inside its own
// process (150's board factory, executed from committed
// career_task_intent/v1 intents — the asynchronous path above). A
// composition root that can supply sessions synchronously installs a
// PROVIDER here: an object { boardFor(posting), transport? }. This
// factory is the single resolution point every composition root (the
// Edge handler, the harness) goes through, so the wiring cannot drift.
//
// Fail-closed, always: no provider, a provider whose boardFor throws
// (worker unreachable), a provider that returns nothing, or a returned
// object missing any of 149's board methods all resolve to null — the
// drive stops named BOARD_NOT_WIRED and no board is ever faked into
// existence. A bare UPMORE_CAREER_WORKER_URL is NOT a provider: it
// addresses the worker's asynchronous task API (the intent path at the
// top of this file); it cannot vend synchronous board sessions and is
// never treated as one.
const BOARD_METHODS = ["open", "form", "fill", "answers", "atReview", "submit"];
export function createCareerBoardFor(provider) {
  if (!provider || typeof provider.boardFor !== "function") return null;
  return function careerBoardFor(posting) {
    let board = null;
    try { board = provider.boardFor(posting); } catch (_) { return null; }
    if (!board || typeof board !== "object") return null;
    for (const m of BOARD_METHODS) if (typeof board[m] !== "function") return null;
    return board;
  };
}
