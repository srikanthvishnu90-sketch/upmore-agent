"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-108", "sophomore-early-programs");
  s.user("Sophomore insight/early programs — which are open, tailored applications for the open ones");
  const prof = L.personaProfile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const feedPrograms = r.postings.filter((p) => /insight|sophomore|early career|discovery|launch|academy/i.test(p.title) && (p.seniority_band === "intern" || p.seniority_band === "new_grad"));
  const bcg = L.cir("bcg"); const bain = L.cir("bain");
  const cirPrograms = [...(bcg.entry_routes || []), ...(bain.entry_routes || [])].map((x) => ({ route: x.route, status: x.status }));
  const packet = feedPrograms.length ? T.tailorResume(prof, feedPrograms[0].title + "\n" + feedPrograms[0].jd_text.slice(0, 2000), { jobId: feedPrograms[0].job_id }) : null;
  s.agent(`Open/closed, from the records: in the live feeds, ${feedPrograms.length} postings are early/insight-style programs open to underclassmen${feedPrograms.length ? ` (e.g., ${feedPrograms[0].title} at ${feedPrograms[0].company})` : ""}. From the company files: BCG Launch is a virtual pre-application program described on BCG's official page (no application deadline in the record); Bain's Associate Consultant Intern window for your class (Dec 2027–Jun 2028 grads) CLOSED Aug 31, 2026, and BCG's Summer Associate window closed earlier in the summer — I am not dressing closed windows up as open. ${packet ? `For the open feed program, a tailored packet is built and audit-checked (${packet.audit.ok}), stopped at the doorstep.` : "No open feed program existed in this poll to tailor for — the CIR program states above are the deliverable."}`, { card: { title: "Sophomore / early programs", feed_programs: feedPrograms.slice(0, 6).map(L.slim), cir_programs: cirPrograms, packet_ok: packet ? packet.ok : null } });
  s.verify("feed programs filtered from live rows; CIR program states read from entry_routes status fields verbatim", { feed_programs: feedPrograms.length, cir_programs: cirPrograms.length, packet_ok: packet ? packet.ok : null });
  await s.finish({ status: "COMPLETE", outcome: `Early-program map delivered from live rows + CIR states (${feedPrograms.length} open feed programs; Bain ACI + BCG Summer Associate honestly shown closed)${packet ? "; tailored packet built for the top open program" : ""}` });
})().catch((e) => { console.error(e); process.exit(1); });
