"use strict";
/* 175-career-approval-ui.js — FRONTEND LANE B: the approval card + the
   ask-when-missing cards as rendered chat UI (owner direction
   2026-10-21 16:32 CDT, frontend-first; correction 16:34 CDT).

   THE SURFACE THIS IS: the owner's Messages card IS the approval
   mechanism for the cloud-worker batch. There is NO extension approval
   path anywhere in scope (owner correction 2026-10-21 16:34) — nothing
   in this module references an extension surface. The worker claims
   and drives ONLY against a batch whose card the owner tapped, bound
   to the exact payload hash. This module is the card layer over the
   engines built earlier today; it rebuilds none of them:
     155 (batch apply) — prepare + the approval mint: approveRun binds
       per-application payload hashes under one approvalRef of the
       exact form `batch:<runId>:<cardSha256>`, minted only over the
       re-verified card set hash, only from status awaiting_approval.
     172 (missing-fact ask) — coverage by stated facts only, the ask
       queue (stable mfq_ ids), typed reply parsing, intake storing a
       CONFIRMED fact with provenance {source:"owner_reply", ...} and
       the resume signal (fact_stored | all_fields_covered).
     173 (re-prepare + card ledger) — once every question is answered
       the job re-prepares and a NEW card issues; the old card is
       SUPERSEDED and validateApproval refuses its hash by name
       (CARD_SUPERSEDED). A re-prepared card is again the approval
       surface — a payload NEVER changes silently under an old tap.

   What lives here:
   1. buildBatchCard — the approval card MODEL (pure JSON) from a
      batch in either of its two real shapes: a live 155 run (apps at
      doorstep with payload hashes) or the executor's stored shape
      (career_batch_run/v1 — apps awaiting_attestation under one card
      set hash). The card renders the batch's EXACT answers with the
      caller's provenance basis (REAL / TEST-INVENTED / UNANSWERED-
      STOP — the basis doctrine is 173's: REAL is owner-stated only)
      and carries ONE approve action whose binding is {run_id,
      card_sha256}: the tap can only ever name the payload shown.
   2. renderCardText / renderCardHtml — the Messages-shaped text (the
      shape the owner already reads) and the in-chat HTML element.
   3. tapApprove — the tap. Against a live 155 run it calls 155's
      approveRun (the mint itself, never a reimplementation) and reads
      the approval record off the run. Against a stored batch state it
      mints the same record shape under the same rules (status must be
      awaiting_approval; the tapped hash must be the CURRENT hash — a
      stale card is refused CARD_SUPERSEDED when a 173 ledger is
      supplied, APPROVAL_SET_CHANGED otherwise). The record carries
      attestationsSupplied: ["certify_true"] — the tap IS the per-batch
      attestation step (the TEST profile attests nothing in advance).
   4. claimBatch — the cloud executor's claim gate, as a pure check
      over (approval record, current batch state): no record ->
      CLAIM_NO_APPROVAL; a record whose hash is no longer the batch's
      current hash -> CARD_SUPERSEDED (173's validateApproval verdict
      is attached when a ledger is supplied); a ref that is not the
      deterministic mint for (runId, current hash) -> CLAIM_REF_-
      MISMATCH; an approved payload that has since changed ->
      CLAIM_PAYLOAD_MISMATCH. Only a record that survives every check
      yields a claim. This is the TEST-world proof of the record
      contract the DB claim path consumes; the DB write itself is the
      host seam (career_apply_cards / the claim RPCs), unchanged here.
   5. buildAskCard — a tappable card per 172 field type, rendered from
      the queue question's shape: yes_no -> two_option (Yes / No);
      number -> option_stepper (stated-value chips + a free-entry
      affordance); month_year -> month_picker (12 month chips for the
      stated graduation year + free entry); anything else -> a named
      text_reply card carrying 172's accepted shape. Every option
      carries the exact reply_text a typed reply would have sent.
   6. tapAskCard — an option tap routes its reply_text through 172's
      intakeReply bound to the card's question_id (a tap on a stale
      question is refused by 172 as stale_question; an unknown option
      is refused here by name). The stored fact and 172's resume
      signal surface verbatim — all_fields_covered is the signal the
      host hands to 173's watcher, which re-prepares and issues the
      NEW card this module renders again. The ask leg never approves
      anything and never touches a batch payload directly.

   Posture: pure/sync like its siblings; clock and ids are injected.
   This module prepares, renders, records approvals and gates claims
   in the test world — it never executes a run, never submits, and
   the submit flag is the caller's, untouched (OFF in every proof). */
const CareerApprovalUi = (() => {
  const req = (p) => { try { return typeof require !== "undefined" ? require(p) : null; } catch { return null; } };
  const getBatch = () => (typeof CareerBatchApply !== "undefined" ? CareerBatchApply : req("./155-career-batch-apply.js"));
  const getAsk = () => (typeof CareerMissingFactAsk !== "undefined" ? CareerMissingFactAsk : req("./172-career-missing-fact-ask.js"));
  const crypto = (() => { try { return typeof require !== "undefined" ? require("node:crypto") : null; } catch { return null; } })();

  const VERSION = 1;
  const s = (v) => (v == null ? "" : String(v));
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
  function sha256(text) {
    if (crypto && crypto.createHash) return crypto.createHash("sha256").update(String(text)).digest("hex");
    let h = 0x811c9dc5;
    const str = String(text);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return `fnv1a-${h.toString(16)}`;
  }
  const esc = (v) => s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // ---------------- batch state, both real shapes ----------------
  // Normalize a live 155 run OR the executor's stored wrapper
  // ({version:"career_batch_run/v1", run:{...}}) into the one state
  // shape the card + claim gate read. The stored shape's apps sit at
  // awaiting_attestation with payloadSha256 null — the batch-level
  // binding there is the card set hash, and the card says so.
  function batchState(input) {
    if (!input || typeof input !== "object") return null;
    const run = input.run && typeof input.run === "object" && input.version ? input.run : input;
    if (!run || !run.id) return null;
    const apps = run.selected && Array.isArray(run.selected)
      ? run.selected.map((k) => run.apps && run.apps[k]).filter(Boolean)
      : Object.values(run.apps || {});
    return {
      runId: run.id,
      userId: run.userId || null,
      status: run.status || null,
      familyText: run.familyText || "",
      requested: run.requested || 0,
      cardSha256: run.cardSha256 || null,
      approvalRef: run.approvalRef || null,
      approvals: clone(run.approvals || {}),
      postings: apps.map((a) => ({
        postingKey: a.postingKey, company: a.company || null, role: a.role || null,
        url: a.url || null, stage: a.stage || null,
        payloadSha256: a.payloadSha256 || null,
        location: (run.postings && run.postings[a.postingKey] && run.postings[a.postingKey].location) || null,
      })),
      shape: input.version ? "stored" : "live155",
    };
  }

  // ---------------- 1. the approval card model ----------------
  function buildBatchCard(input) {
    const inp = input || {};
    const st = batchState(inp.run);
    if (!st) return { ok: false, code: "NO_BATCH", reason: "no batch run or stored batch record was supplied" };
    if (!st.cardSha256) return { ok: false, code: "NO_CARD_HASH", reason: "this batch has no card set hash — it was never prepared to a card" };
    const card = {
      kind: "batch_approval_card",
      version: VERSION,
      runId: st.runId,
      userId: st.userId,
      cardSha256: st.cardSha256,
      title: inp.title || `Apply to ${st.postings.length} ${st.familyText} roles?`,
      world: inp.world || null, // e.g. "staged TEST batch (executor stored record)" — labeled, never implied live
      batchShape: st.shape,
      postings: st.postings,
      answers: (inp.basisAnswers || []).map((b) => ({ label: b.label, value: b.value, tag: b.tag, note: b.note || null })),
      stops: (inp.standingStops || []).map((x) => ({ key: x.key || null, label: x.label, tag: "UNANSWERED-STOP", note: x.note || null })),
      attestationsSuppliedOnApproval: ["certify_true"],
      posture: {
        submitFlag: "OFF",
        note: "Approving this card records the batch approval and supplies the certify_true attestation for this batch only. The worker may claim and drive ONLY this exact payload. The submit flag stays OFF; nothing submits.",
      },
      actions: [
        {
          action_id: "approve_batch",
          label: `Approve ${st.postings.length} application${st.postings.length === 1 ? "" : "s"}`,
          binding: { run_id: st.runId, card_sha256: st.cardSha256 },
        },
      ],
      supersedes: inp.supersedes || null,
    };
    card.text = renderCardText(card);
    return { ok: true, card };
  }

  function renderCardText(card) {
    const out = [];
    out.push(card.title);
    out.push("=".repeat(47));
    out.push(`Batch: ${card.runId}${card.world ? ` — ${card.world}` : ""}`);
    if (card.supersedes) out.push(`This card SUPERSEDES ${card.supersedes} — the earlier card can no longer be approved.`);
    out.push(`Payload hash (your tap binds to exactly this): ${card.cardSha256}`);
    out.push("");
    out.push("APPLICATIONS ON THIS CARD:");
    for (const p of card.postings) out.push(`- ${p.company || ""} — ${p.role || ""}${p.location ? ` (${p.location})` : ""} [${p.stage || "prepared"}]`);
    out.push("");
    out.push("ANSWERS THIS BATCH WILL SEND (per answer, as tagged):");
    for (const l of card.answers) out.push(`[${l.tag}] ${l.label}: ${l.value}${l.note ? ` (${l.note})` : ""}`);
    out.push("");
    out.push("STOPS NAMED (never invented, never filled):");
    if (!card.stops.length) out.push("- none");
    for (const x of card.stops) out.push(`- ${x.label}${x.note ? ` — ${x.note}` : ""}`);
    out.push("");
    out.push("Posture: flag OFF — approval flips NOTHING by itself.");
    out.push("Approving authorizes the doorstep batch only and supplies the certify_true attestation for the batch. Nothing submits; CAREER_AGENT_SUBMIT stays OFF.");
    out.push(`[ Approve: tap binds run ${card.runId} @ ${card.cardSha256} ]`);
    return out.join("\n");
  }

  function renderCardHtml(card) {
    const rows = card.answers.map((l) =>
      `<div class="ans"><span class="tag tag-${esc(l.tag)}">${esc(l.tag)}</span> <span class="lab">${esc(l.label)}:</span> <span class="val">${esc(l.value)}</span>${l.note ? ` <span class="note">(${esc(l.note)})</span>` : ""}</div>`).join("\n");
    const stops = card.stops.length
      ? card.stops.map((x) => `<div class="stop">- ${esc(x.label)}${x.note ? ` — <span class="note">${esc(x.note)}</span>` : ""}</div>`).join("\n")
      : `<div class="stop">- none</div>`;
    const posts = card.postings.map((p) =>
      `<div class="post">${esc(p.company || "")} — ${esc(p.role || "")}${p.location ? ` (${esc(p.location)})` : ""} <span class="stage">[${esc(p.stage || "prepared")}]</span></div>`).join("\n");
    const act = card.actions[0];
    return [
      `<section class="card batch-approval-card" data-kind="batch_approval_card" data-run-id="${esc(card.runId)}" data-card-sha256="${esc(card.cardSha256)}">`,
      `<h3>${esc(card.title)}</h3>`,
      card.world ? `<div class="world">${esc(card.world)}</div>` : "",
      card.supersedes ? `<div class="supersedes">This card SUPERSEDES ${esc(card.supersedes)} — the earlier card can no longer be approved.</div>` : "",
      `<div class="hash">Payload hash (your tap binds to exactly this): <code>${esc(card.cardSha256)}</code></div>`,
      `<div class="postings">${posts}</div>`,
      `<div class="answers"><h4>Answers this batch will send</h4>${rows}</div>`,
      `<div class="stops"><h4>Stops named (never invented, never filled)</h4>${stops}</div>`,
      `<p class="posture">Posture: flag OFF — approval flips NOTHING by itself. Approving authorizes the doorstep batch only and supplies the certify_true attestation for the batch. Nothing submits; CAREER_AGENT_SUBMIT stays OFF.</p>`,
      `<button type="button" class="approve" data-action="approve_batch" data-run-id="${esc(act.binding.run_id)}" data-card-sha256="${esc(act.binding.card_sha256)}">${esc(act.label)}</button>`,
      `</section>`,
    ].filter((x) => x !== "").join("\n");
  }

  // ---------------- 2. the approve tap ----------------
  // opts.liveRun: a live 155 run object (the product path — 155's own
  // mint runs). opts.ledger: a 173 reprepare engine, when the batch's
  // cards live in its ledger (the ask/re-prepare loop) — its
  // validateApproval verdict decides CARD_SUPERSEDED by name.
  // opts.jobId: the ledger's job key (defaults to the run id).
  function tapApprove(card, currentInput, opts) {
    const o = opts || {};
    const st = batchState(currentInput);
    if (!st) return { ok: false, code: "NO_BATCH", reason: "no current batch state to approve against" };
    if (!card || card.kind !== "batch_approval_card") return { ok: false, code: "NOT_A_CARD", reason: "the tap did not land on a batch approval card" };
    // Ledger first, when one is supplied: in the ask/re-prepare loop
    // each prepare is a fresh run under the SAME job, so successive
    // cards differ in run id as well as hash — the ledger is the
    // authority on whether this card is the job's current one, and a
    // superseded card is refused by name before any other check.
    if (o.ledger && typeof o.ledger.validateApproval === "function") {
      const v = o.ledger.validateApproval(o.jobId || st.runId, card.cardSha256);
      if (!v.ok && v.code === "CARD_SUPERSEDED") {
        return { ok: false, code: "CARD_SUPERSEDED", reason: v.reason, supersededBy: v.supersededBy || null, currentCardId: v.currentCardId || null };
      }
      if (v.ok && card.cardSha256 !== st.cardSha256) {
        return { ok: false, code: "CARD_SUPERSEDED", reason: "this card is the ledger's current card, but the batch state supplied is a different prepare — refusing rather than approving a state the card does not name", currentCardSha256: st.cardSha256 };
      }
      if (v.ok) {
        if (o.userId && st.userId && o.userId !== st.userId) return { ok: false, code: "CARD_USER_MISMATCH", reason: "this card belongs to a different user" };
        if (st.status !== "awaiting_approval") return { ok: false, code: "NO_RUN_AWAITING_APPROVAL", reason: `this batch is "${st.status}", not waiting for a yes` };
        return mintRecord(card, st, o);
      }
      // NO_CURRENT_CARD / CARD_HASH_NOT_RECOGNIZED: fall through to
      // the generic checks — the ledger simply has no say on this one.
    }
    if (card.runId !== st.runId) return { ok: false, code: "CARD_RUN_MISMATCH", reason: "this card names a different batch than the current one" };
    if (o.userId && st.userId && o.userId !== st.userId) return { ok: false, code: "CARD_USER_MISMATCH", reason: "this card belongs to a different user" };
    // Supersession is checked BEFORE the status gate: a re-prepared
    // batch sits at awaiting_approval again under a NEW hash, and a
    // tap on the old card must be refused as superseded, by name.
    if (card.cardSha256 !== st.cardSha256) {
      return { ok: false, code: "CARD_SUPERSEDED", reason: "the payload changed after this card was issued; only the newest card can be approved", currentCardSha256: st.cardSha256 };
    }
    if (st.status !== "awaiting_approval") {
      return { ok: false, code: "NO_RUN_AWAITING_APPROVAL", reason: `this batch is "${st.status}", not waiting for a yes` };
    }
    return mintRecord(card, st, o);
  }

  // The mint itself. With a live 155 run, 155's approveRun is the
  // mint (never reimplemented) and the record is read off the run.
  // Against a stored batch state the same record shape is produced
  // under the same binding: ref = batch:<runId>:<cardSha256> over
  // exactly the carded postings.
  function mintRecord(card, st, o) {
    let record;
    if (o.liveRun) {
      const Batch = getBatch();
      const res = Batch.approveRun(o.liveRun, { approvedByUser: true });
      if (!res.ok) return { ok: false, code: res.code, reason: res.reason };
      const after = batchState(o.liveRun);
      record = {
        kind: "batch_approval_record", version: VERSION,
        runId: after.runId, userId: after.userId, cardSha256: after.cardSha256,
        approvalRef: res.approvalRef, approvals: after.approvals,
        attestationsSupplied: ["certify_true"], approvedByUser: true,
        approvedAt: iso(o.now != null ? o.now : Date.now()), via: "card_tap_155_mint",
      };
    } else {
      record = {
        kind: "batch_approval_record", version: VERSION,
        runId: st.runId, userId: st.userId, cardSha256: st.cardSha256,
        approvalRef: `batch:${st.runId}:${st.cardSha256}`,
        approvals: Object.fromEntries(st.postings.map((p) => [p.postingKey, p.payloadSha256])),
        attestationsSupplied: ["certify_true"], approvedByUser: true,
        approvedAt: iso(o.now != null ? o.now : Date.now()), via: "card_tap_stored_batch",
      };
    }
    return { ok: true, record };
  }

  // ---------------- 3. the cloud claim gate ----------------
  // The executor may claim a batch ONLY against a surviving record.
  // currentInput: the batch's CURRENT state (live run or stored
  // wrapper, post-approval shape: status approved + approvalRef set).
  function claimBatch(record, currentInput, opts) {
    const o = opts || {};
    if (!record || record.kind !== "batch_approval_record" || record.approvedByUser !== true) {
      return { ok: false, code: "CLAIM_NO_APPROVAL", reason: "no approval record exists for this batch — the card was never tapped" };
    }
    const st = batchState(currentInput);
    if (!st) return { ok: false, code: "CLAIM_NO_BATCH", reason: "the batch no longer exists" };
    // Ledger first, as in tapApprove: successive prepares of one job
    // carry successive run ids, so a superseded record may mismatch
    // the run id too — the named verdict is still CARD_SUPERSEDED.
    if (o.ledger && typeof o.ledger.validateApproval === "function") {
      const v = o.ledger.validateApproval(o.jobId || record.runId, record.cardSha256);
      if (!v.ok && v.code === "CARD_SUPERSEDED") {
        return { ok: false, code: "CARD_SUPERSEDED", reason: "the payload changed after approval; the worker may not claim a superseded payload", supersededBy: v.supersededBy || null, currentCardId: v.currentCardId || null };
      }
    }
    if (record.runId !== st.runId) return { ok: false, code: "CLAIM_RUN_MISMATCH", reason: "this approval record names a different batch" };
    if (record.cardSha256 !== st.cardSha256) {
      const out = { ok: false, code: "CARD_SUPERSEDED", reason: "the payload changed after approval; the worker may not claim a superseded payload", currentCardSha256: st.cardSha256 };
      if (o.ledger && typeof o.ledger.validateApproval === "function") {
        const v = o.ledger.validateApproval(o.jobId || st.runId, record.cardSha256);
        if (!v.ok) { out.ledgerCode = v.code; if (v.supersededBy) out.supersededBy = v.supersededBy; }
      }
      return out;
    }
    const expectedRef = `batch:${st.runId}:${st.cardSha256}`;
    if (record.approvalRef !== expectedRef || st.approvalRef !== expectedRef) {
      return { ok: false, code: "CLAIM_REF_MISMATCH", reason: "the approval ref is not the mint bound to this run and this exact card hash" };
    }
    if (st.status !== "approved") {
      return { ok: false, code: "CLAIM_NOT_APPROVED_STATE", reason: `the batch is "${st.status}" — an approval record alone does not move it; the mint must have run` };
    }
    // Every approved payload must still be the payload on the batch:
    // a changed payload under an approved hash is refused, never
    // silently re-pointed (149's click-time rule, at claim time).
    for (const [key, sha] of Object.entries(record.approvals || {})) {
      const cur = st.approvals[key];
      if (cur === undefined) return { ok: false, code: "CLAIM_PAYLOAD_MISMATCH", reason: `an approved application (${key}) is no longer on the batch` };
      if (cur !== sha) return { ok: false, code: "CLAIM_PAYLOAD_MISMATCH", reason: `the payload for ${key} changed after approval` };
    }
    return {
      ok: true,
      claim: {
        runId: st.runId, userId: st.userId, cardSha256: st.cardSha256, approvalRef: st.approvalRef,
        postingKeys: Object.keys(record.approvals || {}),
        attestationsSupplied: (record.attestationsSupplied || []).slice(),
        claimedAt: iso(o.now != null ? o.now : Date.now()),
      },
    };
  }

  // ---------------- 4. the ask cards ----------------
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const YOE_CHIPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // question: a 172 queue question ({question_id, field_key, type,
  // text, accepted_shape}). opts.year: the stated graduation year a
  // month picker resolves against (from the profile's covered facts —
  // never invented; without it the picker falls back to text_reply).
  function buildAskCard(question, opts) {
    const o = opts || {};
    if (!question || !question.question_id || !question.field_key) {
      return { ok: false, code: "NO_QUESTION", reason: "no 172 queue question was supplied" };
    }
    const base = {
      kind: "missing_fact_ask_card", version: VERSION,
      question_id: question.question_id, field_key: question.field_key, type: question.type,
      text: question.text, accepted_shape: question.accepted_shape || null,
      context: o.context || null,
    };
    if (question.type === "yes_no") {
      base.control = "two_option";
      base.options = [
        { option_id: "yes", label: "Yes", reply_text: "Yes" },
        { option_id: "no", label: "No", reply_text: "No" },
      ];
    } else if (question.type === "number") {
      base.control = "option_stepper";
      base.options = YOE_CHIPS.map((n) => ({ option_id: `n_${n}`, label: String(n), reply_text: String(n) }));
      base.free_entry = { allowed: true, hint: `or reply with a number (${question.accepted_shape || "a number"})` };
    } else if (question.type === "month_year") {
      const year = o.year != null ? o.year : null;
      if (year != null && Number.isInteger(year)) {
        base.control = "month_picker";
        base.year = year;
        base.options = MONTH_NAMES.map((mName, i) => ({
          option_id: `m_${String(i + 1).padStart(2, "0")}`,
          label: `${mName} ${year}`,
          reply_text: `${mName} ${year}`,
        }));
        base.free_entry = { allowed: true, hint: `or reply with a month + year (${question.accepted_shape || "month + year"})` };
      } else {
        base.control = "text_reply";
        base.free_entry = { allowed: true, hint: question.accepted_shape || "month + year" };
        base.picker_unavailable_reason = "no graduation year is stated on the profile to resolve the picker against — the ask stays a typed reply rather than inventing a year";
      }
    } else {
      base.control = "text_reply";
      base.free_entry = { allowed: true, hint: question.accepted_shape || "your stated answer" };
    }
    base.text_rendered = renderAskCardText(base);
    return { ok: true, card: base };
  }

  function renderAskCardText(card) {
    const out = [card.text];
    if (card.control === "two_option") out.push("[ Tap: Yes | No ]");
    else if (card.control === "option_stepper") out.push(`[ Tap a number: ${card.options.map((x) => x.label).join(" · ")} ]`);
    else if (card.control === "month_picker") out.push(`[ Tap a month: ${card.options.map((x) => x.label.split(" ")[0]).join(" · ")} (${card.year}) ]`);
    if (card.free_entry) out.push(`(${card.free_entry.hint})`);
    return out.join("\n");
  }

  function renderAskCardHtml(card) {
    const btns = (card.options || []).map((op) =>
      `<button type="button" class="ask-option" data-question-id="${esc(card.question_id)}" data-option-id="${esc(op.option_id)}" data-reply-text="${esc(op.reply_text)}">${esc(op.label)}</button>`).join("\n");
    return [
      `<section class="card missing-fact-ask-card" data-kind="missing_fact_ask_card" data-question-id="${esc(card.question_id)}" data-field-key="${esc(card.field_key)}" data-control="${esc(card.control)}">`,
      `<p class="ask-text">${esc(card.text)}</p>`,
      btns ? `<div class="ask-options">${btns}</div>` : "",
      card.free_entry ? `<div class="free-entry">${esc(card.free_entry.hint)}</div>` : "",
      card.picker_unavailable_reason ? `<div class="picker-note">${esc(card.picker_unavailable_reason)}</div>` : "",
      `</section>`,
    ].filter((x) => x !== "").join("\n");
  }

  // An answer tap: the option's reply_text goes through 172's intake,
  // bound to the card's question_id. The stored fact (confirmed,
  // owner_reply provenance) and the resume signal surface verbatim;
  // all_fields_covered is the re-prepare signal the host hands to 173.
  function tapAskCard(card, session, optionId, opts) {
    const o = opts || {};
    if (!card || card.kind !== "missing_fact_ask_card") return { ok: false, code: "NOT_AN_ASK_CARD", reason: "the tap did not land on an ask card" };
    const option = (card.options || []).find((x) => x.option_id === optionId) || null;
    let replyText = null;
    if (option) replyText = option.reply_text;
    else if (o.replyText != null && card.free_entry && card.free_entry.allowed) replyText = String(o.replyText);
    else return { ok: false, code: "OPTION_NOT_ON_CARD", reason: `option "${optionId}" is not on this card and no free-entry reply was supplied` };
    const Ask = getAsk();
    const res = Ask.intakeReply(session, replyText, { question_id: card.question_id, now: o.now != null ? o.now : Date.now() });
    if (res.status !== "stored") {
      return { ok: false, code: `INTAKE_${res.status.toUpperCase()}`, reason: res.reason || res.status, reask_text: res.text || null, session: res.session };
    }
    return {
      ok: true, status: "stored",
      field_key: res.field_key, value: res.value, tag: res.tag,
      fact: res.fact,
      resume: res.resume, // { signal: fact_stored | all_fields_covered, ... } — 173's watcher consumes all_fields_covered
      session: res.session,
    };
  }

  // ================= F2: the review card (BUILDER-PLAN-48H F2, 2026-10-22) =================
  // The approval card the owner reviews, one model under two
  // renderers. Where the batch card above binds ONE approval to a
  // whole batch, this layer is the REVIEW surface over the same
  // bindings: per application it shows the job, the company, the
  // match reason and EVERY field answer that will be sent, each
  // answer carrying its verification state; the reviewer approves,
  // edits or rejects PER APPLICATION and batch-approves the
  // reviewed set. Verification is derived from evidence already in
  // the prepared payloads, never assumed:
  //   - canonical field input: the caller's explicit state;
  //   - trunk v1 message-card entry: a field is verified iff its
  //     provenance-ledger row carries a confirmation event and names
  //     the answer's own factId (the ledger IS the record of the
  //     owner's confirmation);
  //   - trunk v2 cloud item: a field is verified iff the prepared
  //     field carries its confirmation_event_id.
  // An edited answer is re-marked "edited" and never counts as
  // verified — the original stays on the record beside it.
  // The commit (tapReviewCommit) runs the EXISTING tap above (155's
  // mint) unchanged, and only when the reviewed set is the WHOLE
  // card: the mint binds the exact card payload, so a set changed
  // by rejection or edit needs a fresh prepared card (173's
  // supersession doctrine) — it is refused by name, never silently
  // subset-approved. 'Submit when complete' exists on the card
  // DISABLED and wired to nothing (owner decision pending; the
  // submit path is untouched). Data shapes are the real ones; TEST
  // data is labeled by the card's `world`, never implied live.
  const REVIEW_STATES = ["pending", "approved", "rejected"];
  const displayValue = (v) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));

  function fieldFromCanonical(f) {
    if (!f || !s(f.name) || !s(f.label)) return null;
    return {
      name: s(f.name), label: s(f.label),
      value: f.value, shown: f.shown != null ? f.shown : displayValue(f.value),
      kind: f.kind || "text", factId: f.factId || null,
      verification: ["verified", "unverified", "edited"].includes(f.verification) ? f.verification : "unverified",
      issues: Array.isArray(f.issues) ? f.issues.map((x) => s(x)).filter(Boolean) : [],
      originalValue: f.originalValue != null ? f.originalValue : null,
      editedAt: f.editedAt || null,
    };
  }
  function appFromCanonical(a) {
    if (!a || !s(a.id) || !s(a.company)) return null;
    if (!Array.isArray(a.fields) || !a.fields.length) return { error: "NO_FIELDS", id: s(a.id) };
    const fields = a.fields.map(fieldFromCanonical);
    if (fields.some((f) => !f)) return { error: "BAD_FIELD", id: s(a.id) };
    if (new Set(fields.map((f) => f.name)).size !== fields.length) return { error: "DUPLICATE_FIELD", id: s(a.id) };
    return {
      id: s(a.id), jobTitle: a.jobTitle ? s(a.jobTitle) : null, company: s(a.company),
      location: a.location ? s(a.location) : null, url: a.url ? s(a.url) : null,
      matchReason: a.matchReason ? s(a.matchReason) : null,
      payloadSha256: a.payloadSha256 || null,
      state: "pending", rejectReason: null, edited: false,
      fields, blank: Array.isArray(a.blank) ? a.blank.map((x) => s(x)).filter(Boolean) : [],
    };
  }
  function appFromV1Entry(item, meta) {
    const e = item && item.entry;
    if (!e || !Array.isArray(e.answers)) return null;
    const ledger = Array.isArray(e.ledger) ? e.ledger : [];
    const fields = e.answers.map((ans) => {
      const row = ledger.find((r) => r && r.field_id === ans.name);
      const verified = !!(row && row.confirmation_event_id && Array.isArray(row.fact_refs) && row.fact_refs[0] === ans.factId);
      return {
        name: s(ans.name), label: s(ans.label), value: ans.value,
        shown: ans.shown != null ? ans.shown : displayValue(ans.value),
        kind: ans.kind || "text", factId: ans.factId || null,
        verification: verified ? "verified" : "unverified",
        issues: [], originalValue: null, editedAt: null,
      };
    });
    return appFromCanonical({
      id: e.jobId, jobTitle: meta.jobTitle, company: e.company, location: meta.location,
      url: e.url, matchReason: meta.matchReason, payloadSha256: item.hash || null,
      fields, blank: e.blank || [],
    });
  }
  function appFromV2Item(item, meta) {
    const p = item && item.payload, r = item && item.readback;
    if (!p || !Array.isArray(p.fields) || !r || !Array.isArray(r.answers)) return null;
    const fields = p.fields.map((f) => {
      const ans = r.answers.find((x) => x && x.name === f.name) || {};
      return {
        name: s(f.name), label: s(f.label), value: f.value,
        shown: ans.shown != null ? ans.shown : displayValue(f.value),
        kind: ans.kind || "text", factId: f.factId || null,
        verification: f.confirmation_event_id ? "verified" : "unverified",
        issues: [], originalValue: null, editedAt: null,
      };
    });
    return appFromCanonical({
      id: p.job_id, jobTitle: meta.jobTitle, company: p.company, location: meta.location,
      url: p.url, matchReason: meta.matchReason, payloadSha256: item.hash || null,
      fields, blank: r.blank || [],
    });
  }
  function normalizeReviewApp(raw, appMeta) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.entry) return appFromV1Entry(raw, (appMeta || {})[raw.entry.jobId] || {});
    if (raw.item) return appFromV2Item(raw.item, (appMeta || {})[(raw.item.payload || {}).job_id] || {});
    if (raw.payload && raw.readback) return appFromV2Item(raw, (appMeta || {})[(raw.payload || {}).job_id] || {});
    return appFromCanonical(raw);
  }

  function buildReviewCard(input) {
    const inp = input || {};
    if (!s(inp.runId) || !s(inp.cardSha256)) {
      return { ok: false, code: "NO_BINDING", reason: "a review card must bind to a prepared batch (runId + cardSha256) — an unbound card can never be approved" };
    }
    if (!Array.isArray(inp.applications) || !inp.applications.length) {
      return { ok: false, code: "NO_APPLICATIONS", reason: "no applications were supplied for review" };
    }
    const apps = [];
    for (const raw of inp.applications) {
      const app = normalizeReviewApp(raw, inp.appMeta);
      if (!app) return { ok: false, code: "BAD_APPLICATION", reason: "an application could not be read in any known shape (canonical, v1 entry, v2 cloud item)" };
      if (app.error) return { ok: false, code: app.error, reason: `application ${app.id}: ${app.error === "NO_FIELDS" ? "it carries no field answers — there is nothing honest to review" : app.error}` };
      apps.push(app);
    }
    if (new Set(apps.map((a) => a.id)).size !== apps.length) {
      return { ok: false, code: "DUPLICATE_APPLICATION", reason: "two applications on this card share one id" };
    }
    const card = {
      kind: "approval_review_card", version: VERSION,
      runId: s(inp.runId), cardSha256: s(inp.cardSha256), eventId: inp.eventId || null,
      title: inp.title || `Apply to ${apps.length} role${apps.length === 1 ? "" : "s"}?`,
      world: inp.world || null,
      applications: apps,
      // Built DISABLED (plan decision 2, 2026-10-22): visible as an
      // option, inert, no path wired; only the owner's words turn it on.
      submitWhenComplete: {
        label: "Submit when complete", enabled: false,
        reason: "Off — submissions stay disabled until the owner turns them on.",
      },
    };
    return { ok: true, card };
  }

  // Coverage as covered/total (plan rule 1) — computed from the
  // model on every call, never stored, so it cannot drift.
  function reviewCoverage(card) {
    const apps = (card && card.applications) || [];
    const fields = apps.flatMap((a) => a.fields || []);
    return {
      fieldsVerified: fields.filter((f) => f.verification === "verified").length,
      fieldsEdited: fields.filter((f) => f.verification === "edited").length,
      fieldsUnverified: fields.filter((f) => f.verification === "unverified").length,
      fieldsTotal: fields.length,
      applicationsReviewed: apps.filter((a) => a.state !== "pending").length,
      applicationsTotal: apps.length,
    };
  }
  const coverageLine = (card) => {
    const c = reviewCoverage(card);
    return `Answers verified: ${c.fieldsVerified}/${c.fieldsTotal} · Applications reviewed: ${c.applicationsReviewed}/${c.applicationsTotal}`;
  };

  function findApp(card, appId) {
    return card && Array.isArray(card.applications) ? card.applications.find((a) => a.id === appId) || null : null;
  }
  function reviewApprove(card, appId) {
    const app = findApp(card, appId);
    if (!app) return { ok: false, code: "APP_NOT_ON_CARD", reason: `application "${appId}" is not on this card` };
    if (app.state === "rejected") return { ok: false, code: "APP_REJECTED", reason: "this application was rejected on this card; a rejection is final here — a fresh card can carry it again" };
    const next = clone(card);
    findApp(next, appId).state = "approved";
    return { ok: true, card: next };
  }
  function reviewReject(card, appId, reason) {
    const app = findApp(card, appId);
    if (!app) return { ok: false, code: "APP_NOT_ON_CARD", reason: `application "${appId}" is not on this card` };
    if (!s(reason).trim()) return { ok: false, code: "REJECT_REASON_REQUIRED", reason: "a dropped application always carries its reason (plan rule 2) — supply one" };
    const next = clone(card);
    const target = findApp(next, appId);
    target.state = "rejected";
    target.rejectReason = s(reason).trim();
    return { ok: true, card: next };
  }
  function editReviewField(card, appId, fieldName, newValue, opts) {
    const o = opts || {};
    const app = findApp(card, appId);
    if (!app) return { ok: false, code: "APP_NOT_ON_CARD", reason: `application "${appId}" is not on this card` };
    if (app.state === "rejected") return { ok: false, code: "APP_REJECTED", reason: "a rejected application is not edited on this card" };
    const field = app.fields.find((f) => f.name === fieldName);
    if (!field) return { ok: false, code: "FIELD_NOT_ON_CARD", reason: `field "${fieldName}" is not on application "${appId}"` };
    const next = clone(card);
    const targetApp = findApp(next, appId);
    const target = targetApp.fields.find((f) => f.name === fieldName);
    if (target.originalValue == null) target.originalValue = target.value;
    target.value = newValue;
    target.shown = displayValue(newValue);
    target.verification = "edited"; // owner-typed on the card: no longer source-verified, and says so
    target.editedAt = iso(o.now != null ? o.now : Date.now());
    targetApp.edited = true;
    if (targetApp.state === "approved") targetApp.state = "pending"; // approval was of the old answers
    return { ok: true, card: next };
  }
  function approveAllPending(card) {
    const next = clone(card);
    for (const app of next.applications) if (app.state === "pending") app.state = "approved";
    return { ok: true, card: next };
  }

  // Every application returns exactly once (plan rule 2): approved
  // (committable, with the exact fields that will be sent), dropped
  // (rejected, with its recorded reason), or held back (with the
  // rule that holds it).
  function reviewCommitSet(card) {
    const approved = [], dropped = [], heldBack = [];
    for (const app of (card && card.applications) || []) {
      if (app.state === "rejected") { dropped.push({ id: app.id, reason: app.rejectReason }); continue; }
      if (app.edited) { heldBack.push({ id: app.id, reason: "edited answers need a fresh prepared card before this application can be approved for sending" }); continue; }
      if (app.state !== "approved") { heldBack.push({ id: app.id, reason: "not yet reviewed" }); continue; }
      approved.push({
        id: app.id,
        fields: app.fields.map((f) => ({ name: f.name, label: f.label, value: f.value, verification: f.verification })),
      });
    }
    return { approved, dropped, heldBack, binding: { runId: card ? card.runId : null, cardSha256: card ? card.cardSha256 : null } };
  }

  // The commit: the EXISTING tap (155's mint / stored-batch mint)
  // over this card's binding, unchanged — reached only when the
  // reviewed set is the whole card.
  function tapReviewCommit(card, currentInput, opts) {
    const set = reviewCommitSet(card);
    if (!card || set.dropped.length || set.heldBack.length || set.approved.length !== (card.applications || []).length) {
      return {
        ok: false, code: "COMMIT_SET_INCOMPLETE",
        reason: "the approval mint binds this card's exact payload; a set changed by rejection or edit, or still under review, needs a fresh prepared card — a subset is never silently approved",
        partition: set,
      };
    }
    const view = { kind: "batch_approval_card", runId: card.runId, cardSha256: card.cardSha256 };
    return tapApprove(view, currentInput, opts || {});
  }

  // The bridge's button binding (channel_present): a button carries
  // only { action, version, eventId, runId, cardSha256 } — never a
  // payload, never the hash's authority.
  function reviewChannelActions(card) {
    return [{ action: "approve", version: VERSION, eventId: card.eventId || null, runId: card.runId, cardSha256: card.cardSha256 }];
  }

  // ---------------- renderer 1: the channel card (text) ----------------
  // The numbered format the bridge already emits (WO-022): head line,
  // one numbered section per application with indented field lines,
  // the WO-022 reply footer. Unverified answers are loud here too.
  function fieldTextLine(f) {
    const val = displayValue(f.shown != null ? f.shown : f.value);
    if (f.issues && f.issues.length) return `⚠ CHECK — ${f.label}: ${val} — ${f.issues.join("; ")}`;
    if (f.verification === "edited") return `⚠ EDITED (UNVERIFIED) — ${f.label}: ${val} (was: ${displayValue(f.originalValue)})`;
    if (f.verification !== "verified") return `⚠ UNVERIFIED — ${f.label}: ${val}`;
    return `${f.label}: ${val}`;
  }
  function renderReviewText(card) {
    const out = [];
    out.push(card.title);
    if (card.world) out.push(`(${card.world})`);
    out.push(`${card.applications.length} application${card.applications.length === 1 ? " is" : "s are"} ready for your review. Every answer below goes exactly as shown.`);
    out.push(`Payload hash (your tap binds to exactly this): ${card.cardSha256}`);
    card.applications.forEach((a, i) => {
      out.push("");
      out.push(`${i + 1}. ${a.company} — ${a.jobTitle || a.id}${a.location ? ` (${a.location})` : ""}`);
      out.push(`   Match: ${a.matchReason || "not recorded"}`);
      if (a.url) out.push(`   Posting: ${a.url}`);
      for (const f of a.fields) out.push(`   ${fieldTextLine(f)}`);
      out.push(`   Left blank: ${a.blank.length ? a.blank.join("; ") : "none"}`);
      out.push(`   Review: ${a.state === "approved" ? "approved" : a.state === "rejected" ? `rejected — ${a.rejectReason}` : "awaiting your review"}`);
    });
    out.push("");
    out.push(coverageLine(card));
    out.push(`[ ] ${card.submitWhenComplete.label} — OFF (disabled)`);
    out.push(`Reply "yes" to approve the reviewed set exactly as shown, "yes but not N" to leave one out, or "no".`);
    return out.join("\n");
  }

  // ---------------- renderer 2: the web card (HTML) ----------------
  // Styled by src/trainee-design-tokens.css + src/career-approval-
  // review.css. Every value is escaped; the DOM binder below renders
  // only this string, and the disclosure it produces IS the review.
  function fieldChip(f) {
    if (f.issues && f.issues.length) return `<span class="f2-chip f2-chip--alert">⚠ CHECK</span>`;
    if (f.verification === "edited") return `<span class="f2-chip f2-chip--alert">⚠ EDITED</span>`;
    if (f.verification !== "verified") return `<span class="f2-chip f2-chip--alert">⚠ UNVERIFIED</span>`;
    return `<span class="f2-chip">Verified</span>`;
  }
  const fieldAlert = (f) => (f.verification !== "verified" || (f.issues && f.issues.length)) ? " f2-field--alert" : "";
  function renderReviewHtml(card) {
    const apps = card.applications.map((a) => {
      const fields = a.fields.map((f) => [
        `<div class="f2-field${fieldAlert(f)}" data-field="${esc(f.name)}">`,
        `<span class="f2-field-label">${esc(f.label)}</span>`,
        `<span class="f2-field-value">${esc(displayValue(f.shown != null ? f.shown : f.value))}</span>`,
        fieldChip(f),
        `<button type="button" class="f2-edit-btn" data-f2-action="edit-field" data-app="${esc(a.id)}" data-field="${esc(f.name)}">Edit</button>`,
        (f.issues || []).map((x) => `<p class="f2-issue">${esc(x)}</p>`).join(""),
        f.originalValue != null ? `<p class="f2-was">Was: ${esc(displayValue(f.originalValue))}</p>` : "",
        `<span class="f2-editor" hidden><input type="text" data-f2-edit-input value="${esc(displayValue(f.shown != null ? f.shown : f.value))}"><button type="button" data-f2-action="edit-save" data-app="${esc(a.id)}" data-field="${esc(f.name)}">Save answer</button></span>`,
        `</div>`,
      ].join("")).join("\n");
      const stateLine = a.state === "approved"
        ? `<p class="f2-app-state f2-app-state--approved">Approved</p>`
        : a.state === "rejected"
          ? `<p class="f2-app-state f2-app-state--rejected">Rejected — ${esc(a.rejectReason || "")}</p>`
          : `<p class="f2-app-state">Awaiting your review</p>`;
      return [
        `<article class="f2-app" data-app-id="${esc(a.id)}" data-state="${esc(a.state)}">`,
        `<h3 class="f2-app-title">${esc(a.jobTitle || a.id)}</h3>`,
        `<p class="f2-company">${esc(a.company)}${a.location ? ` · ${esc(a.location)}` : ""}</p>`,
        a.matchReason
          ? `<p class="f2-match"><span>Match</span> ${esc(a.matchReason)}</p>`
          : `<p class="f2-match f2-match--missing"><span>Match</span> Match reason: not recorded</p>`,
        a.url ? `<p class="f2-url"><a href="${esc(a.url)}">${esc(a.url)}</a></p>` : "",
        `<div class="f2-fields">${fields}</div>`,
        `<p class="f2-blank">Left blank: ${a.blank.length ? esc(a.blank.join("; ")) : "none"}</p>`,
        stateLine,
        `<div class="f2-app-actions">`,
        `<button type="button" data-f2-action="approve-app" data-app="${esc(a.id)}">Approve</button>`,
        `<button type="button" data-f2-action="reject-app" data-app="${esc(a.id)}">Reject</button>`,
        `<span class="f2-reject-box" hidden><input type="text" data-f2-reason placeholder="Reason (required)"><button type="button" data-f2-action="reject-confirm" data-app="${esc(a.id)}">Confirm reject</button></span>`,
        `</div>`,
        `</article>`,
      ].join("\n");
    }).join("\n");
    return [
      `<section class="f2-card" data-kind="approval_review_card" data-run-id="${esc(card.runId)}" data-card-sha256="${esc(card.cardSha256)}">`,
      `<h2 class="f2-title">${esc(card.title)}</h2>`,
      card.world ? `<p class="f2-world">${esc(card.world)}</p>` : "",
      `<p class="f2-binding">Payload hash (your tap binds to exactly this): <code>${esc(card.cardSha256)}</code></p>`,
      `<p class="f2-coverage">${esc(coverageLine(card))}</p>`,
      apps,
      `<div class="f2-actions">`,
      `<button type="button" class="f2-primary" data-f2-action="approve-all">Approve all remaining</button>`,
      `<button type="button" class="f2-primary" data-f2-action="commit">Record approval for the reviewed set</button>`,
      `<button type="button" data-f2-action="submit-when-complete" disabled>${esc(card.submitWhenComplete.label)}</button>`,
      `<span class="f2-submit-note">${esc(card.submitWhenComplete.label)}: OFF — ${esc(card.submitWhenComplete.reason)}</span>`,
      `</div>`,
      `<p class="f2-status" role="status" aria-live="polite"></p>`,
      `</section>`,
    ].filter((x) => x !== "").join("\n");
  }

  // The web wiring: renders the model into a host element and routes
  // the card's own controls through the model ops — the surface a
  // host page mounts. handlers.commit(set, card) is the host seam
  // (in production the tapReviewCommit adapter; the seam receives
  // the exact partition, every application once). The disabled
  // submit-when-complete control has NO case here: it is wired to
  // nothing, by construction.
  function wireReviewCard(rootEl, initialCard, handlers) {
    const doc = (typeof document !== "undefined" ? document : null);
    if (!rootEl || !doc || typeof rootEl.addEventListener !== "function") {
      return { ok: false, code: "NO_DOM", reason: "wireReviewCard needs a DOM element" };
    }
    const h = handlers || {};
    let card = initialCard;
    const render = () => { rootEl.innerHTML = renderReviewHtml(card); };
    const setStatus = (msg) => {
      const el = rootEl.querySelector(".f2-status");
      if (el) el.textContent = msg;
    };
    const apply = (res, okMsg) => {
      if (res && res.ok) { card = res.card; render(); if (typeof h.onChange === "function") h.onChange(card); if (okMsg) setStatus(okMsg); }
      else if (res) setStatus(`Not done: ${res.code} — ${res.reason || ""}`);
      return res;
    };
    rootEl.addEventListener("click", async (event) => {
      const btn = event.target && typeof event.target.closest === "function" ? event.target.closest("[data-f2-action]") : null;
      if (!btn || btn.disabled) return;
      const action = btn.getAttribute("data-f2-action");
      const appId = btn.getAttribute("data-app");
      const fieldName = btn.getAttribute("data-field");
      const appEl = btn.closest(".f2-app");
      if (action === "approve-app") apply(reviewApprove(card, appId), "Approved — it is in the reviewed set.");
      else if (action === "approve-all") apply(approveAllPending(card), "Every remaining application is approved in the reviewed set.");
      else if (action === "reject-app") {
        const box = appEl && appEl.querySelector(".f2-reject-box");
        if (box) box.hidden = false;
      } else if (action === "reject-confirm") {
        const input = appEl && appEl.querySelector("[data-f2-reason]");
        apply(reviewReject(card, appId, input ? input.value : ""), "Rejected — recorded with its reason.");
      } else if (action === "edit-field") {
        const fieldEl = btn.closest(".f2-field");
        const editor = fieldEl && fieldEl.querySelector(".f2-editor");
        if (editor) editor.hidden = false;
      } else if (action === "edit-save") {
        const fieldEl = btn.closest(".f2-field");
        const input = fieldEl && fieldEl.querySelector("[data-f2-edit-input]");
        apply(editReviewField(card, appId, fieldName, input ? input.value : ""), "Answer updated — it is marked edited (unverified) and the application is back in review.");
      } else if (action === "commit") {
        if (typeof h.commit !== "function") { setStatus("Not done: NO_COMMIT_HANDLER — this surface has no approval seam wired."); return; }
        const set = reviewCommitSet(card);
        try {
          const res = await h.commit(set, card);
          if (res && res.ok) setStatus(res.text || "Approval recorded for the reviewed set exactly as shown. Nothing has been submitted to an employer.");
          else setStatus(`Not recorded: ${(res && res.code) || "REFUSED"} — ${(res && res.reason) || "the approval seam refused."}`);
        } catch (e) {
          setStatus(`Not recorded: COMMIT_ERROR — ${e && e.message ? e.message.slice(0, 160) : "the approval seam errored."}`);
        }
      }
      // "submit-when-complete" intentionally has no case: disabled in
      // the markup and wired to nothing here.
    });
    render();
    return { ok: true, getCard: () => card, refresh: render };
  }

  return {
    VERSION,
    batchState,
    buildBatchCard, renderCardText, renderCardHtml,
    tapApprove, claimBatch,
    buildAskCard, renderAskCardText, renderAskCardHtml, tapAskCard,
    buildReviewCard, reviewCoverage, reviewApprove, reviewReject, editReviewField,
    approveAllPending, reviewCommitSet, tapReviewCommit, reviewChannelActions,
    renderReviewText, renderReviewHtml, wireReviewCard,
    _sha256: sha256,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerApprovalUi;
