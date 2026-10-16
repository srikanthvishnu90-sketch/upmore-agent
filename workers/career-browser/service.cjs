"use strict";
const fs = require("node:fs");
const Portal = require("../../packages/domain/149-career-portal-apply.js");
const Browser = require("../../packages/domain/150-career-portal-browser.js");
const { hash, fail, clone } = require("./store.cjs");
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const bindingHash = value => hash(canonical(value));

// Receive -> Equip -> Execute -> Check. No model/provider call. Production
// execution is deliberately disabled: this slice permits registered, local
// controlled portals only. Authentication and equipment are host injections.
function createWorker({ store, resolveEquipment, authority, controlledPortals = [], boardFactory = Browser.createBrowserBoard, readReceipt, now = Date.now, maxActions = 120, timeoutMs = 30000 }) {
  if (!store || typeof resolveEquipment !== "function") throw fail("WORKER_NOT_WIRED");
  for (const method of ["current", "claim", "begin", "consume", "settle", "finish", "pending"]) if (typeof authority?.[method] !== "function") throw fail("TASK_AUTHORITY_NOT_WIRED");
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > 1000 || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw fail("BUDGET_CONFIGURATION_INVALID");
  const portals = new Map(controlledPortals.map((p) => {
    const u = new URL(p.url), submit = new URL(p.submitUrl);
    if (u.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(u.hostname) || submit.origin !== u.origin) throw fail("CONTROLLED_LOCAL_PORTAL_REQUIRED");
    return [u.href, { url: u.href, submitUrl: submit.href, seatKey: p.canonicalKey || u.href }];
  }));
  const save = (t, phase, detail = {}) => {
    t.phase = phase;
    t.checkpoints.push({ sequence: t.checkpoints.length + 1, phase, at: new Date(now()).toISOString(), ...detail });
    store.put(t);
  };
  const owned = (id, uid) => { const t = store.get(id); if (!t || t.userId !== uid) throw fail("TASK_NOT_FOUND"); return t; };
  function checkAuthority(t, readOnly = false) {
    const current = authority.current(t.userId);
    if (!current.exists || current.epoch !== t.privacyEpoch) {
      t.spec = null; t.review = null; t.result = null; t.asks = []; t.authority = null;
      if (t.attempt) t.attempt = { fenced: true, receiptKey: hash([t.id, "submit"]), unknown: true };
      t.status = t.attempt ? "unknown_outcome" : "cancelled"; t.blocker = "PRIVACY_EPOCH_REVOKED";
      save(t, "check"); throw fail("PRIVACY_EPOCH_REVOKED");
    }
    if (!readOnly && (!t.authority || current.version !== t.authority.accountVersion || (current.paused && t.authority.binding.action !== "reconcile"))) {
      t.status = t.attempt ? "unknown_outcome" : "cancelled"; t.blocker = "TASK_AUTHORITY_REVOKED";
      save(t, "check"); throw fail("TASK_AUTHORITY_REVOKED");
    }
    return current;
  }
  function effect(t, operation, fn) {
    checkAuthority(t);
    const sequence = t.effectSequence = (t.effectSequence || 0) + 1;
    save(t, "execute", { action: operation, effectSequence: sequence });
    const ticket = authority.begin(t.authority, operation, hash([t.id, t.authority.intentId, sequence, operation]));
    authority.consume(t.authority, ticket);
    const before = hash([t.id, t.authority.intentId, sequence, operation]);
    try {
      const out = fn();
      authority.settle(t.authority, ticket, "completed", before, hash(out === undefined ? null : out));
      return out;
    } catch (e) {
      try { authority.settle(t.authority, ticket, "uncertain", before, null); } catch (_) {}
      e.effectUncertain = true; throw e;
    }
  }
  const validProof = (t, proof) => proof?.taskId === t.id && proof.userId === t.userId && proof.destination === t.attempt?.destination && proof.payloadSha256 === t.attempt?.payloadSha256 && proof.resumeSha256 === t.attempt?.resumeSha256 && proof.confirmationId && proof.source === "controlled_portal_readback";
  function destinationProof(t) {
    if (typeof readReceipt !== "function") return null;
    if (t.budget.spentActions + t.budget.reservedActions >= t.budget.limitActions) { t.blocker = "READBACK_BUDGET_EXHAUSTED"; return null; }
    t.budget.reservedActions++; save(t, "execute", { action: "destination_readback", actionState: "reserved" });
    try { return effect(t, "destination_readback", () => readReceipt(clone(t))); }
    finally {
      t.budget.reservedActions--; t.budget.spentActions++;
      save(t, "check", { action: "destination_readback", actionState: "settled" });
    }
  }
  function publicTask(t) {
    return clone({ version: "career_task/v1", id: t.id, userId: t.userId, status: t.status, phase: t.phase, revision: t.revision,
      review: t.review || null, result: t.result || null, asks: t.asks || [],
      blocker: t.blocker || null, budget: t.budget,
      authority: t.authority ? { intentId: t.authority.intentId, accountVersion: t.authority.accountVersion, privacyEpoch: t.authority.privacyEpoch } : null,
      capabilities: { browser: "CONTROLLED_LOCAL_ONLY", employer_submission: "NOT_WIRED" } });
  }
  function receive(userId, input) {
    if (typeof userId !== "string" || !userId || userId.length > 160 || !input
      || typeof input.eventId !== "string" || !input.eventId || input.eventId.length > 200
      || typeof input.posting?.canonicalKey !== "string" || !input.posting.canonicalKey || input.posting.canonicalKey.length > 500
      || typeof input.artifactId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.artifactId)
      || !/^[a-f0-9]{64}$/.test(input.resumeSha256 || "")) throw fail("TASK_INPUT_REQUIRED");
    if (!portals.has(input.posting.url)) throw fail("DESTINATION_NOT_REGISTERED");
    // One identity per user and seat, independent of webhook ID. A replay
    // with altered facts cannot silently mutate an already reviewed task.
    const id = hash([userId, portals.get(input.posting.url).seatKey]).slice(0, 32);
    return store.withLock(id, () => {
      const specification = { posting: input.posting, artifactId: input.artifactId, resumeSha256: input.resumeSha256 };
      const existing = store.get(id);
      const grant = authority.claim({ userId, intentId: input.intentId, taskId: id,
        leaseToken: existing?.authority?.intentId === input.intentId ? existing.authority.leaseToken : null,
        expected: { action: "prepare", event_id: input.eventId, artifact_id: input.artifactId, resume_sha256: input.resumeSha256, destination: input.posting.url } });
      if (existing && existing.specHash !== bindingHash(specification)) throw fail("TASK_SPEC_CONFLICT");
      if (grant.request && bindingHash(grant.request.posting) !== bindingHash(input.posting)) throw fail("TASK_AUTHORITY_BINDING_MISMATCH");
      if (existing) {
        checkAuthority(existing, true);
        if (existing.specHash !== bindingHash(specification)) throw fail("TASK_SPEC_CONFLICT");
        if (!existing.attempt && existing.authority?.accountVersion !== grant.accountVersion) { existing.authority = grant; existing.status = "queued"; save(existing, "receive"); }
        return publicTask(existing);
      }
      const t = { id, userId, spec: clone(specification), specHash: bindingHash(specification), receivedEvent: input.eventId,
        status: "queued", revision: 0, checkpoints: [], approvals: [], authority: grant, privacyEpoch: grant.privacyEpoch,
        budget: { limitActions: maxActions, spentActions: 0, reservedActions: 0, spendCents: 0 } };
      save(t, "receive");
      return publicTask(t);
    });
  }
  function equip(t) {
    checkAuthority(t);
    const e = resolveEquipment(t.userId, t.spec.artifactId);
    if (!e || e.userId !== t.userId || !e.profile || !e.resumePath) throw fail("EQUIPMENT_OWNER_MISMATCH");
    if (e.privacyEpoch !== t.privacyEpoch || e.accountVersion !== t.authority.accountVersion) throw fail("STALE_EQUIPMENT_AUTHORITY");
    const bytes = fs.readFileSync(e.resumePath);
    if (hash(bytes) !== t.spec.resumeSha256) throw fail("RESUME_SHA_MISMATCH");
    // Store no chat transcript or credential; resolve confirmed facts afresh
    // and bind their exact version to the review. Missing facts stay missing.
    const profile = clone(e.profile);
    if (profile.resume?.sha256 !== t.spec.resumeSha256) throw fail("RESUME_SHA_MISMATCH");
    const profileHash = hash(profile);
    save(t, "equip", { artifactSha256: t.spec.resumeSha256, profileHash });
    return { ...e, profile, profileHash };
  }
  function executeBoard(t, e, deadline) {
    const registered = portals.get(t.spec.posting.url);
    const board = boardFactory({ url: registered.url, userId: t.userId, resumePath: e.resumePath,
      commandTimeoutMs: Math.max(1, deadline - now()), deadlineMs: deadline,
      scope: { origin: new URL(registered.url).origin, submitUrl: registered.submitUrl, taskId: t.id,
        userId: t.userId, payloadSha256: t.review?.payloadSha256 || null, resumeSha256: t.spec.resumeSha256 } });
    // Every browser command reserves before the effect and settles afterwards.
    // A crash leaves a reservation that recovery charges conservatively.
    const wrapped = Object.create(board);
    for (const method of ["open", "form", "fill", "answers", "atReview", "armForSubmit", "submit", "submissionState"]) {
      if (typeof board[method] !== "function") continue;
      wrapped[method] = (...args) => {
        if (now() >= deadline) throw fail("TASK_TIMEOUT");
        if (t.budget.spentActions + t.budget.reservedActions >= t.budget.limitActions) throw fail("ACTION_BUDGET_EXHAUSTED");
        t.budget.reservedActions++;
        save(t, "execute", { action: method, actionState: "reserved" });
        try {
          const result = effect(t, method, () => board[method](...args));
          if (result && typeof result.then === "function") throw fail("SYNC_BOARD_REQUIRED");
          save(t, "check", { action: method, observationSha256: hash(result === undefined ? null : result) });
          return result;
        } finally {
          t.budget.reservedActions--; t.budget.spentActions++;
          save(t, "check", { action: method, actionState: "settled" });
        }
      };
    }
    return { board: wrapped, close: () => { try { board.close?.(); } catch (_) {} } };
  }
  function prepareLocked(t, approval) {
    const oldReview = t.review;
    t.status = "preparing"; save(t, "equip");
    const deadline = now() + timeoutMs;
    let run;
    try {
      const e = equip(t);
      run = executeBoard(t, e, deadline);
      const session = Portal.createPortalSession({ userId: t.userId, board: run.board });
      const prepared = Portal.runApply(session, { userId: t.userId, posting: t.spec.posting, profile: e.profile, attestations: e.attestations || {}, log: { records: [] }, now: new Date(now()).toISOString() });
      if (prepared.resultStatus !== "prepared") {
        t.status = prepared.resultStatus; t.asks = prepared.asks || []; t.blocker = prepared.code || null;
        save(t, "check"); return publicTask(t);
      }
      t.review = { kind: "career_browser_review", taskId: t.id, userId: t.userId,
        authority: { intentId: t.authority.intentId, accountVersion: t.authority.accountVersion, privacyEpoch: t.privacyEpoch },
        postingKey: t.spec.posting.canonicalKey, destination: portals.get(t.spec.posting.url).submitUrl,
        resumeSha256: t.spec.resumeSha256, profileHash: e.profileHash,
        bindings: prepared.stepLog.filter((s) => s.action === "fill").map((s) => ({ fieldId: s.field_id, source: s.source, profileKey: s.profile_key || null, questionKey: s.question_key || null, profileHash: e.profileHash })),
        observation: run.board.lastObservation || null,
        payload: session.doorstep.payload, payloadSha256: session.doorstep.payloadSha256,
        observedAt: new Date(now()).toISOString(), expiresAt: new Date(now() + 600000).toISOString() };
      t.status = "review_ready"; t.blocker = null; t.asks = [];
      save(t, "check", { reviewSha256: t.review.payloadSha256 });
      if (!approval) return publicTask(t);
      if (!oldReview || oldReview.payloadSha256 !== t.review.payloadSha256 || oldReview.profileHash !== t.review.profileHash) {
        t.blocker = "REVIEW_CHANGED_REAPPROVAL_REQUIRED"; save(t, "check"); return publicTask(t);
      }
      if (now() >= Date.parse(oldReview.expiresAt)) throw fail("APPROVAL_EXPIRED");
      // Write-ahead fence BEFORE calling 149's one-shot gate. Any crash from
      // this point requires readback; no new approval can cause a re-click.
      t.approvals.push(approval.approvalRef);
      t.status = "unknown_outcome";
      t.attempt = { approvalRef: approval.approvalRef, payloadSha256: t.review.payloadSha256, destination: t.review.destination, resumeSha256: t.review.resumeSha256 };
      save(t, "execute", { action: "submit", actionState: "write_ahead_fence" });
      // Combine fix (2026-10-15, composition defect): forward the approval's
      // payloadSha256 — approve() above validated it against the stored
      // review and the re-prepared review hash was checked equal, so this is
      // exactly the doorstep's hash. Without it, 149's MI-116 gate correctly
      // refuses the hashless approval (APPROVAL_PAYLOAD_MISMATCH) before the
      // arming wire and no click ever happens.
      const outcome = Portal.submitDoorstep(session, { approvedByUser: true, approvalRef: approval.approvalRef, payloadSha256: approval.payloadSha256 }, { posting: t.spec.posting, log: { records: [] }, now: new Date(now()).toISOString() });
      const proof = destinationProof(t);
      t.status = validProof(t, proof) ? "completed" : "unknown_outcome";
      t.result = { kind: "career_browser_result", taskId: t.id, status: t.status, approvalRef: approval.approvalRef,
        destination: t.review.destination, payloadSha256: t.review.payloadSha256, resumeSha256: t.review.resumeSha256,
        receipt: validProof(t, proof) ? proof : null,
        capture: outcome.submission ? { confirmationId: outcome.submission.confirmationId || null, confirmationUrl: outcome.submission.confirmationUrl || null } : null,
        checkedAt: new Date(now()).toISOString() };
      save(t, "check");
      return publicTask(t);
    } catch (e) {
      t.status = t.attempt || e.effectUncertain ? "unknown_outcome" : /REVOKED/.test(e.code || "") ? "cancelled" : "blocked";
      t.blocker = e.code || "WORKER_RUNTIME_FAILURE";
      save(t, "check");
      return publicTask(t);
    } finally { run?.close(); }
  }
  function finish(t) {
    if (!t.authority) return publicTask(t);
    try {
      if (authority.finish(t.authority, publicTask(t)).state !== "completed") {
        checkAuthority(t);
        throw fail("TASK_RESULT_UNCONFIRMED");
      }
    } catch (e) {
      try { checkAuthority(t); } catch (_) {}
      t.status = t.attempt ? "unknown_outcome" : "cancelled";
      t.blocker = e.code || "TASK_RESULT_UNCONFIRMED"; save(t, "check");
    }
    return publicTask(t);
  }
  function prepare(userId, id) {
    return store.withLock(id, () => {
      const t = owned(id, userId);
      try { checkAuthority(t); } catch (_) { return publicTask(t); }
      if (t.attempt || t.status === "completed") return publicTask(t);
      // A crashed read/fill reservation consumes budget; it is never free.
      t.budget.spentActions += t.budget.reservedActions; t.budget.reservedActions = 0;
      prepareLocked(t); return finish(t);
    });
  }
  function approve(userId, id, approval) {
    return store.withLock(id, () => {
      const t = owned(id, userId);
      checkAuthority(t, true);
      if (typeof approval?.approvalRef !== "string" || !approval.approvalRef.trim() || approval.approvalRef.length > 200 || approval.approvedByUser !== true) throw fail("APPROVAL_REQUIRED");
      if (t.approvals.includes(approval.approvalRef)) return publicTask(t);
      if (t.attempt) throw fail("RECONCILE_REQUIRED");
      if (t.status !== "review_ready" || !t.review) throw fail("REVIEW_REQUIRED");
      if (now() >= Date.parse(t.review.expiresAt)) throw fail("APPROVAL_EXPIRED");
      for (const [field, expected] of Object.entries({ payloadSha256: t.review.payloadSha256, resumeSha256: t.review.resumeSha256, destination: t.review.destination })) {
        if (approval[field] !== expected) throw fail("APPROVAL_BINDING_MISMATCH");
      }
      if (approval.profileSha256 != null && approval.profileSha256 !== t.review.profileHash) throw fail("APPROVAL_BINDING_MISMATCH");
      t.authority = authority.claim({ userId, intentId: approval.intentId, taskId: id,
        expected: { action: "approve", event_id: approval.approvalRef, task_id: id, payload_sha256: approval.payloadSha256, resume_sha256: approval.resumeSha256, destination: approval.destination, profile_sha256: approval.profileSha256 } });
      prepareLocked(t, approval); return finish(t);
    });
  }
  function reconcile(userId, id, options = {}) {
    return store.withLock(id, () => {
      const t = owned(id, userId);
      checkAuthority(t, true);
      if (!t.attempt || t.status === "completed") return publicTask(t);
      t.authority = authority.claim({ userId, intentId: options.intentId, taskId: id, expected: { action: "reconcile", task_id: id } });
      t.budget.spentActions += t.budget.reservedActions; t.budget.reservedActions = 0;
      save(t, "check", { actionState: "crash_reservations_settled" });
      const proof = destinationProof(t);
      if (validProof(t, proof)) {
        t.status = "completed";
        t.result = { kind: "career_browser_result", taskId: t.id, status: t.status, approvalRef: t.attempt.approvalRef, receipt: proof, checkedAt: new Date(now()).toISOString(), reconciled: true };
      } else { t.status = "unknown_outcome"; t.blocker = "DESTINATION_READBACK_REQUIRED"; }
      save(t, "check"); return finish(t);
    });
  }
  return { receive, prepare, approve, reconcile, get: (userId, id) => { const t=owned(id,userId);try{checkAuthority(t,true);}catch(e){if(e.code!=="PRIVACY_EPOCH_REVOKED")throw e;}return publicTask(t); },
    runPending: () => {
      const results=[];
      for(const intent of authority.pending()) {
        try {
          const b=intent.binding;
          if(b.action==="prepare") { const task=receive(intent.userId,{...intent.request,intentId:intent.intentId});results.push(prepare(intent.userId,task.id)); }
          else if(b.action==="approve") results.push(approve(intent.userId,b.task_id,{approvedByUser:true,approvalRef:b.event_id,intentId:intent.intentId,payloadSha256:b.payload_sha256,resumeSha256:b.resume_sha256,destination:b.destination,profileSha256:b.profile_sha256}));
          else if(b.action==="reconcile") results.push(reconcile(intent.userId,b.task_id,{intentId:intent.intentId}));
        } catch(e) { results.push({intentId:intent.intentId,status:"blocked",blocker:e.code||"TASK_AUTHORITY_UNAVAILABLE"}); }
      }
      for(const id of store.list()) {const t=store.get(id);if(t.status==="queued")results.push(prepare(t.userId,id));}
      return results;
    } };
}
module.exports = { createWorker };
