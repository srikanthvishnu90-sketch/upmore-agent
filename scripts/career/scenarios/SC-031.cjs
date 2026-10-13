"use strict";
const L = require("./_w02-lib.cjs"); const { H, M } = L;
(async () => {
  const s = H.session("SC-031", "reply-booking-tue-wed-5pm-et");
  s.user("Reply handling: banker offers Tue or Wed 5pm ET — propose from my calendar, card, book it");
  const contact = { person_id: "TEST-W02-031", full_name: "Banker Fixture (TEST)", current_firm: "Fixture Bank (TEST)", title: "Associate", work_email: "banker.fixture@fixturebank.test" };
  const reply = { subject: "Re: coffee chat", body: "Happy to chat — Tuesday or Wednesday at 5pm ET works for me. Let me know." };
  s.tool("TEST fixture reply inbox", reply);
  const cls = M.classifyReply(reply, { nowMs: Date.parse("2026-10-13T12:00:00Z") }); // Tue 2026-10-13
  s.tool("CareerOutreach.classifyReply", cls);
  // Fixture calendar: busy Tue 2026-10-20 17:00 ET is FREE; first Tue (Oct 20) free, Wed busy is irrelevant — book first free offered slot.
  const cal = L.fixtureCalendar([{ start: "2026-10-21T21:00:00.000Z", end: "2026-10-21T21:30:00.000Z" }]); // Wed Oct 21 5pm ET busy
  cal.events.push({ id: "TEST-PREEXISTING", title: "Existing fixture hold (TEST)", start: "2026-10-20T12:00:00.000Z", end: "2026-10-20T12:30:00.000Z" });
  const res = M.bookFromReply(reply, contact, { calendar: cal, nowMs: Date.parse("2026-10-13T12:00:00Z"), durationMin: 30 });
  s.tool("CareerOutreach.bookFromReply (W02 extension, injected fixture calendar)", res);
  if (res.ok) s.card(res.card);
  s.agent(res.ok ? `Booked: coffee chat with Banker Fixture (TEST) on ${res.booked.start} (${res.booked.timezone}, 30 min). Wednesday 5pm ET was busy on your calendar, so I took the free Tuesday slot they offered.` : `Could not book: ${res.reason}`);
  const ev = cal.events.find((e) => e.source === "bookFromReply");
  const ok = cls.classification === "positive-ready" && !!res.ok && !!ev && ev.start === res.booked.start && ev.attendees.includes(contact.work_email);
  s.verify("booked event read back from the INJECTED FIXTURE CALENDAR's own events[] records (not from the return value alone)", { calendar_events: cal.events, booked_event: ev || null, classification: cls.classification });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `Positive reply classified; Tue/Wed 5pm ET options proposed from the fixture calendar; event ${ev.id} booked at ${ev.start} in the calendar's own records.` }
    : { status: "LEARN", outcome: "Booking did not verify from calendar records.", reason: `cls=${cls.classification} res=${JSON.stringify(res).slice(0, 300)}`, unblock: "Fix bookFromReply slot parsing/conflict logic and rerun SC-031." });
})().catch((e) => { console.error(e); process.exit(1); });
