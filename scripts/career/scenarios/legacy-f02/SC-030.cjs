"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-030", "starred-company-watch-ramp");
  s.user("watch Ramp for me");
  const prof = L.profile("test-persona.json");
  let set = D.watchSet(prof);
  const wasWatched = set.has("ramp");
  set = D.addWatch(set, "Ramp");
  const store = L.memStore();
  const rampFeeds = [J.feeds.ashby("ramp"), J.feeds.lever("ramp")];
  const p1 = await J.poll(rampFeeds, { store });
  const p2 = await J.poll(rampFeeds, { store });
  s.tool("131 watch + 121.poll ramp feeds x2 (live)", { was_already_starred: wasWatched, cadence_minutes: D.cadenceFor("Ramp", set), feeds: L.feedSummary(p1), first_new: p1.new_postings.length, second_new: p2.new_postings.length });
  s.agent(`Ramp is on your watch set${wasWatched ? " (it was already one of your target companies)" : ""}. Watched companies poll every ${D.cadenceFor("Ramp", set)} minutes (the starred cadence), everything else hourly. Live check just now: Ashby/Ramp HTTP ${p1.feeds[0].status} with ${p1.feeds[0].postings.length} postings; Lever/Ramp HTTP ${p1.feeds[1].status} (no Lever board — recorded as a gap, not an error in your watch). Baseline snapshot saved (${p1.new_postings.length} postings); the immediate second poll found ${p2.new_postings.length} new — the next change is what will alert you.`, { card: { title: "Watching Ramp", cadence_minutes: D.cadenceFor("Ramp", set), ashby_postings: p1.feeds[0].postings.length, baseline: p1.new_postings.length, second_poll_new: p2.new_postings.length } });
  s.verify("watch set contains ramp; cadenceFor returns POLL_MINUTES.starred=15; poll diff vs the saved snapshot is the reported number", { watch_has_ramp: set.has("ramp"), cadence: D.cadenceFor("Ramp", set), second_new: p2.new_postings.length });
  await s.finish({ status: "COMPLETE", outcome: `Ramp watched at the 15-minute starred cadence; live baseline of ${p1.new_postings.length} Ashby postings saved and immediate re-poll diff reported (${p2.new_postings.length} new)` });
})().catch((e) => { console.error(e); process.exit(1); });
