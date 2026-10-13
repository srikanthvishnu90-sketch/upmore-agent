"use strict"; const { S, T, H } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-145", "season-retro");
  s.user("Season retro: what converted, what didn't, next season's plan");
  const r = S.seasonRetro(T.seedTestLog()); s.tool("136.seasonRetro", r);
  s.agent(`Retro from your own log (${r.total} applications):\n• Converted: ${r.what_converted}\n• Didn't: ${r.what_didnt}\n• Next season: ${r.next_season_plan.join(" ")}`);
  s.verify("retro numbers recomputed from log rows only; referred rows: 1 offer, 0 rejections; losing version named", { referred: r.referred, cold: r.cold, computed_from: r.computed_from });
  await s.finish({ status: "COMPLETE", outcome: "Season retro computed from the log: what converted, what didn't (fin-v1 killed), and a 3-point next-season plan" }); })();
