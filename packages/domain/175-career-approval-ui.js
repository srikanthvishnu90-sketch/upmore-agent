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

  return {
    VERSION,
    batchState,
    buildBatchCard, renderCardText, renderCardHtml,
    tapApprove, claimBatch,
    buildAskCard, renderAskCardText, renderAskCardHtml, tapAskCard,
    _sha256: sha256,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerApprovalUi;
