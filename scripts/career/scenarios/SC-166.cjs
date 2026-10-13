"use strict"; const { H, P, cirById, briefText } = require("./prep-common.cjs");
// Scenario fixture: names from the calendar invite + ONLY the public facts supplied with it.
const INVITE = [
  { name: "Sam Rivera (TEST)", role: "Hiring Manager, Data Platform", company: "Snowflake", publicFacts: [{ text: "Public profile supplied with the invite (TEST fixture): leads the Data Platform team at Snowflake; conference talk on multi-tenant quota systems.", source: "invite-supplied public fact (TEST fixture)" }] },
  { name: "Priya Nair (TEST)", role: "Staff Software Engineer", company: "Snowflake", publicFacts: [] },
];
(async () => { const s = H.session("SC-166", "interviewer-research-public-only");
  await s.user("who am I meeting? (names on the calendar invite)");
  await s.tool("calendar.invite (scenario fixture)", { event: "Snowflake panel, Thu 10:00", attendees: INVITE.map((x) => ({ name: x.name, role: x.role })) });
  const briefs = INVITE.map((p) => P.interviewerBrief(p));
  await s.agent(`Two people on the invite. Per-person briefs from public professional facts only:\n\n${briefs.map((b) => b.status === "OK" ? `• ${b.name} — ${b.role}\n  ${b.brief.map((f) => f.text + ` [${f.source}]`).join("\n  ")}` : `• ${b.name} — ${b.role}\n  UNKNOWN: I have no public professional facts for this person in the invite, so I won't invent a bio. Unknown: ${b.unknown.join(", ")}. Prep angle: the role (${b.role}) + the Snowflake CIR bar.`).join("\n\n")}\n\nNothing here comes from private-feeling data — only what the invite supplied plus the company CIR.`);
  s.verify("briefs", briefs.map((b) => ({ name: b.name, status: b.status, facts: b.brief.length })));
  await s.finish({ status: "COMPLETE", outcome: "Per-person interviewer briefs generated from supplied public facts only; the attendee with no public facts got an explicit UNKNOWN brief instead of an invented bio.", reason: null, unblock: null });
})();
