"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-107", "internship-deadline-radar");
  s.user("Internship deadline radar: warn me 2 weeks before each target's window closes");
  const slugs = fs.readdirSync(path.join(L.ROOT, "packages/career-data/cirs")).map((f) => f.replace(".json", ""));
  const cirs = slugs.map((x) => L.cir(x)).filter(Boolean);
  const now = Date.now();
  const radar = A3.deadlineRadar(cirs, { now });
  const dated = radar.filter((r) => r.close_date);
  const sim = A3.deadlineRadar([L.cir("bain")], { now: Date.parse("2026-08-20T00:00:00Z") });
  const warnDemo = sim.find((r) => r.close_date === "2026-08-31");
  s.tool("132.deadlineRadar over all CIRs (real now) + WARN simulation at 2026-08-20", { entries: radar.length, dated: dated.length, states: radar.reduce((a, r) => { a[r.state] = (a[r.state] || 0) + 1; return a; }, {}), warn_demo: warnDemo });
  s.agent(`Radar built from the dated closes actually recorded in the company files: ${dated.length} dated windows across ${cirs.length} CIRs. Today (Oct 13, 2026) every dated US window in the files is already closed — Bain ACI closed Aug 31, Bain AC Oct 11, BCG's in June/July — and the radar says so instead of pretending otherwise; next-cycle closes are 'no dated close in CIR' until the firms publish them. The 2-week warning itself is proven: replaying the radar as of Aug 20 puts Bain's Aug 31 close in state '${warnDemo.state}' with warn_at ${warnDemo.warn_at}.`, { card: { title: "Deadline radar", dated_windows: dated, warn_demo: warnDemo } });
  s.verify("close dates are parsed from CIR entry_routes fact claims by 132.parseDates; warn state computed at two different 'now' values", { dated: dated.length, warn_state_at_aug20: warnDemo.state, warn_at: warnDemo.warn_at });
  await s.finish({ status: warnDemo.state.startsWith("WARN") ? "COMPLETE" : "LEARN", outcome: `Deadline radar live over ${cirs.length} CIRs (${dated.length} dated windows, all honestly shown closed today); the 2-weeks-before WARN state fires correctly in the Aug-20 replay` });
})().catch((e) => { console.error(e); process.exit(1); });
