"use strict";
/* 173-career-reprepare-card.js — the answered-state watcher + re-prepare
   engine + superseding approval-card ledger (owner ruling 2026-10-21
   14:37 CDT; Muse's piece of the ask-the-user loop).

   The loop it closes: Claude's host wiring raises each missing-fact
   question while the worker still holds the job (career_apply_cloud_ask,
   migration 20261024110000 — per-person only; identity and bank numbers
   are never asked by text; failed asks are recorded). Rows live in
   career_apply_questions; Messages reads open questions through
   career_apply_questions_open_as; replies land through
   career_apply_question_answer_as. Once ALL of a job's questions are
   answered, the payload the owner would approve has CHANGED — and an
   approval is bound to the exact payload (155's card set hash; 149's
   click-time APPROVAL_PAYLOAD_MISMATCH). The old card therefore cannot
   survive: this module re-prepares the job and issues a NEW card, with
   the old one recorded SUPERSEDED, both hashes kept.

   What lives here:
   1. createQuestionsStore — a faithful LOCAL FIXTURE of the
      career_apply_questions row lifecycle (open -> answered | failed),
      exposing the two documented function shapes
      (career_apply_questions_open_as / career_apply_question_answer_as)
      plus the worker-side cloudAsk. The migration is Claude's WO line
      and is not on this base; the live wiring swaps this adapter for
      PostgREST calls of the same shapes — engine code unchanged.
   2. createReprepareEngine — the watcher + re-prepare engine. A tick
      scans the store per job: any open question -> wait; a failed ask
      -> named, never counted as answered; all answered -> exactly one
      re-prepare through the executor's prepare composition (155
      prepareRun over 149/150, sandbox boards in tests) with the
      answered facts merged as confirmed answers carrying their
      owner_reply provenance. Partial answers NEVER re-prepare. A
      question shared by several jobs completes each job independently.
   3. The card ledger — every successful prepare issues a hash-bound
      card rendered from the provenance basis (REAL = owner-stated,
      including newly answered facts stamped with their question
      provenance; TEST-INVENTED only where the basis marks it;
      UNANSWERED-STOP for anything still open). Issuing a card
      supersedes the job's previous card; validateApproval accepts only
      the current card's hash — an approval against a superseded hash
      is refused by name (CARD_SUPERSEDED).

   Named behaviors for the races (each test-proven):
   - duplicate ticks: the answered-set fingerprint dedupes — the same
     answered set never re-prepares twice (ALREADY_CURRENT).
   - an answer arriving MID-PREPARE (incl. a correction): the prepare's
     fingerprint is re-checked on completion; a changed set discards
     the result as REPREPARE_STALE_NEW_ANSWER — no card is issued from
     a stale payload, and the loop re-arms for the next tick.
   - a second question opening for a carded job re-arms the loop: the
     job waits while it is open and re-prepares when it is answered,
     superseding the previous card again.
   - a FAILED re-prepare is recorded named (REPREPARE_STOPPED_<code> /
     REPREPARE_ERROR) and its fingerprint is HELD — the watcher does
     not spin on it; a changed answered set (a correction, a new
     answer) re-arms.

   Pure/sync like the other domain modules; the clock, postings,
   profiles and boards are injected via deps. Posture is the caller's:
   this module prepares and cards only — it never executes a run and
   never submits. */
const CareerReprepareCard = (() => {
  const req = (p) => { try { return typeof require !== "undefined" ? require(p) : null; } catch { return null; } };
  const getBatch = () => (typeof CareerBatchApply !== "undefined" ? CareerBatchApply : req("./155-career-batch-apply.js"));
  const crypto = (() => { try { return typeof require !== "undefined" ? require("node:crypto") : null; } catch { return null; } })();

  function sha256(text) {
    if (crypto && crypto.createHash) return crypto.createHash("sha256").update(String(text)).digest("hex");
    let h = 0x811c9dc5;
    const str = String(text);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return `fnv1a-${h.toString(16)}`;
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

  // ---------------- the questions store (fixture of Claude's shapes) ----
  // Row: { id, user_id, key, kind, label, type, options[], company,
  //        job_ids[], state: open|answered|failed, answer, asked_at,
  //        answered_at, fail_reason }
  // answer: { value, verbatim, provenance: { source: "owner_reply",
  //           question_id, asked_at, answered_at } }
  function createQuestionsStore() {
    const rows = new Map();
    let seq = 0;
    // The worker raising a question while it holds the job
    // (career_apply_cloud_ask). fail:true records the FAILED ask the
    // same way the host wiring does — a failed ask is a record, never
    // a silent gap.
    function cloudAsk(input) {
      const inp = input || {};
      seq += 1;
      const row = {
        id: inp.id || `caq_${String(seq).padStart(4, "0")}`,
        user_id: inp.user_id || null,
        key: inp.key || null,
        kind: inp.kind || "missing_fact",
        label: inp.label || inp.key || "",
        type: inp.type || "text",
        options: Array.isArray(inp.options) ? inp.options.slice() : [],
        company: inp.company || null,
        job_ids: Array.isArray(inp.job_ids) ? inp.job_ids.slice() : [],
        state: "open",
        answer: null,
        asked_at: inp.now != null ? inp.now : null,
        answered_at: null,
        fail_reason: null,
      };
      if (inp.fail) {
        row.state = "failed";
        row.fail_reason = inp.fail_reason || "ask_delivery_failed";
      }
      rows.set(row.id, row);
      return clone(row);
    }
    // Messages read shape: the user's OPEN questions only (per-person).
    function career_apply_questions_open_as(userId) {
      return [...rows.values()].filter((r) => r.user_id === userId && r.state === "open").map(clone);
    }
    // The reply landing: binds the answer to its question with its
    // provenance. Re-answering an answered row is a CORRECTION — the
    // new verbatim replaces the old, the answered-set fingerprint
    // moves, and that is what re-arms a held or carded job.
    function career_apply_question_answer_as(userId, questionId, value, meta) {
      const m = meta || {};
      const row = rows.get(questionId);
      if (!row || row.user_id !== userId) return { ok: false, code: "QUESTION_NOT_FOUND" };
      if (row.state === "failed") return { ok: false, code: "QUESTION_ASK_FAILED", fail_reason: row.fail_reason };
      const answeredAt = m.now != null ? m.now : null;
      row.answer = {
        value,
        verbatim: m.verbatim != null ? String(m.verbatim) : String(value),
        provenance: { source: "owner_reply", question_id: row.id, asked_at: row.asked_at, answered_at: answeredAt },
      };
      row.state = "answered";
      row.answered_at = answeredAt;
      return { ok: true, row: clone(row) };
    }
    function rowsForUser(userId) { return [...rows.values()].filter((r) => r.user_id === userId).map(clone); }
    function rowsForJob(userId, jobId) { return rowsForUser(userId).filter((r) => r.job_ids.includes(jobId)); }
    function get(questionId) { const r = rows.get(questionId); return r ? clone(r) : null; }
    return { cloudAsk, career_apply_questions_open_as, career_apply_question_answer_as, rowsForUser, rowsForJob, get };
  }

  // The answered-set fingerprint of a job: its answered rows hashed
  // over (question id, answer value), order-free. A new answer OR a
  // correction moves it; nothing else does.
  function fingerprintAnswers(answeredRows) {
    const parts = (answeredRows || [])
      .filter((r) => r.state === "answered" && r.answer)
      .map((r) => `${r.id}=${sha256(JSON.stringify(r.answer.value))}`)
      .sort();
    return sha256(parts.join("|"));
  }

  // ---------------- the card basis + rendered card ----------------
  // Basis lines: { label, value, tag: REAL|TEST-INVENTED, note }.
  // Stops: { key, label, tag: "UNANSWERED-STOP", note }.
  // REAL is owner-stated ONLY: standing confirmed answers arrive via
  // deps.basisAnswers (the caller's provenance basis — for the TEST
  // profile, the manifest in ~/workspace/test-profile-build), and the
  // job's answered questions join as REAL lines stamped with their
  // owner_reply provenance. A standing stop whose key a question has
  // since answered LEAVES the stop list; anything still open stays a
  // stop and is never rendered as a filled answer.
  function buildBasis(deps, store, userId, jobId) {
    const lines = (deps.basisAnswers || []).map((b) => ({ label: b.label, value: b.value, tag: b.tag, note: b.note || null }));
    const rows = store.rowsForJob(userId, jobId);
    const answered = rows.filter((r) => r.state === "answered" && r.answer);
    const answeredKeys = new Set(answered.map((r) => r.key));
    for (const row of answered) {
      lines.push({
        label: row.label, value: row.answer.value, tag: "REAL",
        note: `owner reply — question ${row.key} (${row.id}), answered ${iso(row.answer.provenance ? row.answer.provenance.answered_at : row.answered_at)}`,
      });
    }
    const stops = [];
    for (const sStop of deps.standingStops || []) {
      if (answeredKeys.has(sStop.key)) continue;
      stops.push({ key: sStop.key, label: sStop.label, tag: "UNANSWERED-STOP", note: sStop.note || null });
    }
    for (const row of rows.filter((r) => r.state === "open")) {
      stops.push({ key: row.key, label: row.label, tag: "UNANSWERED-STOP", note: `question ${row.id} still open` });
    }
    return { lines, stops };
  }

  function renderCardText(card, posting) {
    const out = [];
    out.push("RE-PREPARED APPLICATION — NEW APPROVAL CARD");
    out.push("=".repeat(47));
    out.push(`Job: ${(posting && (posting.title || posting.role)) || card.jobId} at ${(posting && posting.company) || ""} (${card.jobId})`);
    out.push(`Card: ${card.cardId}${card.supersedes ? ` — SUPERSEDES ${card.supersedes}` : ""}`);
    if (card.supersedes) {
      out.push(`Superseded payload hash: ${card.supersedesPayloadSha256}`);
      out.push("The earlier card's approval does NOT carry over: approval is bound to the exact payload.");
    }
    out.push(`Payload hash: ${card.payloadSha256}`);
    out.push(`Card set hash: ${card.cardSha256}`);
    out.push("Posture: flag OFF — approval drives DOORSTEPS ONLY. Nothing submits.");
    out.push("");
    out.push("ANSWERS THIS APPLICATION WILL SEND (per answer, as tagged):");
    for (const l of card.basis.lines) out.push(`[${l.tag}] ${l.label}: ${l.value}${l.note ? ` (${l.note})` : ""}`);
    out.push("");
    out.push("STOPS NAMED (still unanswered — never invented, never filled):");
    if (!card.basis.stops.length) out.push("- none for this job");
    for (const sStop of card.basis.stops) out.push(`- ${sStop.label}${sStop.note ? ` — ${sStop.note}` : ""}`);
    return out.join("\n");
  }

  // ---------------- the watcher + re-prepare engine ----------------
  function createReprepareEngine(deps) {
    const d = deps || {};
    const Batch = getBatch();
    const store = d.store;
    const userId = d.userId || null;
    const now = () => (typeof d.now === "function" ? d.now() : d.now != null ? d.now : Date.now());
    const jobs = {}; // jobId -> per-job ledger (pure JSON)
    const cards = {}; // cardId -> card record (pure JSON)
    let cardSeq = 0;

    function jobState(jobId) {
      if (!jobs[jobId]) {
        jobs[jobId] = {
          jobId, status: "idle",
          openQuestions: [], failedAsks: [],
          lastPreparedFingerprint: null, failedFingerprint: null, inFlightFingerprint: null,
          prepareCount: 0, currentCardId: null, lastRun: null,
          failures: [], events: [],
        };
      }
      return jobs[jobId];
    }
    function record(st, type, data) { st.events.push(Object.assign({ seq: st.events.length + 1, at: now(), type }, data || {})); }
    function fail(st, code, reason, extra) {
      const f = Object.assign({ at: now(), code, reason: reason || null }, extra || {});
      st.failures.push(f);
      record(st, "failure", { code });
      return f;
    }
    const rowsOf = (jobId) => store.rowsForJob(userId, jobId);
    const answeredOf = (jobId) => rowsOf(jobId).filter((r) => r.state === "answered" && r.answer);
    const fingerprintOf = (jobId) => fingerprintAnswers(answeredOf(jobId));

    // The profile a prepare sees: the caller's base profile with every
    // answered fact merged as a CONFIRMED answer carrying its
    // owner_reply provenance verbatim. Nothing unconfirmed is merged;
    // nothing is derived here — an answer the owner never gave does
    // not exist in this profile.
    function mergedProfile(jobId) {
      const profile = clone(d.baseProfile || {});
      profile.answers = Object.assign({}, (d.baseProfile || {}).answers || {});
      for (const row of answeredOf(jobId)) {
        profile.answers[row.key] = { value: row.answer.value, confirmed: true, provenance: clone(row.answer.provenance) };
      }
      return profile;
    }

    function issueCard(st, run, app, fp) {
      cardSeq += 1;
      const posting = d.postings[st.jobId];
      const prev = st.currentCardId ? cards[st.currentCardId] : null;
      const card = {
        cardId: `card-${sha256(`${st.jobId}|${run.id}|${app.payloadSha256}|${cardSeq}`).slice(0, 12)}`,
        jobId: st.jobId, runId: run.id,
        payloadSha256: app.payloadSha256, cardSha256: run.cardSha256,
        answeredFingerprint: fp, issuedAt: now(),
        supersedes: prev ? prev.cardId : null,
        supersedesPayloadSha256: prev ? prev.payloadSha256 : null,
        state: "current",
        basis: buildBasis(d, store, userId, st.jobId),
      };
      card.text = renderCardText(card, posting);
      if (prev) {
        prev.state = "superseded";
        prev.supersededBy = card.cardId;
        prev.supersededByPayloadSha256 = card.payloadSha256;
      }
      cards[card.cardId] = card;
      st.currentCardId = card.cardId;
      return card;
    }

    // One prepare of one job through the executor's composition
    // (155 over 149/150). fp is the answered-set fingerprint the
    // prepare is FOR; it is re-checked on completion (the mid-prepare
    // race). Returns a named result; never throws.
    function runPrepare(jobId, fp) {
      const st = jobState(jobId);
      const posting = d.postings[jobId];
      if (!posting) { fail(st, "REPREPARE_NO_POSTING", "no posting is wired for this job"); st.failedFingerprint = fp; st.status = "failed"; return { ok: false, code: "REPREPARE_NO_POSTING" }; }
      st.status = "preparing";
      st.inFlightFingerprint = fp;
      st.prepareCount += 1;
      const run = Batch.createRun({ userId, familyText: d.familyText || posting.familyText || "roles", count: 1, now: now() });
      let prepError = null;
      try {
        Batch.prepareRun(run, {
          postings: [posting],
          profile: mergedProfile(jobId),
          profileMaster: d.profileMaster || null,
          boardFor: (p) => (typeof d.boardFor === "function" ? d.boardFor(p, { jobId, fingerprint: fp, prepareCount: st.prepareCount }) : null),
          attestations: d.attestations || {},
          log: d.log || { records: [] },
          now: now(),
        });
      } catch (err) { prepError = err; }
      st.inFlightFingerprint = null;
      st.lastRun = Batch.serializeRun(run);
      if (prepError) {
        fail(st, "REPREPARE_ERROR", `the prepare threw: ${prepError && prepError.message ? prepError.message.slice(0, 160) : "unknown error"}`);
        st.failedFingerprint = fp; st.status = "failed";
        return { ok: false, code: "REPREPARE_ERROR" };
      }
      // The mid-prepare race: an answer (or a correction) landed while
      // the prepare ran. The payload just built answers a question set
      // that no longer exists — discard it, issue NO card, re-arm.
      const fpNow = fingerprintOf(jobId);
      if (fpNow !== fp) {
        record(st, "REPREPARE_STALE_NEW_ANSWER", { preparedFor: fp, currentSet: fpNow });
        st.status = "rearmed";
        return { ok: false, code: "REPREPARE_STALE_NEW_ANSWER", stale: true };
      }
      const key = Batch.postingKeyOf(posting);
      const app = run.apps[key];
      if (!app || app.stage !== "doorstep") {
        const code = app && app.stop && app.stop.code ? app.stop.code : "NO_DOORSTEP";
        fail(st, `REPREPARE_STOPPED_${code}`, app && app.stop ? app.stop.reason : "the prepare produced no doorstep", { asks: app && app.stop ? app.stop.asks || null : null });
        st.failedFingerprint = fp; st.status = "failed";
        return { ok: false, code: `REPREPARE_STOPPED_${code}` };
      }
      const card = issueCard(st, run, app, fp);
      st.lastPreparedFingerprint = fp;
      st.failedFingerprint = null;
      st.status = "carded";
      record(st, "card_issued", { cardId: card.cardId, payloadSha256: card.payloadSha256, supersedes: card.supersedes });
      return { ok: true, card };
    }

    // The batch's original prepare of a job (before any question
    // exists): same composition, same card issuance.
    function initialPrepare(jobId) { return runPrepare(jobId, fingerprintOf(jobId)); }

    // One watcher tick. Scans every job named by any of the user's
    // question rows and acts per the named rules. Returns the per-job
    // actions taken (the audit surface).
    function tick() {
      const results = [];
      const jobIds = new Set();
      for (const row of store.rowsForUser(userId)) for (const j of row.job_ids) jobIds.add(j);
      for (const jobId of jobIds) {
        const st = jobState(jobId);
        const rows = rowsOf(jobId);
        const open = rows.filter((r) => r.state === "open");
        const failed = rows.filter((r) => r.state === "failed");
        const answered = rows.filter((r) => r.state === "answered" && r.answer);
        st.openQuestions = open.map((r) => r.id);
        st.failedAsks = failed.map((r) => ({ id: r.id, key: r.key, reason: r.fail_reason }));
        if (open.length) {
          if (st.status !== "preparing") st.status = st.currentCardId ? "carded_awaiting_answers" : "awaiting_answers";
          results.push({ jobId, action: "waiting_open_questions", open: st.openQuestions.slice() });
          continue;
        }
        if (failed.length) {
          // A failed ask is recorded and named; it is NOT answered and
          // it does not silently complete or vanish.
          st.status = "ask_failed";
          results.push({ jobId, action: "ask_failed_named", failed: st.failedAsks.slice() });
          continue;
        }
        if (!answered.length) { results.push({ jobId, action: "no_answers" }); continue; }
        const fp = fingerprintAnswers(answered);
        if (fp === st.lastPreparedFingerprint) { results.push({ jobId, action: "already_current" }); continue; }
        if (fp === st.failedFingerprint) { results.push({ jobId, action: "failed_fingerprint_held", fingerprint: fp }); continue; }
        if (st.inFlightFingerprint) { results.push({ jobId, action: "prepare_in_flight" }); continue; }
        const res = runPrepare(jobId, fp);
        results.push({ jobId, action: res.ok ? "reprepared" : res.code, cardId: res.card ? res.card.cardId : null });
      }
      return results;
    }

    // Approval validation against the ledger: only the CURRENT card's
    // hash validates, and only for the payload it was issued over. A
    // superseded hash is refused by name, with the chain recorded.
    function validateApproval(jobId, cardSha256) {
      const st = jobState(jobId);
      const cur = st.currentCardId ? cards[st.currentCardId] : null;
      if (!cur) return { ok: false, code: "NO_CURRENT_CARD", reason: "this job has no live approval card" };
      if (cardSha256 === cur.cardSha256 && cur.state === "current") {
        return { ok: true, cardId: cur.cardId, payloadSha256: cur.payloadSha256 };
      }
      const sup = Object.values(cards).find((c) => c.jobId === jobId && c.cardSha256 === cardSha256 && c.state === "superseded");
      if (sup) {
        return { ok: false, code: "CARD_SUPERSEDED", supersededCardId: sup.cardId, supersededBy: sup.supersededBy || null, currentCardId: cur.cardId, reason: "the payload changed after this card was issued; only the newest card can be approved" };
      }
      return { ok: false, code: "CARD_HASH_NOT_RECOGNIZED", reason: "this hash names no card ever issued for this job" };
    }

    return { tick, initialPrepare, validateApproval, jobs, cards, jobState, fingerprintOf };
  }

  return { createQuestionsStore, createReprepareEngine, fingerprintAnswers, buildBasis, renderCardText };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerReprepareCard;
