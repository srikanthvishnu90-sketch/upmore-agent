<<<<<<< HEAD
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
=======
"use strict"; const { H, G, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-166", "professor-path");
  await s.user("Professor path: my professor worked at the target — draft the ask");
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "pasted_contacts", records: [T("Prof. Lena Alvarez", { current_firm: "TEST University", title: "Professor of Computer Science", prior_firms: ["Datadog"], is_professor: true, work_email: "alvarez@example.test" })] }]);
  const prof = st.people[0];
  const atTarget = Object.assign({}, prof, { current_firm: "Datadog" });
  const ask = G.draftReferralAsk(atTarget, profile, { hadGoodChat: true, role: "Software Engineering Intern", proof: "my DeployBoard project (Go/Kubernetes, 12 student teams — fact F-003)" });
  await s.tool("135-career-graph.importGraph(professor record)", { prior_firms: prof.prior_firms, is_professor: prof.is_professor });
  await s.tool("135-career-graph.draftReferralAsk(kind=professor)", ask);
  await s.agent(`Your professor path is real: Prof. Alvarez's record shows prior firm Datadog. The ask is drafted in the professor register — respectful, specific proof attached, and it offers her the lighter option (point me to the right person) instead of demanding the referral outright. Held for your yes:\n\n${ask.draft.body}`);
  s.verify("professor ask state", { kind: ask.kind, status: ask.status, prior_firm_on_record: prof.prior_firms });
  await s.finish({ status: "COMPLETE", outcome: "Professor path verified from the record (prior firm Datadog) and a professor-register referral ask drafted with real proof (F-003), held draft_only for approval." });
>>>>>>> origin/career/sc-w09
})();
