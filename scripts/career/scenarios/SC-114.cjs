"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-114", "triage-30-pasted-links");
  s.user("Triage these 30 links: flag expired, duplicate, and clearance-blocked with reasons");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live) — the feed state the links are triaged against", { totals: L.feedTotals(r) });
  const live = r.postings.filter((p) => p.url);
  const clearance = live.filter((p) => /\b(ts\/sci|top secret|security clearance)\b/i.test(p.jd_text));
  const plain = live.filter((p) => !/\b(ts\/sci|top secret|security clearance)\b/i.test(p.jd_text) && J.hardFilters(p, prof).length === 0);
  const links = [];
  for (const p of plain.slice(0, 8)) links.push(p.url);
  for (const p of plain.slice(0, 6)) links.push(p.url); // duplicates
  for (const p of clearance.slice(0, 4)) links.push(p.url);
  while (links.length < 30) links.push(`https://boards.greenhouse.io/stripe/jobs/99999${links.length} (pasted link, not in any current feed)`);
  const rows = A3.triageLinks(links.slice(0, 30).map((u) => u.replace(/ \(pasted.*$/, "")), { postings: r.postings, profile: prof });
  const counts = {}; for (const x of rows) counts[x.verdict] = (counts[x.verdict] || 0) + 1;
  s.tool("132.triageLinks verdicts", { counts });
  s.agent(`Triaged all 30 pasted links against the live feed state (nothing was fetched blindly, nothing guessed): ${Object.entries(counts).map(([k, v]) => `${v} × ${k}`).join(" · ")}. Duplicates point at their first occurrence; clearance-blocked rows name the clearance requirement in the posting itself; links in no current feed are 'ask — unverifiable' (expired, portal-only, or a board I cannot read), never silently called live.`, { card: { title: "30-link triage", counts, rows: rows.map((x) => ({ url: x.url.slice(0, 80), verdict: x.verdict, reason: x.reason })) } });
  s.verify("verdict counts sum to 30 and each row carries a reason from the triage function", { total: rows.length, counts });
  await s.finish({ status: rows.length === 30 ? "COMPLETE" : "LEARN", outcome: `30 pasted links triaged with per-link reasons: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}` });
})().catch((e) => { console.error(e); process.exit(1); });
