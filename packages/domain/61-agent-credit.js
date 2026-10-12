  /* Credit (Instinct spec doc 02 CRDT-001/002/003/004/005/006/007/011/012/014/015/016):
     functions over the rows a bureau or servicer connector supplies: score history,
     a report snapshot (accounts, inquiries, public records), loans and offers. Score
     monitoring with bands and drops, the plain-English walkthrough, factor
     explanations with the user's own numbers, the utilization plan, new-account
     impact in honest ranges, hard-inquiry alerts against known applications, the
     refinance breakeven, student-loan program checks against a dated rules table,
     freeze guidance, the authorized-user explainer, dispute and collector letters
     with no identity number in them. Nothing here pulls a report or files anything;
     drafts are handed to the user. Pure. */
  const AgentCredit = (() => {
    const DAY = 86400000;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const ymd = s => String(s || "").slice(0, 10);
    const dayMs = s => Date.parse(ymd(s) + "T00:00:00Z");
    const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);
    const monthsBetween = (a, b) => Math.max(0, Math.floor(daysBetween(a, b) / 30.44));
    const divRound = (n, d) => { const q = Math.trunc(n / d), r = n - q * d; return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q; };
    const mask = s => { const d = String(s || "").replace(/\D/g, ""); return d.length >= 4 ? `ending ${d.slice(-4)}` : String(s || "the account"); };
    // Identity digits in anything the person typed (an SSN, spaced or not; a card or account number) never reach a letter.
    const IDNUM = /\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b\d(?:[ -]?\d){8,18}\b/g;
    const redact = s => String(s).replace(IDNUM, "[number removed]");
    const hasIdNum = s => new RegExp(IDNUM.source).test(s);
    // Two calendar years on (Feb 29 goes to Feb 28): what the bureaus mean by "two years", not 730 days.
    const addYears = (s, n) => { const [y, m, d] = ymd(s).split("-").map(Number), last = new Date(Date.UTC(y + n, m, 0)).getUTCDate(); return `${y + n}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`; };

    // CRDT-001: score monitoring. Bands are the FICO ranges; a drop of 10 or more, or a band change, is worth a message.
    const BANDS = [[800, "exceptional"], [740, "very good"], [670, "good"], [580, "fair"], [300, "poor"]];
    const band = s => (BANDS.find(([lo]) => s >= lo) || [0, "poor"])[1];
    function scoreMonitor(history, opts) {
      const o = opts || {}, rows = (history || []).slice().sort((a, b) => ymd(a.on).localeCompare(ymd(b.on)));
      if (!rows.length) return { latest: null, text: "No score on file yet. Connect a bureau or a card that reports one." };
      // A score moves only against the same bureau and model: Equifax VantageScore is not compared with Experian FICO.
      const latest = rows[rows.length - 1], series = rows.filter(r => (r.bureau || null) === (latest.bureau || null) && (r.model || null) === (latest.model || null)), prev = series.length > 1 ? series[series.length - 2] : null;
      const at = days => series.filter(r => daysBetween(ymd(r.on), ymd(latest.on)) >= days).pop() || null;
      const d30 = at(30), d90 = at(90), change = prev ? latest.score - prev.score : null;
      const alert = (change != null && change <= -(o.drop_alert_points || 10)) || (prev && band(prev.score) !== band(latest.score));
      return { latest: { score: latest.score, on: ymd(latest.on), bureau: latest.bureau || null, model: latest.model || null, band: band(latest.score) }, change_since_last: change, change_30d: d30 ? latest.score - d30.score : null, change_90d: d90 ? latest.score - d90.score : null, alert: !!alert, text: `${latest.score} (${band(latest.score)}) as of ${ymd(latest.on)}${latest.bureau ? ` from ${latest.bureau}` : ""}${latest.model ? `, ${latest.model}` : ""}${change != null ? (change === 0 ? `, unchanged since ${ymd(prev.on)}` : `, ${change > 0 ? "up" : "down"} ${Math.abs(change)} since ${ymd(prev.on)}`) : ""}.${alert ? " Worth a look: that is a real move, not noise." : ""}`, source: latest.bureau || "score feed", as_of: ymd(latest.on) };
    }

    // Report helpers: utilization, ages, lates, from the snapshot's own rows.
    function revolving(report) { return (report.accounts || []).filter(a => a.type === "credit_card" && a.status !== "closed"); }
    function utilization(report) { const cards = revolving(report), bal = cards.reduce((s, a) => s + (a.balance_cents || 0), 0), lim = cards.reduce((s, a) => s + (a.limit_cents || 0), 0); return { balance_cents: bal, limit_cents: lim, bps: lim ? divRound(bal * 10000, lim) : null, per_card: cards.map(a => ({ id: a.id, name: a.name || mask(a.number), balance_cents: a.balance_cents || 0, limit_cents: a.limit_cents || 0, bps: a.limit_cents ? divRound((a.balance_cents || 0) * 10000, a.limit_cents) : null })) }; }
    function ages(report, asOf) { const open = (report.accounts || []).filter(a => a.opened_on); const m = open.map(a => monthsBetween(a.opened_on, asOf)); return { oldest_months: m.length ? Math.max(...m) : null, average_months: m.length ? divRound(m.reduce((s, x) => s + x, 0), m.length) : null, count: open.length }; }
    function lates(report) { let n30 = 0, n60 = 0, n90 = 0, last = null; for (const a of report.accounts || []) { const h = a.payment_history || {}; n30 += h.late30 || 0; n60 += h.late60 || 0; n90 += h.late90 || 0; if (h.last_late_on && (!last || h.last_late_on > last)) last = h.last_late_on; } return { late30: n30, late60: n60, late90: n90, last_late_on: last, any: n30 + n60 + n90 > 0 }; }
    function inquiries(report, asOf, months) { return (report.inquiries || []).filter(i => i.kind !== "soft" && monthsBetween(i.on, asOf) < (months || 24)); }

    // CRDT-003: the standard reason codes explained with the user's numbers, not a generic paragraph.
    const FACTORS = {
      high_utilization: r => { const u = utilization(r); return `You are using ${u.bps != null ? pctOf(u.bps) : "?"} percent of your card limits (${money(u.balance_cents)} of ${money(u.limit_cents)}). Under 30 percent helps; under 10 percent helps most. This factor resets every statement, so it recovers fast.`; },
      late_payments: r => { const l = lates(r); return `${l.late30 + l.late60 + l.late90} late payment${l.late30 + l.late60 + l.late90 === 1 ? "" : "s"} on file${l.last_late_on ? `, the latest ${l.last_late_on}` : ""}. Payment history is the largest factor; a late mark fades over about two years and drops off after seven.`; },
      short_history: (r, asOf) => { const a = ages(r, asOf); return `Your oldest account is ${a.oldest_months != null ? Math.floor(a.oldest_months / 12) : "?"} years old and the average is ${a.average_months != null ? Math.round(a.average_months / 12 * 10) / 10 : "?"} years. Nothing speeds this up but time; keeping the oldest card open protects it.`; },
      many_inquiries: (r, asOf) => `${inquiries(r, asOf, 12).length} hard inquiries in the last 12 months. Each costs a few points for up to a year and leaves the report after two; several for one loan within a short window count as one.`,
      few_accounts: r => `${(r.accounts || []).length} accounts on file. Scores like a mix of revolving and installment credit; this is minor and no reason to open an account you do not need.`,
      high_balances: r => { const u = utilization(r); return `Card balances total ${money(u.balance_cents)}. Paying before the statement closes changes what gets reported.`; },
      derogatory: r => { const pr = (r.public_records || []).length, co = (r.collections || []).length; return `${pr} public record${pr === 1 ? "" : "s"} and ${co} collection${co === 1 ? "" : "s"} on file. These weigh most while recent and can be disputed if wrong.`; }
    };
    function factors(report, asOf) { return (report.factors || []).map(f => ({ code: f.code, bureau_text: f.text || null, explanation: FACTORS[f.code] ? FACTORS[f.code](report, asOf || report.as_of) : `${f.text || f.code}: the bureau did not say more, and I will not guess.`, source: report.bureau || "credit report", as_of: asOf || report.as_of || null })); }

    // CRDT-002: the plain-English walkthrough, with what looks off flagged (unknown accounts, closed accounts still reporting a balance, unexplained inquiries).
    // A share in basis points, rounded to a whole percent unless rounding would carry it across the 10 or 30 percent
    // lines people are told about: 29.5 is said "29.5", never "30" next to "under 30 percent helps".
    const pctOf = bps => { const r = Math.round(bps / 100); const crosses = [1000, 3000].some(line => (bps < line) !== (r * 100 < line)); return crosses ? (Math.round(bps / 10) / 10).toFixed(1) : String(r); };
    function walkthrough(report, known) {
      const asOf = report.as_of, u = utilization(report), a = ages(report, asOf), l = lates(report), inq = inquiries(report, asOf, 24), open = (report.accounts || []).filter(x => x.status !== "closed"), closed = (report.accounts || []).filter(x => x.status === "closed");
      // An application list the person gave, even an empty one ("I applied for nothing"), is checked; no list assumes nothing.
      const knownIds = new Set(((known || {}).accounts || []).map(x => x.id)), appsGiven = Array.isArray((known || {}).applications), knownApps = appsGiven ? known.applications : [];
      const off = [];
      for (const x of report.accounts || []) { if (knownIds.size && !knownIds.has(x.id)) off.push({ kind: "unknown_account", id: x.id, text: `${x.name || mask(x.number)} opened ${x.opened_on || "?"} is not an account you told me about. If you do not recognize it, that is a fraud alert, not a credit question.` }); if (x.status === "closed" && (x.balance_cents || 0) > 0) off.push({ kind: "closed_with_balance", id: x.id, text: `${x.name || mask(x.number)} is closed but still reports ${money(x.balance_cents)}; closed-and-paid accounts should show zero.` }); }
      for (const i of inq) if (appsGiven && !knownApps.some(k => Math.abs(daysBetween(k.on, i.on)) <= 14 && (!k.by || String(k.by).toLowerCase() === String(i.by).toLowerCase()))) off.push({ kind: "unexplained_inquiry", on: i.on, by: i.by, text: `A hard inquiry by ${i.by} on ${i.on} matches no application you made.` });
      const sections = [
        { title: "Accounts", text: a.oldest_months != null ? `${open.length} open, ${closed.length} closed. Oldest ${Math.floor(a.oldest_months / 12)} years, average age ${(a.average_months / 12).toFixed(1)} years.` : `${open.length} open, ${closed.length} closed; no opening dates reported.` },
        { title: "Utilization", text: u.bps != null ? `${pctOf(u.bps)} percent: ${money(u.balance_cents)} across ${money(u.limit_cents)} of limits.${((n) => n ? ` ${n === 1 ? "One card is" : `${n} cards are`} above half ${n === 1 ? "its" : "their"} limit, which scores worse than the same balance spread out.` : "")(u.per_card.filter(c => c.bps != null && c.bps > 5000).length)}` : "No revolving limits reported." },
        { title: "Payment history", text: l.any ? `${l.late30} thirty-day, ${l.late60} sixty-day, ${l.late90} ninety-day lates${l.last_late_on ? `; latest ${l.last_late_on}` : ""}.` : "No late payments on file." },
        { title: "Inquiries", text: `${inquiries(report, asOf, 12).length} hard in the last 12 months, ${inq.length} in 24.` },
        { title: "Public records and collections", text: `${(report.public_records || []).length} public records, ${(report.collections || []).length} collections.` }
      ];
      return { bureau: report.bureau || null, as_of: asOf, sections, looks_off: off, text: sections.map(s => `${s.title}: ${s.text}`).join(" ") + (off.length ? ` Worth checking: ${off.map(o => o.text).join(" ")}` : " Nothing looks off."), source: report.bureau || "credit report", summary_numbers: { utilization_bps: u.bps, oldest_months: a.oldest_months, average_months: a.average_months, lates: l, inquiries_12m: inquiries(report, asOf, 12).length } };
    }
    // CRDT-007: hard inquiries that match no application the user made are flagged; same-loan shopping windows are grouped.
    function inquiryAlerts(report, applications) {
      const asOf = report.as_of, out = [];
      for (const i of inquiries(report, asOf, 24)) { const match = (applications || []).find(k => Math.abs(daysBetween(k.on, i.on)) <= 14 && (!k.by || String(k.by).toLowerCase() === String(i.by).toLowerCase())); if (!match) { const off = addYears(i.on, 2); out.push({ on: i.on, by: i.by, falls_off: off, text: `Hard inquiry by ${i.by} on ${i.on} that matches nothing you applied for. If you did not apply, that can be identity fraud: freeze your reports (I have the links) and dispute it. It leaves the report by ${off} either way.` }); } }
      return { alerts: out, count: out.length, source: report.bureau || "credit report", as_of: asOf };
    }
    // CRDT-005: the utilization plan: the cheapest set of pay-downs to bring every card and the total under the target before statements close.
    function utilizationPlan(report, target_bps, cash_available_cents) {
      const t = target_bps || 3000, u = utilization(report), moves = [];
      for (const c of u.per_card) { if (c.limit_cents && c.bps > t) moves.push({ id: c.id, name: c.name, pay_cents: c.balance_cents - divRound(c.limit_cents * t, 10000), from_bps: c.bps, statement_on: ((report.accounts || []).find(a => a.id === c.id) || {}).statement_on || null }); }
      const perCard = moves.reduce((s, m) => s + m.pay_cents, 0), totalNeed = u.limit_cents ? Math.max(0, u.balance_cents - divRound(u.limit_cents * t, 10000)) : 0, extra = Math.max(0, totalNeed - perCard);
      if (extra > 0) { const biggest = u.per_card.filter(c => !moves.some(m => m.id === c.id)).sort((a, b) => b.balance_cents - a.balance_cents)[0]; if (biggest) moves.push({ id: biggest.id, name: biggest.name, pay_cents: extra, from_bps: biggest.bps, note: "brings the total under the target" }); }
      const total = moves.reduce((s, m) => s + m.pay_cents, 0), affordable = cash_available_cents == null || total <= cash_available_cents;
      return { target_bps: t, now_bps: u.bps, moves, total_cents: total, affordable, text: moves.length ? `To get under ${Math.round(t / 100)} percent: ${moves.map(m => `pay ${money(m.pay_cents)} on ${m.name}${m.statement_on ? ` before ${m.statement_on}` : ""}`).join("; ")}. Total ${money(total)}.${affordable ? "" : ` That is more than the ${money(cash_available_cents)} you have free; the first move alone still helps.`} Pay before the statement closes: that is the balance the bureaus see.` : `You are already under ${Math.round(t / 100)} percent.`, source: report.bureau || "credit report", as_of: report.as_of };
    }
    // CRDT-006: what opening an account does, in honest ranges from the user's own report.
    function newAccountImpact(report, kind, limit_cents) {
      const a = ages(report, report.as_of), u = utilization(report), n = a.count;
      const newAvg = n != null && a.average_months != null ? divRound(a.average_months * n, n + 1) : null;
      const newUtil = kind === "credit_card" && limit_cents && u.limit_cents ? divRound(u.balance_cents * 10000, u.limit_cents + limit_cents) : null;
      const parts = [`A hard inquiry: a few points for up to a year, gone from the report in two.`, newAvg != null ? `Average account age drops from ${(a.average_months / 12).toFixed(1)} to ${(newAvg / 12).toFixed(1)} years; it recovers as the account ages.` : "", newUtil != null ? `Utilization falls from ${pctOf(u.bps)} to ${pctOf(newUtil)} percent once the new limit reports, which helps.` : "", kind === "loan" ? "An installment loan adds mix and a new balance; the balance matters more than the mix." : ""].filter(Boolean);
      return { kind, inquiry: true, average_age_months_before: a.average_months, average_age_months_after: newAvg, utilization_bps_before: u.bps, utilization_bps_after: newUtil, text: parts.join(" ") + " Exact point changes are not published; these are the directions and the mechanisms.", source: report.bureau || "credit report", as_of: report.as_of };
    }
    // CRDT-011: refinance watch. Monthly payment at each offer, the saving, the breakeven on closing costs, the interest difference over the remaining term.
    const payment = (principal_cents, apr_bps, months) => { if (!apr_bps) return divRound(principal_cents, months); const r = apr_bps / 120000; const f = Math.pow(1 + r, months); return Math.round(principal_cents * r * f / (f - 1)); };
    function refinanceWatch(loan, offers) {
      const cur = payment(loan.balance_cents, loan.apr_bps, loan.months_left), rows = (offers || []).map(o => { const months = o.months || loan.months_left, p = payment(loan.balance_cents, o.apr_bps, months), saving = cur - p, costs = o.closing_costs_cents || 0, breakeven = saving > 0 ? Math.ceil(costs / saving) : null, totalCur = cur * loan.months_left, totalNew = p * months + costs; return { lender: o.lender, apr_bps: o.apr_bps, months, payment_cents: p, monthly_saving_cents: saving, closing_costs_cents: costs, breakeven_months: breakeven, total_cost_difference_cents: totalNew - totalCur, worth_it: saving > 0 && breakeven != null && breakeven < Math.min(months, loan.months_left) && totalNew < totalCur, as_of: o.as_of || null }; }).sort((a, b) => a.total_cost_difference_cents - b.total_cost_difference_cents);
      const best = rows.find(r => r.worth_it) || null;
      return { current: { apr_bps: loan.apr_bps, payment_cents: cur, months_left: loan.months_left }, offers: rows, best, text: best ? `${best.lender} at ${(best.apr_bps / 100).toFixed(2)} percent: ${money(best.payment_cents)} a month, ${money(best.monthly_saving_cents)} less; the ${money(best.closing_costs_cents)} costs pay back in ${best.breakeven_months} months and you come out ${money(-best.total_cost_difference_cents)} ahead over the term. Rates move; this is as of ${best.as_of || "the quote"}.` : rows.length ? "No offer beats your current loan once costs and the term are counted." : "No offers to compare yet.", source: "your loan and the quotes you gave me", as_of: loan.as_of || null };
    }
    // CRDT-012: student loan programs checked structurally against a dated rules table. The answer is likely, unlikely or needs a check; the servicer decides.
    const PROGRAM_RULES = { as_of: "2026-10", source: "studentaid.gov program pages; structural conditions only, verify with the servicer", programs: [
      { id: "pslf", name: "Public Service Loan Forgiveness", needs: { loan_type: ["direct"], employer_kind: ["government", "nonprofit_501c3"], payments_required: 120, plan: ["idr", "standard_10"] } },
      { id: "idr", name: "Income-driven repayment", needs: { loan_type: ["direct", "ffel_consolidated"], income_known: true } },
      { id: "consolidation", name: "Direct Consolidation (to make FFEL or Perkins loans Direct)", needs: { loan_type: ["ffel", "perkins"] } },
      { id: "closed_school", name: "Closed school discharge", needs: { school_closed_while_enrolled: true } },
      { id: "tpd", name: "Total and permanent disability discharge", needs: { disability_documented: true } }
    ] };
    function studentLoanEligibility(loan, profile, rules) {
      const R = rules || PROGRAM_RULES, out = [];
      for (const p of R.programs) { const n = p.needs, checks = []; if (n.loan_type) checks.push({ what: `loan type ${n.loan_type.join(" or ")}`, ok: n.loan_type.includes(loan.type) }); if (n.employer_kind) checks.push({ what: `employer ${n.employer_kind.join(" or ")}`, ok: n.employer_kind.includes(profile.employer_kind) }); if (n.payments_required) checks.push({ what: `${n.payments_required} qualifying payments`, ok: (profile.qualifying_payments || 0) >= n.payments_required, progress: profile.qualifying_payments || 0 }); if (n.plan) checks.push({ what: `on ${n.plan.join(" or ")}`, ok: n.plan.includes(profile.plan) }); if (n.income_known) checks.push({ what: "income on file", ok: profile.income_cents != null }); if (n.school_closed_while_enrolled) checks.push({ what: "school closed while enrolled", ok: !!profile.school_closed_while_enrolled }); if (n.disability_documented) checks.push({ what: "documented total and permanent disability", ok: !!profile.disability_documented });
        const structural = checks.filter(c => c.what !== `${n.payments_required} qualifying payments`), verdict = structural.every(c => c.ok) ? (checks.every(c => c.ok) ? "likely" : "on track") : "unlikely";
        out.push({ program: p.id, name: p.name, verdict, checks, text: `${p.name}: ${verdict}${verdict === "on track" ? ` (${profile.qualifying_payments || 0} of ${n.payments_required} payments)` : ""}; ${checks.map(c => `${c.ok ? "yes" : "no"}: ${c.what}`).join(", ")}.` }); }
      return { programs: out, text: out.filter(x => x.verdict !== "unlikely").map(x => x.text).join(" ") || "No program matches structurally.", rules_as_of: R.as_of, source: R.source, caveat: "Structural checks only; the servicer's count and the current rules decide." };
    }
    // CRDT-014: freeze guidance with the bureaus' own freeze pages; free, reversible, and it does not touch existing accounts.
    const FREEZE_LINKS = [{ bureau: "Equifax", url: "https://www.equifax.com/personal/credit-report-services/credit-freeze/" }, { bureau: "Experian", url: "https://www.experian.com/freeze/center.html" }, { bureau: "TransUnion", url: "https://www.transunion.com/credit-freeze" }];
    const bureauKey = b => String(b || "").toLowerCase().replace(/[^a-z]/g, "");
    function freezeGuidance(status) { const done = new Set(((status || {}).bureaus || []).filter(b => String(b.state || "").toLowerCase() === "frozen").map(b => bureauKey(b.bureau))); return { steps: FREEZE_LINKS.map(l => ({ bureau: l.bureau, url: l.url, done: done.has(bureauKey(l.bureau)) })), text: `A freeze is free, takes minutes per bureau, and blocks new accounts in your name while leaving your existing ones alone; you lift it when you apply for something. ${FREEZE_LINKS.map(l => `${l.bureau}: ${done.has(bureauKey(l.bureau)) ? "frozen" : l.url}`).join("; ")}. Keep each PIN somewhere I never see.`, remaining: FREEZE_LINKS.filter(l => !done.has(bureauKey(l.bureau))).map(l => l.bureau) }; }
    // CRDT-015: authorized user, explained against the user's situation.
    function authorizedUserExplainer(profile) {
      const thin = (profile.accounts_count || 0) < 3 || (profile.oldest_months || 0) < 24, lines = [`Being added as an authorized user on someone's old, low-balance, never-late card can add that account's history to your file${thin ? ", which matters for you because your own file is thin" : ", though your file already has history so the gain is smaller"}.`, "The primary holder's habits become yours on paper: a high balance or a late payment on their card lands on your report too.", "You are not liable for the debt as an authorized user; a joint account is different.", "Some scoring models discount authorized-user accounts; it helps most with lenders using older models.", "Adding someone else to your card does the same for them; set a low limit if the issuer allows it."];
      return { thin_file: thin, text: lines.join(" ") };
    }
    // CRDT-016 / CRDT-004: letters. No identity number ever appears; the account is named by its last four digits.
    function collectorResponse(spec) {
      // Only the last four digits name the account, whatever was pasted into the field.
      const last4 = String(spec.account_last4 || "").replace(/\D/g, "").slice(-4), kind = spec.kind || "validation", who = spec.collector ? redact(spec.collector) : "[collector name]", acct = last4 ? `account ending ${last4}` : "the account you reference", amount = spec.amount_cents != null ? money(spec.amount_cents) : "[amount]";
      const letters = {
        validation: `To ${who}: I received your communication dated ${spec.contact_on || "[date]"} regarding ${acct} (${amount}). I dispute this debt and request validation under the Fair Debt Collection Practices Act: the name of the original creditor, the amount and how it was calculated, and proof that you are authorized to collect it. Until you provide this, stop collection activity. Send everything in writing to the address above.`,
        cease: `To ${who}: Regarding ${acct}, under the Fair Debt Collection Practices Act I ask that you cease all communication with me except to confirm that collection is ending or that a specific action will be taken. Do not contact me at work or by phone.`,
        pay_for_delete: `To ${who}: Regarding ${acct} (${amount}), I will pay ${spec.offer_cents != null ? money(spec.offer_cents) : "[offer]"} as settlement in full if you agree in writing, before payment, to delete the account from all three credit bureaus and report nothing further. This is not an admission that the debt is valid.`,
        not_mine: `To ${who}: The debt you reference (${acct}) is not mine. I have never held an account with the original creditor you name. Treat this as a dispute, stop collection, and send any records you have so I can report identity theft if needed.`
      };
      const text = letters[kind] || letters.validation;
      return { kind, text, timing: kind === "validation" ? "Send within 30 days of the first written notice; after that validation is still worth requesting but the automatic pause does not apply." : null, next: "Send by mail with tracking and keep a copy. I can file the follow-up dates.", contains_identity_numbers: hasIdNum(text) };
    }
    function disputeDraft(report, item, reason) {
      const name = item.name ? redact(item.name) : mask(item.number), why = redact(reason), text = `To ${report.bureau || "[bureau]"}: I dispute the following item on my report as of ${report.as_of || "[date]"}: ${name}${item.opened_on ? `, opened ${item.opened_on}` : ""}. Reason: ${why}. Please investigate and correct or remove it, and send me the result in writing. Enclosed: ${(item.evidence || ["the supporting statement"]).map(redact).join(", ")}.`;
      return { bureau: report.bureau || null, item: name, reason: why, text, next: "Bureaus must investigate within about 30 days. File with each bureau that shows the item. Keep the confirmation number; I will track the deadline.", contains_identity_numbers: hasIdNum(text), capability_id: "CRDT-004", tier: "T2" };
    }

    return { scoreMonitor, band, utilization, ages, lates, inquiries, factors, walkthrough, inquiryAlerts, utilizationPlan, newAccountImpact, refinanceWatch, payment, studentLoanEligibility, PROGRAM_RULES, freezeGuidance, FREEZE_LINKS, authorizedUserExplainer, collectorResponse, disputeDraft, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentCredit;
