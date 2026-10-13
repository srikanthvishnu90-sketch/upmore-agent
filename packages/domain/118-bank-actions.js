  /* Bank actions (real-world C77 case tracking, C79 fee reversal packets, C96 signup-bonus matching,
     C99 retention offers, C168 lower-APR negotiation, C199 dormant-account closure prep): the written-channel
     preparation layer for issuer and bank actions Upmore never executes itself. No phone calls, ever. Nothing
     here sends, files, submits or closes anything: it computes the math from the person's own rows, drafts the
     exact message the person sends through the issuer's written channel (chat, secure message or email), opens
     a LOCAL case record with the deadlines that govern the real filing, and tracks the outcome against later
     rows (a reversal credit, a provisional credit, a closed status). An issuer action is done only when the
     issuer's own record says so; a packet is preparation, never a claim that anything was filed.
     Money math is integer cents throughout. APR interest is the simple stated-APR estimate (balance x APR for
     a year, balance held constant) and is said as an estimate wherever it appears. Pure: rows, offers and
     today are passed in. Loads after AgentDispute (79), AgentRecovery (41, via AgentWorkflows 36) and
     AgentLedger (57) when present; each dependency is optional and the packet says what it could not check. */
  const BankActions = (() => {
    const DAY = 86400000;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const ymd = s => String(s || "").slice(0, 10);
    const dayMs = s => Date.parse(ymd(s) + "T00:00:00Z");
    const addDays = (s, n) => new Date(dayMs(s) + n * DAY).toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);
    const divRound = (n, d) => { const q = Math.trunc(n / d), r = n - q * d; return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q; };
    const median = xs => { const s = xs.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : divRound(s[m - 1] + s[m], 2); };
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const nice = s => { const [y, m, d] = ymd(s).split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
    const pct = bps => { const r = Math.round(bps / 100); const crosses = [1000, 3000].some(line => (bps < line) !== (r * 100 < line)); return crosses ? (Math.round(bps / 10) / 10).toFixed(1) : String(r); };
    // A stable short case id from the charge's own identity: the same charge always opens the same case.
    const caseIdFor = charge => { const s = `${charge.account_id || ""}|${charge.provider_transaction_id || ""}|${charge.amount_cents}|${ymd(charge.posted_on)}`; let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return "DSP-" + h.toString(16).toUpperCase().padStart(8, "0"); };
    const Dispute = () => (typeof AgentDispute !== "undefined" ? AgentDispute : (typeof require !== "undefined" ? require("./79-dispute.js") : null));
    const Recovery = () => (typeof AgentRecovery !== "undefined" ? AgentRecovery : null);
    const PAYROLL_RE = /payroll|salary|wages|direct\s*dep|\bdir dep\b|paycheck/i;

    // ---- C96: the person's actual direct-deposit pattern, from their own credit rows. ----
    function ddPattern(rows) {
      const credits = (rows || []).filter(r => r && Number.isSafeInteger(r.amount_cents) && r.amount_cents > 0 && !r.is_pending && !r.is_transfer && ymd(r.posted_on))
        .filter(r => PAYROLL_RE.test(r.merchant_raw || "") || r.category === "income")
        .slice().sort((a, b) => ymd(a.posted_on).localeCompare(ymd(b.posted_on)));
      if (!credits.length) return { count: 0, total_cents: 0, largest_cents: 0, median_each_cents: 0, interval_days: null, rows: [] };
      const amounts = credits.map(r => r.amount_cents);
      const gaps = []; for (let i = 1; i < credits.length; i++) gaps.push(daysBetween(credits[i - 1].posted_on, credits[i].posted_on));
      const interval = gaps.length ? median(gaps) : null;
      return { count: credits.length, total_cents: amounts.reduce((s, x) => s + x, 0), largest_cents: Math.max(...amounts), median_each_cents: median(amounts), interval_days: interval, rows: credits };
    }
    // Projected direct deposits inside a window of `days`, from the learned cadence: median deposit x days / interval.
    const projectedInWindow = (p, days) => (p.interval_days ? divRound(p.median_each_cents * days, p.interval_days) : p.total_cents);

    // C96 matcher: dated offers (each with its source and the day it was checked; a promo term older than the
    // offer book's 7-day promo window is said as may-have-changed) against the learned direct-deposit pattern.
    // Opening and funding the account is the person's own step; this matches and tracks, it never opens.
    function matchBonuses(offers, pattern, today) {
      const out = [];
      for (const o of offers || []) {
        const age = daysBetween(o.checked_on, today), stale = !(age >= 0 && age <= 7);
        const checks = (o.requirements || []).map(r => {
          if (r.kind === "dd_total") { const have = projectedInWindow(pattern, r.within_days); return { kind: r.kind, need_cents: r.amount_cents, within_days: r.within_days, projected_cents: have, met: pattern.count > 0 && have >= r.amount_cents }; }
          if (r.kind === "dd_single") return { kind: r.kind, need_cents: r.amount_cents, within_days: r.within_days, projected_cents: pattern.largest_cents, met: pattern.count > 0 && pattern.largest_cents >= r.amount_cents };
          if (r.kind === "debit_count") return { kind: r.kind, need_count: r.count, within_days: r.within_days, met: null, note: "counted on the new account once it is open; your current rows cannot meet another bank's requirement" };
          return { kind: r.kind, met: null, note: "unknown requirement kind" };
        });
        const ddChecks = checks.filter(c => c.kind === "dd_total" || c.kind === "dd_single");
        const dd_met = ddChecks.length ? ddChecks.every(c => c.met === true) : null;
        const eligible = dd_met === true;
        out.push({ id: o.id, bank: o.bank, bonus_cents: o.bonus_cents, checked_on: o.checked_on, stale, cite: `per ${o.source.title}, checked ${o.checked_on}${stale ? "; that may have changed, so check before acting" : ""}`, eligible, dd_met, checks, keep_open_days: o.keep_open_days || null, early_closure_fee_cents: o.early_closure_fee_cents || 0 });
      }
      out.sort((a, b) => (b.eligible ? 1 : 0) - (a.eligible ? 1 : 0) || b.bonus_cents - a.bonus_cents);
      return out;
    }
    function bonusText(offers, pattern, today, sourceLine) {
      const m = matchBonuses(offers, pattern, today);
      if (!pattern.count) return `I don't see a direct-deposit pattern in your linked rows yet, so I can't match bank signup bonuses to it honestly. Once a paycheck or salary deposit lands, ask again.\n${sourceLine}`;
      const lines = [`Your direct-deposit pattern: ${pattern.count} deposits, median ${money(pattern.median_each_cents)} each, about every ${pattern.interval_days} days, largest ${money(pattern.largest_cents)}.`];
      for (const o of m) {
        const reqText = o.checks.map(c => c.kind === "dd_total" ? `direct deposits totaling ${money(c.need_cents)} within ${c.within_days} days — your pattern projects ${money(c.projected_cents)} in that window: ${c.met ? "met" : "not met"}` : c.kind === "dd_single" ? `one direct deposit of ${money(c.need_cents)} within ${c.within_days} days — your largest is ${money(pattern.largest_cents)}: ${c.met ? "met" : "not met"}` : `${c.need_count} debit purchases within ${c.within_days} days — ${c.note}`).join("; ");
        lines.push(`${o.bank}: ${money(o.bonus_cents)} bonus (${o.cite}). ${reqText}.${o.keep_open_days ? ` Keep the account open ${o.keep_open_days} days${o.early_closure_fee_cents ? ` or an early-closure fee of ${money(o.early_closure_fee_cents)} applies` : ""}.` : ""} ${o.dd_met === true ? "Your deposit pattern meets the deposit requirements as they stand." : o.dd_met === false ? "Your deposit pattern does not meet the deposit requirements as they stand." : "This offer has no deposit requirement to match against; its requirements run on the new account once it is open."}`);
      }
      lines.push("Opening and funding an account is your step at the bank; I match the offers and then track every requirement against your real deposits until the bonus posts.");
      lines.push(sourceLine);
      return lines.join("\n");
    }

    // ---- C79: a fee-reversal packet from the person's real fee rows (the recovery scan's own candidates). ----
    function feePacket(rows, today, institution) {
      const R = Recovery(); if (!R) return null;
      const scan = R.scan(rows || [], { today, institution: institution || undefined });
      const fees = scan.candidates.filter(c => c.kind === "bank_fee");
      const total = fees.reduce((s, c) => s + c.amount_cents, 0);
      return { fees, total_cents: total, scan };
    }
    function feePacketText(rows, today, institution, sourceLine) {
      const p = feePacket(rows, today, institution); if (!p) return null;
      const where = institution || "your bank";
      if (!p.fees.length) return `I don't see a bank fee in your linked rows to ask ${where} to reverse.\n${sourceLine}`;
      const lines = [`${p.fees.length} bank fee${p.fees.length === 1 ? "" : "s"} totaling ${money(p.total_cents)}, each one a fee ${where} may reverse as a courtesy when asked in writing:`];
      for (const f of p.fees) for (const e of f.evidence) lines.push(`- ${nice(e.posted_on)}: ${e.label}, ${money(f.amount_cents)} (reference ${String(e.transaction_id).slice(0, 64)})`);
      lines.push("", `The request to send (in ${where}'s app chat or secure message — I don't make calls, and nothing is sent without your yes):`, ...new Set(p.fees.map(f => f.action.text)));
      lines.push(`A fee counts as recovered only when a credit of the same amount posts to the account; I keep watching for it. ${sourceLine}`);
      return lines.join("\n");
    }
    // A fee is recovered when a later credit of the same amount carries reversal wording (the scan's own rule).
    function feeRecovered(rowsAfter, fee) {
      const R = Recovery(); if (!R) return null;
      const e = fee.evidence[0];
      return (rowsAfter || []).some(r => r && r.amount_cents === fee.amount_cents && ymd(r.posted_on) >= ymd(e.posted_on) && /\b(refund|reversal|reversed|credit|waive[dr]?|courtesy|adjustment)\b/i.test(r.merchant_raw || "") && /\b(fee|service)\b/i.test(r.merchant_raw || "")) || false;
    }

    // ---- C77: a dispute case record around the draft the person sends (79-dispute.js). The person files;
    // the case carries the deadlines and tracks the provisional credit and the resolution in later rows. ----
    function disputeCase(charge, opts) {
      const o = opts || {}, D = Dispute();
      const id = caseIdFor(charge);
      const draftText = D ? D.draft(charge, { today: o.today, unauthorized: !!o.unauthorized, source: o.source || "" }) : null;
      const deadlines = [
        { what: `Ask the merchant first; if they say no or ${D ? D.WAIT_DAYS : 10} days pass, file with the issuer`, on: addDays(o.today, D ? D.WAIT_DAYS : 10) },
        o.statement_close_on ? { what: "Written dispute reaches the issuer (Fair Credit Billing Act: 60 days from the statement that first showed the charge)", on: addDays(o.statement_close_on, 60) } : { what: "Written dispute reaches the issuer within 60 days of the statement that first showed the charge (that statement date is not in your bank rows, so no exact date is claimed)", on: null },
      ];
      return { case_id: id, charge, opened_on: o.today, deadlines, draft: draftText, status: "prepared_not_filed" };
    }
    function disputeCaseText(charge, opts) {
      const o = opts || {}, c = disputeCase(charge, o);
      const lines = [`Dispute case ${c.case_id} opened for this charge. Prepared for you to file — nothing has been sent or filed by me.`, ""];
      if (c.draft) lines.push(c.draft);
      lines.push("", "Deadlines on this case:");
      for (const d of c.deadlines) lines.push(`- ${d.what}${d.on ? ` — by ${nice(d.on)}` : ""}.`);
      lines.push("I track this case: a provisional credit (a temporary credit from the issuer while it investigates) and the final resolution both show in your transactions, and I'll report them when they post. If round one is denied, the packet escalates to a chargeback with the same case id.");
      if (o.source) lines.push(o.source);
      return lines.join("\n");
    }
    // Provisional credit / resolution tracking: a later credit of the charge's amount from the issuer or the
    // merchant is a lead the case reports; only the issuer's final word closes it, so the status says which.
    function trackDispute(rowsAfter, charge) {
      const amt = Math.abs(charge.amount_cents);
      const credits = (rowsAfter || []).filter(r => r && r.amount_cents === amt && ymd(r.posted_on) >= ymd(charge.posted_on));
      const prov = credits.find(r => /\b(provisional|temporary|temp credit|dispute credit|issuer credit|adjustment)\b/i.test(r.merchant_raw || ""));
      const merchantBack = credits.find(r => r !== prov && String(r.merchant_raw || "").toLowerCase().includes(String(charge.merchant_raw || "").split(/[*#]/)[0].trim().toLowerCase().slice(0, 6)));
      return { provisional_credit: prov ? { on: ymd(prov.posted_on), amount_cents: prov.amount_cents } : null, merchant_refund: merchantBack ? { on: ymd(merchantBack.posted_on), amount_cents: merchantBack.amount_cents } : null, status: prov ? "provisional_credit_posted" : merchantBack ? "merchant_refunded" : "awaiting_outcome" };
    }

    function disputeStatusText(caseRec, rowsAfter, sourceLine) {
      const t = trackDispute(rowsAfter, caseRec.charge);
      const amt = money(Math.abs(caseRec.charge.amount_cents)), name = String(caseRec.charge.merchant_raw || "").split(/[*#]/)[0].trim();
      const head = `Case ${caseRec.case_id} (${name}, ${amt}): `;
      const body = t.status === "provisional_credit_posted" ? `a provisional credit of ${amt} posted on ${nice(t.provisional_credit.on)} — that's the issuer's temporary credit while it investigates, not the final word. The case closes when the issuer confirms the final resolution; I'll report it then.` : t.status === "merchant_refunded" ? `the merchant refunded ${amt} on ${nice(t.merchant_refund.on)} — the money is back, so this case is done unless the issuer says otherwise.` : `no provisional credit and no refund has posted yet. The merchant step runs to ${nice(caseRec.deadlines[0].on)}${caseRec.deadlines[1].on ? `, and the written issuer dispute is due by ${nice(caseRec.deadlines[1].on)}` : ""}.`;
      return head + body + (sourceLine ? `\n${sourceLine}` : "");
    }
    function feeStatusText(fee, rowsAfter, sourceLine) {
      const e = fee.evidence[0], recovered = feeRecovered(rowsAfter, fee);
      return recovered ? `Good news on the ${nice(e.posted_on)} fee: a ${money(fee.amount_cents)} reversal credit for the ${e.label} fee has posted, so that fee is recovered.${sourceLine ? `\n${sourceLine}` : ""}` : `No reversal credit for the ${money(fee.amount_cents)} ${e.label} fee from ${nice(e.posted_on)} has posted yet; the request stands until one does.${sourceLine ? `\n${sourceLine}` : ""}`;
    }

    // ---- C99: retention-offer preparation (written channel only). The fee math is the annual-fee audit's:
    // the fee row against the statement credits the card actually paid back in the year before it. ----
    function retentionPacket(input) {
      const o = input || {}, tx = (o.transactions || []).filter(r => r && r.account_id === o.account_id && r.posted_on && !r.is_pending && Number.isFinite(r.amount_cents));
      const fees = tx.filter(r => r.amount_cents < 0 && /\b(annual (membership )?fee|annual fee)\b/i.test(r.merchant_raw || "")).sort((a, b) => (a.posted_on < b.posted_on ? 1 : -1));
      if (!fees.length) return { found: false, text: `I don't see an annual fee on ${o.account_name} in your linked history, so there is no retention case to prepare yet.` };
      const fee = fees[0], cost = -fee.amount_cents, from = addDays(fee.posted_on, -365);
      const credits = tx.filter(r => r.amount_cents > 0 && r.posted_on > from && r.posted_on <= fee.posted_on && /\b(credit|statement credit)\b/i.test(r.merchant_raw || "") && !/\b(payment|thank you)\b/i.test(r.merchant_raw || ""));
      const back = credits.reduce((s, r) => s + r.amount_cents, 0), net = back - cost;
      const name = o.account_name, issuer = o.issuer || "the issuer";
      let offerMath = null, verdict = null;
      if (o.offer) {
        const credit = o.offer.credit_cents || 0, points = o.offer.points || 0, cpp = o.offer.points_value_cents;
        const pointsValue = points && cpp != null ? Math.round(points * cpp) : null;
        const value = credit + (pointsValue || 0);
        offerMath = { credit_cents: credit, points, points_value_cents: pointsValue, total_value_cents: value, keep_net_cents: value + net };
        verdict = points && cpp == null ? "I can't value those points without a cents-per-point figure you trust, so no keep-or-kill verdict yet." : (offerMath.keep_net_cents >= 0 ? `Keep: the offer's ${money(value)} plus the ${money(back)} the card already paid back covers the ${money(cost)} fee, ${money(offerMath.keep_net_cents)} ahead before any new points you earn.` : `Kill or downgrade: even with the offer's ${money(value)}, you are ${money(-offerMath.keep_net_cents)} behind the ${money(cost)} fee on credits alone; the card would have to earn that back in points you actually use.`);
      }
      const draft = `Hi, my ${name} annual fee of ${money(cost)} posted on ${nice(fee.posted_on)}. In the year before it, the card paid me back ${money(back)} in statement credits, so the fee leaves me ${net >= 0 ? money(net) + " ahead" : money(-net) + " behind"} before points. I'd like to keep the card — is there a retention offer available, a statement credit or bonus points, if I keep it open? Please confirm any offer in writing here. Thank you.`;
      const lines = [
        `${name}: ${money(cost)} annual fee posted ${fee.posted_on}. In the year before it, the card paid back ${money(back)} in statement credits (${credits.length} credit${credits.length === 1 ? "" : "s"}). The fee is ${net >= 0 ? `covered by ${money(net)}` : `${money(-net)} more than the credits you used`}, before points.`,
        `Written-channel draft for ${issuer} (their app chat or secure message — I don't make calls, and nothing is sent without your yes):`, `"${draft}"`,
        offerMath ? `If they offer ${offerMath.credit_cents ? money(offerMath.credit_cents) + " credit" : ""}${offerMath.credit_cents && offerMath.points ? " plus " : ""}${offerMath.points ? `${offerMath.points.toLocaleString("en-US")} points${offerMath.points_value_cents != null ? ` (at ${o.offer.points_value_cents} cents a point, ${money(offerMath.points_value_cents)})` : " (no value assumed)"}` : ""}: ${verdict}` : "Send it before you decide to cancel: a retention offer only counts when it is confirmed in writing and the credit or points post to the account.",
        "Points you earn are not counted above: I can't see their value from your transactions.",
      ];
      return { found: true, fee_cents: cost, fee_on: fee.posted_on, credits_back_cents: back, net_cents: net, draft, offer: offerMath, verdict, text: lines.join("\n") };
    }

    // ---- C168: lower-APR preparation (written channel only). Interest is the simple stated-APR estimate. ----
    function aprPacket(input) {
      const o = input || {};
      const yearly = bps => Math.round(o.balance_cents * bps / 10000);
      const cur = yearly(o.apr_bps);
      const scenarios = (o.scenarios_bps || [o.apr_bps - 500]).filter(b => Number.isInteger(b) && b >= 0 && b < o.apr_bps).map(bps => ({ apr_bps: bps, yearly_cents: yearly(bps), saving_year_cents: cur - yearly(bps), saving_month_cents: divRound(cur - yearly(bps), 12) }));
      const ask = scenarios[0];
      const draft = ask ? `Hi, my balance is ${money(o.balance_cents)} at ${(o.apr_bps / 100).toFixed(2)}% APR, which costs about ${money(cur)} a year in interest if the balance stays. I've been a customer in good standing — can you lower my APR to ${(ask.apr_bps / 100).toFixed(2)}%? That would save me about ${money(ask.saving_year_cents)} a year. If a temporary reduction or a hardship plan is what you can offer instead, please send its exact terms in writing — the rate, how long it lasts, and whether the card stays open — before I agree to anything. Thank you.` : null;
      const lines = [
        `${o.card_name}: balance ${money(o.balance_cents)} at ${(o.apr_bps / 100).toFixed(2)}% APR. At that rate the balance costs about ${money(cur)} a year in interest (${money(divRound(cur, 12))} a month), if the balance stays the same — an estimate from the stated APR, not a statement figure.`,
        ...scenarios.map(s => `At ${(s.apr_bps / 100).toFixed(2)}% APR it would cost about ${money(s.yearly_cents)} a year: ${money(s.saving_year_cents)} a year saved, about ${money(s.saving_month_cents)} a month.`),
        draft ? `Written-channel draft for ${o.issuer || "the issuer"} (app chat or secure message — I don't make calls, and nothing is sent without your yes):\n"${draft}"` : "Tell me the rate to ask for and I'll draft the message.",
        "Tradeoffs, before you accept anything: a lower APR on the same open card costs nothing in credit terms. A hardship plan or a settlement is different — it can close the card, restrict use, and be reported to the bureaus; never accept one from a draft. Any new rate counts only when the issuer confirms it in writing.",
      ];
      return { current_yearly_cents: cur, scenarios, draft, text: lines.join("\n") };
    }

    // ---- C199: dormant-account closure prep. The disclosure comes first; closure is the person's own tap
    // at the issuer, after their yes. What breaks is computed from their rows: recurring charges that ride
    // the card, payments that pay it, and the utilization and age effects of losing its limit and history. ----
    function closurePacket(input) {
      const o = input || {}, accounts = (o.accounts || []).filter(a => a && a.type === "credit_card");
      const target = accounts.find(a => a.id === o.target_id);
      if (!target) return { found: false, text: "I can't find that card among the accounts you gave me, so there is nothing to prepare." };
      const open = accounts.filter(a => a.status !== "closed"), others = open.filter(a => a.id !== target.id);
      const util = list => { const bal = list.reduce((s, a) => s + (a.balance_cents || 0), 0), lim = list.reduce((s, a) => s + (a.limit_cents || 0), 0); return { balance_cents: bal, limit_cents: lim, bps: lim ? divRound(bal * 10000, lim) : null }; };
      const before = util(open), after = util(others);
      const agesOf = list => list.filter(a => a.opened_on).map(a => Math.max(0, Math.floor(daysBetween(a.opened_on, o.today) / 30.44)));
      const ageBefore = agesOf(open), ageAfter = agesOf(others);
      const avg = xs => xs.length ? divRound(xs.reduce((s, x) => s + x, 0), xs.length) : null;
      const isOldest = target.opened_on && open.every(a => !a.opened_on || a.opened_on >= target.opened_on);
      const rows = (o.transactions || []).filter(r => r && r.account_id === target.id && !r.is_pending);
      const byMerchant = {};
      for (const r of rows) { if (r.amount_cents < 0 && !/\b(payment|thank you|autopay)\b/i.test(r.merchant_raw || "")) { const k = String(r.merchant_raw || "").toLowerCase(); byMerchant[k] = byMerchant[k] || { name: r.merchant_raw, count: 0, last_on: ymd(r.posted_on), amount_cents: -r.amount_cents }; byMerchant[k].count++; } }
      const recurring = Object.values(byMerchant).filter(m => m.count >= 2).sort((a, b) => b.last_on.localeCompare(a.last_on));
      const paysCard = rows.some(r => r.amount_cents > 0 && /\b(payment|thank you|autopay)\b/i.test(r.merchant_raw || ""));
      const lines = [
        `Closing ${target.name}: the disclosure first — nothing is closed, and closure is your tap at ${o.issuer || "the issuer"} after your yes.`,
        `Credit utilization: your cards carry ${money(before.balance_cents)} on ${money(before.limit_cents)} of limits (${before.bps != null ? pct(before.bps) + "%" : "unknown"}). Without this card's ${money(target.limit_cents || 0)} limit, the same balances are ${money(after.balance_cents)} on ${money(after.limit_cents)} (${after.bps != null ? pct(after.bps) + "%" : "unknown"})${before.bps != null && after.bps != null ? ` — ${((after.bps - before.bps) / 100).toFixed(2)} points higher` : ""}. This card's own balance is ${money(target.balance_cents || 0)}${(target.balance_cents || 0) > 0 ? ", which must be paid or transferred first" : ""}.`,
        `Account age: ${isOldest ? `this is your oldest card (opened ${target.opened_on}); closing it shortens your oldest-account history once it ages off the report. ` : ""}Average account age goes from ${avg(ageBefore) != null ? (avg(ageBefore) / 12).toFixed(1) + " years" : "unknown"} to ${avg(ageAfter) != null ? (avg(ageAfter) / 12).toFixed(1) + " years" : "unknown"}.`,
        recurring.length ? `What breaks: ${recurring.map(m => `${m.name} charged this card ${m.count} times (last ${nice(m.last_on)}, ${money(m.amount_cents)})`).join("; ")} — move those to another card first or they'll decline.` : "What breaks: no merchant has charged this card more than once in your rows, so no recurring charge rides it.",
        paysCard ? "Payments: money has come in to pay this card; if that is autopay from your bank, cancel or redirect it at the bank too, or a payment may bounce after closure." : "Payments: no payment into this card appears in your rows.",
        "Direct deposits never land on a credit card, so none are affected. After you close it, I verify two things: the issuer shows the account closed, and your next credit report reflects it.",
      ];
      return { found: true, target: { id: target.id, name: target.name }, utilization_before_bps: before.bps, utilization_after_bps: after.bps, is_oldest: !!isOldest, recurring, text: lines.join("\n") };
    }
    function closureVerified(accountsAfter, target_id) {
      const t = (accountsAfter || []).find(a => a && a.id === target_id);
      return t ? { closed_at_issuer: t.status === "closed", status: t.status || null } : { closed_at_issuer: false, status: null };
    }

    // ---- C141: the 'not me' packet for a fraud-pattern firing: lock guidance first, then a dispute case
    // per charge. Locking is the person's tap in the issuer's app; Upmore holds no card controls. ----
    function fraudPacket(firing, charges, opts) {
      const o = opts || {}, total = (charges || []).reduce((s, c) => s + Math.abs(c.amount_cents), 0);
      const cases = (charges || []).map(c => disputeCase(c, o));
      const lines = [
        `If these aren't yours, act in this order — the lock is your tap in ${o.issuer || "the issuer"}'s app; I can't lock the card from here:`,
        `1. Lock the card now: open ${o.issuer || "the issuer"}'s app, pick this card, and turn on its lock/freeze control. Then check the lock reads active there — that screen is the verification.`,
        `2. Disputes: I opened a case for each charge, ${money(total)} in total, each pre-filled for you to file with the issuer (you file; nothing is sent by me):`,
        ...cases.map((c, i) => `- Case ${c.case_id}: ${charges[i].merchant_raw}, ${money(Math.abs(charges[i].amount_cents))}, posted ${nice(charges[i].posted_on)}. Merchant step by ${nice(c.deadlines[0].on)}${c.deadlines[1].on ? `; written issuer dispute by ${nice(c.deadlines[1].on)}` : ""}.`),
        `3. Ask the issuer for a replacement card with a new number, and change the password on the account the card sits in if anything else looks off.`,
        "I keep watching the account: the provisional credits and resolutions land in your transactions, and I'll report them against these case ids.",
      ];
      return { total_cents: total, cases, text: lines.join("\n") };
    }

    return { ddPattern, projectedInWindow, matchBonuses, bonusText, feePacket, feePacketText, feeRecovered, feeStatusText, disputeCase, disputeCaseText, trackDispute, disputeStatusText, retentionPacket, aprPacket, closurePacket, closureVerified, fraudPacket, caseIdFor };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = BankActions;
