#!/usr/bin/env node
// Weekly corpus growth (corpus/USAGE-PROMPT.txt step 3): every Sunday, pull the week's real conversations that were
// (a) failures, (b) corrected by the person, or (c) a situation the corpus has no example for; redact names, handles and
// numbers; write them as DRAFT corpus examples for a person to rewrite into the corpus mannerisms, review by hand and
// append to corpus/upmore-convo-corpus-5-of-5.txt (or a new file). Once merged, an example is an eval on every commit
// (tests/edge/corpus-evals.test.ts), so each failure becomes a permanent eval.
//
// Nothing here is automatic past the draft: redaction is a heuristic and a person reads every line before it is merged.
// Drafts go to corpus/drafts/ (gitignored), never straight into the corpus.
//
//   node scripts/corpus-weekly-export.cjs --rows rows.json [--since 2026-10-04] [--out corpus/drafts]
//       rows.json: agent_messages rows [{ thread_id, role, content, meta, created_at }], e.g. exported in the SQL editor:
//       select thread_id, role, content, meta, created_at from agent_messages where created_at >= now() - interval '7 days'
//       order by thread_id, created_at, id;
//   node scripts/corpus-weekly-export.cjs --live [--since ...]
//       reads the same rows over the REST API with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment
//       (never a file, never logged); prints NOT RUN without them.
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const StyleCorpus = require(path.join(root, "packages/domain/75-style-corpus.js"));

const OUTAGE = /AI service .* isn'?t responding|can'?t answer that right now/i;
const CORRECTION = /^\s*(no+\b|nope|not that|that'?s (not|wrong)|wrong|i (meant|said|asked)|i didn'?t (say|ask|mean)|wait,? no|actually\b|that'?s not what)/i;
const NEW_SITUATION_BELOW = 0.12; // best style-corpus score under this: the corpus has no near example

// Why a turn pair belongs in the export, or null.
function failureOf(a) {
  const m = (a && a.meta) || {}, r = m.flow_route || {};
  if (m.failure_code) return `failure_code ${m.failure_code}`;
  if (m.model_error) return "model error";
  if (OUTAGE.test(String(a.content || ""))) return "outage reply";
  if (m.incomplete) return "incomplete planner reply";
  if (r.outcome === "unavailable" || r.outcome === "error") return `flow ${r.outcome}`;
  if (Array.isArray(r.problems) && r.problems.length) return `flow problems: ${r.problems.join("; ").slice(0, 120)}`;
  return null;
}

// Redaction. Names: capitalized words that are not sentence starts or known words, and the word after a money verb
// ("send sam 40"). Handles, emails, phone numbers, card/account digits and every other number are replaced with
// placeholders that stay consistent inside one conversation, so the draft still reads.
const COMMON = new Set("I A An The And Or But If So Yes No Ok Okay Hi Hey Thanks Thank Please Sure Done Sent Staged Nothing Reply YES NO DETAILS NEW SAVE Venmo Zelle PayPal Cash App Checking Savings Netflix Hulu Spotify Upmore Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Which What Who When Where Why How That This It Its Want Send Pay Cancel Split Buy Sell Request Next Then First Two Can Can't Don't Didn't Won't I'll I'm I've Set Your You You're Here Here's There There's Got Looks Tap Open Check Try Sorry Not All Every Each Already Just Also Today Tomorrow Tonight Good Great Got It's Let Let's Bank Card Account Order Market Stock Fee No".split(" "));
const STOP = new Set("me my the a an it them him her you your back for of in on at by and or with from to all everyone everybody each checking savings venmo zelle cash app paypal card bank account send pay do be go get see cancel buy sell request confirm start help use try tap keep watch ask check this that their his its our what which who now today tonight tomorrow rn pls please money half again too also just instead first then is was are will would can could thanks dinner rent lunch uber split each yes no ok okay".split(" "));
function redactor() {
  const maps = { name: new Map(), handle: new Map(), num: new Map() };
  const tag = (kind, key, label, close = "") => { const m = maps[kind]; if (!m.has(key)) m.set(key, `${label}${m.size + 1}${close}`); return m.get(key); };
  const name = w => tag("name", w.toLowerCase(), "<NAME", ">");
  return function redact(text) {
    let t = String(text == null ? "" : text);
    t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<EMAIL>");
    t = t.replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "<PHONE>");
    t = t.replace(/[@$][A-Za-z][\w.-]{1,30}/g, h => tag("handle", h.toLowerCase(), "@handle"));
    t = t.replace(/(•+|\*{2,}|x{2,})\s?\d{2,4}/gi, "••NNNN");
    t = t.replace(/\d{5,}/g, "<DIGITS>");
    // Amounts: "40", "$40" and "$40.00" are one number (one placeholder); digits inside a placeholder are left alone.
    t = t.replace(/(?<![A-Za-z0-9_.])\$?\d[\d,]*(?:\.\d+)?/g, n => { const v = Number(n.replace(/[$,]/g, "")); return (n.startsWith("$") ? "$" : "") + tag("num", Number.isFinite(v) ? String(v) : n, "N"); });
    // Lowercase names: the word after a money verb ("send sam 40"), and a lowercase word right after a redacted name
    // (a surname: "priya patel"), unless it is an ordinary word.
    t = t.replace(/\b(send|pay|venmo|zelle|request|split with|ask)\s+([a-z][a-z'-]{1,20})\b/gi, (m, v, w) => STOP.has(w.toLowerCase()) ? m : `${v} ${name(w)}`);
    t = t.replace(/\b(to|from|with)\s+([a-z][a-z'-]{1,20})\b/g, (m, v, w) => STOP.has(w) ? m : `${v} ${name(w)}`);
    // A name seen once in this conversation is redacted everywhere after, in any case ("Priya", then "priya").
    t = t.replace(/\b[A-Za-z][a-z'-]{1,20}\b/g, w => maps.name.has(w.toLowerCase()) ? maps.name.get(w.toLowerCase()) : w);
    // Over-redacts a capitalized ordinary word rather than miss a name: a person rewrites the draft anyway.
    t = t.replace(/\b([A-Z][a-z]{1,20})\b/g, w => COMMON.has(w) ? w : name(w));
    for (let i = 0; i < 2; i++) t = t.replace(/(<NAME\d+>)\s+([a-z][a-z'-]{1,20})\b/g, (m, n, w) => STOP.has(w) ? m : `${n} ${name(w)}`);
    return t;
  };
}

function threadsOf(rows) {
  const byThread = new Map();
  for (const r of rows) { if (!byThread.has(r.thread_id)) byThread.set(r.thread_id, []); byThread.get(r.thread_id).push(r); }
  for (const list of byThread.values()) list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || (a.id || 0) - (b.id || 0));
  return byThread;
}

// One draft per conversation that has at least one reason; the conversation is cut to the turns around the reasons.
function classify(rows, examples) {
  const drafts = [];
  for (const [thread, list] of threadsOf(rows)) {
    const reasons = []; let firstUser = null;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.role === "user" && firstUser === null) firstUser = m.content;
      if (m.role === "assistant") { const f = failureOf(m); if (f) reasons.push({ kind: "failure", at: i, why: f }); }
      if (m.role === "user" && i > 0 && list[i - 1].role === "assistant" && CORRECTION.test(String(m.content || ""))) reasons.push({ kind: "corrected", at: i, why: "the person corrected the reply" });
    }
    if (firstUser) {
      const best = bestScore(examples, firstUser);
      if (best < NEW_SITUATION_BELOW) reasons.push({ kind: "new_situation", at: 0, why: `no corpus example is near (best score ${best.toFixed(2)})` });
    }
    if (reasons.length) drafts.push({ thread, reasons, turns: list.map(m => ({ role: m.role, content: m.content })) });
  }
  return drafts;
}
function bestScore(examples, message) {
  // select() returns examples, not scores: score the nearest one the same way the selector does.
  const picked = StyleCorpus.select(examples, message, { k: 1, always: [] });
  if (!picked.length) return 0;
  const q = new Set(StyleCorpus.tokens(message)), e = picked[0];
  const toks = new Set(StyleCorpus.tokens(e.turns.map(t => t.text).join(" ")));
  let hit = 0; for (const t of q) if (toks.has(t)) hit++;
  return q.size ? hit / Math.sqrt(q.size * toks.size) : 0;
}

function render(drafts, since) {
  const L = [`# DRAFT corpus examples, week since ${since}. NOT the corpus: rewrite each A: line into the corpus mannerisms,`,
    "# check the redaction by hand (names, handles, numbers), then append to corpus/upmore-convo-corpus-5-of-5.txt and run",
    "# node scripts/build-style-corpus.cjs && deno run -A evals/corpus/run.ts. Delete this file after merging.", ""];
  drafts.forEach((d, i) => {
    const redact = redactor();
    L.push(`### W.${String(i + 1).padStart(2, "0")} ${d.reasons.map(r => r.kind).filter((k, j, a) => a.indexOf(k) === j).join(", ")}`);
    for (const r of d.reasons) L.push(`(why: ${r.kind}: ${r.kind === "failure" ? redact(r.why) : r.why})`);
    for (const t of d.turns) L.push(`${t.role === "user" ? "U" : "A (actual, rewrite)"}: ${redact(t.content).replace(/\s*\n\s*/g, " ")}`);
    L.push("NOTE: (write the rule this example teaches)", "");
  });
  return L.join("\n");
}

async function fetchLive(since) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const q = `${url.replace(/\/$/, "")}/rest/v1/agent_messages?select=id,thread_id,role,content,meta,created_at&created_at=gte.${encodeURIComponent(since)}&order=thread_id.asc,created_at.asc,id.asc&limit=10000`;
  const r = await fetch(q, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`agent_messages read failed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function main(argv) {
  const arg = k => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const since = arg("--since") || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  let rows;
  if (argv.includes("--live")) {
    rows = await fetchLive(since);
    if (!rows) { console.log("NOT RUN: --live needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. Nothing was exported."); return 2; }
  } else if (arg("--rows")) rows = JSON.parse(fs.readFileSync(arg("--rows"), "utf8"));
  else { console.log("usage: node scripts/corpus-weekly-export.cjs --rows rows.json | --live [--since YYYY-MM-DD] [--out dir]"); return 2; }
  const examples = JSON.parse(fs.readFileSync(path.join(root, "corpus/corpus.json"), "utf8")).examples;
  const drafts = classify(rows.filter(r => !r.created_at || String(r.created_at) >= since), examples);
  const out = path.resolve(arg("--out") || path.join(root, "corpus/drafts"));
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `weekly-${since}.txt`);
  fs.writeFileSync(file, render(drafts, since) + "\n", { mode: 0o600 });
  const count = k => drafts.filter(d => d.reasons.some(r => r.kind === k)).length;
  console.log(`weekly export since ${since}: ${rows.length} messages, ${drafts.length} draft examples (failures ${count("failure")}, corrected ${count("corrected")}, new situations ${count("new_situation")}) -> ${path.relative(root, file)}. Review every line by hand before merging.`);
  return 0;
}

module.exports = { classify, redactor, failureOf, render, CORRECTION };
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c), e => { console.error(String(e && e.message || e)); process.exit(1); });
