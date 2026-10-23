'use strict';
// =====================================================================
// Routing families: the CHECK set (2026-10-23). Written BEFORE the family layer was built and never used to build or
// tune it (the dev set is tests/career-routing-families.test.cjs). Synthetic phrasings only; no eval or held-out text.
// Its pass rate is reported as written; a failure here is fixed only by a general change, never a phrase added for it.
// =====================================================================
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const Reply = D("140-career-reply.js");
const host = CareerHost.createCareerHost({ CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"), CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"), CareerReply: Reply, CareerContainment: D("143-career-containment.js") });
let n = 0;
const ask = (text) => { n += 1; const ctx = host.createTurnCtx({ userId: `chk-${n}`, threadId: `chk-${n}`, now: Date.parse("2026-10-23T15:00:00Z"), snapshot: null, postings: [] }); return host.runTurn(text, ctx); };
const isFallback = (o) => !String(o.reply || "").trim() || Reply.isFallbackText(String(o.reply)) || o.contained || o.intent === "career_fallback";

const CHECK = {
  identity: ["Who is this?", "what exactly are you", "hey, what do you do?", "sup", "so what is trainee"],
  onboarding: ["What info do you need from me?", "what do I need to give you to begin", "how do I get started with you", "what should I share with you first"],
  safety: ["Will you ever apply somewhere without checking with me?", "you won't email anyone without my ok, right?", "do you send messages automatically", "nothing should be submitted until I approve it"],
  offtopic: ["what's the capital of australia", "tell me a joke", "can you recommend a good movie tonight", "what's the score of the lakers game", "how do I bake banana bread"],
  status: ["Have I applied to anything yet?", "how are my applications going", "any updates on the jobs I applied to?", "how many applications have I sent"],
  prep: ["How do I prepare for a software engineering interview?", "help me prepare for my interview with a hospital", "what should I do to get ready for a finance interview"],
  fields: ["What does a typical job application ask for?", "which questions will the application form have", "what details do I need ready before applying"],
  resume: ["Have you got my resume?", "do you have a copy of my CV", "which resume are you using for me", "is there a resume on my account"],
  change: ["What careers can I go into with a psychology degree?", "I'm an accountant who wants to get into UX design, how?", "how can I move from retail management into HR"],
  search: ["Are there any accounting jobs in Seattle?", "show me product design roles in New York", "got any remote customer support jobs", "warehouse jobs near Dallas"],
};

for (const [family, asks] of Object.entries(CHECK)) {
  for (const a of asks) {
    test(`check/${family}: "${a}" is answered, not the fallback`, () => {
      const o = ask(a);
      assert.ok(!isFallback(o), `${o.handler || "-"}/${o.intent || "-"}${o.contained ? " contained" : ""}: ${String(o.reply).slice(0, 160)}`);
    });
  }
}
