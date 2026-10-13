<<<<<<< HEAD
"use strict"; const { H, P, cirById } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-165", "technical-prep-swe-snowflake");
  await s.user("help me prep the technical round (SWE)");
  const drills = P.technicalDrills({ cir: cirById("snowflake"), roleFamily: "SWE" });
  await s.tool("127-career-prep.technicalDrills", drills);
  await s.agent(`Using Snowflake as the grounded example (its CIR is on file): its loop is recruiter/HM screen → technical interviews (coding; design for experienced levels) → panel. Your practice sets are matched to those round types, each tagged to the CIR stage that produced it:\n\n${drills.sets.map((x) => `▸ ${x.type.toUpperCase()} [source: ${x.source.type}]\n${x.prompts.map((p) => `  - ${p}`).join("\n")}`).join("\n")}\n\nSnowflake's bar per the CIR: follow-ups push past a first working solution toward performance/trade-off discussion, and database reasoning shows up even in generalist loops — so every coding rep above ends with a 'now scale it / now make it faster' follow-up. Want me to run the coding set as a timed drill?`);
  s.verify("drill sets generated from CIR stage names", { cir_grounded: drills.cir_grounded, set_types: drills.sets.map((x) => x.type) });
  await s.finish({ status: "COMPLETE", outcome: "SWE technical prep delivered: coding + system-design practice sets matched to the Snowflake CIR's actual round types, with the CIR bar (follow-ups past first solution, DB reasoning) built into the reps.", reason: null, unblock: null });
=======
"use strict"; const { H, G, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-165", "departed-contact-next-path");
  await s.user("My only contact left the firm — find the next path, don't write to the departed blindly");
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "linkedin_export", records: [
    T("Gone Person", { current_firm: "Datadog", title: "Software Engineer", schools: ["TEST University"], at_company: false, departed_at: "2026-08", next_firm: "Elsewhere (TEST)", work_email: "gone@example.test" }),
    T("Priya Nair", { current_firm: "Datadog", title: "Software Engineer", schools: ["TEST University"], clubs: ["TEST University Investing Club"], connection_degree: 1, work_email: "priya@example.test" }),
    T("Cold Person", { current_firm: "Datadog", title: "Software Engineer", work_email: "cold@example.test" })] }]);
  const nx = G.departedNextPath(st, "Gone Person (TEST)", profile);
  await s.tool("135-career-graph.departedNextPath", nx);
  await s.agent(`Do NOT write to Gone Person as a Datadog contact — they left in ${nx.departed.departed_at}${nx.departed.next_firm ? " (now at " + nx.departed.next_firm + ")" : ""}. A blind 'quick question about Datadog' email lands wrong and burns the relationship.\n\nYour next live path at Datadog: ${nx.next_paths[0].name} — warmth ${nx.next_paths[0].score} (${nx.next_paths[0].why.join(", ")}). Cold Person is also on file (warmth 0) as the fallback. Want me to draft the coffee-chat ask to ${nx.next_paths[0].name} — chat first, referral ask never in email one?`);
  s.verify("next-path state", { departed_flagged: nx.departed.do_not_contact_as, next: nx.next_paths.map((p) => p.name), departed_excluded_from_paths: !nx.next_paths.some((p) => p.name.includes("Gone")) });
  await s.finish({ status: "COMPLETE", outcome: "Departed contact flagged do-not-contact-as-Datadog (left 2026-08); next live path found and ranked (Priya Nair, alumni+club+1st-degree) with a cold fallback on file." });
>>>>>>> origin/career/sc-w09
})();
