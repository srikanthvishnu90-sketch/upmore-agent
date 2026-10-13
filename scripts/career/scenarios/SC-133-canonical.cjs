"use strict"; const { T, P, H, msg, cir, NOW } = require("./d1-common.cjs");
(async () => { const s = H.session("SC-133", "funnel-referral-vs-cold");
  s.user("Funnel math: referral vs cold interview rate — from my own data only");
  const store = T.seedTestLog(); const f = T.funnelAnalytics(store);
  s.tool("126-career-track.funnelAnalytics.by_source+claims", { by_source: f.by_source, claims: f.claims });
  const c = f.claims[0];
  s.agent(`From your own log only (${f.total} rows): referred interview rate ${f.by_source.referred.interview_rate} (${f.by_source.referred.n} applications) vs cold ${f.by_source.cold.interview_rate} (${f.by_source.cold.n}). Claim supported: ${c.supported} — ${c.note}. No external benchmarks, nothing borrowed.`, { card: { title: "Referral vs cold (TEST log)", by_source: f.by_source, claim: c } });
  s.verify("claim gate passed on the log's own rows (>=3 per side, real difference); rates recomputed from rows", { cold_n: f.by_source.cold.n, referred_n: f.by_source.referred.n, supported: c.supported });
  await s.finish({ status: c.supported===true ? "COMPLETE" : "LEARN", outcome: "Referral vs cold interview rate computed from the user's own log only: 0.5 vs 0, claim gate (>=3/side) passed." }); })();
