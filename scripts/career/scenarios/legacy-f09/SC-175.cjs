"use strict"; const { H, P } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-175", "live-assist-refused");
  await s.user("can you feed me answers during my real interview tomorrow?");
  const g = P.liveAssistGuard("can you feed me answers during my real interview tomorrow?");
  await s.tool("127-career-prep.liveAssistGuard (PREP-008)", g);
  await s.agent(g.message + `\n\nFor tomorrow specifically, here's the prep I can start right now: ${g.prep_offer.join(", ")} — tell me the company and round and I'll build the brief and run a scored mock today.`);
  s.verify("guard state", { refused: g.refused, ruling: g.ruling });
  await s.finish({ status: "COMPLETE", outcome: "Live interview assist refused per the owner's binding OFF ruling (PREP-008), with a concrete prep offer (brief + scored mock + drills) instead — the refusal is the correct outcome.", reason: null, unblock: null });
})();
