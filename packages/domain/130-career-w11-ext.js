/* Career W11 extensions (SC-201..205 prep tail + SC-212..220 negotiation gaps).
   NEW file by design: the vendored engines 127-career-prep.js / 128-career-negotiation.js stay
   byte-identical to their sibling branches; everything here either adapts data for them or adds
   the scenario-specific shapes they do not carry. Same laws as 127/128: NO network, NO invented
   facts (company claims only from a CIR, carried with source labels; personal claims only from
   facts the caller supplies), NO SENDS (every outward text is { requires_approval: true,
   sent: false }), comp figures ONLY from CIR compensation_notes via 128's benchmark, and tax /
   legal specifics are referred out, never answered. */
"use strict";
const N = (() => { try { return require("./128-career-negotiation.js"); } catch { return null; } })();
const DISCLAIMER = "Advice, not a guarantee of outcome. Not legal or tax advice — have an employment lawyer review any agreement before you sign.";
const s = (v) => (v == null ? "" : String(v));
const card = (kind, title, body, destination) => ({ type: "approval_card", kind, title, body, destination: destination || "recruiter (address confirmed on the card before send)", requires_approval: true, sent: false, note: "Nothing sends without your yes on this card." });

// ---------- BUG-141 adapter: pivot/career CIRs store screening_signals as {stated, revealed} ----------
// 127's normalizeCir calls .map on screening_signals and crashes on the merged-corpus shape.
// Flattening stated+revealed into one list (entries untouched) lets the vendored engine consume
// pivot CIRs unchanged. Every other list field already matches 127's expectations.
function adaptCir(cir) {
  if (!cir || typeof cir !== "object") return cir;
  const out = Object.assign({}, cir);
  const flat = (v) => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") return [...(v.stated || []), ...(v.revealed || [])];
    return v;
  };
  for (const k of ["screening_signals", "interview_styles", "values_culture_signals"]) {
    if (out[k] != null) out[k] = flat(out[k]);
  }
  return out;
}

// ---------- SC-201 research-talk prep (PhD / research role) ----------
// Grounded ONLY in the talk record the caller supplies + optional CIR interview styles.
// No result, venue or audience fact is invented; missing talk fields are named as gaps.
function researchTalkPrep(opts) {
  opts = opts || {}; const talk = opts.talk || {};
  const gaps = ["title", "problem", "method", "result", "limitations"].filter((k) => !s(talk[k]));
  return {
    kind: "research_talk", title: s(talk.title) || null,
    narrative_arc: [
      { beat: "Problem & why it matters", say: s(talk.problem) || "[GAP: supply the problem statement]" },
      { beat: "What was hard / what prior work missed", say: s(talk.gap) || "[not supplied — do not improvise a literature claim; state only what you read]" },
      { beat: "Method", say: s(talk.method) || "[GAP: supply the method]" },
      { beat: "Result (only the numbers in your record)", say: s(talk.result) || "[GAP: supply the result]" },
      { beat: "Limitations, stated before they ask", say: s(talk.limitations) || "[GAP: supply honest limitations]" },
      { beat: "What you would do next", say: s(talk.next) || "[not supplied]" },
    ],
    likely_questions: [
      "Why does this problem matter beyond your subfield?",
      "What is the strongest objection to your method, and what evidence answers it?",
      "What would change your conclusion?",
      "How does this connect to the work this lab / team does? (Answer only from the team's published work you have actually read.)",
      "What did you personally do versus collaborators?",
    ],
    drills: ["Give the talk in 10 minutes, then in 2 minutes — same result numbers both times.", "Practice the limitations slide until it takes under 60 seconds; panels trust candidates who volunteer limits."],
    gaps, cir_grounded: !!opts.cir,
    honesty: "Built only from the talk record you supplied. No venue, audience or result fact was added.",
  };
}

// ---------- SC-202 teaching-demo prep (academic role) ----------
// No CIR exists for academic employers in the corpus; this prep claims nothing about any
// institution — it structures the demo the caller describes.
function teachingDemoPrep(opts) {
  opts = opts || {}; const lesson = opts.lesson || {};
  const mins = Number(lesson.minutes) || 20;
  const blocks = [
    { block: "Hook + objective", minutes: Math.max(2, Math.round(mins * 0.1)), do: `Open with the puzzle in "${s(lesson.topic) || "[topic]"}" and state what students will be able to DO by the end.` },
    { block: "Core concept, worked example", minutes: Math.round(mins * 0.4), do: "One concept, one fully worked example on the board — narrate your reasoning, not just steps." },
    { block: "Check for understanding", minutes: Math.round(mins * 0.25), do: "Cold-call-free check: a 60-second pair task or poll on the exact misconception this topic is known for in YOUR teaching notes (not supplied = prepare it tonight)." },
    { block: "Second example, students lead", minutes: Math.round(mins * 0.15), do: "Students start the solution; you correct the path, not just the answer." },
    { block: "Close + bridge", minutes: Math.max(2, mins - Math.round(mins * 0.9)), do: "Summarize the one takeaway and name what it unlocks next class." },
  ];
  return {
    kind: "teaching_demo", topic: s(lesson.topic) || null, audience: s(lesson.audience) || null, minutes: mins,
    blocks, total_block_minutes: blocks.reduce((a, b) => a + b.minutes, 0),
    likely_committee_questions: [
      "Why did you choose this example for this level?",
      "A student says the opposite of the correct idea confidently — walk us through your next 30 seconds.",
      "How do you know they learned it (what evidence, not vibes)?",
      "How would you adapt this for a student who already knows the material?",
    ],
    materials_checklist: ["Slides/board plan printable as a handout", "Worked example solved in advance, twice", "Backup explanation if the demo tech fails", "One formative check with an answer key for yourself"],
    cir_grounded: false,
    honesty: "No CIR covers academic employers, so nothing about any institution's process is claimed. This plan structures only the lesson you described.",
  };
}

// ---------- SC-203 portfolio walkthrough prep (design interview) ----------
// Project order + narrative come ONLY from project records the caller supplies; the company
// side (what the panel probes) comes from the CIR via the vendored prep engine's caller.
function portfolioWalkthrough(opts) {
  opts = opts || {}; const projects = opts.projects || [];
  const ordered = [...projects].sort((a, b) => (b.lead ? 1 : 0) - (a.lead ? 1 : 0));
  return {
    kind: "portfolio_walkthrough", company: s(opts.company) || null, cir_grounded: !!opts.cir,
    order: ordered.map((p, i) => ({
      order: i + 1, project: s(p.name),
      arc: [
        `Context & your role: ${s(p.role) || "[state your exact role — panels probe this first]"}`,
        `The hard decision: ${s(p.decision) || "[name the trade-off you owned]"}`,
        `Evidence it worked: ${s(p.evidence) || "[only metrics you actually have — none supplied]"}`,
        `What you would redo: ${s(p.redo) || "[prepare one honest redo]"}`,
      ],
    })),
    probe_questions: [
      "Show me where the design almost went the other way — what decided it?",
      "What did the research / data say that you disagreed with?",
      "Where is your work in this screen, specifically (not the team's)?",
      "How did engineering constraints change the design?",
    ],
    gaps: projects.length ? [] : ["No project records supplied — the walkthrough cannot be built from nothing."],
    honesty: "Every project claim above is copied from the records you supplied; nothing was embellished.",
  };
}

// ---------- SC-204 hiring-manager round: deeper team brief ----------
// Roadmap/team facts are NEVER invented: they appear only if the caller supplies public facts;
// otherwise they are listed as questions to ask the HM — which is what the round is for.
function hiringManagerBrief(opts) {
  opts = opts || {};
  const supplied = (opts.teamFacts || []).filter((f) => f && s(f.text));
  return {
    kind: "hiring_manager_round",
    known_about_team: supplied.map((f) => ({ text: s(f.text), source: s(f.source || "provided public fact") })),
    roadmap_status: supplied.length ? "SUPPLIED_FACTS_ONLY" : "UNKNOWN — no team/roadmap facts were supplied, so none are claimed. Earning them is the point of this round.",
    questions_to_ask_them: [
      "What does success in this role look like at 6 months, in your words?",
      "What is the team's hardest open problem right now, and why is it still open?",
      "How are projects staffed — do I join a team, or get matched after starting?",
      "What happened with the last person in this role (growth, scope, or exit — whatever you can share)?",
      "What would make you regret hiring for this role?",
    ],
    what_the_hm_is_testing: ["Can you talk about THEIR problems, not only your past?", "Do you ask about success criteria before day one?", "Is your interest in this team specific or generic?"],
    honesty: "Team and roadmap statements above are only the public facts supplied; everything else is framed as a question to ask, never as a fact about the team.",
  };
}

// ---------- SC-205 bar-raiser-style panel prep ----------
// The panel style is user-described (no Amazon CIR exists in the corpus — stated, not hidden).
// Prep = hardest-question set + scored-mock plan built on the caller's own story bank.
function barRaiserPrep(opts) {
  opts = opts || {};
  return {
    kind: "bar_raiser_panel", cir_grounded: false,
    cir_note: "No CIR for this employer exists in the merged corpus, so no company process, bar or comp claim is made. 'Bar-raiser-style' is YOUR description of the panel; prep below targets the hardest-questioner dynamic generically.",
    hardest_questions: [
      "Tell me about your biggest failure — and do not soften it. What exactly was YOUR mistake?",
      "Give me a decision you made with incomplete data that turned out wrong. Walk the reasoning.",
      "Where do you disagree with how this panel has framed the problem?",
      "Your story's result — how do you KNOW your action caused it, versus the team or timing?",
      "If we hire you and it fails in year one, what most likely caused it?",
    ],
    rules: [
      "Every claim gets a follow-up: prepare the second layer (numbers, alternatives considered, what you'd do now) for each story.",
      "Never defend an inflated claim — concede the limit and show the corrected reasoning; panels score judgment, not perfection.",
      "Answer the question asked before expanding; the hardest questioner is timing your precision.",
    ],
    mock_plan: "Run a text mock where every answer gets one hostile follow-up; score with the same structure/evidence/specificity rubric (127 scoreAnswer). Fix the weakest dimension, then re-mock.",
    stories_supplied: (opts.stories || []).length,
  };
}

// ---------- SC-212 below-floor analysis ----------
function belowFloorAnalysis(offer, bench, opts) {
  opts = opts || {}; const floor = Number(opts.floor);
  if (!Number.isFinite(floor)) return { status: "NEEDS_FLOOR", note: "No floor was stated by the user — the counter-vs-walk math cannot run on an unstated floor." };
  const tc = N ? N.totalComp(offer) : null;
  const annualized = tc ? tc.annualized_total : (offer.base_salary || 0);
  const gap = floor - annualized;
  const fig = bench && bench.figures && bench.figures[0];
  return {
    status: gap > 0 ? "BELOW_FLOOR" : "AT_OR_ABOVE_FLOOR", floor,
    annualized_total: annualized, year1_total: tc ? tc.year1_total : null, gap_to_floor: Math.max(0, gap),
    counter_math: gap > 0
      ? `Closing the gap on base alone needs base ≈ $${((offer.base_salary || 0) + gap).toLocaleString()}. Closing it on signing alone needs a $${gap.toLocaleString()} signing increase (year-1 only — it does not fix the annualized gap). A split (part base, part signing) is the realistic ask.`
      : "The offer already meets your floor on annualized math — negotiating now is upside, not rescue.",
    sourced_anchor: fig ? { low: fig.low, high: fig.high, source_url: fig.source_url, as_of: fig.as_of } : null,
    honesty: fig
      ? `The sourced range tops at $${fig.high.toLocaleString()} (${fig.source_url}, as of ${fig.as_of}). ${gap > 0 && (offer.base_salary || 0) + gap > fig.high ? "Your floor sits ABOVE the sourced top of range — a counter to the floor is unlikely to land on base; expect to decide between a partial close and walking." : "A counter toward the floor is inside the sourced range — it is a defensible ask."}`
      : "No sourced benchmark figure exists for this company, so no claim is made about how likely a counter is to land — the math above is your floor against their numbers only.",
    walk_framing: "Walking is rational IF: the gap survives their best counter AND you have a live alternative or can extend your search. It is not rational as a bluff — never threaten to walk unless you will.",
    disclaimer: DISCLAIMER,
  };
}

// ---------- SC-213 equity explainer (scenario arithmetic, never a prediction) ----------
function equityScenarios(offer) {
  const eq = (offer && offer.equity) || {};
  const timeline = eq.vest_years ? {
    vest_years: eq.vest_years, cliff: eq.cliff || null,
    plain: `Vesting over ${eq.vest_years} years${eq.cliff ? ` with a ${eq.cliff} cliff` : ""}: before the cliff you own nothing vested; after it, vesting proceeds on the schedule in the grant paperwork (the letter does not state the cadence — ask for it). Leaving before a vest date forfeits the unvested part.`,
  } : { vest_years: null, cliff: null, plain: "The letter states no vesting period — ask for the vesting schedule in writing before valuing anything." };
  if (eq.grant_value != null && eq.vest_years) {
    const perYear = Math.round(eq.grant_value / eq.vest_years);
    const scenarios = [0, 0.5, 1, 2].map((m) => ({
      label: m === 0 ? "Company value falls / grant repriced to zero" : m === 1 ? "Grant value holds exactly as stated" : `Grant value × ${m}`,
      total_if_fully_vested: Math.round(eq.grant_value * m), per_year_average: Math.round(perYear * m),
      note: "Hypothetical arithmetic on the letter's stated grant value — NOT a prediction of the stock price.",
    }));
    return { status: "VALUED_BY_LETTER", kind: eq.type || "equity", grant_value: eq.grant_value, timeline, scenarios,
      plain: `This grant's value is stated IN the letter: $${eq.grant_value.toLocaleString()} total, ≈ $${perYear.toLocaleString()}/yr if it holds its stated value and you vest fully. Real value moves with the share price between grant and sale, and you only keep what vests while you are employed.`, disclaimer: DISCLAIMER };
  }
  if (eq.shares != null || eq.type) {
    return { status: "UNVALUED", kind: eq.type || "equity", shares: eq.shares || null, timeline, scenarios: [],
      plain: `This grant is ${eq.shares ? eq.shares.toLocaleString() + " " : ""}${eq.type || "equity"} with NO share price and NO grant value in the letter — so no honest dollar figure exists yet. What decides its worth: (1) the current per-share value (for options, the strike vs the latest valuation), (2) whether the company ever becomes liquid, (3) how much vests before you leave. Ask the recruiter, in writing: the strike/valuation, the total shares outstanding (your %), and the vesting cadence. Until then it is unvalued — not worth $0, and not worth a guessed number either.`,
      questions_for_recruiter: ["What is the current strike price and the latest 409A / board valuation per share?", "How many shares are outstanding in total (so I can compute my percentage)?", "What is the vesting cadence after the cliff — monthly or quarterly?", "Is there an exercise window after leaving, and how long is it? (The tax side of exercising is a CPA question — see the referral in SC-220.)"],
      disclaimer: DISCLAIMER };
  }
  return { status: "NO_EQUITY_STATED", timeline, scenarios: [], plain: "The letter states no equity at all — there is nothing to explain or value.", disclaimer: DISCLAIMER };
}

// ---------- SC-214 signing-bonus pivot (when base won't move) ----------
function signingBonusPivot(offer, opts) {
  opts = opts || {}; const gap = Number(opts.gap) || 0;
  const ask = gap > 0 ? gap : 10000;
  const email = `Subject: ${offer.role || "Offer"} — one adjustment that gets me to yes\n\nHi [Recruiter name],\n\nThank you again — I've thought hard about the package. I understand base is set by the band and I respect that. The one adjustment that gets me to a signed yes: a signing bonus of $${((offer.signing_bonus || 0) + ask).toLocaleString()} (an increase of $${ask.toLocaleString()} over the current $${(offer.signing_bonus || 0).toLocaleString()}). It closes my year-1 gap without changing the band, and it's a one-time cost rather than a recurring one.\n\nIf we can do that, I'm ready to sign and stop my other processes.\n\nWith appreciation,\n[Your name]`;
  const call = `OPEN: "I want to say yes. Base being band-fixed, I went looking for the lever that doesn't break your band."\nASK: "A signing increase of $${ask.toLocaleString()} — to $${((offer.signing_bonus || 0) + ask).toLocaleString()} total — closes my year-1 gap. One-time cost, no band change."\nIF PUSHED: "If signing can't reach it either, a written 6-month review with a defined adjustment is my fallback — but signing is the clean yes."\nCLOSE: "Get me that in writing and I sign the same day."`;
  return { ask_increase: ask, new_signing_total: (offer.signing_bonus || 0) + ask, scripts: { email, call },
    why_it_works: "Signing bonuses are one-time costs, so comp teams can often approve them where a base move (which compounds and breaks the band) is impossible. It fixes year 1 only — say so honestly and keep the 6-month review as the annualized fallback.",
    card: card("signing_bonus_pivot_email", `Signing-bonus pivot for ${offer.company || "offer"} — review before anything sends`, email), disclaimer: DISCLAIMER };
}

// ---------- SC-215 internship return-offer conversion ----------
function returnOfferConversion(offer, bench, opts) {
  opts = opts || {}; const outcomes = opts.outcomes || [];
  const fig = bench && bench.figures && bench.figures[0];
  return {
    kind: "return_offer_conversion", company: offer.company || null,
    ask_before_signing: [
      "Team placement: which team, and is placement decided before or after I sign?",
      "Level and title in writing, and the exact comp breakdown (base / signing / bonus / equity + vesting).",
      `Start date and any flexibility; the decision deadline in writing (this letter says ${offer.expiry_date || "no expiry parsed — get it in writing"}).`,
      "What happens to the offer if I need to renege for grad school / a visa change — ask, don't assume.",
      "Can I speak with a converted intern from last summer before deciding?",
    ],
    conversion_play: [
      "Thank the team in writing within 24 hours — your manager and mentor personally, naming the work (your outcomes below are the material).",
      "Benchmark BEFORE reacting: " + (fig ? `the sourced figure on file is $${fig.low.toLocaleString()}–$${fig.high.toLocaleString()} — read its own words before using it: "${s(fig.figure_text).slice(0, 160)}" (${fig.source_url}, as of ${fig.as_of}). If that figure is for a different level than this offer, it is context, NOT your anchor — your anchor is your internship outcomes below. Your base is $${(offer.base_salary || 0).toLocaleString()}.` : "no sourced figure exists in this company's CIR — anchor on your internship outcomes and any competing offer, never an invented market number."),
      "Your leverage is real but perishable: shipped internship work + a team that already wants you. Use it once, warmly, with one concrete ask — not a sequence of asks.",
      "Never accept verbally on the spot; every counter goes out on an approval card.",
    ],
    your_counter_evidence: outcomes,
    card: card("return_offer_thankyou", `Return-offer thank-you + questions for ${offer.company || "offer"} — review before anything sends`,
      `Subject: Thank you — and a few questions before I sign\n\nHi [Manager name],\n\nThank you for the return offer — working with this team this summer was the strongest part of my year, especially ${outcomes[0] || "the project I shipped"}. Before I sign, could you help me with: my team placement, the decision deadline in writing, and a short call with a converted intern from last summer?\n\nI'm excited to land this — I just want to sign with clear eyes.\n\nBest,\n[Your name]`),
    disclaimer: DISCLAIMER,
  };
}

// ---------- SC-216 comp-expectation answer mid-process ----------
function compExpectationAnswer(bench) {
  const fig = bench && bench.figures && bench.figures[0];
  if (!fig) return { status: "NO_SOURCED_FIGURE", wording: null,
    fallback: "\"I'm focused on the role and the team first. I don't have a sourced range for this company that I'd want to anchor on — could you share the band budgeted for this level? I'll be transparent that I want to land inside a fair band for the level.\"",
    note: "This company's CIR publishes no figure, so no range is quoted — inventing one would be exactly the anchor mistake this scenario tests.", disclaimer: DISCLAIMER };
  const wording = `"Based on the published range for this role — $${fig.low.toLocaleString()}–$${fig.high.toLocaleString()} (source: ${fig.source_url}, as of ${fig.as_of}) — I'd expect a package in that band for this level, and I'm flexible on how it's composed across base, signing and equity once we get there."`;
  return { status: "OK", wording, figure: fig,
    card: card("comp_expectation_reply", `Comp-expectation reply for ${bench.company || "this process"} — approve the wording before it is used`, wording, "recruiter (channel confirmed on the card)"),
    note: "Range is quoted ONLY from the CIR figure with its source + date. The wording keeps composition flexible so it does not anchor base alone.", disclaimer: DISCLAIMER };
}

// ---------- SC-217 exploding-offer (48h) pressure plan ----------
function pressurePlan(offer, opts) {
  opts = opts || {}; const now = opts.now ? Date.parse(opts.now) : Date.now();
  const exp = offer.expiry_date ? Date.parse(offer.expiry_date + "T00:00:00Z") : null;
  const hoursLeft = exp != null ? Math.round((exp - now) / 3600000) : null;
  return {
    kind: "exploding_offer", company: offer.company || null, expiry_date: offer.expiry_date || null, hours_left_at_plan: hoursLeft,
    same_day_sequence: [
      "Hour 0–1: parse the offer into the log (done), screenshot/save the letter, and tell the recruiter IN WRITING that you received it and are reviewing carefully — this creates a paper trail without accepting anything.",
      "Hour 1–3: benchmark from the CIR (sourced figures only) and run the total-comp math; list the 3 questions whose answers could change your decision.",
      "Hour 3–5: send the extension request (card-gated draft) asking for a standard review window (a week) and naming a concrete reason — school / family / counsel review. Exploding deadlines soften most often when the ask is specific and polite.",
      "Same day: notify any other live process that a deadline exists (honest leverage, SC-218 wording) — only processes that are real.",
      "Before expiry minus 6 hours: decide on the WRITTEN terms only. If an extension is promised verbally, ask for it by email before relying on it.",
    ],
    do_not: ["Do not accept verbally under time pressure — a verbal yes you renege on burns the bridge and possibly worse.", "Do not invent a competing offer to counter the pressure.", "Do not let the deadline lapse silently — either an extension, an acceptance, or a warm decline lands before it."],
    note: "A 48-hour deadline is a pressure tactic, not a law of nature — but treat the date as real until an extension exists in writing.", disclaimer: DISCLAIMER,
  };
}

// ---------- SC-218 competing-deadline leverage (honest only) ----------
function leverageScript(offer, competing) {
  if (!competing || !competing.company || !competing.expiry_date) {
    return { status: "REFUSED_NO_REAL_COMPETING_OFFER", script: null,
      note: "No real competing offer with a stored deadline was supplied, so no leverage script is written. Inventing a competing deadline is a fabrication — if the other process is real, parse its letter into the log first and this script writes itself from those stored facts." };
  }
  const body = `Subject: Timeline update on my side\n\nHi [Recruiter name],\n\nI want to be transparent because ${offer.company || "your team"} is my first choice: I hold another offer (from ${competing.company}) with a decision deadline of ${competing.expiry_date}. I'd much rather land here. If we can get to terms I'm comfortable signing — [your concrete ask] — before that date, I'll sign here and close the other process the same day.\n\nThank you for working with me on the timing,\n[Your name]`;
  return { status: "OK", script: body, competing_facts_used: { company: competing.company, expiry_date: competing.expiry_date },
    honesty_checks: { competing_offer_exists_in_log: true, deadline_is_the_stored_one: true, first_choice_claim_must_be_true: "Only send if this company genuinely is your first choice — the script's power is that every word is checkable." },
    card: card("leverage_email", `Competing-deadline note to ${offer.company || "offer"} — review before anything sends`, body), disclaimer: DISCLAIMER };
}

// ---------- SC-220 tax / legal referred out ----------
const TAX_LEGAL_RE = /tax|withhold|1099|w-?2|equity.*(exercise|strike|iso|nso|amt)|non-?compete|non-?solicit|arbitration|severance|visa|immigration|signing bonus.*clawback|clawback|intellectual property assignment|ip assignment/i;
function referralOut(text) {
  const q = s(text);
  if (!TAX_LEGAL_RE.test(q)) return { referred: false, note: "No tax/legal trigger detected in the question." };
  return {
    referred: true, answered: false,
    label: "This is a tax/legal question about your offer. It is REFERRED OUT — the agent does not answer tax or legal specifics, and anything below is logistics, not advice.",
    refer_to: [
      { who: "Employment lawyer (licensed in the state where you'll work)", for: "non-compete / non-solicit, IP assignment, arbitration, severance, clawback and any clause that survives employment" },
      { who: "CPA or tax advisor (ideally one who handles equity comp)", for: "option exercise timing, ISO/NSO and AMT exposure, withholding on bonuses, multi-state tax" },
    ],
    bring: ["The full offer letter AND every attachment/exhibit (the binding terms are usually in the attachments)", "The equity plan document and your grant notice", "Your deadline date — tell them the expiry up front; both professionals triage by deadline", "This exact question, written down, plus what decision it changes"],
    while_you_wait: "Do not sign, exercise anything, or let the deadline lapse silently while waiting: if the deadline is tight, send the card-gated extension request (it needs no legal input) and tell the recruiter counsel is reviewing — a normal, expected sentence.",
    disclaimer: DISCLAIMER,
  };
}

module.exports = { adaptCir, researchTalkPrep, teachingDemoPrep, portfolioWalkthrough, hiringManagerBrief, barRaiserPrep, belowFloorAnalysis, equityScenarios, signingBonusPivot, returnOfferConversion, compExpectationAnswer, pressurePlan, leverageScript, referralOut, DISCLAIMER };
