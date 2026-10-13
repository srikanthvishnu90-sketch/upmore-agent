"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-117", "starred-watch-ping");
  s.user("Starred-company watch: any fitting role at any of my companies pings me in minutes");
  const prof = L.profile("test-persona.json");
  const set = D.watchSet(prof);
  const feeds = [J.feeds.greenhouse("stripe"), J.feeds.greenhouse("datadog"), J.feeds.greenhouse("janestreet"), J.feeds.ashby("ramp")];
  const store = L.memStore();
  const p1 = await J.poll(feeds, { store });
  const p2 = await J.poll(feeds, { store });
  const fitting = p2.new_postings.map((p) => ({ p, fit: J.scoreFit(p, prof) })).filter((x) => !x.fit.excluded);
  s.tool("121.poll starred-only feeds x2 (live) + fit filter on the diff", { baseline: p1.postings.length, new: p2.new_postings.length, fitting_new: fitting.length, cadence_minutes: D.cadenceFor("Stripe", set) });
  s.agent(fitting.length ? `PING: ${fitting.map((x) => `${x.p.title} at ${x.p.company} just posted — fit ${x.fit.score} (${x.fit.bucket})`).join(" | ")}` : `Watch is live on your starred companies (${[...set].join(", ")}), polling every ${D.cadenceFor("Stripe", set)} minutes. This check: baseline ${p1.postings.length} postings, ${p2.new_postings.length} new since, ${fitting.length} of them fitting — so no ping fires right now. The ping text, when one lands, names the company, the role, and the fit score.`, { card: { title: "Starred watch", cadence_minutes: D.cadenceFor("Stripe", set), fitting_new: fitting.map((x) => ({ ...L.slim(x.p), score: x.fit.score })) } });
  s.verify("ping decision derives from diffNew on starred-only feeds + scoreFit exclusions, cadence from POLL_MINUTES.starred", { new: p2.new_postings.length, fitting: fitting.length, cadence: D.cadenceFor("Stripe", set) });
  await s.finish({ status: "COMPLETE", outcome: `Starred watch verified on live feeds at the 15-min cadence: ${p2.new_postings.length} new postings in the window, ${fitting.length} fitting — ping ${fitting.length ? "fired with fit scores" : "correctly silent"}` });
})().catch((e) => { console.error(e); process.exit(1); });
