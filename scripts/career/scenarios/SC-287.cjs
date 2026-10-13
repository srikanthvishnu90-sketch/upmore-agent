"use strict";
// SC-287 (canonical) Connect LinkedIn the zero-risk way: data export uploaded and parsed into the graph.
const { H, Profile } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-287", "connect-linkedin-export-graph");
  s.user("Connect LinkedIn the zero-risk way: here's my data export (uploads Connections.csv + Profile.csv)");
  const connectionsCsv = [
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    "Testy,One (TEST),https://www.linkedin.com/in/testy-one,,TEST Corp,Intern,01 Jan 2025",
    '"Doe, Jr (TEST)",John,https://www.linkedin.com/in/johndoe,,Example LLC,Analyst,02 Feb 2025',
    "Priya,Sharma (TEST),https://www.linkedin.com/in/priya-sharma,,Stripe,Engineer,03 Mar 2025",
  ].join("\n");
  const profileCsv = [
    "First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers",
    "Alex,Testcase (TEST),,,,TEST headline,TEST summary,Technology,,Chicago Illinois United States,,,",
  ].join("\n");
  const p = Profile.createProfile({});
  const ing = Profile.ingestLinkedIn(p, { connectionsCsv, profileCsv });
  s.tool("CareerProfile.ingestLinkedIn", { connections: ing.connections.length, errors: ing.errors, added_facts: ing.addedFacts.map((f) => f.id) });
  // The graph = the stored connection records, queryable by company:
  const atStripe = p.connections.filter((c) => c.company === "Stripe");
  const graphCompanies = [...new Set(p.connections.map((c) => c.company).filter(Boolean))];
  s.tool("graph query: connections at Stripe", atStripe);
  s.agent(`Done — zero-risk because nothing logged in anywhere: your export parsed into your graph. ${ing.connections.length} connections stored (${graphCompanies.join(", ")}), your headline saved, everything tagged as from your own export. For example, you have ${atStripe.length} connection at Stripe: ${atStripe.map((c) => c.name).join(", ")}.`, { card: { type: "linkedin_graph", title: "Your graph from your export", connections: p.connections.map((c) => ({ name: c.name, company: c.company, source: c.source })) } });
  const ok = ing.errors.length === 0 && p.connections.length === 3 && atStripe.length === 1 && atStripe[0].name === "Priya Sharma (TEST)"
    && p.connections.every((c) => c.source === "linkedin-export") && ing.addedFacts.every((f) => f.source === "linkedin-export")
    && p.basics.name === "Alex Testcase (TEST)";
  s.verify("graph state in the profile itself: 3 connection nodes stored source-tagged, a company query against the stored graph returns the right node, profile fact stored — no login, no scraping, no session", { ok, nodes: p.connections.map((c) => c.name), companies: graphCompanies });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "LinkedIn connected the zero-risk way: the user's own data export parsed into a stored, queryable graph (3 connections, company lookup works) — no login, no session, no scraping." }
    : { status: "LEARN", outcome: "Export-to-graph ingestion did not verify.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix ingestLinkedIn in 122 and rerun SC-287." });
})().catch((e) => { console.error(e); process.exit(1); });
