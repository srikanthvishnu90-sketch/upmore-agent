"use strict";
const fs = require("node:fs");
const Portal = require("../../packages/domain/149-career-portal-apply.js");
const Browser = require("../../packages/domain/150-career-portal-browser.js");
const { hash, fail, clone } = require("./store.cjs");
const {validResearchPNG}=require('./research-png.cjs');
const { validControlledReceipt } = require('./receipt.cjs');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const bindingHash = value => hash(canonical(value));

// Receive -> Equip -> Execute -> Check. No model/provider call. Production
// employer execution remains disabled. Applications use registered loopback
// portals; public research has a separate read-only origin policy.
function createWorker({ store, resolveEquipment, authority, controlledPortals = [], nativePortals = [], evidenceRoot, evidenceRequired = false, researchOrigins = [], researchBoardFactory = Browser.createResearchBoard, boardFactory = Browser.createBrowserBoard, readReceipt, now = Date.now, retentionClock=Date.now, retentionSchedule=setTimeout, privateRetentionMs=900000, maxActions = 120, timeoutMs = 30000 }) {
  if (!store || ((controlledPortals.length || nativePortals.length) && typeof resolveEquipment !== "function")) throw fail("WORKER_NOT_WIRED");
  for (const method of ["current", "claim", "begin", "consume", "settle", "finish", "pending"]) if (typeof authority?.[method] !== "function") throw fail("TASK_AUTHORITY_NOT_WIRED");
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > 1000 || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw fail("BUDGET_CONFIGURATION_INVALID");
  const portals = new Map(controlledPortals.map((p) => {
    const u = new URL(p.url), submit = new URL(p.submitUrl);
    if (u.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(u.hostname) || submit.origin !== u.origin) throw fail("CONTROLLED_LOCAL_PORTAL_REQUIRED");
    return [u.href, { url: u.href, submitUrl: submit.href, seatKey: p.canonicalKey || u.href }];
  }));
  // Separate native registration leaves the global controlled-loopback gate
  // unchanged. Native validation currently refuses every employer URL.
  for(const input of nativePortals){
    const m=require('./greenhouse-native.cjs').validateManifest(input);
    if(portals.has(m.url))throw fail('DESTINATION_REGISTRATION_CONFLICT');
    portals.set(m.url,{url:m.url,submitUrl:m.submitUrl,seatKey:m.canonicalKey,nativeManifest:m});
  }
  const {publicResearchURL,normalizeResearchRequest} = require('../../supabase/functions/_shared/career_research_policy.js');
  const publicOrigins = new Set(researchOrigins.map(origin => {
    if (new URL(publicResearchURL(origin + '/')).origin !== origin) throw fail('RESEARCH_ORIGIN_CONFIGURATION_INVALID');
    return origin;
  }));
  if(evidenceRequired && !evidenceRoot)throw fail("EVIDENCE_ROOT_REQUIRED");
  const evidenceCapture=evidenceRoot?require("./evidence.cjs").createEvidenceCapture(evidenceRoot):null;
  let auditCursor=0;
  let cancelEvidenceExpiry;
  const retention=require('./private-retention.cjs').createPrivateRetention({store,eraseEvidence:id=>evidenceCapture?.erase(id),clock:retentionClock,schedule:retentionSchedule,ttlMs:privateRetentionMs});
  function markExpired(id,removed){store.withLock(id,()=>{const t=store.get(id);if(!t)return;for(const [stage,d]of Object.entries(t.evidence||{}))if(removed.includes(d.ref))t.evidence[stage]={stage,status:"EXPIRED"};save(t,"check");});}
  function releaseEvidence({immediate=false}={}){
    cancelEvidenceExpiry?.();retention.cancel();
    if(immediate){retention.sweep(true);evidenceCapture?.sweepUntracked(store.list(),{immediate:true});}
    else {retention.arm();cancelEvidenceExpiry=evidenceCapture?.scheduleExpiry(markExpired);}
  }
  const save = (t, phase, detail = {}) => {
    retention.stamp(t);
    t.phase = phase;
    t.checkpoints.push({ sequence: t.checkpoints.length + 1, phase, at: new Date(now()).toISOString(), ...detail });
    store.put(t);
  };
  const owned = (id, uid) => { const t = store.get(id); if (!t || t.userId !== uid) throw fail("TASK_NOT_FOUND"); return t; };
  function checkAuthority(t, readOnly = false) {
    if(retention.expired(t)){if(t.privateExpiredAt===undefined)retention.expire(t);throw fail('PRIVATE_RETENTION_EXPIRED');}
    const current = authority.current(t.userId);
    if (!current.exists || current.epoch !== t.privacyEpoch) {
      t.spec = null; t.review = null; t.result = null; t.asks = []; t.authority = null;
      if(t.kind==='public_research/v1'){t.publicationTask=null;t.publicationPending=false;t.publicationReceipt=null;}
      t.evidence={};evidenceCapture?.erase(t.id);
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
  function effect(t, operation, fn, digest=hash) {
    checkAuthority(t);
    const sequence = t.effectSequence = (t.effectSequence || 0) + 1;
    save(t, "execute", { action: operation, effectSequence: sequence });
    const ticket = authority.begin(t.authority, operation, hash([t.id, t.authority.intentId, sequence, operation]));
    authority.consume(t.authority, ticket);
    const before = hash([t.id, t.authority.intentId, sequence, operation]);
    try {
      const out = fn();
      authority.settle(t.authority, ticket, "completed", before, digest(out === undefined ? null : out));
      return out;
    } catch (e) {
      try { authority.settle(t.authority, ticket, "uncertain", before, null); } catch (_) {}
      e.effectUncertain = true; throw e;
    }
  }
  const validProof = validControlledReceipt;
  function captureEvidence(t,board,stage,confirmationId) {
    if(!evidenceCapture)return;
    const descriptor=evidenceCapture.capture(t,board,stage,confirmationId);t.evidence ||= {};t.evidence[stage]=descriptor;
    save(t,"check",{evidenceStage:stage,evidenceStatus:descriptor.status});
    if(evidenceRequired&&stage==="confirmed-receipt"&&descriptor.status!=="CAPTURED")t.blocker="REQUIRED_RECEIPT_EVIDENCE_MISSING";
    if(evidenceRequired && stage!=="confirmed-receipt" && descriptor.status!=="CAPTURED")throw fail("REQUIRED_BROWSER_EVIDENCE_MISSING");
  }
  function destinationProof(t,board) {
    if (typeof readReceipt !== "function") return null;
    if (t.budget.spentActions + t.budget.reservedActions >= t.budget.limitActions) { t.blocker = "READBACK_BUDGET_EXHAUSTED"; return null; }
    t.budget.reservedActions++; save(t, "execute", { action: "destination_readback", actionState: "reserved" });
    try { return effect(t, "destination_readback", () => {
      const proof=readReceipt(clone(t));
      if(evidenceCapture && validProof(t,proof)) {
        if(typeof board?.captureReceiptEvidence==='function')captureEvidence(t,board,"confirmed-receipt",proof.confirmationId);
        else {t.evidence ||= {};t.evidence["confirmed-receipt"]={status:"NOT_VERIFIED",stage:"confirmed-receipt"};save(t,"check");}
      }
      return proof;
    }); }
    finally {
      t.budget.reservedActions--; t.budget.spentActions++;
      save(t, "check", { action: "destination_readback", actionState: "settled" });
    }
  }
  function publicTask(t) {
    // Local checkpoint revisions continue changing during save recovery. Once
    // confirmed, expose the exact immutable central receipt on every read.
    if(t.kind==='public_research/v1'&&t.publicationReceipt&&!t.publicationPending&&t.status===t.publicationReceipt.status&&t.blocker===t.publicationReceipt.blocker&&bindingHash(t.result)===bindingHash(t.publicationReceipt.result))return clone(t.publicationReceipt);
    return clone({ version: "career_task/v1", kind: t.kind || "career_application", id: t.id, userId: t.userId, status: t.status, phase: t.phase, revision: t.revision,
      review: t.review || null, result: t.result || null, evidence:t.evidence||{}, asks: t.asks || [],
      blocker: t.blocker || null, budget: t.budget,
      privateDataExpiresAt:Number.isFinite(t.privateExpiresAt)?new Date(t.privateExpiresAt).toISOString():null,
      privateDataExpiredAt:Number.isFinite(t.privateExpiredAt)?new Date(t.privateExpiredAt).toISOString():null,
      authority: t.authority ? { intentId: t.authority.intentId, accountVersion: t.authority.accountVersion, privacyEpoch: t.authority.privacyEpoch } : null,
      capabilities: { browser: t.kind === "public_research/v1" ? "PUBLIC_READ_ONLY" : "CONTROLLED_LOCAL_ONLY", employer_submission: "NOT_WIRED" } });
  }
  function receive(userId, input) {
    if (input?.action === "research") return receiveResearch(userId, input);
    if (typeof userId !== "string" || !userId || userId.length > 160 || !input
      || typeof input.eventId !== "string" || !input.eventId || input.eventId.length > 200
      || typeof input.posting?.canonicalKey !== "string" || !input.posting.canonicalKey || input.posting.canonicalKey.length > 500
      || typeof input.artifactId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.artifactId)
      || !/^[a-f0-9]{64}$/.test(input.resumeSha256 || "")) throw fail("TASK_INPUT_REQUIRED");
    if (!portals.has(input.posting.url)) throw fail("DESTINATION_NOT_REGISTERED");
    if(portals.get(input.posting.url).nativeManifest && input.posting.canonicalKey!==portals.get(input.posting.url).seatKey)throw fail("NATIVE_POSTING_BINDING_MISMATCH");
    // One identity per user and seat, independent of webhook ID. A replay
    // with altered facts cannot silently mutate an already reviewed task.
    const id = hash([userId, portals.get(input.posting.url).seatKey]).slice(0, 32);
    return store.withLock(id, () => {
      const specification = { posting: input.posting, artifactId: input.artifactId, resumeSha256: input.resumeSha256, ...(portals.get(input.posting.url).nativeManifest?{nativeManifestSha256:bindingHash(portals.get(input.posting.url).nativeManifest)}:{}) };
      const existing = store.get(id);
      if(existing&&retention.expired(existing)){if(existing.privateExpiredAt===undefined)retention.expire(existing);throw fail('PRIVATE_RETENTION_EXPIRED');}
      const grant = authority.claim({ userId, intentId: input.intentId, taskId: id,
        leaseToken: existing?.authority?.intentId === input.intentId ? existing.authority.leaseToken : null,
        expected: { action: "prepare", event_id: input.eventId, artifact_id: input.artifactId, resume_sha256: input.resumeSha256, destination: input.posting.url } });
      if (existing && existing.specHash !== bindingHash(specification)) throw fail("TASK_SPEC_CONFLICT");
      if (grant.request && bindingHash(grant.request.posting) !== bindingHash(input.posting)) throw fail("TASK_AUTHORITY_BINDING_MISMATCH");
      if (existing) {
        checkAuthority(existing, true);
        if (existing.specHash !== bindingHash(specification)) throw fail("TASK_SPEC_CONFLICT");
        if (!existing.attempt && existing.authority?.accountVersion !== grant.accountVersion) { existing.authority = grant; existing.status = "queued"; save(existing, "receive"); }
        else if(!existing.attempt&&existing.authority?.intentId===grant.intentId&&existing.authority?.leaseToken!==grant.leaseToken){existing.authority=grant;save(existing,"receive");}
        return publicTask(existing);
      }
      const t = { id, userId, spec: clone(specification), specHash: bindingHash(specification), receivedEvent: input.eventId,
        status: "queued", revision: 0, checkpoints: [], approvals: [], authority: grant, privacyEpoch: grant.privacyEpoch,
        budget: { limitActions: maxActions, spentActions: 0, reservedActions: 0, spendCents: 0 } };
      save(t, "receive");
      return publicTask(t);
    });
  }
  function receiveResearch(userId, input) {
    if (typeof userId !== 'string' || !userId || userId.length > 160 || !/^[A-Za-z0-9_-]{1,128}$/.test(input.eventId || '') || Object.keys(input).some(k => !['action','eventId','intentId','url','question'].includes(k))) throw fail('TASK_INPUT_REQUIRED');
    const spec = normalizeResearchRequest(input);
    if (!publicOrigins.has(new URL(spec.url).origin)) throw fail('RESEARCH_ORIGIN_NOT_REGISTERED');
    const id = hash([userId, 'public_research/v1', input.intentId]).slice(0,32);
    return store.withLock(id, () => {
      const existing = store.get(id);
      if (existing) {
        checkAuthority(existing,true);if(existing.specHash!==bindingHash(spec))throw fail('TASK_SPEC_CONFLICT');
        if(existing.status==='queued'&&existing.authority?.intentId===input.intentId){
          const grant=authority.claim({userId,intentId:input.intentId,taskId:id,leaseToken:existing.authority.leaseToken,expected:{action:'research',event_id:input.eventId,destination:spec.url}});
          if(grant.leaseToken!==existing.authority.leaseToken){existing.authority=grant;save(existing,'receive');}
        }return publicTask(existing);
      }
      const grant = authority.claim({userId,intentId:input.intentId,taskId:id,expected:{action:'research',event_id:input.eventId,destination:spec.url}});
      if (bindingHash(grant.binding.research) !== bindingHash(spec) || bindingHash(grant.request?.research) !== bindingHash(spec)) throw fail('TASK_AUTHORITY_BINDING_MISMATCH');
      const t={id,userId,kind:'public_research/v1',spec,specHash:bindingHash(spec),authority:grant,privacyEpoch:grant.privacyEpoch,status:'queued',revision:0,checkpoints:[],approvals:[],budget:{limitActions:maxActions,spentActions:0,reservedActions:0,spendCents:0}};
      save(t,'receive');return publicTask(t);
    });
  }
  function research(userId,id) {
    return store.withLock(id,()=>{
      const t=owned(id,userId);let board;
      if(t.kind!=='public_research/v1')throw fail('TASK_KIND_MISMATCH');
      try {
        checkAuthority(t);
        if(t.publicationPending){return finish(t);}
        if(t.result || t.status!=='queued')return publicTask(t);
        if(!publicOrigins.has(new URL(t.spec.url).origin))throw fail('RESEARCH_ORIGIN_NOT_REGISTERED');
        t.status='reading';save(t,'execute');
        board=researchBoardFactory({taskId:t.id,intentId:t.authority.intentId,commandTimeoutMs:timeoutMs,deadlineMs:now()+timeoutMs});
        t.budget.reservedActions++;save(t,'execute',{action:'read_public_page',actionState:'reserved'});
        const readStartedAt=now();
        let capture;try { capture=effect(t,'read_public_page',()=>board.readPage(t.spec.url),bindingHash); }
        finally {t.budget.reservedActions--;t.budget.spentActions++;save(t,'check',{action:'read_public_page',actionState:'settled'});}
        checkAuthority(t);
        if(capture?.then || capture?.version!=='public_research_capture/v1' || capture.provenance!=='owned_chromium_dom' || capture.taskId!==t.id || capture.intentId!==t.authority.intentId || capture.url!==t.spec.url || capture.untrusted!==true || !/^[a-f0-9]{64}$/.test(capture.sourceSha256||'') || !capture.sessionId || !Array.isArray(capture.navigation) || !capture.navigation.some(e=>e.status==='read'&&e.url===t.spec.url&&e.method==='GET'&&e.httpStatus===200&&e.sourceSha256===capture.sourceSha256) || !capture.screenshot?.base64)throw fail('RESEARCH_EVIDENCE_INVALID');
        const png=Buffer.from(capture.screenshot.base64,'base64');
        if(capture.screenshot.mimeType!=='image/png' || png.toString('base64')!==capture.screenshot.base64 || png.length!==capture.screenshot.bytes || hash(png)!==capture.screenshot.sha256 || !validResearchPNG(png))throw fail('RESEARCH_EVIDENCE_INVALID');
        if(typeof capture.text!=='string' || capture.text.length>24000 || typeof capture.capturedAt!=='string' || !Number.isFinite(Date.parse(capture.capturedAt)))throw fail('RESEARCH_EVIDENCE_INVALID');
        const captured=Date.parse(capture.capturedAt),completed=now();
        if(captured<readStartedAt-30000||captured>completed+30000||!capture.navigation.some(e=>e.status==='read'&&e.url===t.spec.url&&e.method==='GET'&&e.httpStatus===200&&e.sourceSha256===capture.sourceSha256&&Number.isFinite(Date.parse(e.at))&&Date.parse(e.at)>=readStartedAt-30000&&Date.parse(e.at)<=captured+30000))throw fail('RESEARCH_EVIDENCE_INVALID');
        const artifact={version:'public_research_artifact/v1',taskId:t.id,intentId:t.authority.intentId,question:t.spec.question,provenance:{threadId:t.authority.binding.thread_id,turnKey:t.authority.binding.turn_key,requestHash:t.authority.binding.request_hash},source:{url:capture.url,title:capture.title,capturedAt:capture.capturedAt,sourceSha256:capture.sourceSha256},capture,trust:'untrusted_source_data',objectiveStatus:'requires_review',claim:'Source capture only. The research question is not marked answered or verified.'};
        t.status=capture.blocked?'blocked':capture.text.trim()?'evidence_ready':'insufficient_evidence';t.blocker=capture.blocked||null;
        t.result={kind:'public_research_result',status:t.status,artifact,artifactSha256:bindingHash(artifact),artifactEncoding:"sorted-json/v1",browserOutcome:'observed',sends:0,submissions:0};save(t,'check');
      } catch(e) {
        t.status=/REVOKED/.test(e.code||'')?'cancelled':'blocked';t.blocker=e.code||'RESEARCH_RUNTIME_UNAVAILABLE';
        t.result=null;save(t,'check');
      } finally {try{board?.close();}catch(_){}}
      if(t.authority){t.publicationTask=publicTask(t);t.publicationPending=true;save(t,'check');}
      return finish(t);
    });
  }
  function equip(t) {
    checkAuthority(t);
    if (typeof resolveEquipment !== "function") throw fail("WORKER_NOT_WIRED");
    const e = resolveEquipment(t.userId, t.spec.artifactId,{accountVersion:t.authority.accountVersion,privacyEpoch:t.privacyEpoch,taskId:t.id,intentId:t.authority.intentId,leaseToken:t.authority.leaseToken,postingKey:t.spec.posting.canonicalKey,resumeSha256:t.spec.resumeSha256});
    try {
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
    }catch(error){try{e?.release?.();}catch(_){}throw error;}
  }
  function executeBoard(t, e, deadline) {
    const registered = portals.get(t.spec.posting.url);
    if(registered.nativeManifest && t.spec.nativeManifestSha256!==bindingHash(registered.nativeManifest))throw fail("NATIVE_MANIFEST_CHANGED");
    const board = boardFactory({ url: registered.url, userId: t.userId, resumePath: e.resumePath,
      resumeContentType:e.profile.resume.contentType, nativeManifest:registered.nativeManifest || null,
      commandTimeoutMs: Math.max(1, deadline - now()), deadlineMs: deadline,
      ...(evidenceRoot?{evidenceRoot,evidenceDir:require("node:path").join(evidenceRoot,t.id)}:{}),
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
          const result = effect(t, method, () => {
            const observed=board[method](...args);
            if(method==="open" && observed?.ok)captureEvidence(t,board,"form-read");
            if(method==="atReview" && observed?.atFinalReview)captureEvidence(t,board,"filled-review");
            return observed;
          });
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
    let run,equipment;
    try {
      const e = equipment = equip(t);
      run = executeBoard(t, e, deadline);
      const session = Portal.createPortalSession({ userId: t.userId, board: run.board });
      const prepared = Portal.runApply(session, { userId: t.userId, posting: t.spec.posting, profile: e.profile, attestations: e.attestations || {}, log: { records: [] }, now: new Date(now()).toISOString() });
      if (prepared.resultStatus !== "prepared") {
        t.status = prepared.resultStatus; t.asks = prepared.asks || []; t.blocker = prepared.code || null;
        save(t, "check"); return publicTask(t);
      }
      t.review = { kind: "career_browser_review", taskId: t.id, userId: t.userId,
        authority: { intentId: t.authority.intentId, accountVersion: t.authority.accountVersion, privacyEpoch: t.privacyEpoch },
        postingKey: t.spec.posting.canonicalKey, nativeManifestSha256:t.spec.nativeManifestSha256 || null, destination: portals.get(t.spec.posting.url).submitUrl,
        resumeSha256: t.spec.resumeSha256, artifactVersion:e.artifactVersion || null, profileHash: e.profileHash,
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
      const proof = destinationProof(t,run.board);
      t.status = validProof(t, proof) ? "completed" : "unknown_outcome";
      t.result = { kind: "career_browser_result", taskId: t.id, status: t.status, approvalRef: approval.approvalRef,
        destination: t.review.destination, payloadSha256: t.review.payloadSha256, resumeSha256: t.review.resumeSha256,
        receipt: validProof(t, proof) ? proof : null,
        nativeDispatchObservation:run.board.nativeReceiptCapture?.dispatch || null,
        capture: outcome.submission ? { confirmationId: outcome.submission.confirmationId || null, confirmationUrl: outcome.submission.confirmationUrl || null } : null,
        checkedAt: new Date(now()).toISOString() };
      save(t, "check");
      return publicTask(t);
    } catch (e) {
      t.status = t.attempt || e.effectUncertain ? "unknown_outcome" : /REVOKED/.test(e.code || "") ? "cancelled" : "blocked";
      t.blocker = e.code || "WORKER_RUNTIME_FAILURE";
      save(t, "check");
      return publicTask(t);
    } finally {
      try{run?.close();}finally{try{equipment?.release?.();}catch(_){t.blocker='EQUIPMENT_CLEANUP_FAILED';if(!t.attempt)t.status='blocked';save(t,'check');}}
    }
  }
  function finish(t) {
    if (!t.authority) return publicTask(t);
    try {
      if (authority.finish(t.authority, t.kind==='public_research/v1'&&t.publicationTask?t.publicationTask:publicTask(t)).state !== "completed") {
        checkAuthority(t);
        throw fail("TASK_RESULT_UNCONFIRMED");
      }
      if(t.kind==='public_research/v1'&&t.publicationPending){t.publicationReceipt=clone(t.publicationTask);t.publicationPending=false;t.blocker=t.publicationTask?.blocker||null;t.publicationTask=null;save(t,'check');}
    } catch (e) {
      let current=true;try { checkAuthority(t); } catch (_) {current=false;}
      if(t.kind==='public_research/v1'&&current){t.publicationPending=true;t.blocker='TASK_RESULT_UNCONFIRMED';save(t,'check');return publicTask(t);}
      if(t.kind==='public_research/v1')t.publicationPending=false;
      t.status = t.attempt ? "unknown_outcome" : "cancelled";
      t.blocker = e.code || "TASK_RESULT_UNCONFIRMED"; save(t, "check");
    }
    return publicTask(t);
  }
  function prepare(userId, id) {
    return store.withLock(id, () => {
      const t = owned(id, userId);
      if(t.kind==="public_research/v1")throw fail("RESEARCH_ACTION_REFUSED");
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
      if(t.kind==="public_research/v1")throw fail("RESEARCH_ACTION_REFUSED");
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
      if(t.kind==="public_research/v1")throw fail("RESEARCH_ACTION_REFUSED");
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
  return { receive, prepare, approve, reconcile, research, releaseEvidence, get: (userId, id) => { const t=owned(id,userId);try{checkAuthority(t,true);}catch(e){if(!["PRIVACY_EPOCH_REVOKED","PRIVATE_RETENTION_EXPIRED"].includes(e.code))throw e;}return publicTask(t); },
    runPending: ({limit=50,taskId}={}) => {
      if(!Number.isInteger(limit)||limit<1||limit>50)throw fail("TASK_BATCH_LIMIT_INVALID");
      if(taskId!==undefined&&!/^[a-f0-9]{32}$/.test(taskId))throw fail("TASK_ID_INVALID");
      retention.sweep();
      evidenceCapture?.sweepUntracked(store.list(),{at:retentionClock()});
      // Polling observes revocation even while a task is idle at review. No
      // browser operation or task redispatch occurs in this authority audit.
      const auditIds=store.list().sort(),auditBatch=new Set(taskId?[taskId]:[]);
      for(let n=0;n<Math.min(10,auditIds.length);n++)auditBatch.add(auditIds[(auditCursor+n)%auditIds.length]);
      if(auditIds.length)auditCursor=(auditCursor+10)%auditIds.length;
      for(const id of auditBatch)store.withLock(id,()=>{
        const t=store.get(id);if(!t)return;
        if(t.blocker==="PRIVACY_EPOCH_REVOKED"||t.privateExpiredAt!==undefined)return;
        try{checkAuthority(t,true);}catch(e){if(e.code!=="PRIVACY_EPOCH_REVOKED")throw e;return;}
        const expired=evidenceCapture?.expire(id,now())||[];
        if(expired.length){for(const [stage,d]of Object.entries(t.evidence||{}))if(expired.includes(d.ref))t.evidence[stage]={stage,status:"EXPIRED"};save(t,"check");}
      });
      const results=[];
      const scopedTask=taskId?store.get(taskId):null;
      if(taskId&&!scopedTask)throw fail('TASK_NOT_FOUND');
      if(scopedTask?.privateExpiredAt!==undefined)return [publicTask(scopedTask)];
      const pending=authority.pending({limit,...(scopedTask?{taskId,userId:scopedTask.userId}:{})});
      for(const intent of pending.filter(i=>!taskId||(i.userId===scopedTask.userId&&(i.taskId===taskId||i.binding?.task_id===taskId))).slice(0,limit)) {
        try {
          const b=intent.binding;
          if(b.action==="research") { const task=receive(intent.userId,{action:"research",eventId:b.event_id,...b.research,intentId:intent.intentId});results.push(research(intent.userId,task.id)); }
          else if(b.action==="prepare") { const task=receive(intent.userId,{...intent.request,intentId:intent.intentId});results.push(prepare(intent.userId,task.id)); }
          else if(b.action==="approve") results.push(approve(intent.userId,b.task_id,{approvedByUser:true,approvalRef:b.event_id,intentId:intent.intentId,payloadSha256:b.payload_sha256,resumeSha256:b.resume_sha256,destination:b.destination,profileSha256:b.profile_sha256}));
          else if(b.action==="reconcile") results.push(reconcile(intent.userId,b.task_id,{intentId:intent.intentId}));
        } catch(e) { results.push({intentId:intent.intentId,status:"blocked",blocker:e.code||"TASK_AUTHORITY_UNAVAILABLE"}); }
      }
      for(const id of store.list()) {if(results.length>=limit)break;if(taskId&&id!==taskId)continue;const t=store.get(id);if(t.status==="queued"||(t.kind==='public_research/v1'&&t.publicationPending))results.push(t.kind==="public_research/v1"?research(t.userId,id):prepare(t.userId,id));}
      return results;
    } };
}
module.exports = { createWorker };
