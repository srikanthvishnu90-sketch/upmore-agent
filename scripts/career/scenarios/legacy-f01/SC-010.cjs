"use strict";
// SC-010 LinkedIn export ingestion — connections + profile parsed source-tagged; malformed rows reported.
const { H, Profile } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-010", "linkedin-export-ingestion");
  s.user("(uploads LinkedIn archive: Connections.csv + Profile.csv)");
  const connectionsCsv = [
    "Notes:",
    '"When exporting your connection data, LinkedIn adds this preamble (TEST)"',
    "",
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    "Testy,One (TEST),https://www.linkedin.com/in/testy-one,,TEST Corp,Intern,01 Jan 2025",
    "Bad,RowOnlyThree,https://www.linkedin.com/in/badrow",
    '"Doe, Jr (TEST)",John,https://www.linkedin.com/in/johndoe,,Example LLC,Analyst,02 Feb 2025',
  ].join("\n");
  const profileCsv = [
    "First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers",
    "Alex,Testcase (TEST),,,,TEST headline,TEST summary,Technology,,Chicago Illinois United States,,,",
  ].join("\n");
  const p = Profile.createProfile({});
  const ing = Profile.ingestLinkedIn(p, { connectionsCsv, profileCsv });
  s.tool("CareerProfile.ingestLinkedIn", { added_facts: ing.addedFacts.map((f) => ({ id: f.id, source: f.source })), connections: ing.connections.length, errors: ing.errors });
  s.agent(`Imported ${ing.connections.length} LinkedIn connections and your LinkedIn profile headline, all tagged as from your LinkedIn export. One row in Connections.csv was malformed (3 columns instead of 7, row 6) — I skipped that row and imported the rest; nothing was silently dropped.`, { card: { type: "linkedin_import", title: "LinkedIn import", connections: ing.connections.map((c) => c.name), errors: ing.errors } });
  const ok = ing.connections.length === 2 && p.connections.length === 2
    && ing.errors.length === 1 && /expected 7 columns, got 3/.test(ing.errors[0].reason) && ing.errors[0].file === "Connections.csv"
    && ing.connections.every((c) => c.source === "linkedin-export")
    && ing.addedFacts.every((f) => f.source === "linkedin-export")
    && p.basics.name === "Alex Testcase (TEST)";
  s.verify("profile state: 2 valid connections stored source-tagged linkedin-export, profile fact stored, exactly 1 malformed-row error reported with file + reason, no throw and no silent drop", { ok, connections: p.connections.map((c) => c.name), errors: ing.errors });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "LinkedIn archive ingested: 2 connections + the profile headline stored as source-tagged facts/records; the one malformed Connections.csv row was reported by file and reason, never silently dropped." }
    : { status: "LEARN", outcome: "LinkedIn ingestion did not parse/report as required.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix ingestLinkedIn in 122 and rerun SC-010." });
})().catch((e) => { console.error(e); process.exit(1); });
