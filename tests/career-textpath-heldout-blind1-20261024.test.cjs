"use strict";
/* HELD-OUT BLIND RUN v1 (coordinator-authored file, 2026-10-24) —
   MEASUREMENT ONLY. The conversation texts live verbatim in
   tests/heldout-blind-v1-conversations.json (user texts only, no
   expected answers). Each conversation runs as ONE fresh user, in
   order, through the real host at the branch head. Same recorder
   discipline as batches 1/2: the router's actual result per turn,
   kept whole; a null intent with the 140 fallback text records
   fallback:true. NO routing assertions and NO fixes in this round —
   the records are the deliverable.
   Check: node --test tests/career-textpath-heldout-blind1-20261024.test.cjs */
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const { FALLBACK_TEXT_RE } = (() => { try { return require(path.join(ROOT, "packages/domain/140-career-reply.js")); } catch { return {}; } })();
const FALLBACK_RE = FALLBACK_TEXT_RE || /^(I didn't catch that|I'm Trainee, a career agent: I find roles)/;

const NOW = Date.parse("2026-10-24T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const POSTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/career/conversations.json"), "utf8")).postings;
const CONVS = JSON.parse(fs.readFileSync(path.join(__dirname, "heldout-blind-v1-conversations.json"), "utf8")).conversations;
// The records file: HELDOUT_BLIND1_RECORDS when set, else heldout-blind1-records.jsonl under the home directory's workspace folder (the coordinator's
// reading location). Its directory is created on first write, so the suite records on any machine, not only the one
// that already has that folder (CI and a fresh checkout have none; the whole suite failed there with ENOENT).
const RECORDS_PATH = process.env.HELDOUT_BLIND1_RECORDS || path.join(os.homedir(), "workspace", "heldout-blind1-records.jsonl");
fs.mkdirSync(path.dirname(RECORDS_PATH), { recursive: true });

function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text) => {
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: POSTINGS });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return out;
  };
  return { say };
}

function runSet(feature, userId, turns) {
  const w = makeWorld();
  turns.forEach((text, i) => {
    let out = null;
    let thrown = null;
    try { out = w.say(userId, `t-${userId}`, text); } catch (e) { thrown = e; }
    let rec;
    if (thrown) {
      rec = { feature, turn: i + 1, user: text, intent: "THREW", handler: null, resultStatus: null, contained: null, replyClass: "threw", fallback: false, reply: "", annotation: `runTurn threw: ${String((thrown && thrown.message) || thrown).slice(0, 200)}` };
    } else {
      const reply = String((out && out.reply) || "");
      const intent = out ? out.intent : null;
      const fb = !intent || FALLBACK_RE.test(reply);
      rec = { feature, turn: i + 1, user: text, intent, handler: out ? out.handler : null, resultStatus: out ? out.resultStatus : null, contained: out ? out.contained : null, replyClass: fb ? "fallback" : "substantive", fallback: fb, reply: reply.slice(0, 400) };
    }
    fs.appendFileSync(RECORDS_PATH, `${JSON.stringify(rec)}\n`);
    process.stdout.write(`HELDBLIND1|${JSON.stringify(rec)}\n`);
  });
}

for (const [cid, turns] of Object.entries(CONVS)) {
  test(`held-out blind v1 ${cid} (${turns.length} turns, measurement only)`, () => {
    runSet(cid, `blind1-${cid.toLowerCase()}`, turns);
  });
}
