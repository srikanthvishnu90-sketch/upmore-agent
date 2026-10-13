"use strict";
const { T, H, NOW, HRT, NOTION_CIR } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-079", "deadline-radar");
  const store = T.seedTestLog();
  s.user("what deadlines are coming in the next 2 weeks?");
  const items = T.deadlineRadar(store, [HRT, NOTION_CIR], { now: NOW, withinDays: 14 });
  s.tool("126-career-track.deadlineRadar", items);
  s.agent("Next 2 weeks, from your log + the CIR records:\n" + items.map((i) => `${i.date} (${i.days_away}d) — ${i.label} [${i.source}]`).join("\n"));
  const cir = items.find((i) => i.kind === "cir_deadline");
  s.verify("one dated list merging CIR windows (HRT winter deadline) + log offer expiry + assessment deadline + follow-ups, all inside 14 days and sorted", { count: items.length, hrt_cir: cir, kinds: [...new Set(items.map((i) => i.kind))] });
  await s.finish({ status: "COMPLETE", outcome: `Deadline radar returned ${items.length} dated items in 14 days, incl. the HRT winter application deadline 2026-10-16 from its CIR, Stripe offer expiry 2026-10-20 and HRT assessment 2026-10-18 from the log` });
})();
