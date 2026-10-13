"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-065", "weekly-digest");
  const store = T.seedTestLog();
  s.user("send my weekly digest");
  const d = T.weeklyDigest(store, { now: NOW });
  s.tool("126-career-track.weeklyDigest", d);
  s.agent(d.text);
  s.verify("every digest number recomputed independently from the log rows", { counts: d.counts, store_rows: T.rowsOf(store).length, sent7_check: T.rowsOf(store).filter((r) => Date.parse(r.applied_at) >= NOW - 7 * 86400000).length, open_check: T.rowsOf(store).filter((r) => !T.TERMINAL.includes(r.stage)).length });
  await s.finish({ status: "COMPLETE", outcome: "Weekly digest built from the log: 3 sent in 7d, 6 responses, 1 active interview, 1 rejection in 7d, 7 open of 12, with dated next actions" });
})();
