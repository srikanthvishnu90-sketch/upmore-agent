/* Payroll, benefits and equity PREPARATION surfaces (cluster K10: C101, C103, C108, C159, C172, C184, C196,
   C202, C204). Portal rails (payroll, benefits, FSA administrator, equity platform, PSLF servicer) are not
   wired, so tonight's finish line is the preparation surface: the search workflow, the claim packet, the
   audit math, the filled form lines and the deadline checklist — each computed in code from the person's
   facts passed in, each ending with the owner's own submission step stated plainly. Nothing here files,
   submits, enrolls, changes a payroll record or moves money, and no account number is ever asked for in chat.
   Reference rules and official sources: packages/offers/payroll-reference.json (PAYROLL_REF_JSON in the
   router bundle), each with a checked date. Pure: facts, reference data and today are passed in.
   Tests: tests/k10-payroll.test.cjs, tests/edge/k10-payroll-transcript.test.ts. */
const PayrollBenefits = (() => {
  const money = (c) => { const v = Math.round(c); const neg = v < 0; const a = Math.abs(v); return `${neg ? "-" : ""}$${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`; };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const nice = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}, ${s.slice(0, 4)}` : String(s || "");
  const addDays = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  const addMonths = (s, n) => { const [y, m] = s.split("-").map(Number); const t = (y * 12 + (m - 1)) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
  const monthName = (ym) => `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
  const src = (ref, id) => ((ref && ref.sources) || []).find((x) => x.id === id);
  const STANDIN = "Stand-in data: these are example facts, not your employer's or your accounts — a live run needs your employer, plan and pay-stub details (named in my notes).";

  function validate(ref) {
    const problems = [];
    if (!ref || !/^\d{4}-\d{2}-\d{2}$/.test(ref.checked_on || "")) problems.push("payroll reference: checked_on must be a date");
    if (!ref || ref.rules.b83_window_days !== 30) problems.push("payroll reference: the 83(b) window is 30 days by statute");
    if (!ref || ref.rules.pslf_required_payments !== 120) problems.push("payroll reference: PSLF requires 120 qualifying payments");
    if (!ref || ref.rules.dcfsa_household_cap_cents !== 500000) problems.push("payroll reference: dependent care FSA household cap must be $5,000");
    for (const s of (ref && ref.sources) || []) {
      if (!s.id || !s.title || !/^https:\/\//.test(s.url || "") || !/^\d{4}-\d{2}-\d{2}$/.test(s.checked_on || "")) problems.push(`payroll reference source ${s.id || "?"}: id, title, https url and checked date`);
    }
    return problems;
  }

  // ---- what the person is asking: one capability per message, most specific first ----
  function kind(message) {
    const t = String(message || "").toLowerCase();
    if (!t.trim()) return null;
    if (/dependent care fsa|daycare fsa|childcare fsa/.test(t)) return "C184";
    if (/forgotten 401|old 401|first job.*401|find.*401\(k\)|401\(k\) at my/.test(t)) return "C101";
    if (/\bfsa claims?\b|submit my fsa|file my fsa/.test(t)) return "C103";
    if (/benefits audit|leaving money on the table at work|am i leaving money/.test(t)) return "C108";
    if (/w-?4|withholding|interest-free loan|refund was \$/.test(t)) return "C159";
    if (/pslf|public service loan forgiveness/.test(t)) return "C172";
    if (/direct deposit|split my paycheck|split my pay\b/.test(t)) return "C196";
    if (/open enrollment|pick my benefits|choose my benefits|benefits for next year/.test(t)) return "C202";
    if (/equity (?:grant|plan|paper|comp)|my equity|83\(b\)|rsus?\b|grants? becoming tax|paper chase/.test(t)) return "C204";
    return null;
  }

  // ---- C101: forgotten 401(k)s — search workflow over the official sources, balances only from facts ----
  function c101(p, ref) {
    const accts = p.oldAccounts || [];
    const total = accts.reduce((s, a) => s + a.balanceCents, 0);
    const lines = [];
    if (accts.length) {
      lines.push(`Found ${accts.length} old account${accts.length > 1 ? "s" : ""} on the facts you gave me, totaling ${money(total)}:`);
      for (const a of accts) lines.push(`${a.employer} (${a.years}) ${a.plan} at ${a.administrator}: ${money(a.balanceCents)}.`);
    } else lines.push("No old-account balances are on file yet, so I won't invent any — here is the exact search workflow:");
    lines.push(`1) Search the ${src(ref, "nrurb").title} (free) under every prior employer name. 2) Check the ${src(ref, "ebsa-abandoned").title.split("—")[1].trim()} resources for terminated plans. 3) Check ${src(ref, "pbgc").title} for any pension. 4) Search each state you lived in on its unclaimed-property site.`);
    lines.push(accts.length ? "Next step is yours to approve: I can prepare the rollover packet for these balances — the rollover itself runs through the custodians after your yes, and I never move retirement money on a stand-in record." : "Tell me a prior employer's name and years and I'll run this workflow against it.");
    return lines.join(" ");
  }

  // ---- C103: FSA claim packet — eligible only, deadline countdown, spend-down for the rest ----
  function c103(p, ref, today) {
    const f = p.fsa; if (!f) return "I don't have your FSA balance or plan year yet — I need the administrator name, your balance and the plan-year end date before I can build a claim packet.";
    const eligible = (f.expenses || []).filter((e) => e.eligible), blocked = (f.expenses || []).filter((e) => !e.eligible);
    const claim = eligible.reduce((s, e) => s + e.amountCents, 0);
    const days = daysBetween(today, f.planYearEnd);
    const lines = [`FSA claim packet ready: ${eligible.length} eligible expenses totaling ${money(claim)} — ${eligible.map((e) => `${e.label} ${money(e.amountCents)}`).join("; ")}. Submit these to your FSA administrator with the receipts; you file, I prepare.`];
    for (const b of blocked) lines.push(`Left out: ${b.label} ${money(b.amountCents)} — ${b.why}; claiming it without that would risk a denied claim.`);
    lines.push(`Your balance is ${money(f.balanceCents)} and the plan year ends ${nice(f.planYearEnd)} — ${days} days left. After this packet, ${money(f.balanceCents - claim)} is still at risk: spend-down plan — book eligible care before ${nice(f.planYearEnd)} or check whether your plan allows a grace period or carryover (per ${src(ref, "irs-pub969").title}, checked ${ref.checked_on}).`);
    return lines.join(" ");
  }

  // ---- C108: benefits audit — match, ESPP, legal, gym, commuter, each in dollars ----
  function matchAt(p, pct) {
    let match = 0, prev = 0;
    for (const tier of p.benefits.matchTiers) { const span = Math.max(0, Math.min(pct, tier.upToPct) - prev); match += p.salaryCents * (span / 100) * tier.rate; prev = tier.upToPct; }
    return Math.round(match);
  }
  function c108(p) {
    const b = p.benefits, topPct = b.matchTiers[b.matchTiers.length - 1].upToPct;
    const now = matchAt(p, b.contributionPct), full = matchAt(p, topPct), missing = full - now;
    const esppContrib = Math.round(p.salaryCents * b.esppProposedPct / 100);
    const esppGain = Math.round(esppContrib / (1 - b.esppDiscount)) - esppContrib;
    const commuterYear = b.commuterMonthlyCents * 12, commuterSave = Math.round(commuterYear * p.marginalRate);
    const total = missing + esppGain + b.legalBenefitCents + b.gymBenefitCents + commuterSave;
    return `Benefits audit on your pay facts: you're leaving ${money(total)} a year on the table. 401(k) match: at ${b.contributionPct}% you get ${money(now)} of match; at ${topPct}% you'd get the full ${money(full)} — ${money(missing)} a year missed. ESPP: not enrolled; at ${b.esppProposedPct}% of pay (${money(esppContrib)}) with the ${Math.round(b.esppDiscount * 100)}% discount, the discount alone is worth ${money(esppGain)} a year if you sold at purchase — shares can fall, that's the risk. Prepaid legal benefit unused: ${money(b.legalBenefitCents)} of value. Gym benefit unused: ${money(b.gymBenefitCents)} a year. Commuter benefit: ${money(commuterYear)} a year pre-tax saves about ${money(commuterSave)} at your ${Math.round(p.marginalRate * 100)}% federal marginal rate. Enrollments happen in your benefits portal — I'll prepare each one, you submit.`;
  }

  // ---- C159: W-4 worksheet — exact form lines from the refund and marginal rate ----
  function c159(p) {
    const refund = p.w4.lastRefundCents;
    if (!refund || refund <= 0) return "Your last refund was $0.00 on the facts I have, so there's no over-withholding to fix — changing your W-4 would just shrink each paycheck and create a bill in April. No change prepared.";
    const perPay = Math.round(refund / p.payPeriodsPerYear), perMonth = Math.round(refund / 12);
    const line4b = Math.round(refund / p.marginalRate);
    return `W-4 worksheet ready for your review — you file it with your employer, never the IRS, and I don't submit it. Your ${money(refund)} refund is about ${money(perMonth)} a month lent interest-free. Corrected form lines: Step 1 — your name, address and filing status as on your last return. Step 3 — leave as-is unless your dependents changed. Step 4(b) — Deductions: ${money(line4b)} (that's the refund divided by your ${Math.round(p.marginalRate * 100)}% marginal rate: ${money(refund)} / ${p.marginalRate} = ${money(line4b)}). Step 4(c) — extra withholding: $0. Expected result if your pay stays the same: about ${money(perPay)} more per paycheck (${p.payPeriodsPerYear} pay periods), about ${money(perMonth)} a month, and a refund near $0 instead of ${money(refund)}. Check it in the IRS Tax Withholding Estimator before you hand it in (per ${"IRS Form W-4 guidance"}).`;
  }

  // ---- C172: PSLF tracker — count, gaps, ETA, forgiven estimate labeled ----
  function c172(p, ref, today) {
    const s = p.pslf, req = ref.rules.pslf_required_payments;
    if (s.qualifyingPayments >= req) return `PSLF: you have ${s.qualifyingPayments} of ${req} qualifying payments — that's the full count. Next step is the final forgiveness application through your servicer; I can prepare it, you submit.`;
    const left = req - s.qualifyingPayments;
    const eta = monthName(addMonths(today.slice(0, 7), left));
    const paid = left * s.monthlyPaymentCents;
    const forgiven = Math.max(0, s.balanceCents - paid);
    const gaps = (s.uncertifiedMonths || []).length ? ` Gap flagged: ${s.uncertifiedMonths.join(", ")} have no employer certification on file — those months don't count until the form is filed, so certify now rather than at the end.` : " No certification gaps on file.";
    return `PSLF tracker: ${s.qualifyingPayments} of ${req} qualifying payments counted on your ${money(s.balanceCents)} balance, ${left} to go at ${money(s.monthlyPaymentCents)} a month. If every payment from here qualifies, the ${req}th lands in ${eta} and roughly ${money(forgiven)} would be forgiven (estimate: today's balance minus ${money(paid)} of payments; interest changes it).${gaps} Last certification on file: ${nice(s.lastCertification)} — certify employment every year (per ${src(ref, "pslf").title}). I track and prepare the forms; you submit them.`;
  }

  // ---- C184: dependent care FSA — capped election, tax saving, receipts packet ----
  function c184(p, ref) {
    const d = p.dcfsa, cap = ref.rules.dcfsa_household_cap_cents;
    const election = Math.min(d.proposedElectionCents, cap);
    const capped = d.proposedElectionCents > cap;
    const rate = p.marginalRate + p.ficaRate;
    const saving = Math.round(election * rate);
    const annual = d.childcareMonthlyCents * 12;
    return `Dependent care FSA packet ready: elect ${money(election)} for the year${capped ? ` — capped at the ${money(cap)} household limit (per ${src(ref, "irs-pub503").title})` : ""}. Your care runs ${money(d.childcareMonthlyCents)} a month (${money(annual)} a year), so the full election gets used. Tax saving: ${money(saving)} a year (${Math.round(p.marginalRate * 100)}% federal + ${p.ficaRate * 100}% FICA on ${money(election)}). Claims packet: ${money(d.receiptsOnFileCents)} of provider receipts on file, ready to submit with the provider's name, the dates of care and who was cared for — no SSN in chat, ever; that goes only in the administrator's own form. Enrollment is at open enrollment in your benefits portal: I prepare, you submit. Use it or lose it — anything unspent at plan-year end is gone.`;
  }

  // ---- C196: direct deposit change PREPARED only — split math, owner submits ----
  function c196(p, splitCents, monthlyCents) {
    const split = monthlyCents != null ? Math.round(monthlyCents * 12 / p.payPeriodsPerYear) : (splitCents == null ? 25000 : splitCents);
    if (split <= 0) return "A $0.00 split changes nothing — tell me the amount per paycheck and I'll prepare the form.";
    if (split >= p.netPayCents) return `That split (${money(split)} a paycheck) is at or above your whole net pay of ${money(p.netPayCents)} a paycheck, so I won't prepare it — the remainder has to stay positive. Give me a smaller amount.`;
    const rest = p.netPayCents - split, monthlyAvg = Math.round(split * p.payPeriodsPerYear / 12);
    const lead = monthlyCents != null ? `You asked for ${money(monthlyCents)} a month: on ${p.payPeriodsPerYear} paychecks a year that's ${money(split)} a paycheck, averaging ${money(monthlyAvg)} a month.` : `${money(split)} a paycheck averages ${money(monthlyAvg)} a month.`;
    return `Direct deposit change PREPARED — not submitted. I don't change where your pay goes; you enter this in your payroll portal, and never paste account or routing numbers in chat. ${lead} Prepared form: per paycheck (net ${money(p.netPayCents)}) — ${money(split)} to the new savings account, ${money(rest)} to your current checking. Check the math: ${money(split)} + ${money(rest)} = ${money(p.netPayCents)}. Steps: payroll portal, then Pay or Direct Deposit, then Add account, enter the numbers from the bank's own page, set the fixed amount of ${money(split)}, save, and check the split on the next stub — I'll watch for it and flag it if the first paycheck doesn't split.`;
  }

  // ---- C202: open enrollment — total-cost math per plan from actual usage ----
  function c202(p) {
    const rows = p.enrollment.plans.map((pl) => {
      const premium = pl.premiumMonthlyCents * 12;
      const usage = (pl.costs || []).reduce((s, c) => s + c.amountCents, 0);
      const hsa = pl.employerHsaCents || 0;
      return { name: pl.name, premium, usage, hsa, total: premium + usage - hsa, maxOop: pl.maxOopCents, detail: (pl.costs || []).map((c) => `${c.label} ${money(c.amountCents)}`).join("; ") };
    });
    const sorted = [...rows].sort((a, b) => a.total - b.total), best = sorted[0], worst = sorted[sorted.length - 1];
    const parts = rows.map((r) => `${r.name}: premiums ${money(r.premium)} + your usage ${money(r.usage)}${r.hsa ? ` − employer HSA ${money(r.hsa)}` : ""} = ${money(r.total)} for the year (worst case with the out-of-pocket max: ${money(r.premium + r.maxOop - r.hsa)})`);
    return `Open enrollment math on your actual usage, not a recommendation — the numbers: ${parts.join(". ")}. On last year's usage the ${best.name} costs least at ${money(best.total)}, saving ${money(worst.total - best.total)} versus the ${worst.name}. Usage behind it (${best.name}): ${best.detail}. The trade-off in one line: the cheapest-on-your-usage plan carries the highest worst case above, so if a big hospital year is likely, weigh that, not just the total. Elections go in your benefits portal before the deadline — I prepare the picks, you submit, and we capture the confirmation together.`;
  }

  // ---- C204: equity paper chase — vest schedule, 83(b) clock loud and early ----
  function c204(p, ref, today) {
    const e = p.equity, deadline = addDays(e.isoGrantDate, ref.rules.b83_window_days);
    const left = daysBetween(today, deadline);
    const lines = [`Equity paper chase — checklist with deadlines: RSUs: ${e.rsuSharesTotal.toLocaleString("en-US")} shares total, ${e.rsuPerVest} vest next on ${nice(e.nextVest)}; check withholding at vest — the default rate often under-withholds, that's the usual tax surprise.`];
    if (e.b83Filed) lines.push(`83(b): filed, confirmed on the checklist.`);
    else if (left < 0) lines.push(`83(b): the 30-day deadline for the ${nice(e.isoGrantDate)} grant was ${nice(deadline)} — it has passed and it cannot be extended or backdated. Do not backdate anything; take this to a tax professional before the next grant.`);
    else lines.push(`83(b) WARNING: ISO grant ${nice(e.isoGrantDate)} (${e.isoShares.toLocaleString("en-US")} shares) — the election is due ${nice(deadline)}, ${left} days from today (${today}). The 30-day clock is statutory and cannot be extended (per ${src(ref, "irs-83b").title}). The filing step is yours: sign, mail with proof of mailing, keep the stamped copy — I track the clock and the checklist, I don't file it.`);
    lines.push(`ESPP: enrollment closes ${nice(e.esppEnrollBy)} — decide before then. Every deadline above stays on your tracker until you tell me it's done.`);
    return lines.join(" ");
  }

  function answer(message, ctx) {
    const c = ctx || {}, p = c.profile, ref = c.ref, today = c.today || "2026-10-12";
    const id = kind(message);
    if (!id) return null;
    if (!p || !ref) return { id, text: "I don't have the facts or the reference data loaded for that yet, so I won't guess at payroll or benefits numbers." };
    const problems = validate(ref);
    if (problems.length) return { id, text: "My payroll reference data failed its own checks, so I won't quote it. It needs a refresh before any numbers." };
    let text;
    if (id === "C101") text = c101(p, ref);
    else if (id === "C103") text = c103(p, ref, today);
    else if (id === "C108") text = c108(p);
    else if (id === "C159") text = c159(p);
    else if (id === "C172") text = c172(p, ref, today);
    else if (id === "C184") text = c184(p, ref);
    else if (id === "C196") { const raw = String(message); const m = raw.match(/\$\s?(\d[\d,]*(?:\.\d{2})?)/); const cents = m ? Math.round(parseFloat(m[1].replace(/,/g, "")) * 100) : undefined; text = /a month|per month|\/mo\b/i.test(raw) && cents != null ? c196(p, undefined, cents) : c196(p, cents); }
    else if (id === "C202") text = c202(p);
    else text = c204(p, ref, today);
    return { id, text: `${text} ${STANDIN} From stand-in pay and plan facts, as of ${nice(today)}.` };
  }
  return { kind, answer, validate, matchAt, STANDIN };
})();
if (typeof module !== "undefined") module.exports = PayrollBenefits;
