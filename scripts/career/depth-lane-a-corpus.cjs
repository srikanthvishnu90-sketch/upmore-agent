/* DEPTH LANE A — fresh adversarial corpus for memory & continuity
   (MI-013 / MI-012 / MI-021 / MI-017 + LF-02).

   Every conversation here was written fresh for this lane (new firms,
   new personas, new words — nothing from the Lane C corpus, the
   42-battery, or the P-set). Turns run through the REAL production
   host seam (supabase/functions/_shared/career_host.js) with an
   in-memory persistence layer that mirrors the production RPCs:
     * per-thread snapshots (extractSnapshot round-trip between turns)
     * a per-user ACCOUNT record that survives across threads
     * the commit patch whitelist enforced exactly like
       career_host_commit (an out-of-whitelist patch key is a hard
       failure of the run — the DB would reject the whole commit)
     * the watch profile extracted per user like the RPC does

   Bars (owner, 2026-10-16, raised): memory checks >= 75%,
   multi-intent parts >= 90%, cross-thread recall >= 70%,
   T3-band success >= 60%, overall fallback <= 10% — judged on the
   WORST band, not the average. Tracker events 100% recorded with
   zero non-assertion writes is floor, not a bar.

   Usage: node scripts/career/depth-lane-a-corpus.cjs [--json]
          PATCH_MODE=legacy node ...   (pre-migration whitelist) */
"use strict";
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW0 = Date.parse("2026-10-16T15:00:00.000Z");
const PATCH_MODE = process.env.PATCH_MODE || "current";
const PATCH_WHITELIST = PATCH_MODE === "legacy"
  ? ["paused", "preferred_locations", "erase"]
  : ["paused", "preferred_locations", "erase", "stated_facts"];

const host = CareerHost.createCareerHost({
  CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
  CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
  CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
});

// ---------------- in-memory production-semantics store ----------------
function makeStore() { return { accounts: new Map(), threads: new Map(), watches: new Map(), patchViolations: [] }; }
const clone = (v) => JSON.parse(JSON.stringify(v));

function applyPatch(store, userId, patch) {
  for (const k of Object.keys(patch)) {
    if (!PATCH_WHITELIST.includes(k)) { store.patchViolations.push({ userId, key: k }); return; }
  }
  if (patch.erase === true) { store.accounts.set(userId, { paused: true }); return; }
  const a = store.accounts.get(userId) || {};
  for (const k of Object.keys(patch)) a[k] = clone(patch[k]);
  store.accounts.set(userId, a);
}

function say(store, userId, threadId, text, opts) {
  const o = opts || {};
  const account = clone(store.accounts.get(userId) || {});
  const snapshot = store.threads.get(threadId) || null;
  const watchState = clone(store.watches.get(userId) || {});
  const ctx = host.createTurnCtx({ userId, threadId, now: o.now || NOW0, accountPersistence: true, snapshot, account, watchState, postings: o.postings || [] });
  const out = host.runTurn(text, ctx);
  const snap = host.extractSnapshot(ctx);
  store.threads.set(threadId, snap);
  if (ctx._hostPatch) applyPatch(store, userId, ctx._hostPatch);
  const aws = snap.stores && snap.stores.alertWatchState;
  const wpk = `career:watch-profile:${userId}`;
  if (aws && aws[wpk]) store.watches.set(userId, { [wpk]: clone(aws[wpk]) });
  return { out, ctx, snap };
}

// ---------------- grading helpers ----------------
const FALLBACK_HEAD = "I didn't catch that";
function isFallback(out) {
  if (!out) return true;
  if (out.contained) return true;
  if (out.intent === "career_fallback") return true;
  if (!out.reply || !String(out.reply).trim()) return true;
  if (String(out.reply).startsWith(FALLBACK_HEAD)) return true;
  return false;
}
const lc = (v) => String(v == null ? "" : v).toLowerCase();
function factsOf(ctx, snap) {
  const a = (ctx && ctx.statedFacts && ctx.statedFacts.facts) || [];
  if (a.length) return a;
  return (((snap || {}).stores || {}).statedFacts || {}).facts || [];
}
function rowsOf(ctx) {
  const ts = (ctx && ctx.trackStore) || {};
  return Array.isArray(ts) ? ts : (Array.isArray(ts.rows) ? ts.rows : []);
}
function runChecks(turn, r, store) {
  const fails = [];
  const reply = (r.out && r.out.reply) || "";
  const rl = lc(reply);
  for (const c of turn.checks || []) {
    if (c.t === "notFallback") { if (isFallback(r.out)) fails.push(`fallback (intent=${r.out && r.out.intent}, contained=${r.out && r.out.contained})`); }
    else if (c.t === "intent") { if (!r.out || r.out.intent !== c.v) fails.push(`intent ${r.out && r.out.intent} != ${c.v}`); }
    else if (c.t === "intentNot") { if (r.out && r.out.intent === c.v) fails.push(`intent is ${c.v} (forbidden here)`); }
    else if (c.t === "contains") { for (const v of c.v) if (!rl.includes(lc(v))) fails.push(`reply lacks "${v}"`); }
    else if (c.t === "containsAny") { if (!c.v.some((v) => rl.includes(lc(v)))) fails.push(`reply lacks any of ${JSON.stringify(c.v)}`); }
    else if (c.t === "notContains") { for (const v of c.v) if (rl.includes(lc(v))) fails.push(`reply wrongly contains "${v}"`); }
    else if (c.t === "fact") { const fs = factsOf(r.ctx, r.snap); if (!fs.some((f) => f.kind === c.kind && lc(f.value).includes(lc(c.value)))) fails.push(`no stated fact ${c.kind}~"${c.value}" (have: ${fs.map((f) => `${f.kind}=${f.value}`).join("; ") || "none"})`); }
    else if (c.t === "noFact") { const fs = factsOf(r.ctx, r.snap); if (fs.some((f) => f.kind === c.kind && lc(f.value).includes(lc(c.value)))) fails.push(`fact wrongly recorded: ${c.kind}~"${c.value}"`); }
    else if (c.t === "noFactKind") { const fs = factsOf(r.ctx, r.snap); if (fs.some((f) => f.kind === c.kind)) fails.push(`fact kind wrongly recorded: ${c.kind}=${fs.filter((f) => f.kind === c.kind).map((f) => f.value).join(",")}`); }
    else if (c.t === "row") { const rows = rowsOf(r.ctx); const row = rows.find((x) => lc(x.company || "").includes(lc(c.company))); if (!row) fails.push(`no tracker row for ${c.company} (rows: ${rows.map((x) => x.company).join(", ") || "none"})`); else if (c.stage && lc(row.stage) !== lc(c.stage)) fails.push(`row ${c.company} stage "${row.stage}" != "${c.stage}"`); }
    else if (c.t === "noRow") { const rows = rowsOf(r.ctx); if (rows.some((x) => lc(x.company || "").includes(lc(c.company)))) fails.push(`tracker row wrongly exists for ${c.company}`); }
    else if (c.t === "rowCount") { const rows = rowsOf(r.ctx); if (rows.length !== c.v) fails.push(`tracker rows ${rows.length} != ${c.v}`); }
    else if (c.t === "accountFact") { const a = store.accounts.get(turn.user) || {}; const sf = (a.stated_facts && a.stated_facts.facts) || []; if (!sf.some((f) => f.kind === c.kind && lc(f.value).includes(lc(c.value)))) fails.push(`account holds no fact ${c.kind}~"${c.value}" (account keys: ${Object.keys(a).join(",") || "none"})`); }
    else if (c.t === "watch") { const w = store.watches.get(turn.user) || {}; if (!Object.keys(w).length) fails.push("no watch profile persisted for user"); }
    else if (c.t === "fn") { const msg = c.fn(r, store); if (msg) fails.push(msg); }
    else fails.push(`unknown check ${c.t}`);
  }
  return fails;
}

// ---------------- fixture postings (harness-only, like the gauntlet pool) ----------------
const POOL = [
  { id: "fx-1", title: "Data Analytics Intern", company: "Lumen Grid", location: "Seattle, WA", remote_terms: "hybrid", requirements: ["SQL", "Python", "data science coursework"], salary: "$30/hr", deadline: "2026-11-02", tradeoff: "" },
  { id: "fx-2", title: "Business Analyst Intern", company: "Copperline Bank", location: "Denver, CO", remote_terms: "onsite", requirements: ["economics", "Excel", "financial modeling"], salary: "$28/hr", deadline: "2026-11-09", tradeoff: "" },
  { id: "fx-3", title: "Operations Intern", company: "Atlas Freight", location: "Chicago, IL", remote_terms: "onsite", requirements: ["supply chain", "logistics", "route analysis"], salary: "$26/hr", deadline: "2026-11-12", tradeoff: "" },
  { id: "fx-4", title: "Consulting Intern", company: "Harbor & Finch", location: "Boston, MA", remote_terms: "hybrid", requirements: ["case interviews", "economics", "slide work"], salary: "$32/hr", deadline: "2026-11-05", tradeoff: "" },
  { id: "fx-5", title: "Software Engineering Intern", company: "Halcyon Robotics", location: "Austin, TX", remote_terms: "onsite", requirements: ["Python", "robotics", "computer science"], salary: "$38/hr", deadline: "2026-11-15", tradeoff: "" },
  { id: "fx-6", title: "Finance Intern", company: "Pinecrest Capital", location: "New York, NY", remote_terms: "onsite", requirements: ["finance", "valuation", "Excel"], salary: "$34/hr", deadline: "2026-11-20", tradeoff: "" },
];

// ---------------- the corpus ----------------
// turn: { user, thread, say, postings?, checks?, memory?: true, parts?: [{name, any:[..] }] }
const U = "lane-a-user";
const CONVOS = [
  // ===== MEM — facts stated in-thread, used later in-thread =====
  { id: "MEM-1", band: "MEM", turns: [
    { user: U, thread: "m1", say: "junior here — economics major, based in Denver btw", checks: [{ t: "fact", kind: "year", value: "junior" }, { t: "fact", kind: "majors", value: "economics" }, { t: "fact", kind: "geography", value: "Denver" }] },
    { user: U, thread: "m1", say: "find me internships", postings: POOL, checks: [{ t: "notFallback" }] },
    { user: U, thread: "m1", say: "given all of that, which of these actually fit me best?", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Denver", "economics", "Copperline"] }] },
  ] },
  { id: "MEM-2", band: "MEM", turns: [
    { user: U, thread: "m2", say: "last summer I interned at a freight company doing route analysis and load planning", checks: [{ t: "fact", kind: "experience", value: "freight" }] },
    { user: U, thread: "m2", say: "knowing that, what kind of roles should I be aiming at?", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["route", "logistics", "freight", "operations", "supply chain"] }] },
  ] },
  { id: "MEM-3", band: "MEM", turns: [
    { user: U, thread: "m3", say: "I'm a rising senior", checks: [{ t: "fact", kind: "year", value: "senior" }] },
    { user: U, thread: "m3", say: "finance and computer science are my majors, and I want New York firms", checks: [{ t: "fact", kind: "majors", value: "finance" }, { t: "fact", kind: "geography", value: "New York" }] },
    { user: U, thread: "m3", say: "so what should I do first?", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["New York", "finance"] }] },
  ] },
  { id: "MEM-4", band: "MEM", turns: [
    { user: U, thread: "m4", say: "I go to Northeastern. last summer I worked at a seed-stage startup on growth experiments", checks: [{ t: "fact", kind: "school", value: "Northeastern" }] },
    { user: U, thread: "m4", say: "with all that in mind, how should I open a first networking call?", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Northeastern", "startup", "growth"] }] },
  ] },
  { id: "MEM-5", band: "MEM", turns: [
    { user: U, thread: "m5", say: "im a sophmore, studying finace and cs, kinda nervous about recruiting", checks: [{ t: "fact", kind: "year", value: "sophomore" }] },
    { user: U, thread: "m5", say: "what should this semester look like for me?", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["sophomore", "finance", "computer science", "second year", "soph"] }] },
  ] },
  { id: "MEM-6", band: "MEM", turns: [
    { user: U, thread: "m6", say: "analysts only for me — associates are too senior for where I am", checks: [{ t: "fact", kind: "level", value: "analysts" }] },
    { user: U, thread: "m6", say: "build my networking plan", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["analyst"] }] },
  ] },

  // ===== XT — cross-thread recall (new thread, same user, account carries) =====
  { id: "XT-1", band: "XT", turns: [
    { user: U, thread: "x1a", say: "I'm a junior studying data science, and I'm targeting Seattle firms", checks: [{ t: "accountFact", kind: "geography", value: "Seattle" }] },
    { user: U, thread: "x1b", say: "what should I do first?", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Seattle", "data science", "junior"] }] },
  ] },
  { id: "XT-2", band: "XT", turns: [
    { user: U, thread: "x2a", say: "last summer I interned at Pinecrest Capital doing diligence memos", checks: [{ t: "fact", kind: "experience", value: "Pinecrest" }] },
    { user: U, thread: "x2b", say: "help me open a coffee chat message — use what you know about me", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Pinecrest", "diligence"] }] },
  ] },
  { id: "XT-3", band: "XT", turns: [
    { user: U, thread: "x3a", say: "I'm targeting Boston firms this cycle", checks: [{ t: "fact", kind: "geography", value: "Boston" }] },
    { user: U, thread: "x3a", say: "actually make it Chicago not Boston", checks: [{ t: "fact", kind: "geography", value: "Chicago" }, { t: "accountFact", kind: "geography", value: "Chicago" }] },
    { user: U, thread: "x3b", say: "quick reminder — where's my search focused?", memory: true, checks: [{ t: "notFallback" }, { t: "contains", v: ["Chicago"] }, { t: "notContains", v: ["targeting Boston", "focused on Boston", "Boston firms"] }] },
  ] },
  { id: "XT-4", band: "XT", turns: [
    { user: U, thread: "x4a", say: "Lumen Grid offered me a data internship at $31 an hour, I have until Friday to decide", checks: [{ t: "notFallback" }] },
    { user: U, thread: "x4b", say: "recap my offer situation", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Lumen"] }] },
  ] },

  // ===== MULTI — multi-intent parts delivered in the turn =====
  { id: "MI-1", band: "MULTI", turns: [
    { user: U, thread: "i1", say: "find me data internships and also tell me what my tracker looks like", postings: POOL, parts: [
      { name: "find", any: ["Lumen Grid", "Data Analytics", "Copperline", "Atlas Freight", "Harbor", "Halcyon", "Pinecrest"] },
      { name: "tracker", any: ["tracker", "applications on record", "no applications"] },
    ], checks: [{ t: "notFallback" }] },
  ] },
  { id: "MI-2", band: "MULTI", turns: [
    { user: U, thread: "i2", say: "I'm a senior studying supply chain — and can you check the status of my applications?", parts: [
      { name: "fact", state: (r) => factsOf(r.ctx, r.snap).some((f) => f.kind === "year" && lc(f.value).includes("senior")) ? null : "senior fact not recorded" },
      { name: "tracker", any: ["tracker", "applications", "on record"] },
    ], checks: [{ t: "notFallback" }, { t: "intentNot", v: "career_recommendations" }] },
  ] },
  { id: "MI-3", band: "MULTI", turns: [
    { user: U, thread: "i3", say: "I'm a junior studying mechanical engineering", checks: [{ t: "fact", kind: "year", value: "junior" }, { t: "fact", kind: "majors", value: "mechanical" }] },
    { user: U, thread: "i3", say: "prep me for a technical interview and set up a watch for software engineering roles", parts: [
      { name: "prep", any: ["interview", "prep", "practice", "question"] },
      { name: "watch", state: (r) => { const aws = ((r.snap || {}).stores || {}).alertWatchState || {}; return Object.keys(aws).length ? null : "no watch persisted"; } },
    ], checks: [{ t: "notFallback" }] },
  ] },
  { id: "MI-4", band: "MULTI", turns: [
    { user: U, thread: "i4", say: "log that I applied to Harbor & Finch, then find me consulting internships", postings: POOL, parts: [
      { name: "log", state: (r) => rowsOf(r.ctx).some((x) => lc(x.company || "").includes("harbor")) ? null : "application not logged" },
      { name: "find", any: ["consulting", "Harbor", "internship", "roles"] },
    ], checks: [{ t: "notFallback" }] },
  ] },

  // ===== CONT — next-step continuations over active work (LF-01a) =====
  { id: "CT-1", band: "CONT", turns: [
    { user: U, thread: "c1", say: "find me internships", postings: POOL, checks: [{ t: "notFallback" }] },
    { user: U, thread: "c1", say: "ok and then?", checks: [{ t: "notFallback" }] },
  ] },
  { id: "CT-2", band: "CONT", turns: [
    { user: U, thread: "c2", say: "give me a practice case question", checks: [{ t: "notFallback" }] },
    { user: U, thread: "c2", say: "so what's the move after that?", checks: [{ t: "notFallback" }] },
  ] },
  { id: "CT-3", band: "CONT", turns: [
    { user: U, thread: "c3", say: "I applied to Copperline Bank last week", checks: [{ t: "row", company: "Copperline" }] },
    { user: U, thread: "c3", say: "what's the status of everything?", checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Copperline"] }] },
    { user: U, thread: "c3", say: "and which of those needs my attention first?", checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Copperline", "attention", "follow"] }] },
  ] },
  { id: "CT-4", band: "CONT", turns: [
    { user: U, thread: "c4", say: "find me finance roles and prep me for interviews", postings: POOL, checks: [{ t: "notFallback" }] },
    { user: U, thread: "c4", say: "next", checks: [{ t: "notFallback" }] },
  ] },

  // ===== CORR — corrections & referents (LF-01c) =====
  { id: "CR-1", band: "CORR", turns: [
    { user: U, thread: "r1", say: "I want to network into Vantage Aero", checks: [{ t: "fact", kind: "target_firm", value: "Vantage" }] },
    { user: U, thread: "r1", say: "not Vantage — I meant Halcyon Robotics", checks: [{ t: "fact", kind: "target_firm", value: "Halcyon" }] },
    { user: U, thread: "r1", say: "ok build the plan for them", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Halcyon"] }] },
  ] },
  { id: "CR-2", band: "CORR", turns: [
    { user: U, thread: "r2", say: "log my application to Beacon Tutoring", checks: [{ t: "row", company: "Beacon" }] },
    { user: U, thread: "r2", say: "wait — it was Brightpath Health, not Beacon", checks: [{ t: "row", company: "Brightpath" }] },
    { user: U, thread: "r2", say: "what's on my tracker?", checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Brightpath"] }] },
  ] },
  { id: "CR-3", band: "CORR", turns: [
    { user: U, thread: "r3", say: "my target firm is Pinecrest Capital", checks: [{ t: "fact", kind: "target_firm", value: "Pinecrest" }] },
    { user: U, thread: "r3", say: "actually scratch that — it's Northgate Legal now", checks: [{ t: "fact", kind: "target_firm", value: "Northgate" }] },
    { user: U, thread: "r3", say: "so what's my plan for them?", memory: true, checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Northgate"] }, { t: "notContains", v: ["plan into Pinecrest", "Pinecrest Capital plan"] }] },
  ] },

  // ===== TRACK — tracker events in free words (MI-017) + LF-02 =====
  { id: "TR-1", band: "TRACK", turns: [
    { user: U, thread: "t1", say: "I applied to Halcyon Robotics for the SWE intern role", checks: [{ t: "row", company: "Halcyon" }] },
    { user: U, thread: "t1", say: "they just emailed me a rejection, ugh", checks: [{ t: "row", company: "Halcyon", stage: "Rejected" }] },
    { user: U, thread: "t1", say: "What job applications do I have out right now, and what is their status?", checks: [{ t: "intentNot", v: "career_recommendations" }, { t: "notFallback" }, { t: "notContains", v: ["Current openings are unverified"] }] },
  ] },
  { id: "TR-2", band: "TRACK", turns: [
    { user: U, thread: "t2", say: "log my application to Copperline Bank", checks: [{ t: "row", company: "Copperline" }] },
    { user: U, thread: "t2", say: "got an interview invite from Copperline this morning!", checks: [{ t: "fn", fn: (r) => { const row = rowsOf(r.ctx).find((x) => lc(x.company || "").includes("copperline")); if (!row) return "no Copperline row"; if (!/interview/i.test(row.stage) && !(row.events || []).some((e) => /interview/i.test(e.type || ""))) return `interview not recorded (stage=${row.stage}, events=${(row.events || []).map((e) => e.type).join(",")})`; return null; } }] },
    { user: U, thread: "t2", say: "where do I stand with everything?", checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Copperline"] }] },
  ] },
  { id: "TR-3", band: "TRACK", turns: [
    { user: U, thread: "t3", say: "I applied to Atlas Freight yesterday", checks: [{ t: "row", company: "Atlas" }] },
    { user: U, thread: "t3", say: "an offer just came in from Atlas Freight!!", checks: [{ t: "row", company: "Atlas", stage: "Offer" }] },
  ] },
  { id: "TR-4", band: "TRACK", turns: [
    { user: U, thread: "t4", say: "anything move on my applications lately?", checks: [{ t: "notFallback" }, { t: "intentNot", v: "career_recommendations" }] },
    { user: U, thread: "t4", say: "show me my pipeline", checks: [{ t: "notFallback" }, { t: "intentNot", v: "career_recommendations" }] },
  ] },

  // ===== T3 — long-horizon arcs =====
  { id: "T3-1", band: "T3", turns: [
    { user: U, thread: "n1", say: "Brightpath Health just offered me their ops analyst seat — $78k base, letter says decide by Thursday", checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Brightpath"] }] },
    { user: U, thread: "n1", say: "honestly, should I take it?", checks: [{ t: "notFallback" }] },
    { user: U, thread: "n1", say: "draft the counter email with the actual words", checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Brightpath"] }] },
    { user: U, thread: "n1", say: "recap where we landed with all this", checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Brightpath", "78", "Thursday"] }] },
  ] },
  { id: "T3-2", band: "T3", turns: [
    { user: U, thread: "n2", say: "sophomore, operations management major", checks: [{ t: "fact", kind: "year", value: "sophomore" }] },
    { user: U, thread: "n2", say: "and I worked a warehouse job last summer, mostly inventory counts", checks: [{ t: "fact", kind: "experience", value: "warehouse" }] },
    { user: U, thread: "n2", say: "plan my semester for me", checks: [{ t: "notFallback" }, { t: "containsAny", v: ["operations", "warehouse", "inventory", "sophomore"] }] },
    { user: U, thread: "n2", say: "turn that into a checklist", checks: [{ t: "notFallback" }] },
    { user: U, thread: "n2", say: "what's the single next step?", checks: [{ t: "notFallback" }] },
  ] },
  { id: "T3-3", band: "T3", turns: [
    { user: U, thread: "n3", say: "help me network into healthcare consulting", checks: [{ t: "notFallback" }, { t: "notContains", v: ["Goldman", "JPMorgan", "Bank of America", "Citi"] }] },
    { user: U, thread: "n3", say: "who do I talk to first?", checks: [{ t: "notFallback" }] },
    { user: U, thread: "n3", say: "draft the opener for the first one", checks: [{ t: "notFallback" }] },
  ] },
  { id: "T3-4", band: "T3", turns: [
    { user: U, thread: "n4", say: "I have a first-round interview at Copperline in three days", checks: [{ t: "notFallback" }] },
    { user: U, thread: "n4", say: "quiz me with a real question", checks: [{ t: "notFallback" }] },
    { user: U, thread: "n4", say: "what should I review tonight before it?", checks: [{ t: "notFallback" }, { t: "containsAny", v: ["Copperline", "interview", "review"] }] },
  ] },

  // ===== ADV — assertion discipline (floor: zero non-assertion writes) =====
  { id: "ADV-1", band: "ADV", turns: [
    { user: U, thread: "a1", say: "my roommate is a junior at Yale studying art history, she's stressed about recruiting", checks: [{ t: "noFact", kind: "school", value: "Yale" }, { t: "noFact", kind: "majors", value: "art" }, { t: "noFact", kind: "year", value: "junior" }] },
    { user: U, thread: "a1", say: "what do you have on record for me?", checks: [{ t: "notContains", v: ["Yale", "art history"] }] },
  ] },
  { id: "ADV-2", band: "ADV", turns: [
    { user: U, thread: "a2", say: "say I was a senior targeting Miami — what would I do?", checks: [{ t: "noFact", kind: "geography", value: "Miami" }, { t: "noFact", kind: "year", value: "senior" }] },
    { user: U, thread: "a2", say: "and if I get rejected from Atlas Freight, does it auto-mark me rejected?", checks: [{ t: "noRow", company: "Atlas" }] },
  ] },
  { id: "ADV-3", band: "ADV", turns: [
    { user: U, thread: "a3", say: "am I a sophomore? and what if I'm actually a finance major?", checks: [{ t: "noFactKind", kind: "year" }, { t: "noFactKind", kind: "majors" }] },
  ] },
  { id: "ADV-4", band: "ADV", turns: [
    { user: U, thread: "a4", say: "I applied to Vantage Aero last week", checks: [{ t: "row", company: "Vantage" }] },
    { user: U, thread: "a4", say: "my friend said Vantage already rejected everyone, so mark me rejected", checks: [{ t: "fn", fn: (r) => { const row = rowsOf(r.ctx).find((x) => lc(x.company || "").includes("vantage")); if (row && lc(row.stage) === "rejected") return "row marked Rejected on hearsay, not the user's own assertion"; return null; } }] },
  ] },
];

// ---------------- run ----------------
// Each conversation is its own persona (its own user id): facts
// accumulating across CONVERSATIONS would be cross-user bleed, while
// facts accumulating across THREADS of one conversation is exactly
// the cross-thread behavior under test (the XT band).
function runCorpus() {
  const store = makeStore();
  const results = [];
  let turnNo = 0;
  for (const convo of CONVOS) {
    const convoRes = { id: convo.id, band: convo.band, turns: [], pass: true };
    const user = `lane-a-${convo.id.toLowerCase()}`;
    for (const rawTurn of convo.turns) {
      const turn = Object.assign({}, rawTurn, { user });
      turnNo += 1;
      turnNo += 1;
      const r = say(store, turn.user, turn.thread, turn.say, { postings: turn.postings, now: NOW0 + turnNo * 60000 });
      const fails = runChecks(turn, r, store);
      let parts = null;
      if (turn.parts) {
        parts = turn.parts.map((p) => {
          let ok = true, why = "";
          if (p.state) { const msg = p.state(r, store); if (msg) { ok = false; why = msg; } }
          else if (p.any) { const rl = lc((r.out && r.out.reply) || ""); if (!p.any.some((v) => rl.includes(lc(v)))) { ok = false; why = `reply lacks part evidence ${JSON.stringify(p.any)}`; } }
          return { name: p.name, ok, why };
        });
        for (const p of parts) if (!p.ok) fails.push(`part "${p.name}" undelivered: ${p.why}`);
      }
      const tRes = { say: turn.say, intent: r.out && r.out.intent, contained: !!(r.out && r.out.contained), fallback: isFallback(r.out), memory: !!turn.memory, parts, fails, replyHead: String((r.out && r.out.reply) || "").slice(0, 220) };
      if (fails.length) convoRes.pass = false;
      convoRes.turns.push(tRes);
    }
    results.push(convoRes);
  }
  return { store, results };
}

function summarize(results, store) {
  const bands = {};
  let totalTurns = 0, fallbackTurns = 0, memTotal = 0, memPass = 0, partsTotal = 0, partsPass = 0;
  for (const c of results) {
    const b = bands[c.band] = bands[c.band] || { convos: 0, convosPass: 0, turns: 0, fallback: 0, memTotal: 0, memPass: 0, partsTotal: 0, partsPass: 0, fails: 0 };
    b.convos += 1; if (c.pass) b.convosPass += 1;
    for (const t of c.turns) {
      b.turns += 1; totalTurns += 1; b.fails += t.fails.length;
      if (t.fallback) { b.fallback += 1; fallbackTurns += 1; }
      if (t.memory) { b.memTotal += 1; memTotal += 1; const ok = t.fails.length === 0; if (ok) { b.memPass += 1; memPass += 1; } }
      if (t.parts) for (const p of t.parts) { b.partsTotal += 1; partsTotal += 1; if (p.ok) { b.partsPass += 1; partsPass += 1; } }
    }
  }
  const xt = bands.XT || { memTotal: 0, memPass: 0 };
  const t3 = bands.T3 || { convos: 0, convosPass: 0 };
  return {
    patchMode: PATCH_MODE, patchViolations: store.patchViolations,
    totalTurns, fallbackTurns, fallbackRate: totalTurns ? fallbackTurns / totalTurns : 0,
    memoryChecks: { pass: memPass, total: memTotal, rate: memTotal ? memPass / memTotal : null },
    multiParts: { pass: partsPass, total: partsTotal, rate: partsTotal ? partsPass / partsTotal : null },
    crossThread: { pass: xt.memPass, total: xt.memTotal, rate: xt.memTotal ? xt.memPass / xt.memTotal : null },
    t3Success: { pass: t3.convosPass, total: t3.convos, rate: t3.convos ? t3.convosPass / t3.convos : null },
    bands,
  };
}

if (require.main === module) {
  const { store, results } = runCorpus();
  const sum = summarize(results, store);
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ summary: sum, results }, null, 1)); process.exit(0); }
  for (const c of results) {
    console.log(`\n=== ${c.id} [${c.band}] ${c.pass ? "PASS" : "FAIL"}`);
    for (const t of c.turns) {
      console.log(`  ${t.fallback ? "FB " : "   "} intent=${t.intent || "(contained)"} :: ${t.say}`);
      if (t.fails.length) for (const f of t.fails) console.log(`      FAIL: ${f}`);
      if (t.fails.length) console.log(`      reply: ${t.replyHead}`);
    }
  }
  console.log("\n================ SUMMARY ================");
  console.log(JSON.stringify(sum, null, 1));
}
module.exports = { runCorpus, summarize, CONVOS };
