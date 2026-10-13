"use strict";
// SC-182 canonical slug (coffee-chat prep brief) — regenerated in Finisher Lane F.
// The original render's tool record named 127-career-prep.coffeeChatPrep, which
// was missing from this branch; Lane F restored it with plain prose.
const path = require("path");
const fs = require("fs");
const H = require("../scenario-harness.cjs");
const P = require(path.join(__dirname, "..", "..", "..", "packages/domain/127-career-prep.js"));
(async () => {
  const s = H.session("SC-182", "canonical-coffee-chat-prep-brief");
  s.user("Coffee-chat prep brief: who, their path, 3 talking points, 5 sharp questions, what not to ask. (The contact is a labeled TEST fixture.)");
  const cir = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "packages/career-data/cirs/datadog.json"), "utf8"));
  const prep = P.coffeeChatPrep({ cir, contact: { name: "Priya Nair (TEST)", role: "Software Engineer", company: "Datadog" }, path: ["B.S. CS, TEST University", "SWE intern (TEST)", "Software Engineer, Datadog backend"], sharedGround: "TEST University" });
  s.tool("127-career-prep.coffeeChatPrep(Datadog company file, TEST contact)", prep);
  s.agent(`Your coffee-chat brief — Priya Nair (TEST fixture), Datadog backend:\n\nWHO / PATH: ${prep.path.join(" -> ")}\n\n3 TALKING POINTS:\n${prep.talking_points.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\n5 SHARP QUESTIONS:\n${prep.questions.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nWHAT NOT TO ASK:\n${prep.do_not_ask.map((x) => "- " + x).join("\n")}\n\nDatadog context is grounded in its company file; Priya's facts are the labeled TEST fixture, not a real bio.`);
  const ok = prep.talking_points.length === 3 && prep.questions.length === 5 && prep.company_file_grounded === true;
  s.verify("coffee prep state", { ok, talking_points: prep.talking_points.length, questions: prep.questions.length, company_file_grounded: prep.company_file_grounded });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Coffee-chat prep brief built from the Datadog company file and the labeled TEST contact: path, 3 talking points, 5 questions, and what-not-to-ask, in plain prose." });
})().catch((e) => { console.error(e); process.exit(1); });
