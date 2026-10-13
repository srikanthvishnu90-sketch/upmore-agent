<<<<<<< HEAD
"use strict"; const { H, P, cirById } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-170", "jane-street-quant-drill-no-cir");
  await s.user("prep me for Jane Street's games");
  const cir = cirById("jane-street"); await s.tool("127-career-prep.findCir", { company: "Jane Street", cir_found: !!cir, nearest_merged_cir: "citadel-securities (official firm prep topics: expected value, probability, market making)" });
  const store = P.makePrepStore(); const set = P.quantDrill();
  await s.agent(`The drill engine is ready — probability and mental math, graded exactly. One honesty note before we start: there is no Jane Street CIR on file, so I can't give you a sourced Jane-Street-specific selectivity read. The closest grounded record is Citadel Securities' own published prep topics (expected value, confidence intervals, market making, options basics — labeled official firm content in its CIR), which is why this set weights expected value and probability games.\n\n${set.questions.map((q, i) => `Q${i + 1} [${q.topic}] ${q.q}`).join("\n")}`);
  await s.user("1) 6. 2) 5/36. 3) 408. 4) +1 — wait, 0.3 times 10 is 3 minus 2 is 1, yes +$1. 5) about 0.02");
  const run = P.runDrill(store, "quant", { "q-1": "6", "q-2": "5/36", "q-3": "408", "q-4": "1", "q-5": "0.02" });
  await s.tool("127-career-prep.runDrill", run);
  await s.agent(`Scored: ${run.total}/${run.max}.\n${run.graded.map((g) => `• ${g.id} [${g.topic}] ${g.correct ? "✓" : "✗"} — key: ${g.answer_key}`).join("\n")}\n\nQ5 is the miss: (4/52)(3/51)(2/50) ≈ 0.00018, not 0.02 — two orders of magnitude. On the selectivity read: honestly, without a Jane Street CIR I won't quote acceptance folklore as fact. What is sourced (Citadel Securities CIR, official): firms at this level publish probability/EV depth as the bar and do not name competition results as requirements.`);
  s.verify("quant drill stored", { drills: store.drills.length, total: run.total, per_question: run.graded.map((g) => g.correct) });
  await s.finish({ status: "LEARN", outcome: "Probability/mental-math drill ran and was scored exactly (20/25; the aces probability missed by 100x), but the Jane-Street-specific honest selectivity read could not be grounded — no Jane Street CIR exists; the agent said so and cited the nearest merged CIR (Citadel Securities) with labels.", reason: "Ledger expectation cites 'CIR jane-street'; no jane-street.json exists on pivot/career or any cir-b* branch.", unblock: "Merge a Jane Street CIR into packages/career-data/cirs; quantDrill + brief then ground firm-specific topics/selectivity in it." });
=======
"use strict"; const { H, G, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-170", "mini-campaign-one-company");
  await s.user("Mini-campaign at one company: 8 people sequenced warm to cold");
  const mk = (name, o) => T(name, Object.assign({ current_firm: "Stripe", title: "Software Engineer", work_email: name.split(" ")[0].toLowerCase() + "@example.test" }, o));
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "linkedin_export", records: [
    mk("Anna A", { schools: ["TEST University"], clubs: ["TEST University Investing Club"], connection_degree: 1 }),
    mk("Ben B", { schools: ["TEST University"], clubs: ["TEST University Investing Club"] }),
    mk("Cara C", { schools: ["TEST University"], connection_degree: 1 }),
    mk("Dan D", { schools: ["TEST University"] }),
    mk("Eli E", { connection_degree: 1, hometown: "Chicago, IL (TEST)" }),
    mk("Fay F", { hometown: "Chicago, IL (TEST)" }),
    mk("Gus G", { connection_degree: 2 }),
    mk("Hal H", {})] }]);
  const camp = G.miniCampaign(st, "Stripe", profile, { count: 8 });
  await s.tool("135-career-graph.miniCampaign", camp);
  await s.agent(`Your 8-person Stripe mini-campaign, sequenced warm to cold — one at a time, each a coffee-chat ask first (a referral ask never goes in email one), and replies re-rank the rest:\n\n${camp.sequence.map((x) => `${x.order}. ${x.name} — warmth ${x.warmth} (${x.why.join(", ")})`).join("\n")}\n\nNothing is sent yet: the sequence is queued, and each send rides the 124 campaign caps (per-firm 15/30d is never approached by 8).`);
  s.verify("campaign state", { count: camp.count, warmths: camp.sequence.map((x) => x.warmth), all_queued_not_sent: camp.sequence.every((x) => x.status === "queued_not_sent") });
  await s.finish({ status: "COMPLETE", outcome: "8-person single-company mini-campaign built and sequenced warm→cold (85→0) with per-person shared facts, all queued-not-sent under the 124 caps." });
>>>>>>> origin/career/sc-w09
})();
