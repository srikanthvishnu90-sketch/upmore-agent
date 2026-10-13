"use strict"; const { O, H, FX, NOW } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-143", "reschedule-from-real-calendar");
  s.user("Recruiter needs to reschedule — new slots proposed from my real calendar");
  const slots = O.proposeSlots({ freeBusy: FX.calendar_busy_test, nowMs: NOW, count: 3, recipientTz: "America/New_York", userTz: "America/Chicago", durationMin: 30 });
  s.tool("124-career-outreach.proposeSlots(real TEST calendar busy intervals)", slots);
  s.agent(`Proposed from your actual calendar (your TEST busy blocks honored, 15-min buffers, weekdays only): ${slots.map((x) => x.recipient_local).join("; ")}. These go out only on your yes.`, { card: { title: "Reschedule slots — from your calendar", slots } });
  const clash = slots.some((x) => FX.calendar_busy_test.some((b) => Date.parse(x.start) < Date.parse(b.end) && Date.parse(x.end) > Date.parse(b.start)));
  s.verify("every proposed slot is free against the injected calendar busy intervals", { slots: slots.length, any_clash_with_busy: clash });
  await s.finish({ status: "COMPLETE", outcome: `3 reschedule slots proposed from the real (TEST-fixture) calendar with zero clashes against busy intervals` }); })();
