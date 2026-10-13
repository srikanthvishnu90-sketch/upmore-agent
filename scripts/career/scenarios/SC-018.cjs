"use strict";
// SC-018 Privacy: what's stored about me? — export lists facts/connections/tokens-by-name; delete offered.
const { H, A, O, EMAIL, stagingRows, fixtureProfile } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-018", "privacy-whats-stored");
  s.user("what do you have stored about me?");
  const p = fixtureProfile();
  p.connections.push({ name: "Testy One (TEST)", company: "TEST Corp", position: "Intern", source: "linkedin-export" });
  const access = A.connectedAccounts(stagingRows());
  const r = O.handleChat("what do you have stored about me?", { profile: p, access });
  s.tool("CareerOnboarding.profileExport", { fact_count: r.fact_count, connection_count: r.connection_count, delete_path_offered: r.delete_path_offered });
  const ex = O.profileExport(p, access);
  s.tool("CareerOnboarding.profileExport(detail)", ex);
  s.agent(r.reply, { card: { type: "profile_export", title: "Stored about you", fact_count: ex.fact_count, draft_count: ex.draft_count, tokens_by_name: ex.tokens_by_name } });
  const ok = r.intent === "profile_export" && ex.fact_count === p.facts.length && ex.connection_count === 1
    && ex.tokens_by_name.map((t) => t.source).join(",") === "gmail,calendar"
    && ex.delete_path_offered === true && /delete my stored profile/.test(ex.text)
    && ex.facts.every((f) => f.id && f.status) && !JSON.stringify(ex).match(/vault:\/\/|refresh_token|access_token|portal_workday/);
  s.verify("export state matches the profile + connection rows exactly (fact count, connection count, token sources by name only — gmail/calendar, no values), and the delete path is offered in the text", { ok, fact_count: ex.fact_count, tokens_by_name: ex.tokens_by_name, connected_email: EMAIL });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `Privacy export listed everything stored: ${ex.fact_count} profile facts with IDs and statuses, 1 connection, and connected tokens by name only (gmail, calendar — never values); the delete path was offered.` }
    : { status: "LEARN", outcome: "Profile export did not match the stored state or exposed a value-shaped field.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix profileExport in 130 and rerun SC-018." });
})().catch((e) => { console.error(e); process.exit(1); });
