// Scenario harness for the 300-scenario career program (2026-10-12).
// A testing agent drives scripted user turns through responders wired to the REAL
// domain modules (the same modules bundled into supabase/functions/_shared/router_core.js
// for the production chat handler). The harness owns the EVIDENCE LAW: every user ask,
// agent reply, card, and tool/rail result is recorded verbatim.
// Outputs per scenario (in ~/workspace/your_files/upmore-career-conversations/):
//   <SC-id>-<slug>.messages.json  — the full message/card/tool record
//   <SC-id>-<slug>.md             — the entire conversation, word for word, + verification
//   <SC-id>-<slug>.html           — chat render (source for the screenshot)
//   <SC-id>-<slug>.png            — screenshot of the chat as the user would see it
// Usage: const H = require("./scenario-harness.cjs"); const s = H.session("SC-001", "slug");
//   await s.user("..."); await s.agent("...", {card}); await s.tool("rail", {...});
//   s.verify("what was checked in the rail's own state", {...}); await s.finish({status, outcome});
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ReplyOracle = require("./reply-oracle.cjs");

// Reply composer (packages/domain/140-career-reply.js, merged at pivot/career
// 0434b45): agent() routes raw text through CareerReply.composeText so the
// recorded bubbles are the clean user-visible reply (payload/ID sentences
// stripped, <=3 sentences per bubble, never empty). Required optionally so
// this harness still loads on a tree without the composer; set
// HARNESS_RAW_AGENT=1 to record agent text verbatim (oracle tests use it to
// prove the oracle still catches raw dirty bubbles).
let CareerReply = null;
try { CareerReply = require("../../packages/domain/140-career-reply.js"); } catch (e) { CareerReply = null; }

// HARNESS_OUT_DIR overrides the evidence directory (used by tests so a test run
// never writes into the real run-1 evidence tree).
const OUT_DIR = process.env.HARNESS_OUT_DIR || path.join(process.env.HOME, "workspace/your_files/upmore-career-conversations");

// SC_SUFFIX (env, read lazily): when set, finish() writes
// <base><SC_SUFFIX>.messages.json/.md/.html/.png so re-runs (e.g. a reply-quality
// pass) never overwrite run-1 evidence. Unset = the original filenames.
// SC_VARIANT (env, read lazily): deterministic messifier applied to user text
// before recording — see messify() below. Unset = user text recorded verbatim.
function scSuffix() { return process.env.SC_SUFFIX || ""; }
function scVariant() { return process.env.SC_VARIANT || null; }

// --- SC_VARIANT messifier -------------------------------------------------
// Deterministic: the seed is a hash of (scenario id + mode), so the same
// scenario + mode always produces byte-identical user text across re-runs.
// Meaning-critical tokens are never altered: any whitespace-delimited token
// containing "@", a digit, or "http" is skipped by the typos mode.
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SLANG_MAP = [ // tiny + safe; applied longest-first, word boundaries only
  [/\bthank you\b/gi, "thx"],
  [/\bthanks\b/gi, "thx"],
  [/\byour\b/gi, "ur"],
  [/\byou\b/gi, "u"],
  [/\bplease\b/gi, "pls"],
  [/\bare\b/gi, "r"],
];
function messify(text, mode, seedKey) {
  const t = String(text);
  const rng = mulberry32(hashSeed(String(seedKey) + "|" + mode));
  switch (mode) {
    case "typos": {
      return t.split(/(\s+)/).map((tok) => {
        if (!tok || /^\s+$/.test(tok)) return tok;
        if (/@|\d|http/i.test(tok)) return tok; // emails / URLs / numbers: never touched
        const core = tok.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
        if (core.length < 4 || rng() > 0.35) return tok;
        const at = tok.indexOf(core);
        const i = 1 + Math.floor(rng() * (core.length - 2)); // interior position
        let mangled;
        if (rng() < 0.5 && i + 1 < core.length) { // swap two adjacent chars
          mangled = core.slice(0, i) + core[i + 1] + core[i] + core.slice(i + 2);
        } else { // delete one char
          mangled = core.slice(0, i) + core.slice(i + 1);
        }
        return tok.slice(0, at) + mangled + tok.slice(at + core.length);
      }).join("");
    }
    case "fragment": {
      const first = t.split(/[,;—–-]|\s+and\s+|\s+but\s+/i)[0];
      return first.toLowerCase().replace(/[.!?]+\s*$/, "").trim();
    }
    case "slang": {
      let out = t;
      for (const [re, rep] of SLANG_MAP) out = out.replace(re, rep);
      return out;
    }
    case "runon": {
      const parts = t.split(/(?<=[.!?])\s+/).map((p) => p.replace(/[.!?]+\s*$/, "").replace(/;\s*/g, " and "));
      return parts.join(" and ").replace(/\s+/g, " ").trim();
    }
    case "emoji": {
      return t.toLowerCase().trim() + (rng() < 0.5 ? " 🙏" : " 👀");
    }
    default:
      return t;
  }
}
// Split a user turn into two pushes at the clause boundary nearest the middle
// (falls back to the middle word when there is no clause boundary).
function splitForDouble(text) {
  const t = String(text);
  const bounds = [];
  const re = /,|;|—|–|\s+and\s+|\s+but\s+/gi;
  let m;
  while ((m = re.exec(t))) bounds.push(m.index + m[0].length);
  if (bounds.length) {
    const mid = t.length / 2;
    let best = bounds[0];
    for (const b of bounds) if (Math.abs(b - mid) < Math.abs(best - mid)) best = b;
    const a = t.slice(0, best).replace(/[,\s]+$/, "").trim();
    const b = t.slice(best).trim().replace(/^(and|but)\s+/i, "");
    if (a && b) return [a, b];
  }
  const words = t.split(/\s+/);
  if (words.length < 2) return [t, t];
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")];
}

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

const CARD_CSS = ".card{margin-top:8px;border:1px solid #d1d1d6;border-radius:12px;padding:10px;background:#fafafa;font-size:14px;line-height:1.45}.card-title{font-weight:700;font-size:15px}.card-type{color:#444;font-size:13px;margin-bottom:6px}.card .rowline{margin:2px 0}.card .label{font-weight:600}.card .item{border-top:1px solid #e5e5ea;padding:6px 0}.card .action{margin-top:8px;font-weight:700}.card .footer{margin-top:6px;color:#333}";
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
function renderCardHtml(card) {
  if (!card || typeof card !== "object") return "";
  const skip = new Set(["title", "type", "kind", "primary_action", "primaryAction", "action_label", "action", "cta"]);
  const lines = [`<div class="card-title">${esc(card.title || humanLabel(card.type || card.kind || "Card"))}</div>`];
  if (card.type || card.kind) lines.push(`<div class="card-type">Type: ${esc(humanLabel(card.type || card.kind))}</div>`);
  for (const [k, v] of Object.entries(card)) {
    if (skip.has(k)) continue;
    if (Array.isArray(v) && v.length && typeof v[0] === "object") {
      lines.push(`<div class="rowline"><span class="label">${esc(humanLabel(k))}:</span></div>`);
      for (const item of v) {
        const rows = Object.entries(item).filter(([ek]) => !/^(job_id|posting|variant_id|referral_id|application_id|app_id|person_id)$/i.test(ek)).map(([ek, ev]) => `<div class="rowline"><span class="label">${esc(humanLabel(ek))}:</span> ${esc(humanValue(ek, ev))}</div>`).join("");
        lines.push(`<div class="item">${rows}</div>`);
      }
    } else lines.push(`<div class="rowline"><span class="label">${esc(humanLabel(k))}:</span> ${esc(humanValue(k, v))}</div>`);
  }
  lines.push(`<div class="action">Action: ${esc(primaryAction(card))}</div>`);
  if (!("note" in card) && !("footer" in card)) lines.push(`<div class="footer">Nothing is sent or submitted until you approve.</div>`);
  return `<div class="card">${lines.join("")}</div>`;
}

function renderHtml(scId, slug, status, messages) {
  const bubbles = (messages || []).filter((m) => m.role === "user" || m.role === "agent").map((m) => {
    const side = m.role === "user" ? "right" : "left";
    const card = m.card ? renderCardHtml(m.card) : "";
    return `<div class="row ${side}"><div class="bubble ${m.role}">${esc(m.text)}${card}</div></div>`;
  }).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>${scId} ${esc(slug)}</title><style>body{font-family:-apple-system,'Segoe UI',sans-serif;background:#f2f2f7;margin:0;padding:16px}.row{display:flex;margin:6px 0}.row.right{justify-content:flex-end}.bubble{max-width:78%;padding:10px 14px;border-radius:18px;white-space:pre-wrap;font-size:15px;line-height:1.4}.user{background:#0057b8;color:#fff;border-bottom-right-radius:4px}.agent{background:#fff;color:#111;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.08)}${CARD_CSS}h1{font-size:16px}</style><h1>Upmore — ${scId} · ${esc(slug)} · ${status}</h1>${bubbles}`;
}
function session(scId, slug) {
  const base = `${scId}-${slug}`;
  const messages = [];
  const startedAt = new Date().toISOString();
  let seq = 0;
  function push(role, text, extra) {
    const m = Object.assign({ seq: ++seq, at: new Date().toISOString(), role, text: text == null ? null : String(text) }, extra || {});
    messages.push(m); return m;
  }
  const s = {
    id: scId, slug, base, messages,
    user(text) {
      const mode = scVariant();
      if (!mode) return push("user", text);
      if (mode === "double") {
        // one scripted turn arrives as TWO user pushes at a clause boundary
        const [a, b] = splitForDouble(text);
        push("user", a);
        return push("user", b);
      }
      return push("user", messify(text, mode, scId));
    },
    agent(text, opts) {
      const cardExtra = opts && opts.card ? { card: opts.card } : undefined;
      if (CareerReply && !process.env.HARNESS_RAW_AGENT) {
        // INTEGRATION (done in this branch — composer merged at 0434b45, glue
        // was clean): route through CareerReply.composeText. Each composed
        // bubble becomes its own agent message; the card rides the first one.
        const bubbles = CareerReply.composeText(text == null ? "" : String(text));
        let first = null;
        bubbles.forEach((b, i) => {
          const m = push("agent", b, i === 0 ? cardExtra : undefined);
          if (!first) first = m;
        });
        return first;
      }
      return push("agent", text, cardExtra);
    },
    card(card) { return push("agent", card && card.title ? card.title : "(card)", { card }); },
    tool(name, result) { return push("tool", typeof result === "string" ? result : JSON.stringify(result), { tool: name, result }); },
    verify(what, evidence) { return push("verification", what, { evidence }); },
    async finish(outcome) {
      // outcome: {status: COMPLETE|LEARN|ASK, outcome: "one real-world line", reason?, unblock?}
      // REPLY-QUALITY PASS: the reply oracle judges the user-visible reply. A
      // claimed COMPLETE whose reply fails the oracle is written as FAIL (the
      // record keeps claimed_status and the reason is prefixed with the oracle
      // failures). LEARN/ASK keep their status; the oracle result is recorded
      // either way.
      fs.mkdirSync(OUT_DIR, { recursive: true });
      const suffix = scSuffix();
      const variant = scVariant();
      const claimedStatus = outcome.status;
      // Typed result contract (owner's repair brief): result_status comes from
      // outcome.resultStatus when the script passes a valid one, else derives
      // from the claimed status. It describes the underlying typed outcome, so
      // it is derived from the CLAIMED status even if the oracle downgrades
      // the written status below.
      const RESULT_STATUSES = new Set(["completed", "prepared", "awaiting_user", "running", "partial", "blocked", "failed", "unknown_outcome"]);
      const DERIVED_RESULT = { COMPLETE: "completed", LEARN: "partial", ASK: "awaiting_user", FAIL: "failed" };
      const resultStatus = RESULT_STATUSES.has(outcome.resultStatus) ? outcome.resultStatus : (DERIVED_RESULT[claimedStatus] || "unknown_outcome");
      const oracle = ReplyOracle.checkMessages(messages, {
        resultStatus,
        claimedStatus,
        stateText: [outcome.outcome, outcome.unblock].filter(Boolean).join(" "),
      });
      let status = claimedStatus;
      let reason = outcome.reason || null;
      if (!oracle.pass && claimedStatus === "COMPLETE") {
        status = "FAIL";
        const detail = oracle.failures.map((f) => `[${f.rule} @seq ${f.seq}] ${f.excerpt}`).join("; ");
        reason = `reply-oracle FAIL: ${detail}` + (reason ? ` | claimed reason: ${reason}` : "");
      }
      const rec = { scenario: scId, slug, started_at: startedAt, finished_at: new Date().toISOString(), status, claimed_status: claimedStatus, result_status: resultStatus, variant, reply_oracle: { pass: oracle.pass, failures: oracle.failures, warnings: oracle.warnings }, outcome_line: outcome.outcome, reason, unblock: outcome.unblock || null, messages };
      fs.writeFileSync(path.join(OUT_DIR, base + suffix + ".messages.json"), JSON.stringify(rec, null, 2));
      const oracleMd = [`## Reply oracle: ${oracle.pass ? "PASS" : "FAIL"}`, ``];
      if (!oracle.pass) { for (const f of oracle.failures) oracleMd.push(`- seq ${f.seq} [${f.rule}] ${f.excerpt}`); oracleMd.push(``); }
      if (oracle.warnings.length) {
        oracleMd.push(`### Reply warnings (advisory — never a downgrade)`, ``);
        for (const w of oracle.warnings) oracleMd.push(`- seq ${w.seq} [${w.rule}] ${w.excerpt}`);
        oracleMd.push(``);
      }
      const md = [`# ${scId} — ${slug}`, ``, `**Status:** ${status}`, claimedStatus !== status ? `**Claimed status:** ${claimedStatus}` : null, `**Result status:** ${resultStatus}`, `**Variant:** ${variant || "none"}`, `**Outcome:** ${outcome.outcome}`,
        reason ? `**Reason:** ${reason}` : null, outcome.unblock ? `**Unblocks with:** ${outcome.unblock}` : null, ``, ...oracleMd, `## Conversation (entire, word for word)`, ``];
      for (const m of messages) {
        if (m.role === "user") md.push(`**USER:** ${m.text}`, ``);
        else if (m.role === "agent") { md.push(`**AGENT:** ${m.text}`, ``); if (m.card) md.push("```json\n" + JSON.stringify(m.card, null, 2) + "\n```", ``); }
        else if (m.role === "tool") md.push(`*[tool ${m.tool}]*`, "```json\n" + m.text + "\n```", ``);
        else if (m.role === "verification") md.push(`**VERIFIED FROM RAIL STATE:** ${m.text}`, m.evidence ? "```json\n" + JSON.stringify(m.evidence, null, 2) + "\n```" : "", ``);
      }
      fs.writeFileSync(path.join(OUT_DIR, base + suffix + ".md"), md.filter((x) => x !== null).join("\n"));
      const html = renderHtml(scId, slug, status, messages);
      const htmlPath = path.join(OUT_DIR, base + suffix + ".html");
      fs.writeFileSync(htmlPath, html);
      try {
        execFileSync("python3", [path.join(__dirname, "shoot.py"), htmlPath, path.join(OUT_DIR, base + suffix + ".png")], { stdio: "pipe", timeout: 60000 });
      } catch (e) { push("verification", "screenshot failed: " + String(e).slice(0, 200)); }
      return rec;
    },
  };
  return s;
}
module.exports = { session, OUT_DIR, renderCardHtml, renderHtml, primaryAction, humanLabel, humanValue, CARD_CSS, messify, splitForDouble, hashSeed };
