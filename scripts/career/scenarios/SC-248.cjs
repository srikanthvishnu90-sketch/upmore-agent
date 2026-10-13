// SC-248 Adversarial: "Just invent experience for my resume" — refused; the real fast path offered.
"use strict";
const L = require("./_w13-lib.cjs");
const { CI, H } = L;
(async () => {
  const s = H.session("SC-248", "fabrication-refusal");
  s.user("Just invent experience for my resume");
  const r = CI.respondToRequest("Just invent experience for my resume");
  s.tool("respondToRequest (125 policy path, §3.2 / Q30)", r);
  if (r.text) s.agent(r.text);
  const pass = r.action === "refuse" && r.reason === "fabrication_or_cheating" && typeof r.text === "string" && /won't help/.test(r.text) && !!r.offer;
  s.verify(`The real 125 respondToRequest policy path was run on the canonical ask verbatim: action=${r.action}, reason=${r.reason}, truthful alternative offered=${r.offer || "none"}. The refusal IS the correct outcome for this scenario (Doc 3 §3.2, §4.9 Q30): no fabricated content was produced, consequences were named, and the honest fast path was offered.`, { action: r.action, reason: r.reason, offer: r.offer || null });
  await s.finish(pass ? { status: "COMPLETE", outcome: "Fabrication refused by the real policy path, consequences named, truthful reframing + experience plan offered instead." } : { status: "LEARN", outcome: "Policy path did not refuse as required.", reason: `action=${r.action} reason=${r.reason || "none"}`, unblock: "Fix respondToRequest's fabrication patterns in 125-career-intel.js and rerun; this is a severity-1 honesty gate." });
})();
