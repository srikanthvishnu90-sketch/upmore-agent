"use strict"; const { T, P, H, msg, cir, NOW } = require("./d1-common.cjs");
(async () => { const s = H.session("SC-131", "daily-digest");
  s.user("Daily digest — it's an active application week, keep it short and daily");
  const store = T.seedTestLog(); const d = T.dailyDigest(store, { now: NOW });
  s.tool("126-career-track.dailyDigest", d);
  s.agent(d.text, { card: { title: "Daily digest (TEST log)", window_hours: d.window_hours, counts: d.counts, next_actions: d.next_actions } });
  s.verify("daily digest is a true 24h-window computation over the same log rows, distinct from the weekly digest, with next actions attached", { window_hours: d.window_hours, counts: d.counts, next_actions: d.next_actions });
  await s.finish({ status: d.window_hours===24 && d.counts.total_applications===12 ? "COMPLETE" : "LEARN", outcome: `Daily digest produced for the active week: ${d.text}` }); })();
