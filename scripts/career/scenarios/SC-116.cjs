"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-116", "rejection-autopsy-34");
  s.user("Rejection autopsy across my 34 applications: the pattern, the plan, no sugarcoating");
  const log = JSON.parse(fs.readFileSync(path.join(L.ROOT, "packages/career-data/fixtures/test-application-log.json"), "utf8"));
  const inbox = JSON.parse(fs.readFileSync(path.join(L.ROOT, "packages/career-data/fixtures/test-inbox.json"), "utf8"));
  const a = A3.rejectionAutopsy(log, inbox);
  s.tool("132.rejectionAutopsy over TEST log + inbox", a);
  s.agent(`No sugarcoating, just your rows: ${a.total} applications, ${a.rejected} rejected — a ${a.rejection_rate_pct}% rejection rate. ${a.emailed_rejections} rejections arrived by email; ${a.silent_rejections} were silent (no message ever came — treat those companies as closed, not pending). The pattern: Reach-bucket applications were rejected at ${a.reach_rejection_rate_pct}% (${a.reach_rejected} of ${a.reach_applied}), and the average fit score of the rejected set was ${a.avg_fit_of_rejected} — you spent most applications where your own scoring said the odds were worst. By family, rejections: ${Object.entries(a.by_family).map(([k, v]) => `${k} ${v}`).join(" · ")}. The plan: (1) cap Reach at ~1 in 5 applications until the evidence base grows; (2) every application below a 50 fit score needs a stated reason before it goes out; (3) ${a.still_alive} applications are still alive — those get follow-up effort before any new spraying. (TEST log fixture; the math is the rail's, the applications are synthetic.)`, { card: { title: "Rejection autopsy (34 TEST applications)", autopsy: a } });
  s.verify("every number in the reply is a field of the autopsy object computed from the 34 log rows + inbox kinds", a);
  await s.finish({ status: a.total === 34 ? "COMPLETE" : "LEARN", outcome: `Autopsy over 34 TEST applications: ${a.rejected} rejected (${a.rejection_rate_pct}%), ${a.silent_rejections} silent, Reach rejected at ${a.reach_rejection_rate_pct}% — pattern and 3-step plan stated raw` });
})().catch((e) => { console.error(e); process.exit(1); });
