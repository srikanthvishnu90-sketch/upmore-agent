"use strict"; const { T, P, H, msg, cir, NOW } = require("./d1-common.cjs");
(async () => { const s = H.session("SC-134", "offer-expiring-friday-escalation");
  const store = T.createMemoryStore([]); T.addApplication(store, { company: "Ramp", role: "Software Engineering Intern", role_family: "SWE", applied_at: "2026-10-02T12:00:00Z", resume_version: "swe-v2", stage: "Offer", offer_deadline: "2026-10-16T12:00:00Z" }, { now: NOW });
  s.user("My Ramp offer expires Friday (Oct 16) — don't let it slip");
  const e = T.offerEscalation(store, "Ramp", { now: NOW });
  s.tool("126-career-track.offerEscalation(Ramp)", e);
  s.agent(`Escalation on: ${e.days_left} days left, so this escalates DAILY until you decide — pings on ${e.schedule.map((x)=>x.date).join(", ")}. It stops only when you accept, decline, or negotiate an extension (${e.stops_when}); silence never decides for you.`, { card: { title: "Offer escalation (TEST)", company: "Ramp", days_left: e.days_left, escalates_daily: e.escalates_daily, schedule: e.schedule } });
  s.verify("daily schedule covers every day from tomorrow through the Friday deadline, from the stored offer_deadline", { days_left: e.days_left, dates: e.schedule.map((x)=>x.date), stops_when: e.stops_when });
  await s.finish({ status: e.escalates_daily && e.schedule.length===4 ? "COMPLETE" : "LEARN", outcome: "Offer expiring Friday Oct 16 (TEST): daily escalation scheduled Oct 13–16 until the user decides." }); })();
