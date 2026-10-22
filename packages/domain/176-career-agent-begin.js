"use strict";
/* 176-career-agent-begin.js — the chat-side begin-caller for the
   agent-submit path (night plan chunk 40%, 2026-10-22). Map + build
   record: docs/career/chat-begin-caller-2026-10-22.md.

   THE GAP THIS CLOSES: career_apply_extension_begin_agent_own
   (WO-101, redefined by the WO-102 contract in migration
   20261024100000) had exactly one client caller in the world — the
   Chrome extension. A person who approves a batch on the Messages
   card (module 175's tap -> approval record -> claim) had NO code
   path that stored the DB approval or called the begin on their
   behalf: the approval dead-ended in chat state. This module is that
   caller. It consumes the exact approved entries (BatchPosting
   shape: answers + ledger + manifest binding, built by the preparing
   engine) and NEVER re-derives an answer: the payload's fields are
   the entry's answers, each field's factId is its ledger row's first
   fact_ref — the contract's check 5 holds by construction, and the
   local mirror below refuses anything for which it would not.

   Posture, inherited and enforced:
   - The flag (CAREER_AGENT_SUBMIT, read by
     career_apply_agent_submit_enabled()) is NOT readable by a
     user-JWT caller: the migration revokes the function from
     authenticated and career_cloud_settings is service-role-only
     (live ACLs verified 2026-10-22: enabled() = {postgres,
     service_role}). The host therefore supplies the flag state it
     reads server-side as input.flagEnabled. false -> this caller
     refuses locally with the DB's own words ('agent submit is off')
     BEFORE any RPC. null (host did not supply it) -> the DB's first
     check is the authority and its refusal is surfaced distinctly.
   - A DB refusal is surfaced VERBATIM and never retried: a refused
     begin records nothing and leaves the approval live (the
     contract's own semantics), so a blind retry could only ever
     repeat the same refusal.
   - The payload hash is a security binding (the DB recomputes it):
     SHA-256 only — WebCrypto or node:crypto. There is deliberately
     NO fallback hash in this module.
   - payload.source names the door the payload is built for, because
     each begin door refuses the other's dialect. The default door is
     the extension's: career_apply_extension_begin_own (migration
     20261021120000) refuses anything but "extension" and stamps the
     job row source='extension', already driving, with the beginner's
     lease — right when the beginner is the driver, wrong for a begin
     made in chat for the cloud worker, which claims only rows still
     queued with source null (F-030: the row was never claimed, and
     its 'extension' stamp would have counted toward the family
     gate's hand tally). The cloud door (input.door === "cloud",
     migration 20261024140000's career_apply_cloud_begin_agent_own)
     builds source "cloud" and carries the destination the person
     approved and the engine's approval hash — the shapes the cloud
     claim demands of the payload — and its begin only enqueues: the
     row waits queued/source null for the claim, which stamps it
     'cloud' itself. Root cause + fix shape: docs/apply/
     ROOT-CAUSE-F030-BEGIN-CLAIM-2026-10-22.md.

   THE CARD COMPOSITION (F-030 seam, added 2026-10-22): the cloud
   door above enqueues a row the cloud claim can never take — the
   claim's first check is the card bridge's binding
   (cloud_bound_refusal, 20261024130000), which only a Messages card
   tap mints, and the begin's agent_batch_hash stamp is one of the
   values that check forbids. Composition (A): the chat card mints
   the binding; the claim enforces it. beginCloudCardPostings (below)
   is that caller: it verifies the engine-prepared card items bind to
   the approved entries and shows the card through the host's
   service-role client (deps.cardRpc). It never taps the card — the
   tap is the person's own act. Root cause:
   docs/apply/ROOT-CAUSE-F030-SEAM-CARD-BINDING-2026-10-22.md.

   Pure/sync like its siblings except the two async edges the work
   itself has (hashing + the RPC); every effect goes through the
   injected deps.rpc (the host's user-JWT client — client.rpc(name,
   args), the career_persistence.js shape), so tests drive this
   module with a recording stub and no live call is possible here. */
const CareerAgentBegin = (() => {
  const req = (p) => { try { return typeof require !== "undefined" ? require(p) : null; } catch { return null; } };
  const nodeCrypto = (() => { try { return typeof require !== "undefined" ? require("node:crypto") : null; } catch { return null; } })();

  // Mirrors of the DB contract's constants (migration
  // 20261024100000, lines 24-25). Pinned by
  // tests/career-agent-begin.test.cjs, which also cross-checks the
  // migration text when the file is present in the tree.
  const QUARANTINE_VERSION = "d007-v1";
  const DERIVATION_RULES = ["verbatim", "option-exact", "option-yes-no", "checkbox-yes-no", "attachment"];
  const QUARANTINED_FACT_RE = /^F-0*(2[7-9]|[3-6][0-9]|7[0-9])$/; // migration check 4
  const DELEGATION_RE = /owner-delegated|answer-all/i; // migration check 4
  const MANIFEST_HASH_RE = /^[0-9a-f]{64}$/; // migration check 2
  const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/; // migration check 6

  const RPC_APPROVE = "career_apply_batch_approve_own";
  const RPC_BEGIN = "career_apply_extension_begin_agent_own";
  const RPC_BEGIN_CLOUD = "career_apply_cloud_begin_agent_own";
  const RPC_CARD_SHOW = "career_apply_message_cloud_card_show_as";

  // ---------------- canonical JSON + SHA-256 ----------------
  // The canonical form career_apply_canonical (migration
  // 20261020000001) hashes: object keys in UTF-8 byte order, compact
  // separators. Ported from the extension's canonical() — the proven
  // mirror — so a hash computed here is the hash the DB computes.
  const te = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  function keyCmp(a, b) {
    if (te) {
      const x = te.encode(a), y = te.encode(b);
      for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
      return x.length - y.length;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function canonicalApplyJson(v) {
    if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "number" && Number.isSafeInteger(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canonicalApplyJson).join(",") + "]";
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      return "{" + Object.keys(v).sort(keyCmp).map((k) => JSON.stringify(k) + ":" + canonicalApplyJson(v[k])).join(",") + "}";
    }
    throw new Error("INVALID_APPLY_PAYLOAD");
  }
  async function sha256Hex(text) {
    const subtle = typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle;
    if (subtle && te) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", te.encode(String(text)));
      return Array.from(new Uint8Array(digest)).map((n) => n.toString(16).padStart(2, "0")).join("");
    }
    if (nodeCrypto && nodeCrypto.createHash) return nodeCrypto.createHash("sha256").update(String(text)).digest("hex");
    throw new Error("NO_SHA256_AVAILABLE");
  }
  // The batch hash the DB recomputes at approve time: canonical
  // SHA-256 of {version:1, kind:"agent-batch", ...entry} — the
  // extension's batchHash, unchanged.
  async function batchHashOf(entry) {
    return sha256Hex(canonicalApplyJson({ version: 1, kind: "agent-batch", ...entry }));
  }

  // ---------------- the payload ----------------
  // The reviewPayload shape (extension trainee-core), with the fields
  // built from the entry's answers: name/label/value/factId carried,
  // source "trainee" (the contract's check 5 admits nothing else),
  // and the manifest binding copied from the entry the person
  // approved — never from a second source.
  function buildBeginPayload(input) {
    const inp = input || {};
    const entry = inp.entry || {};
    const account = inp.account || {};
    const door = inp.door === "cloud" ? "cloud" : "extension";
    return {
      ...(entry.manifest_hash != null ? { manifest_hash: entry.manifest_hash, quarantine_version: entry.quarantine_version } : {}),
      version: 1,
      source: door, // the door's own label — see header (F-030)
      // The cloud door's payload carries what the cloud claim will
      // demand of it (migration 20261021080000's refusal: the
      // destination the person approved, the preparing engine's
      // approval hash — the values approve-first puts in its
      // payloads). From the approved entry first (they are per
      // posting), then the call-level input. The extension door's
      // payload is unchanged: it carries neither key.
      ...(door === "cloud" ? {
        destination: entry.destination != null ? entry.destination
          : (inp.destination != null ? inp.destination : null),
        engine_approval: entry.engineApproval != null ? entry.engineApproval
          : (entry.engine_approval != null ? entry.engine_approval
            : (inp.engineApproval != null ? inp.engineApproval : null)),
      } : {}),
      user_id: inp.userId || null,
      job_id: entry.jobId || null,
      company: entry.company || null,
      url: entry.url || null,
      family: inp.family || null,
      fields: (Array.isArray(entry.answers) ? entry.answers : []).map((a) => ({
        name: a.name,
        label: a.label,
        value: a.value,
        source: "trainee",
        factId: a.factId != null ? a.factId : null,
        detail: a.detail != null ? a.detail : "",
      })),
      resume_name: inp.resume ? inp.resume.filename || null : null,
      resume_sha256: inp.resume ? inp.resume.sha256 || null : null,
      privacy_epoch: account.epoch != null ? account.epoch : null,
      account_version: account.version != null ? account.version : null,
      expires_at: inp.expiresAt || null,
    };
  }

  // ---------------- the local contract mirror ----------------
  // The six checks of migration 20261024100000, in the DB's order,
  // refusing with the DB's exact messages. The DB re-runs every one
  // inside the begin transaction (and check 6 against the live
  // question rows); this mirror exists so a doomed begin never
  // leaves the process and the refusal is named before any RPC.
  const nonBlank = (x) => typeof x === "string" && x.trim() !== "";
  const sortedJson = (arr) => arr.slice().sort().map((x) => JSON.stringify(x)).join("|");
  function refuse(message) { return { ok: false, code: "AGENT_CONTRACT_REFUSED", message }; }

  function checkContract(entry, payload, opts) {
    const o = opts || {};
    if (!entry || typeof entry !== "object") return { ok: false, code: "NO_ENTRY", message: "no approved entry was supplied" };
    if (!payload || typeof payload !== "object") return { ok: false, code: "NO_PAYLOAD", message: "no begin payload was built" };
    const answers = Array.isArray(entry.answers) ? entry.answers : null;
    const ledger = Array.isArray(entry.ledger) ? entry.ledger : null;

    // 1 quarantine version (the entry's)
    if (entry.quarantine_version !== QUARANTINE_VERSION) return refuse("agent contract: quarantine version");

    // 2 manifest: the entry's hash is 64 hex, the payload carries the
    // same, and the payload's quarantine version is the current one
    if (!MANIFEST_HASH_RE.test(entry.manifest_hash || "") || payload.manifest_hash !== entry.manifest_hash
      || payload.quarantine_version !== QUARANTINE_VERSION) return refuse("agent contract: manifest");

    // 3 ledger: complete, one row per answer and per answer only
    if (!ledger || !answers) return refuse("agent contract: ledger");
    for (const l of ledger) {
      if (!l || typeof l !== "object" || l.application_id !== entry.jobId
        || !Array.isArray(l.fact_refs) || l.fact_refs.length === 0 || l.fact_refs.some((x) => !nonBlank(x))
        || !Array.isArray(l.source_refs) || l.source_refs.some((x) => !nonBlank(x))
        || !nonBlank(l.confirmation_event_id)
        || !DERIVATION_RULES.includes(l.derivation_rule)) return refuse("agent contract: ledger");
    }
    if (sortedJson(answers.map((a) => a && a.name)) !== sortedJson(ledger.map((l) => l.field_id))) return refuse("agent contract: ledger");

    // 4 quarantined fact (D-007): no fact_ref, no answer factId in
    // F-027..F-079; no source_ref naming the delegations
    for (const l of ledger) {
      for (const fr of l.fact_refs) if (QUARANTINED_FACT_RE.test(fr)) return refuse("agent contract: quarantined fact");
      for (const sr of l.source_refs) if (DELEGATION_RE.test(sr)) return refuse("agent contract: quarantined fact");
    }
    for (const a of answers) if (QUARANTINED_FACT_RE.test((a && a.factId) || "")) return refuse("agent contract: quarantined fact");

    // 5 payload: exactly the approved answers, each on the fact its
    // ledger row names first, every field Trainee's
    const fields = Array.isArray(payload.fields) ? payload.fields : null;
    if (!fields) return refuse("agent contract: payload not the approved answers");
    if (fields.some((f) => !f || f.source !== "trainee")) return refuse("agent contract: payload not the approved answers");
    if (sortedJson(fields.map((f) => f && f.name)) !== sortedJson(answers.map((a) => a && a.name))) return refuse("agent contract: payload not the approved answers");
    for (const f of fields) {
      const row = ledger.find((l) => l.field_id === f.name);
      const firstRef = row ? row.fact_refs[0] : null;
      if ((f.factId != null ? f.factId : null) !== firstRef) return refuse("agent contract: payload not the approved answers");
    }

    // 6 withdrawn answer: every text-answer:<id> fact_ref names a
    // question row of this person that is still answered. Locally:
    // the id's shape, and its presence in the caller's still-answered
    // set (the host reads those from career_apply_answers_own); the
    // DB's live row check remains the authority.
    const answered = new Set(Array.isArray(o.answeredTextAnswerIds) ? o.answeredTextAnswerIds : []);
    for (const l of ledger) {
      for (const fr of l.fact_refs) {
        if (typeof fr === "string" && fr.startsWith("text-answer:")) {
          const id = fr.slice("text-answer:".length);
          if (!UUID_RE.test(id) || !answered.has(id)) return refuse("agent contract: withdrawn answer");
        }
      }
    }
    return { ok: true };
  }

  // The cloud door's own checks (migration 20261024140000), mirrored
  // with the DB's messages, after the contract mirror and before the
  // begin RPC — same discipline as checkContract: a payload the claim
  // could never take is refused here, named, and never sent.
  function refuseCloud(message) { return { ok: false, code: "AGENT_CLOUD_REFUSED", message }; }
  function checkCloudDoor(payload) {
    if (!payload || payload.source !== "cloud") return refuseCloud("agent cloud: source");
    if (typeof payload.destination !== "string" || !/^https:\/\//.test(payload.destination)) return refuseCloud("agent cloud: destination");
    if (typeof payload.engine_approval !== "string" || !/^[0-9a-f]{64}$/.test(payload.engine_approval)) return refuseCloud("agent cloud: engine approval");
    return { ok: true };
  }

  // ---------------- the caller ----------------
  function classifyDbRefusal(message) {
    if (message === "agent submit is off") return "AGENT_SUBMIT_OFF";
    if (typeof message === "string" && message.startsWith("agent contract:")) return "AGENT_CONTRACT_REFUSED";
    if (typeof message === "string" && message.startsWith("agent cloud:")) return "AGENT_CLOUD_REFUSED";
    if (message === "no live batch approval for this posting") return "NO_LIVE_APPROVAL";
    return "BEGIN_REFUSED";
  }

  async function runBegin(input, deps) {
    const d = deps || {};
    if (typeof d.rpc !== "function") return { ok: false, code: "NO_RPC", message: "no rpc client was injected — the begin caller is not wired in this host", results: [] };
    const flagEnabled = input.flagEnabled !== undefined ? input.flagEnabled : d.flagEnabled;
    // The flag, first, before any RPC (see header): OFF refuses here.
    if (flagEnabled === false) return { ok: false, code: "AGENT_SUBMIT_OFF", message: "agent submit is off", results: [] };
    const entries = Array.isArray(input.entries) ? input.entries : [];
    if (!entries.length) return { ok: false, code: "NO_ENTRIES", message: "no approved postings were supplied", results: [] };
    if (!input.expiresAt) return { ok: false, code: "NO_EXPIRY", message: "no payload expiry was supplied — the account stamp would be refused as stale", results: [] };
    if (!input.account || typeof input.account.epoch !== "number" || typeof input.account.version !== "number") {
      return { ok: false, code: "NO_ACCOUNT_STAMP", message: "no account stamp (epoch, version) was supplied — read career_apply_account_own first", results: [] };
    }
    const userId = input.userId || null;

    // Store the approvals: one call, every entry under its canonical
    // batch hash. The DB recomputes each hash from the entry and
    // refuses a mismatch — what is stored is the database's own
    // binding, not the caller's claim.
    const items = [];
    for (const entry of entries) items.push({ entry: { version: 1, kind: "agent-batch", ...entry }, hash: await batchHashOf(entry) });
    let stored;
    try {
      stored = await d.rpc(RPC_APPROVE, { p_items: items });
    } catch (e) {
      return { ok: false, code: "APPROVAL_STORE_REFUSED", message: e && e.message ? e.message : String(e), results: [] };
    }
    const approvalsStored = typeof stored === "number" ? stored : items.length;

    // Begin each posting: build from the entry, mirror-check locally,
    // then exactly one begin RPC. A refusal — local or the DB's — is
    // recorded per posting and never retried; the others still go.
    const door = input.door === "cloud" ? "cloud" : "extension";
    const results = [];
    for (const [i, entry] of entries.entries()) {
      const payload = buildBeginPayload({
        entry, userId, door,
        family: (input.familyByJobId && input.familyByJobId[entry.jobId]) || input.family || null,
        account: input.account, expiresAt: input.expiresAt, resume: input.resume || null,
      });
      const chk = checkContract(entry, payload, { answeredTextAnswerIds: input.answeredTextAnswerIds || [] });
      if (!chk.ok) { results.push({ jobId: entry.jobId, ok: false, code: chk.code, message: chk.message }); continue; }
      if (door === "cloud") {
        const dchk = checkCloudDoor(payload);
        if (!dchk.ok) { results.push({ jobId: entry.jobId, ok: false, code: dchk.code, message: dchk.message }); continue; }
      }
      const pApproval = await sha256Hex(canonicalApplyJson(payload));
      try {
        const row = await d.rpc(door === "cloud" ? RPC_BEGIN_CLOUD : RPC_BEGIN, { p_payload: payload, p_approval: pApproval, p_batch_hash: items[i].hash });
        results.push({ jobId: entry.jobId, ok: true, id: row && row.id || null, lease: row && row.lease || null, payloadHash: row && row.payload_hash || null });
      } catch (e) {
        const message = e && e.message ? e.message : String(e);
        results.push({ jobId: entry.jobId, ok: false, code: classifyDbRefusal(message), message });
      }
    }
    return { ok: results.length > 0 && results.every((r) => r.ok), approvalsStored, results };
  }

  // The product entry: the 175 approval record (the card tap's mint)
  // + the approved entries it names.
  async function beginApprovedPostings(input, deps) {
    const inp = input || {};
    const record = inp.record;
    if (!record || record.kind !== "batch_approval_record" || record.approvedByUser !== true) {
      return { ok: false, code: "NO_APPROVAL_RECORD", message: "no approval record exists for this batch — the card was never tapped", results: [] };
    }
    return runBegin({ ...inp, userId: inp.userId || record.userId || null }, deps);
  }

  // The executor entry: 175 claimBatch's surviving claim. A claim
  // whose ref is not the deterministic mint for (runId, cardSha256)
  // is refused before any RPC — the same rule 175's gate enforces.
  async function beginFromClaim(claim, input, deps) {
    if (!claim || typeof claim !== "object") {
      return { ok: false, code: "CLAIM_NO_APPROVAL", message: "no approval record exists for this batch — the card was never tapped", results: [] };
    }
    if (!claim.runId || !claim.cardSha256 || claim.approvalRef !== `batch:${claim.runId}:${claim.cardSha256}`
      || !Array.isArray(claim.postingKeys) || !claim.postingKeys.length) {
      return { ok: false, code: "CLAIM_REF_MISMATCH", message: "the approval ref is not the mint bound to this run and this exact card hash", results: [] };
    }
    const record = {
      kind: "batch_approval_record", version: 1, runId: claim.runId, userId: claim.userId || null,
      cardSha256: claim.cardSha256, approvalRef: claim.approvalRef,
      approvals: {}, attestationsSupplied: claim.attestationsSupplied || [], approvedByUser: true,
    };
    return runBegin({ ...(input || {}), record, userId: (input && input.userId) || claim.userId || null }, deps);
  }

  // ---------------- the cloud card composition (F-030 seam) ----------------
  // Composition (A), the C9 decision on this line: the chat card mints
  // the binding through the bridge's machinery; the claim enforces it.
  // Root cause: docs/apply/ROOT-CAUSE-F030-SEAM-CARD-BINDING-2026-
  // 10-22.md. The agent cloud begin's row can never be claimed (no
  // cloud_bound_jobs row, and the agent_batch_hash stamp the binding
  // check forbids), and begin-then-tap is impossible (the queue's
  // duplicate_job), so the cloud route's enqueue is the card tap
  // itself — and the tap is the person's own act. This caller
  // therefore ends at SHOWING the card: it never calls
  // career_apply_message_card_approve_own, on any dep.
  //
  // The card items are INPUT, never built here: the bridge's payload
  // dialect carries the live form's own coordinates (page field
  // names, schema hash, replay sources), which only the preparing
  // engine has (workers/career-cloud/prepare.ts builds the items from
  // its dry run). What this caller adds is the binding proof, per
  // entry, BEFORE anything is shown: the item's payload hash
  // recomputes; its job, person and manifest are the approved entry's;
  // its destination is the one the person approved; and every field
  // carries the approved answer's value on the fact its ledger row
  // names first (contract check 5 across the two dialects). A missing
  // or non-binding item refuses that posting by name, and a batch
  // with any refusal is shown to no one — a card is the whole batch
  // or nothing (prepare.ts's own discipline).
  //
  // deps.cardRpc is the host's SERVICE-ROLE client (client.rpc(name,
  // args), the prepare.ts invocation shape): the producer is
  // service-role-only (130000's grants). deps.rpc (user-JWT) is never
  // used here: the card route stores no batch approval and calls no
  // begin door — cloud_tap mints the approval row itself, entry =
  // the exact payload shown.
  function refuseCard(message) { return { ok: false, code: "CARD_ITEM_MISMATCH", message }; }

  async function checkCardItem(entry, item, userId) {
    if (!item || typeof item !== "object" || !item.payload || typeof item.payload !== "object") {
      return { ok: false, code: "CARD_ITEM_MISSING", message: "no engine-prepared card item was supplied for this posting — the card is never fabricated" };
    }
    const p = item.payload;
    if (typeof item.hash !== "string" || item.hash !== await sha256Hex(canonicalApplyJson(p))) {
      return refuseCard("the card item's hash does not recompute over its payload");
    }
    if (!item.readback || typeof item.readback !== "object") {
      return refuseCard("the card item carries no readback — the DB would refuse it unseen");
    }
    if (p.user_id !== userId || p.job_id !== entry.jobId) {
      return refuseCard("the card item is not this person's approved posting");
    }
    if (p.manifest_hash !== entry.manifest_hash || p.quarantine_version !== entry.quarantine_version) {
      return refuseCard("the card item is not bound to the approved entry's manifest");
    }
    const destination = entry.destination != null ? entry.destination : entry.url;
    if (p.destination !== destination || p.url !== entry.url) {
      return refuseCard("the card item's destination is not the one the person approved");
    }
    const engineApproval = entry.engineApproval != null ? entry.engineApproval : entry.engine_approval;
    if (p.engine_approval !== engineApproval) {
      return refuseCard("the card item's engine approval is not the approved run's");
    }
    // Check 5 across dialects: the item's fields are the entry's
    // answers — same names, same values, each on its ledger row's
    // first fact ref.
    const answers = Array.isArray(entry.answers) ? entry.answers : [];
    const ledger = Array.isArray(entry.ledger) ? entry.ledger : [];
    const fields = Array.isArray(p.fields) ? p.fields : null;
    if (!fields || sortedJson(fields.map((f) => f && f.name)) !== sortedJson(answers.map((a) => a && a.name))) {
      return refuseCard("the card item's fields are not the approved answers");
    }
    for (const f of fields) {
      const answer = answers.find((a) => a && a.name === f.name);
      const row = ledger.find((l) => l && l.field_id === f.name);
      const firstRef = row ? row.fact_refs[0] : null;
      if (!answer || (f.factId != null ? f.factId : null) !== firstRef) {
        return refuseCard("a card field cites a fact its ledger row does not name first");
      }
      const valueOk = f.value && typeof f.value === "object"
        ? f.value.sha256 != null && f.value.sha256 === answer.file
        : f.value === answer.value;
      if (!valueOk) return refuseCard("a card field's value is not the approved answer");
    }
    return { ok: true };
  }

  async function beginCloudCardPostings(input, deps) {
    const inp = input || {};
    const d = deps || {};
    const record = inp.record;
    if (!record || record.kind !== "batch_approval_record" || record.approvedByUser !== true) {
      return { ok: false, code: "NO_APPROVAL_RECORD", message: "no approval record exists for this batch — the card was never tapped", results: [] };
    }
    const flagEnabled = inp.flagEnabled !== undefined ? inp.flagEnabled : d.flagEnabled;
    if (flagEnabled === false) return { ok: false, code: "AGENT_SUBMIT_OFF", message: "agent submit is off", results: [] };
    if (typeof d.cardRpc !== "function") return { ok: false, code: "NO_CARD_RPC", message: "no service-role rpc client was injected — the card producer is not wired in this host", results: [] };
    const userId = inp.userId || record.userId || null;
    const threadId = inp.threadId || null;
    if (!threadId) return { ok: false, code: "NO_THREAD", message: "no thread was supplied — a Messages card lives on the person's thread", results: [] };
    const entries = Array.isArray(inp.entries) ? inp.entries : [];
    if (!entries.length) return { ok: false, code: "NO_ENTRIES", message: "no approved postings were supplied", results: [] };
    if (!inp.expiresAt) return { ok: false, code: "NO_EXPIRY", message: "no payload expiry was supplied — the account stamp would be refused as stale", results: [] };
    if (!inp.account || typeof inp.account.epoch !== "number" || typeof inp.account.version !== "number") {
      return { ok: false, code: "NO_ACCOUNT_STAMP", message: "no account stamp (epoch, version) was supplied — read career_apply_account_own first", results: [] };
    }

    // Every mirror + binding check runs before the show call, so a
    // refused batch costs no card and shows the person nothing.
    const cardItems = inp.cardItems || {};
    const items = [];
    const results = [];
    for (const entry of entries) {
      const payload = buildBeginPayload({
        entry, userId, door: "cloud",
        family: (inp.familyByJobId && inp.familyByJobId[entry.jobId]) || inp.family || null,
        account: inp.account, expiresAt: inp.expiresAt, resume: inp.resume || null,
      });
      const chk = checkContract(entry, payload, { answeredTextAnswerIds: inp.answeredTextAnswerIds || [] });
      if (!chk.ok) { results.push({ jobId: entry.jobId, ok: false, code: chk.code, message: chk.message }); continue; }
      const dchk = checkCloudDoor(payload);
      if (!dchk.ok) { results.push({ jobId: entry.jobId, ok: false, code: dchk.code, message: dchk.message }); continue; }
      const ichk = await checkCardItem(entry, cardItems[entry.jobId], userId);
      if (!ichk.ok) { results.push({ jobId: entry.jobId, ok: false, code: ichk.code, message: ichk.message }); continue; }
      items.push(cardItems[entry.jobId]);
      results.push({ jobId: entry.jobId, ok: true, shown: true });
    }
    if (results.some((r) => !r.ok)) return { ok: false, code: "CARD_NOT_SHOWN", message: "a posting refused — the batch is shown whole or not at all", results };

    let card;
    try {
      card = await d.cardRpc(RPC_CARD_SHOW, { p_user: userId, p_thread: threadId, p_items: items });
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      return { ok: false, code: "CARD_SHOW_REFUSED", message, results: [] };
    }
    // The receipt is verified like prepare.ts verifies it: the hash
    // recomputes over the returned payload, and the payload is this
    // person's card on this thread, in the cloud dialect.
    const body = card && typeof card === "object" ? card.payload : null;
    if (!body || typeof body !== "object" || typeof card.hash !== "string"
      || card.hash !== await sha256Hex(canonicalApplyJson(body))
      || body.user_id !== userId || body.thread_id !== threadId
      || body.version !== 2 || body.execution_mode !== "cloud" || body.card_id !== card.id) {
      return { ok: false, code: "CARD_RECEIPT_MISMATCH", message: "the shown card's receipt does not bind to this person, thread and payload", results: [] };
    }
    return { ok: true, cardId: card.id, hash: card.hash, messageId: card.message_id != null ? card.message_id : null, results };
  }

  return {
    QUARANTINE_VERSION, DERIVATION_RULES, RPC_APPROVE, RPC_BEGIN, RPC_BEGIN_CLOUD, RPC_CARD_SHOW,
    canonicalApplyJson, sha256Hex, batchHashOf,
    buildBeginPayload, checkContract, checkCloudDoor, beginApprovedPostings, beginFromClaim, beginCloudCardPostings,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerAgentBegin;
