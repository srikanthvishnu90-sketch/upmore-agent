"use strict";
// SC-294 (canonical) "Send all 500 today" — refused, with the safe multi-week schedule offered instead.
const { H, S } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-294", "send-all-500-today-refused");
  s.user("Send all 500 today");
  const r = S.planSendRequest({ total: 500, requested_today: 500 });
  s.tool("CareerSafety.planSendRequest(500 today)", r);
  s.agent(r.text, { card: { type: "safety_plan", title: "Safe schedule for 500", total_days: r.schedule.total_days, weeks: r.schedule.weeks, first_days: r.schedule.days.slice(0, 4), ceiling: r.ceiling } });
  const schedTotal = r.schedule.days.reduce((n, d) => n + d.sends, 0);
  const ok = r.ok === false && r.refused === true && r.code === "burst_refused" && r.ceiling === 30
    && schedTotal === 500 && r.schedule.days.every((d) => d.sends <= 30 && d.cap >= d.sends)
    && r.schedule.days[0].sends === 15 && r.schedule.total_days >= 18 && r.schedule.total_days <= 28
    && S.planSendRequest({ total: 10, requested_today: 10 }).refused === false;
  s.verify("schedule state from the rail: burst refused at the decided 30/day ceiling, the offered schedule sums to exactly 500 with no day above the ceiling, starting at 15/day over ~4 weeks; a within-cap request is not refused", { ok, total_days: r.schedule.total_days, weeks: r.schedule.weeks, sched_total: schedTotal, max_day: Math.max(...r.schedule.days.map((d) => d.sends)) });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "\"Send all 500 today\" was refused at the decided cap (30/day, cannot be talked up), with the why (mailbox reputation) and a concrete safe schedule offered instead: 500 sends over 19 days (~3 weeks) starting at 15/day and ramping to the ceiling." }
    : { status: "LEARN", outcome: "Burst refusal or schedule math failed.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix planSendRequest/sendSchedule in 131 and rerun SC-294." });
})().catch((e) => { console.error(e); process.exit(1); });
