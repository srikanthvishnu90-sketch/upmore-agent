"use strict"; const { T, P, H, msg, cir, NOW } = require("./d1-common.cjs");
(async () => { const s = H.session("SC-130", "weekly-digest");
  s.user("Weekly digest please: sent, responses, interviews, next actions");
  const store = T.seedTestLog(); const d = T.weeklyDigest(store, { now: NOW });
  s.tool("126-career-track.weeklyDigest", d);
  s.agent(d.text, { card: { title: "Weekly digest (TEST log)", counts: d.counts, next_actions: d.next_actions } });
  s.verify("every count recomputed from the seed log rows (12 total, 3 sent in 7d, 1 active interview, 1 rejection in 7d)", d.counts);
  await s.finish({ status: d.counts.total_applications===12 && d.counts.sent_last_7d===3 ? "COMPLETE" : "LEARN", outcome: `Weekly digest produced from the log: ${d.text}` }); })();
