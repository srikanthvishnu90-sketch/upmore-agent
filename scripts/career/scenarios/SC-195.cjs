"use strict"; const { H, OS } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-195", "intern-to-fulltime-watch");
  s.user("my internship ends in August — what should I be doing?");
  const tl = OS.internTimeline({ endDate: "2027-08-15" }); s.tool("129.internTimeline", tl);
  s.agent(`Your return-offer timeline (internship ends ${tl.internship_end}):\n${tl.milestones.map((m) => `• ${m.date} — ${m.action}`).join("\n")}\nThe two conversations that matter most: the midpoint expectations check-in and the final-week decision-timeline ask. Both are dated above — nothing is left to memory.`);
  s.verify("6 dated milestones anchored to the August end date, spanning -42d to +21d", { milestones: tl.milestones });
  await s.finish({ status: "COMPLETE", outcome: "Dated return-offer timeline plan with milestones and the exact conversations to have" }); })();
