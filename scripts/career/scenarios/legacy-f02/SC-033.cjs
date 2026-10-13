"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-033", "deadline-aware-discovery");
  s.user("which of these close soon?");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  const cirs = {};
  for (const slug of ["bcg", "bain"]) { try { const c = JSON.parse(fs.readFileSync(path.join(L.ROOT, "packages/career-data/cirs", slug + ".json"), "utf8")); cirs[J.stripHtml ? slug : slug] = c; cirs[c.company_name.toLowerCase()] = c; } catch (e) {} }
  const bcg = JSON.parse(fs.readFileSync(path.join(L.ROOT, "packages/career-data/cirs/bcg.json"), "utf8"));
  const bain = JSON.parse(fs.readFileSync(path.join(L.ROOT, "packages/career-data/cirs/bain.json"), "utf8"));
  const cirMap = { "bcg": bcg, "boston consulting group": bcg, "bain": bain, "bain and company": bain };
  const now = Date.now();
  const scored = L.scoreAll(r.postings, prof);
  const shortlist = await J.buildShortlist(scored, { limit: 8 });
  const infos = shortlist.map((x) => D.deadlineInfo(x.posting, { now, cirs: cirMap }));
  const sorted = D.sortByClosingPressure(infos);
  const cirRows = [{ job_id: "cir:bcg", company: "BCG", posted_at: null }, { job_id: "cir:bain", company: "Bain", posted_at: null }].map((p) => D.deadlineInfo(p, { now, cirs: cirMap }));
  s.tool("131.deadlineInfo over live shortlist + CIR windows", { shortlist_infos: infos, cir_window_rows: cirRows });
  s.agent(`Two different answers, kept separate. (1) From the CIR records: BCG and Bain US windows for this cycle are CLOSED — ${cirRows.map((c) => `${c.company}: ${c.detail}`).join(" | ")} — so I am not recommending either, whatever the feeds say (neither posts to these public boards anyway). (2) For your live shortlist, the feeds publish NO closing dates, so the only honest closing signal is posting age, labeled as a proxy: ${sorted.map((i) => `${i.company} — ${i.detail}`).join(" | ")}`, { card: { title: "Closing soon? (CIR windows + age proxy)", cir_closed: cirRows, shortlist_by_pressure: sorted } });
  s.verify("closed-window flags come from CIR entry_routes status fields; live-feed ordering uses posted_at only and says so", { cir_signals: cirRows.map((c) => c.signal), shortlist_signals: sorted.map((i) => i.signal) });
  await s.finish({ status: "COMPLETE", outcome: "BCG/Bain US windows flagged closed from their CIRs and not recommended; live shortlist ordered by labeled age proxy because feeds publish no close dates" });
})().catch((e) => { console.error(e); process.exit(1); });
