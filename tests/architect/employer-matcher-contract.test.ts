// SERIAL-1490 / SERIAL-1491: the shared employer matcher's two contracts, pinned apart so neither drifts into the other.
//   selection  namesEmployer(text, company): did the person name THIS employer? Strict: every distinctive word of a
//              multi-word name in one run. A miss costs a question, never a wrong employer.
//   screen     employerMatch(text, company): could this be where they work now? "yes" when named; "possible" on a shared
//              leading distinctive word with one name longer, in either direction; "no" otherwise. A possible match is
//              asked once and queues nothing until answered (fail closed; the wrong direction is worse than a question).
// Fail-first on 7932f219: employerMatch and possibleEmployerFact did not exist; the strict rule alone let "I work at
// Acme" pass a posting at "Acme Robotics Inc" (the guard stayed silent).
import assertNode from "node:assert/strict";
import { currentEmployerFact, employerMatch, namesEmployer, possibleEmployerFact, screenPicks } from "../../supabase/functions/_shared/career_apply_want.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const NOW = Date.UTC(2026, 9, 25, 12);

Deno.test("contract 1 (selection): the strict rule picks the posting named and no sibling", () => {
  const cases: [string, string, boolean][] = [
    ["apply to the Data Analyst role at Acme Robotics Inc", "Acme Robotics Inc", true],
    ["apply to the Data Analyst role at Acme Robotics", "Acme Robotics Inc", true],
    ["apply to the Data Analyst role at Acme", "Acme Robotics Inc", false],
    ["apply to the Data Analyst role at Acme Robotics Inc", "Acme Health", false],
    ["apply to Acme Health", "Acme Robotics Inc", false],
    ["apply to Contoso Analytics", "Fabrikam Data", false],
    ["apply to Contoso Analytics", "Contoso Analytics", true],
  ];
  for (const [t, c, want] of cases) eq(namesEmployer(t, c), want, `${JSON.stringify(t)} names ${JSON.stringify(c)}`);
});

Deno.test("contract 2 (the protective screen): yes when named, possible on a shared leading word in either direction, no otherwise", () => {
  const cases: [string, string, "yes" | "possible" | "no"][] = [
    // short employer fact vs long posting name
    ["I work at Acme", "Acme Robotics Inc", "possible"],
    ["Acme", "Acme Robotics Inc", "possible"],
    ["you work at TEST Current Employer", "TEST Chat Employer", "possible"],
    // the reverse: long employer fact vs short posting name
    ["I work at Acme Robotics Inc", "Acme", "possible"],
    ["Acme Robotics Inc", "Acme", "possible"],
    // the same employer
    ["I work at Acme Robotics Inc", "Acme Robotics Inc", "yes"],
    ["I work at Acme Robotics", "Acme Robotics Inc", "yes"],
    ["I work at Acme", "Acme", "yes"],
    ["I work at Stripe", "Stripe Inc", "yes"],
    ["I'm at Google Cloud now", "Google", "possible"],
    // distinct employers: a shared COMMON word is not a lead, and no shared word is nothing
    ["I'm at General Motors", "General Electric", "no"],
    ["I work at Contoso Analytics", "Fabrikam Data", "no"],
    ["I work at Acme Robotics Inc", "Acme Health", "possible"],
    ["I work at Fabrikam", "Acme Robotics Inc", "no"],
  ];
  for (const [t, c, want] of cases) eq(employerMatch(t, c), want, `${JSON.stringify(t)} vs ${JSON.stringify(c)}`);
});

Deno.test("the guard: a definite fact refuses; a possible one is a question attached to that posting only; the person's no clears it for that company, their yes makes it definite", () => {
  const facts = [{ kind: "experience", text: "I work at Acme" }];
  eq(currentEmployerFact("Acme Robotics Inc", facts), null, "not definite");
  eq(!!possibleEmployerFact("Acme Robotics Inc", facts), true, "but possible");
  eq(possibleEmployerFact("Fabrikam Data", facts), null);
  eq(!!currentEmployerFact("Acme", facts), true);
  const picks = [
    { job_id: "g:1", url: "https://boards.greenhouse.io/acmerobotics/jobs/1", company: "Acme Robotics Inc", title: "Data Analyst" },
    { job_id: "g:2", url: "https://boards.greenhouse.io/fabrikam/jobs/2", company: "Fabrikam Data", title: "Data Analyst" },
    { job_id: "g:3", url: "https://boards.greenhouse.io/acme/jobs/3", company: "Acme", title: "Data Analyst" },
  ];
  const r = screenPicks(picks, { apps: [], facts, now: NOW });
  eq(r.ok.map((p) => p.company), ["Fabrikam Data"], "the distinct employer goes on");
  eq(r.refused.map((x) => [x.posting.company, x.ask ?? null]), [["Acme Robotics Inc", "employer"], ["Acme", null]], "the possible one is a question; the definite one a refusal");
  assertNode.match(r.refused[0].reason, /is Acme Robotics Inc where you work now\?/);
  assertNode.match(r.refused[1].reason, /current employer/);
  const no = screenPicks(picks, { apps: [], facts, now: NOW, resolved: [{ company: "Acme Robotics Inc", is_employer: false }] });
  eq(no.ok.map((p) => p.company), ["Acme Robotics Inc", "Fabrikam Data"], "their no clears that company only");
  eq(no.refused.map((x) => x.posting.company), ["Acme"]);
  const yes = screenPicks(picks, { apps: [], facts, now: NOW, resolved: [{ company: "Acme Robotics Inc", is_employer: true }] });
  eq(yes.refused.map((x) => [x.posting.company, x.ask ?? null]), [["Acme Robotics Inc", null], ["Acme", null]], "their yes makes it definite: no question again");
  assertNode.match(yes.refused[0].reason, /they said so when asked/);
});
