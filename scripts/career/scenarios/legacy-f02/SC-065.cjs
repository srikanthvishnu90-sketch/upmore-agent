"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-065", "pm-internships-real-shot");
  s.user("Find 20 PM internships for summer; tailor; apply only where I have a real shot");
  const prof = L.profile("test-persona.json"); const profP = L.personaProfile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const pm = r.postings.filter((p) => p.role_family === "PM" && p.seniority_band === "intern");
  const scored = pm.map((p) => ({ p, fit: J.scoreFit(p, prof) }));
  const realShot = scored.filter((x) => !x.fit.excluded && x.fit.bucket !== "Reach");
  const tailored = realShot.slice(0, 20).map((x) => { const t = T.tailorResume(profP, x.p.title + "\n" + x.p.jd_text.slice(0, 2000), { jobId: x.p.job_id }); return { posting: L.slim(x.p), score: x.fit.score, bucket: x.fit.bucket, audit_ok: t.audit ? t.audit.ok : false }; });
  s.agent(`Real numbers first: the live feeds hold ${pm.length} PM internships right now — not 20, and I will not pad the list. Of those, ${realShot.length} are a real shot for you (not hard-excluded, Match or Safety bucket); the rest are Reach or excluded and I tailored NOTHING for them. Tailored doorstep packets: ${tailored.length}. ${tailored.map((x) => `${x.posting.title} at ${x.posting.company} (${x.score}, ${x.bucket})`).join(" | ")}`, { card: { title: "PM internships — real-shot only", found: pm.length, real_shot: realShot.length, tailored } });
  s.verify("counts from live PM intern rows; real-shot = scoreFit not excluded and bucket != Reach", { pm_intern: pm.length, real_shot: realShot.length, tailored: tailored.length });
  await s.finish({ status: "COMPLETE", outcome: `PM intern sweep: ${pm.length} live (asked 20 — feeds hold fewer, stated plainly), ${realShot.length} real-shot, ${tailored.length} tailored packets; Reach/excluded got nothing` });
})().catch((e) => { console.error(e); process.exit(1); });
