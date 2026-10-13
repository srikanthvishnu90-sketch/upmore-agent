<<<<<<< HEAD
"use strict"; const { H, P } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-169", "ib-technicals-drill");
  await s.user("quiz me on IB technicals");
  const store = P.makePrepStore(); const set = P.financeDrill();
  await s.agent(`IB technicals drill — accounting, DCF, comps, LBO. Five questions, graded against answer keys, gaps named honestly.\n\n${set.questions.map((q, i) => `Q${i + 1} [${q.topic}] ${q.q}`).join("\n\n")}\n\nAnswer them in one message.`);
  await s.user("1) Depreciation up $10: income statement net income falls $6 after tax, cash flow adds back $10 so net cash up $4, balance sheet balances via lower PP&E and retained earnings. 2) Terminal value drives most of a DCF; WACC matters too; sanity-check with a sensitivity table and an implied multiple. 3) Multiples differ because of growth and margins. 4) LBO returns: EBITDA growth, debt paydown, multiple expansion. 5) Working capital up means more cash, obviously.");
  const answers = { "fin-1": "Depreciation up $10: income statement net income falls $6 after tax, cash flow adds back $10 so net cash up $4, balance sheet balances via lower PP&E and retained earnings.", "fin-2": "Terminal value drives most of a DCF; WACC matters too; sanity-check with a sensitivity table and an implied multiple.", "fin-3": "Multiples differ because of growth and margins.", "fin-4": "LBO returns: EBITDA growth, debt paydown, multiple expansion.", "fin-5": "Working capital up means more cash, obviously." };
  const run = P.runDrill(store, "finance", answers);
  await s.tool("127-career-prep.runDrill", run);
  await s.agent(`Score: ${run.total}/${run.max}.\n\nPer question:\n${run.graded.map((g) => `• ${g.id} [${g.topic}] ${g.score_0_5}/5 — key: ${g.answer_key}${g.gap ? `\n  GAP: ${g.gap}` : ""}`).join("\n")}\n\nHonest gaps: Q3 was thin (risk and capital intensity/returns missing) and Q5 was wrong — rising working capital DEcreases cash flow; cash is tied up in inventory and receivables. Those two go on your fix list before any bank screen.`);
  s.verify("drill stored in prep store", { drills: store.drills.length, total: run.total, max: run.max, gaps: run.gaps });
  await s.finish({ status: "COMPLETE", outcome: `Finance technicals drill ran and was graded ${run.total}/${run.max} against answer keys, with per-question gaps named (comps depth, working-capital direction) and stored.`, reason: null, unblock: null });
=======
"use strict"; const { H, G, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-169", "two-paths-one-company");
  await s.user("Two paths into one company — pick the stronger; don't burn both");
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "linkedin_export", records: [
    T("Priya Nair", { current_firm: "Datadog", title: "Software Engineer", schools: ["TEST University"], clubs: ["TEST University Investing Club"], connection_degree: 1, work_email: "priya@example.test" }),
    T("Sam Ortiz", { current_firm: "Datadog", title: "Software Engineer", hometown: "Chicago, IL (TEST)", work_email: "sam@example.test" })] }]);
  const pick = G.pickStrongerPath(st, "Datadog", profile);
  await s.tool("135-career-graph.pickStrongerPath", pick);
  await s.agent(`One ask, through the stronger path only:\n\n✓ CHOSEN: ${pick.chosen.name} — warmth ${pick.chosen.score} (${pick.chosen.why.join(", ")})\n◌ HELD (not contacted): ${pick.held.map((h) => h.name + " — " + h.held_reason).join("; ")}\n\n${pick.rationale}\n\nIf Priya declines or goes quiet for two weeks, Sam's path is still unburned and we take it then.`);
  s.verify("pick state", { chosen: pick.chosen.name, held_count: pick.held.length, held_status: "not_contacted" });
  await s.finish({ status: "COMPLETE", outcome: "Stronger Datadog path chosen (Priya Nair, warmth 85: alumni+club+1st-degree) and the weaker path explicitly held un-contacted so both are never burned." });
>>>>>>> origin/career/sc-w09
})();
