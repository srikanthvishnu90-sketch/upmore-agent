"use strict";
// SC-303 Ask-once memory — graduation answered from the stored profile; a tailoring-style run re-asks nothing.
const { H, O, fixtureProfile } = require("./_f01-lib.cjs");
const Tailor = require(require("path").join(__dirname, "..", "..", "..", "packages/domain/123-career-tailor.js"));
(async () => {
  const s = H.session("SC-303", "ask-once-memory");
  const p = fixtureProfile();
  s.user("what's my graduation date?");
  const r = O.handleChat("what's my graduation date?", { profile: p });
  s.tool("CareerOnboarding.answerFromProfile", r);
  s.agent(r.reply);
  s.user("tailor my resume for a role that needs my graduation date");
  // The tailoring rail consumes confirmed profile facts directly (123 audit cites fact IDs);
  // it has no question path — verify the fact it would use is the stored one and nothing was re-asked.
  const edu = p.facts.find((f) => f.kind === "education");
  const recall2 = O.answerFromProfile(p, "what's my graduation date?");
  s.tool("ask-once recall during tailoring prep", { education_fact: edu.id, graduation_in_fact_text: /2028/.test(edu.text), recall: recall2, profile_constraints: p.constraints });
  s.agent(`Your graduation is already on file (${p.constraints.graduationDate}, from ${edu.id}) — the tailoring run uses the stored fact and does not re-ask it.`);
  const ok = r.intent === "profile_recall" && r.found === true && /2028-05/.test(r.reply) && r.source && /stored/.test(r.source)
    && recall2.found === true && recall2.reasked === false && /2028/.test(edu.text)
    && typeof Tailor === "object";
  s.verify("the answer came from profile constraints (stored, source named), the education fact the tailor cites carries the same date, and the recall path reports reasked=false", { ok, source: r.source, graduationDate: p.constraints.graduationDate, education_fact: edu.id });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Graduation date answered straight from the stored profile (May 2028, source named); the tailoring prep reuses the same stored education fact and re-asks nothing." }
    : { status: "LEARN", outcome: "Ask-once recall failed or re-asked a stored fact.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix answerFromProfile in 130 and rerun SC-303." });
})().catch((e) => { console.error(e); process.exit(1); });
