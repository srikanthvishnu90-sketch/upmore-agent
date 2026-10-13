"use strict";
// SC-300 (canonical) Kill switch: "Stop everything" — all queues halt, status reported, nothing half-sent.
const { H, S } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-300", "kill-switch-stop-everything");
  s.user("Stop everything");
  const state = S.createQueueState({
    campaigns: [{ id: "camp-1", state: "sent" }, { id: "camp-2", state: "sending" }, { id: "camp-3", state: "queued" }, { id: "camp-4", state: "queued" }],
    applications: [{ id: "app-1", state: "queued" }, { id: "app-2", state: "sending" }],
    followups: [{ id: "fu-1", state: "scheduled" }],
  });
  s.tool("queue state before the kill switch", JSON.parse(JSON.stringify(state)));
  const r = S.stopEverything(state, { at: "2026-10-12T20:00:00.000Z" });
  s.tool("CareerSafety.stopEverything", r);
  s.agent(r.text, { card: { type: "kill_switch_report", title: "Everything stopped", report: r.report, half_sent_remaining: r.half_sent_remaining } });
  const all = [...state.campaigns, ...state.applications, ...state.followups];
  const ok = state.halted === true && r.half_sent_remaining === 0 && all.every((i) => i.state !== "sending" && i.state !== "queued" && i.state !== "scheduled")
    && r.report.sent_confirmed === 1 && r.report.aborted_not_sent === 2 && r.report.queued_halted === 4
    && state.campaigns[0].state === "sent" && state.applications[1].state === "aborted_not_sent";
  s.verify("queue state after: halted=true, zero items left in sending/queued/scheduled anywhere, the provider-confirmed send stays sent (reported honestly), both in-flight items resolved to aborted_not_sent — nothing half-sent", { ok, report: r.report, states: all.map((i) => [i.id, i.state]) });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "\"Stop everything\" halted all three queues mid-flight: 1 provider-confirmed send stays sent and is reported as such, 2 in-flight items resolved to NOT sent, 4 queued items halted — zero half-sent items remain, with a full status report." }
    : { status: "LEARN", outcome: "Kill switch left something moving or half-sent.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix stopEverything in 131 and rerun SC-300." });
})().catch((e) => { console.error(e); process.exit(1); });
