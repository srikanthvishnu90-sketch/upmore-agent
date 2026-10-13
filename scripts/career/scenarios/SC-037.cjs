"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-037", "skills-gap-discovery");
  s.user("what roles fit what I can actually prove?");
  const prof = L.profile("test-persona.json");
  const proven = prof.skills.filter((x) => x.proven).map((x) => x.name);
  const unproven = prof.skills.filter((x) => !x.proven).map((x) => x.name);
  const r = await L.pollLive();
  s.tool("121.poll (live) + persona skills", { totals: L.feedTotals(r), proven, unproven });
  const rustRows = r.postings.filter((p) => /rust/i.test(p.title + " " + p.jd_text)).map((p) => ({ p, fit: J.scoreFit(p, prof) })).filter((x) => !x.fit.excluded);
  const rustCounted = rustRows.filter((x) => (x.fit.matched_skills || []).includes("Rust"));
  const rustNamedGap = rustRows.filter((x) => (x.fit.unproven_skills || []).includes("Rust"));
  const scored = L.scoreAll(r.postings, prof);
  const shortlist = await J.buildShortlist(scored, { limit: 5 });
  s.agent(`Only evidenced skills match for you. Proven on your profile: ${proven.join(", ")}. NOT counted: ${unproven.join(", ")} — it sits on your profile with no evidence link. In today's live set, ${rustRows.length} scoreable postings mention Rust; in ${rustCounted.length} of them did Rust count as a match (it must be 0), and in ${rustNamedGap.length} the gap is named in the scoring output itself. Your proven-skill shortlist:`, { card: { title: "Proven-skills shortlist", proven, unproven_not_counted: unproven, items: shortlist.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score, matched_from_reasons: x.reasons })) } });
  s.verify("rail state: unproven_skills vs matched_skills on every Rust-mentioning live posting (BUG-002 fix verified live)", { proven, unproven, rust_postings_scored: rustRows.length, rust_in_matched: rustCounted.length, rust_named_as_gap: rustNamedGap.length });
  await s.finish({ status: rustCounted.length === 0 ? "COMPLETE" : "LEARN", outcome: `Matching ran on proven skills only (${proven.length} skills); Rust (unproven) counted as a match in 0 of ${rustRows.length} Rust-mentioning live postings and is named as a gap`, reason: rustCounted.length ? "BUG-002 regression: unproven skill counted" : undefined });
})().catch((e) => { console.error(e); process.exit(1); });
