// Reply oracle for the career scenario harness (2026-10-13, REPLY-QUALITY PASS).
// The overnight career build scored scenarios on rail state only, so user-visible
// replies leaked JSON, raw IDs, tool markers and ran to dozens of sentences.
// This module is the judge of the USER-VISIBLE reply: agent-role message text
// plus the flattened rendering of any attached card. Tool/verification records
// are NOT user-visible and are never judged here. A scenario whose reply fails
// this oracle must not be scored COMPLETE (the harness enforces the downgrade).
//
// Exports:
//   checkMessages(messages, context?) -> { pass, failures, warnings }
//   checkText(text, context?)         -> same shape for a single bubble (seq null)
//   flattenCard(card)                 -> plain-text rendering of a card
// failures/warnings entries: { seq, rule, excerpt }.
//
// CONTRACT (owner's Diagnosis/Repair Brief, 2026-10-13 — supersedes the first
// reply-quality brief's universal length law):
//   HARD FAILS (failures; the harness downgrades a claimed COMPLETE over these):
//     empty-reply, code-fence, json-braces, uuid, fact-id, tool-marker,
//     internal-jargon, finance-leak, false-completion.
//   ADVISORY ONLY (warnings; NEVER a downgrade): too-many-sentences. Right
//   depth beats a length cap — a long bubble is flagged for a human/judge to
//   weigh against the ask, never auto-failed, and no material qualification
//   should ever be truncated to satisfy it.
// Leak rules apply to agent prose AND to flattened card text — both are
// user-visible. The sentence count applies to agent PROSE only: a card is
// structured data (rows, an action line, a boilerplate footer), not prose.
//
// context (optional, supplied by the harness from the scenario's own record):
//   { resultStatus, claimedStatus, stateText } — resultStatus is the typed
//   result (completed|prepared|awaiting_user|running|partial|blocked|failed|
//   unknown_outcome); stateText is free text from the outcome record. The
//   false-completion rule reads these; without context it can only use
//   not-completed markers found in tool/verification entries.
//
// Card flattening replicates the harness's humanLabel/humanValue rendering
// logic locally (this module must not import the harness; the harness imports
// this module). Raw payload keys the renderer strips (job_id, posting, ...)
// never reach the flattened text, so they are not judged; values the renderer
// DOES show (e.g. a `reason` string citing "fact F-010") are judged.
"use strict";

// --- replicated harness helpers (scenario-harness.cjs: humanLabel/humanValue) ---
function humanLabel(k) { return String(k).replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()); }
function humanValue(k, v) {
  if (v == null) return /fit/i.test(k) ? "no fit score yet" : "not available yet";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object") ? Object.entries(x).filter(([ek]) => !/id|uuid/i.test(ek)).map(([ek, ev]) => `${humanLabel(ek)}: ${humanValue(ek, ev)}`).join(", ") : String(x)).join("; ");
  if (typeof v === "object") return Object.entries(v).filter(([ek]) => !/id|uuid/i.test(ek)).map(([ek, ev]) => `${humanLabel(ek)}: ${humanValue(ek, ev)}`).join(", ");
  return String(v).trim();
}
function primaryAction(card) {
  for (const k of ["primary_action", "primaryAction", "action_label", "action", "cta"]) if (typeof card[k] === "string" && card[k]) return card[k];
  const hay = `${card.type || card.kind || ""} ${card.title || ""}`.toLowerCase();
  if (/disconnect/.test(hay)) return "Disconnect — confirm first";
  if (/connect/.test(hay)) return "Connect";
  if (/batch|approval|apply|submit/.test(hay)) return "Approve — submit only these";
  if (/referral/.test(hay)) return "Approve — send this ask";
  if (/safety|plan/.test(hay)) return "Approve this plan";
  if (/comp|draft/.test(hay)) return "Approve the figure, then draft";
  if (/handoff|captcha/.test(hay)) return "Open the step only you can do";
  if (/digest|status|dashboard|review|list|brief/.test(hay)) return "Review";
  return "Continue";
}
// Plain-text mirror of the harness's renderCardHtml: same fields, same order,
// same per-item id-key stripping, same action/footer lines — without the HTML.
function flattenCard(card) {
  if (!card || typeof card !== "object") return "";
  const skip = new Set(["title", "type", "kind", "primary_action", "primaryAction", "action_label", "action", "cta"]);
  const lines = [String(card.title || humanLabel(card.type || card.kind || "Card"))];
  if (card.type || card.kind) lines.push(`Type: ${humanLabel(card.type || card.kind)}`);
  for (const [k, v] of Object.entries(card)) {
    if (skip.has(k)) continue;
    if (Array.isArray(v) && v.length && typeof v[0] === "object") {
      lines.push(`${humanLabel(k)}:`);
      for (const item of v) {
        const rows = Object.entries(item).filter(([ek]) => !/^(job_id|posting|variant_id|referral_id|application_id|app_id|person_id)$/i.test(ek)).map(([ek, ev]) => `${humanLabel(ek)}: ${humanValue(ek, ev)}`);
        lines.push(rows.join("\n"));
      }
    } else lines.push(`${humanLabel(k)}: ${humanValue(k, v)}`);
  }
  lines.push(`Action: ${primaryAction(card)}`);
  if (!("note" in card) && !("footer" in card)) lines.push("Nothing is sent or submitted until you approve.");
  return lines.join("\n");
}

// --- rules ---
const RULES = [
  {
    rule: "code-fence",
    find(text) { const i = text.indexOf("```"); return i < 0 ? null : i; },
  },
  {
    rule: "json-braces",
    find(text) {
      const m = /\{["\[]/.exec(text);
      if (m) return m.index;
      // a whole line that is raw JSON (object/array literal carrying "key": pairs)
      let off = 0;
      for (const line of text.split("\n")) {
        if (/^\s*[[{]/.test(line) && /"\s*:/.test(line)) return off + line.search(/\S/);
        off += line.length + 1;
      }
      return null;
    },
  },
  {
    rule: "uuid",
    find(text) { const m = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.exec(text); return m ? m.index : null; },
  },
  {
    rule: "fact-id",
    find(text) { const m = /\bF-\d{3,}\b/.exec(text) || /fact_?ids?/i.exec(text); return m ? m.index : null; },
  },
  {
    rule: "tool-marker",
    find(text) {
      const m = /\b\d{3}\.[a-z][a-zA-Z]+\b/.exec(text);
      if (m) return m.index;
      const i = text.indexOf("*[tool");
      return i < 0 ? null : i;
    },
  },
  {
    rule: "internal-jargon",
    find(text) { const m = /router_core|rail state|edge function/i.exec(text); return m ? m.index : null; },
  },
  {
    // Money-movement / finance vocabulary has no place in a CAREER reply —
    // its presence means a finance flow leaked into the career surface.
    // Heuristic vocabulary list (charge/billing/subscription/portfolio/trade/
    // dividend/balance family). Career-legit money words — salary,
    // compensation, offer, pay, bonus, benefits — deliberately do NOT match.
    rule: "finance-leak",
    find(text) {
      let best = null;
      for (const re of FINANCE_PATTERNS) {
        const m = re.exec(text);
        if (m && (best === null || m.index < best)) best = m.index;
      }
      return best;
    },
  },
];

const FINANCE_PATTERNS = [
  /cancel\w*\s+(?:your\s+|the\s+)?subscription/i,
  /\bsubscription\s+(?:charge|billing|payment|fee)\b/i,
  /\bbank balance\b/i,
  /\baccount balance\b/i,
  /\bcredit card (?:payment|bill|balance|charge)\b/i,
  /\bcharge[ds]?\b[^.]{0,30}\b(?:card|account)\b/i,
  /\bcharged your\b/i,
  /\bbilling\b/i,
  /\bportfolio\b/i,
  /\bdividends?\b/i,
  /\bwire transfer\b/i,
  /\btrade[sd]?\b[^.]{0,20}\b(?:stocks?|shares?|securities|positions?|crypto)\b/i,
  /\b(?:buy|sell|buying|selling)\s+(?:the\s+|your\s+)?(?:stocks?|shares?|securities)\b/i,
  /\bstock trade\b/i,
];

// --- false-completion -------------------------------------------------------
// HARD FAIL: the agent claims a completed real-world action while the
// scenario's OWN record says it did not complete. Heuristic, honestly scoped:
//   CLAIM  = an agent bubble matching a past-tense completion pattern
//            ("I've submitted…", "your application was sent", "… submitted").
//   CONTRA = the typed result_status is anything but "completed", OR the
//            claimed scenario status is not COMPLETE, OR a tool/verification
//            entry / outcome text carries a not-completed state marker
//            (prepared / queued / doorstep / provider-accepted / accepted /
//            not-submitted / awaiting approval / draft). "accepted" is the
//            brief's provider-accepted sense (e.g. a provider accepted a
//            send request ≠ delivered) — it only matters in conjunction with
//            a completion CLAIM, never on its own.
// The rule fires only on CLAIM + CONTRA together. With neither context nor
// record markers it cannot prove a contradiction and stays silent — a
// semantic judge covers the residue; this rule catches the provable lies.
const COMPLETION_CLAIMS = [
  /\bI(?:'ve| have)\s+(submitted|sent|applied|booked|paid|delivered|emailed|filed)\b/i,
  /\b(your|the)\s+(application|resume|email|message|payment|booking|request|order)\s+(was|has been|have been)\s+(submitted|sent|delivered|booked|paid|received)\b/i,
  /\b(application|resume|email|message|payment|booking)\s+(submitted|sent|delivered|booked|paid|received)\b/i,
  /\b(submitted|sent|delivered|booked|paid)\s+successfully\b/i,
];
const NOT_COMPLETED_MARKERS = /\b(prepared|queued|doorstep|not[_ -]?submitted|awaiting (?:user|approval)|pending approval|draft|provider[- ]accepted|accepted)\b/i;

function findClaim(text) {
  let best = null;
  for (const re of COMPLETION_CLAIMS) {
    const m = re.exec(text);
    if (m && (best === null || m.index < best.index)) best = m;
  }
  return best;
}
function contradiction(context, recordText) {
  if (context) {
    if (context.resultStatus && context.resultStatus !== "completed") return `result_status=${context.resultStatus}`;
    if (context.claimedStatus && context.claimedStatus !== "COMPLETE") return `claimed status=${context.claimedStatus}`;
  }
  const m = NOT_COMPLETED_MARKERS.exec(recordText || "");
  if (m) return `record says "${m[0]}"`;
  return null;
}

// Sentence terminators: ., ! or ? (singly or repeated) followed by optional
// closing quote/bracket and then whitespace or end-of-text. Decimals ("3.5")
// and mid-token dots do not count; common abbreviations (e.g., i.e., etc.)
// are masked first so they are not read as sentence ends.
function countSentences(text) {
  const masked = String(text).replace(/\b(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|st|approx|dept|inc|ltd)\./gi, (s) => s.replace(/\./g, "·"));
  const m = masked.match(/[.!?]+(?=["')\]]*(?:\s|$))/g);
  return m ? m.length : 0;
}

function excerptAround(text, index, radius) {
  const t = String(text);
  const start = Math.max(0, (index || 0) - (radius || 40));
  const end = Math.min(t.length, (index || 0) + (radius || 80));
  return (start > 0 ? "…" : "") + t.slice(start, end).replace(/\s+/g, " ").trim() + (end < t.length ? "…" : "");
}

// Leak rules only (used for flattened card text, and as part of a prose check).
function checkLeaks(text, seq) {
  const failures = [];
  const t = String(text == null ? "" : text);
  for (const r of RULES) {
    const i = r.find(t);
    if (i !== null && i !== undefined && i >= 0) failures.push({ seq, rule: r.rule, excerpt: excerptAround(t, i) });
  }
  return failures;
}

// Judge one user-visible prose bubble: leak rules as failures, sentence count
// as an ADVISORY warning (right depth is a judgement call, not a hard cap).
function checkBubble(text, seq) {
  const failures = checkLeaks(text, seq);
  const warnings = [];
  const t = String(text == null ? "" : text);
  const n = countSentences(t);
  if (n > 3) warnings.push({ seq, rule: "too-many-sentences", excerpt: `${n} sentences in one bubble (advisory): ` + excerptAround(t, 0, 100) });
  return { failures, warnings };
}

function visibleText(m) {
  const parts = [];
  if (m.text != null && String(m.text).trim()) parts.push(String(m.text));
  if (m.card) { const flat = flattenCard(m.card); if (flat.trim()) parts.push(flat); }
  return parts.join("\n");
}

function checkText(text, context) {
  const { failures, warnings } = checkBubble(text, null);
  const contra = contradiction(context, context && context.stateText);
  if (contra) {
    const claim = findClaim(String(text == null ? "" : text));
    if (claim) failures.push({ seq: null, rule: "false-completion", excerpt: excerptAround(String(text), claim.index) + ` (contradiction: ${contra})` });
  }
  return { pass: failures.length === 0, failures, warnings };
}

function checkMessages(messages, context) {
  const failures = [];
  const warnings = [];
  const msgs = Array.isArray(messages) ? messages : [];
  let anyAgentText = false;
  // The scenario's own record (tool/verification entries + outcome text) is
  // the ground truth the false-completion rule reads claims against.
  let recordText = context && context.stateText ? String(context.stateText) : "";
  for (const m of msgs) {
    if (!m || (m.role !== "tool" && m.role !== "verification")) continue;
    recordText += "\n" + (m.text || "");
    if (m.result !== undefined) recordText += "\n" + (typeof m.result === "string" ? m.result : JSON.stringify(m.result));
    if (m.evidence !== undefined) recordText += "\n" + JSON.stringify(m.evidence);
  }
  const contra = contradiction(context, recordText);
  // Segment check: every user turn must be followed by agent visible text
  // before the next user turn (or the end of the transcript).
  let pendingUser = null; // the user message awaiting an agent reply
  let segmentHasAgentText = false;
  const closeSegment = () => {
    if (pendingUser && !segmentHasAgentText) {
      failures.push({ seq: pendingUser.seq != null ? pendingUser.seq : null, rule: "empty-reply", excerpt: excerptAround(pendingUser.text || "", 0, 100) });
    }
  };
  for (const m of msgs) {
    if (!m || (m.role !== "user" && m.role !== "agent")) continue;
    if (m.role === "user") {
      closeSegment();
      pendingUser = m;
      segmentHasAgentText = false;
    } else {
      const vis = visibleText(m);
      if (vis.trim()) { anyAgentText = true; segmentHasAgentText = true; }
      const seq = m.seq != null ? m.seq : null;
      const prose = m.text != null ? String(m.text) : "";
      const checked = checkBubble(prose, seq);
      failures.push(...checked.failures);
      warnings.push(...checked.warnings);
      if (m.card) failures.push(...checkLeaks(flattenCard(m.card), seq));
      if (contra) {
        const claim = findClaim(prose);
        if (claim) failures.push({ seq, rule: "false-completion", excerpt: excerptAround(prose, claim.index) + ` (contradiction: ${contra})` });
      }
    }
  }
  closeSegment();
  if (!anyAgentText) {
    // finish with no agent text at all (also fires when there are no user turns)
    const last = msgs.length ? msgs[msgs.length - 1] : null;
    if (!failures.some((f) => f.rule === "empty-reply")) {
      failures.push({ seq: last && last.seq != null ? last.seq : null, rule: "empty-reply", excerpt: "no agent reply text in the transcript" });
    }
  }
  return { pass: failures.length === 0, failures, warnings };
}

module.exports = { checkMessages, checkText, flattenCard, humanLabel, humanValue, countSentences };
