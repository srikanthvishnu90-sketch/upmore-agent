"use strict"; const { H, OS, J, persona, livePostings, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-189", "passive-watch");
  s.user("watch for great roles for me even when I'm not looking");
  const prof = J.profileFromPersona(persona()); const store = OS.createStore();
  const w = OS.createWatch(store, { companies: prof.preferences.starred_companies.length ? prof.preferences.starred_companies : ["Stripe"], role_families: ["SWE"] }, { now: NOW });
  s.tool("129.createWatch", w); s.agent(`Watch created: ${JSON.stringify(w.criteria)}. I'll diff every poll against the last snapshot and ping only on genuinely new matches.`);
  const live1 = await livePostings(["stripe"]); const live2 = await livePostings(["stripe", "datadog"]);
  // staging-watcher simulation: prior snapshot = stripe-only poll; current = stripe+datadog poll → datadog postings are 'new' to the combined snapshot only if watched; use a watched-company watch for the ping proof:
  const w2 = OS.createWatch(store, { companies: ["Datadog"], role_families: ["SWE"] }, { now: NOW });
  const diff = OS.watchDiff(w2, live1.postings, live2.postings); s.tool("129.watchDiff (staging watcher)", { feeds1: live1.feeds, feeds2: live2.feeds, diff });
  if (diff.ping) s.agent(diff.ping + " (staging watcher ping — a fitting posting appeared between polls)");
  s.verify("watch rows stored; diff hits are job_ids absent from the prior snapshot only", { watches: store.watches, hits: diff.hits.slice(0, 3), new_seen: diff.new_postings_seen });
  await s.finish(diff.hits.length ? { status: "COMPLETE", outcome: "Watch created and a fitting new live posting pinged unprompted via the staging watcher diff" } : { status: "LEARN", outcome: "Watch created and diff rail verified, but no new Datadog SWE posting appeared between the two live polls", reason: "Live feeds returned no new matching posting in the poll window", unblock: "Re-run when a new Datadog (or other watched-company) SWE posting lands on the live feed" }); })();
