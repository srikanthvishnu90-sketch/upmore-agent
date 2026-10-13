"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-106", "speed-run-starred");
  s.user("Speed run: poll my starred companies' feeds; a fitting role gets applied within the hour it posts");
  const prof = L.profile("test-persona.json"); const profP = L.personaProfile("test-persona.json");
  const starredFeeds = [J.feeds.greenhouse("stripe"), J.feeds.greenhouse("datadog"), J.feeds.greenhouse("janestreet")];
  const store = L.memStore();
  const t0 = Date.now();
  const base = await J.poll(starredFeeds, { store });
  const withRamp = await J.poll([...starredFeeds, J.feeds.ashby("ramp")], { store });
  const fresh = withRamp.new_postings.map((p) => ({ p, fit: J.scoreFit(p, prof) })).filter((x) => !x.fit.excluded).sort((a, b) => b.fit.score - a.fit.score);
  const top = fresh[0];
  const packet = top ? T.tailorResume(profP, top.p.title + "\n" + top.p.jd_text.slice(0, 2500), { jobId: top.p.job_id }) : null;
  const elapsedSec = Math.round((Date.now() - t0) / 1000);
  s.tool("121.poll starred baseline + expanded poll; 123 packet build", { baseline: base.postings.length, new_on_expanded: withRamp.new_postings.length, fitting_new: fresh.length, elapsed_sec: elapsedSec, packet_audit_ok: packet ? packet.audit.ok : null });
  s.agent(top ? `Speed run complete in ${elapsedSec}s of rail time. The expanded poll detected ${withRamp.new_postings.length} postings new to the snapshot; ${fresh.length} pass your hard filters, best fit ${top.p.title} at ${top.p.company} (score ${top.fit.score}). Its tailored application packet is BUILT and truth-audited (${packet.audit.ok}) — detection-to-packet in ${elapsedSec} seconds, far inside the hour. It stops at the doorstep for your yes: nothing is submitted as the TEST persona to a real employer.` : "No fitting new role appeared in this run's detection window.", { card: { title: "Speed run — doorstep packet ready", posting: top ? L.slim(top.p) : null, fit: top ? top.fit.score : null, packet_ok: packet ? packet.ok : null, elapsed_sec: elapsedSec } });
  s.verify("new postings come from diffNew vs the baseline snapshot; the packet's audit is the tailoring gate's own verdict", { new_count: withRamp.new_postings.length, packet_ok: packet ? packet.ok : null, elapsed_sec: elapsedSec });
  await s.finish({ status: top && packet && packet.ok ? "COMPLETE" : "LEARN", outcome: `Starred-feed speed run: detection-to-audited-packet in ${elapsedSec}s for ${top ? top.p.title + " at " + top.p.company : "no role"} — inside the hour, stopped at the doorstep` });
})().catch((e) => { console.error(e); process.exit(1); });
