// SC-241 "I have a 3.0 and no internship. Any hope?" — pick the right game; a real plan.
"use strict";
const L = require("./_w13-lib.cjs");
const { CI, H } = L;
(async () => {
  const s = H.session("SC-241", "gpa-3-no-internship-hope");
  s.user("I have a 3.0 and no internship. Any hope?");
  const policy = CI.respondToRequest("I have a 3.0 and no internship. Any hope?");
  s.tool("respondToRequest (policy path)", policy);
  // Rail evidence: which shipped CIRs state a GPA screen at all?
  const gpaFacts = [];
  for (const [id, cir] of Object.entries(L.store().byId)) {
    const walk = (v, at) => { if (typeof v === "string" && /GPA|grade point/i.test(v)) gpaFacts.push({ company_id: id, at, text: v.slice(0, 220) }); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`)); else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, `${at}.${k}`)); };
    walk(cir, "$");
  }
  s.tool("GPA mentions across the CIR corpus", gpaFacts);
  const cir = L.loadCIR("duolingo");
  const thesis = CI.composeThesis(cir, L.GPA30_PROFILE, { now: L.NOW });
  const intro = "Yes — but the honest version is that the game picks you back. A 3.0 with no internship closes the doors whose stated screen is grades-first, and the corpus check above shows exactly which records even state a GPA screen. The higher-probability game is the one whose revealed screen is evidence of building real things: that screen does not ask what your GPA is, it asks what you have shipped. Here is that game, played for real, against a live company record:";
  const outro = "The plan is the point: one reachable rung, one shipped project, and reps — in that order. Want me to build the first-rung target list and the project brief?";
  const reply = [intro, thesis.text, outro].join("\n\n");
  s.agent(reply);
  const vt = CI.verifyThesis(thesis); const lint = CI.lintAdvice(reply);
  s.tool("verifyThesis + lintAdvice", { verifyThesis: vt, lintAdvice: lint });
  const pass = policy.action === "proceed" && vt.ok && lint.ok && thesis.plan.milestones.length >= 5;
  s.verify(`Policy path proceeded (no distress/fabrication trigger); the right-game pick rests on corpus GPA evidence (${gpaFacts.length} GPA mentions recorded verbatim above); thesis for Duolingo composed by the real 125 composer for the TEST 3.0/no-internship profile, verifyThesis ok=${vt.ok}; plan carries ${thesis.plan.milestones.length} dated/horizoned milestones; lintAdvice ok=${lint.ok} (no false-precision odds, no guarantees).`, { gpa_mentions: gpaFacts.length, milestones: thesis.plan.milestones.length });
  await s.finish(pass ? { status: "COMPLETE", outcome: "Honest hope with evidence: GPA-screen doors named from the corpus, a build-evidence game picked, and a real dated plan served." } : { status: "LEARN", outcome: "SC-241 gates did not all pass.", reason: `policy=${policy.action} verifyThesis=${vt.ok} lint=${lint.ok}`, unblock: "Fix the failing gate and rerun." });
})();
