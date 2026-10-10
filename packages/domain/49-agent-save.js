  /* Save engine (Instinct spec doc 07). Pure and deterministic. Every play
     runs one loop: detect, quantify, act (at the right tier), verify, book.
     Detectors read normalized data (doc 04 shape: transactions in dollars as
     the monitors read them, accounts/bills/debts in integer cents) and return
     opportunities with the rows that prove them. No detector sends a message:
     the ranked queue feeds the proactivity budget (doc 01). Estimates are
     labeled estimates; the ledger books only deltas a verify step confirmed
     from the data, so "you're saving $214 a month, verified" is never mixed
     with a projection. Subscription detection comes from AgentMonitors and
     fee detection from AgentRecovery (loaded alongside); this module adds the
     plays they do not cover and the ledger and queue on top. */
  const AgentSave = (() => {
    const DAY = 86400000;
    const ymd = s => String(s || "").slice(0, 10);
    const days = (a, b) => Math.round((Date.parse(ymd(b) + "T00:00:00Z") - Date.parse(ymd(a) + "T00:00:00Z")) / DAY);
    const month = s => ymd(s).slice(0, 7);
    const cents = d => Math.round(Number(d) * 100);
    const divRound = (n, d) => { const q = Math.trunc(n / d), r = n - q * d; return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q; };
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const WEIGHT = { high: 1, medium: 0.6, low: 0.3 };
    const PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 };
    const monthly = r => divRound(cents(r.amount) * PER_YEAR[r.interval], 12);
    const need = (name, obj) => { if (typeof obj === "undefined") throw new Error(`${name} must be loaded before AgentSave`); return obj; };
    const Monitors = () => need("AgentMonitors", typeof AgentMonitors !== "undefined" ? AgentMonitors : undefined);
    const Recovery = () => need("AgentRecovery", typeof AgentRecovery !== "undefined" ? AgentRecovery : undefined);
    const PAYROLL_RE = /payroll|salary|wages|direct\s*dep|\bdir dep\b|paycheck/i;

    // Two of these is a duplicate; video streaming is left to the monitors' three-or-more overlap rule because two video services are routinely both used.
    const ONE_IS_ENOUGH = Object.freeze({
      "music streaming": ["spotify", "apple music", "tidal", "pandora", "youtube music", "amazon music", "deezer"],
      "cloud storage": ["dropbox", "google one", "onedrive", "icloud"],
      "meal kits": ["hellofresh", "blue apron", "home chef", "factor", "everyplate"],
      "password manager": ["1password", "lastpass", "dashlane", "bitwarden"],
      "vpn": ["nordvpn", "expressvpn", "surfshark", "proton vpn"]
    });
    const opp = (play, key, fields) => Object.assign({ play, key, one_time_cents: 0, expected_monthly_cents: 0, estimate: true, confidence: "medium" }, fields);

    // P1 Subscriptions: inventory, duplicate services, price rises, annual renewals ahead.
    function subscriptions(input) {
      const M = Monitors();
      const recAll = M.recurring(input.transactions || [], input.today).filter(r => !Recovery().feeKind({ merchant_raw: r.merchant })), recActive = recAll.filter(r => !r.dormant);
      // Rent, loans, insurance, utilities and telecom repeat too, but they are bills (P2), not subscriptions (P1).
      const BILL_RE = /\b(rent|mortgage|loan|nelnet|mohela|sallie|hoa|insurance|premium|electric|energy|power|gas co|water|utilit|comcast|xfinity|spectrum|charter|verizon|at&t|att\*|t-mobile|tmobile|mint mobile|google \*fi|visible|tuition|daycare|childcare|payroll)\b/i;
      const bills_recurring = recActive.filter(r => BILL_RE.test(r.merchant)), rec = recActive.filter(r => !BILL_RE.test(r.merchant));
      const inventory = rec.map(r => ({ key: r.key, merchant: r.merchant, amount_cents: cents(r.amount), interval: r.interval, monthly_cents: monthly(r), annual_cents: monthly(r) * 12,
        since: r.firstDate, last: r.lastDate, next: r.nextDate, occurrences: r.occurrences, cost_since_first_cents: cents(r.amount) * r.occurrences, rows: r.rows }));
      const out = [];
      for (const [job, names] of Object.entries(ONE_IS_ENOUGH)) {
        const hits = [];
        for (const r of rec) { const n = names.find(x => (" " + r.key + " ").includes(" " + x + " ")); if (n && !hits.some(h => h.name === n)) hits.push({ name: n, r }); }
        if (hits.length < 2) continue;
        hits.sort((a, b) => monthly(a.r) - monthly(b.r));
        const cheapest = hits[0];
        out.push(opp("P1_subscription", `duplicate_service:${job.split(" ")[0]}`, { title: `${hits.length} ${job} services at once`, capability_id: "BILL-012", tier: "T3",
          expected_monthly_cents: monthly(cheapest.r), confidence: "high", services: hits.map(h => h.r.merchant),
          action: { type: "cancel_one", capability_id: "BILL-003", candidates: hits.map(h => ({ merchant: h.r.merchant, monthly_cents: monthly(h.r) })), note: "The user picks which one; the cheaper one is the number surfaced." },
          evidence: { rule: "Two or more active repeating charges from services that do the same job.", rows: hits.map(h => h.r.rows[h.r.rows.length - 1]), computed: { job, monthly_each: hits.map(h => monthly(h.r)) } },
          verify: { how: "cancel claim confirmed by the billing date passing with no charge (BILL-017)" } }));
      }
      // Price rises on three or more charges: the earlier price steady, the latest at least 5 percent and $0.50 above it, within 45 days.
      const byKey = {};
      for (const t of M.clean(input.transactions || [])) if (!t.pending && !t.transfer && !t.excluded && t.amount < 0 && t.key) (byKey[t.key] = byKey[t.key] || []).push(t);
      for (const key of Object.keys(byKey).sort()) {
        const txs = byKey[key].sort((a, b) => a.date.localeCompare(b.date));
        // The earlier price's cluster may already read as dormant (its last charge is two intervals back) while the merchant is active at the new price.
        const cluster = recAll.find(r => r.key === key);
        if (txs.length < 3 || !cluster || BILL_RE.test(cluster.merchant)) continue;
        const last = txs[txs.length - 1], before = txs.slice(0, -1).slice(-3);
        const prev = before.map(t => cents(Math.abs(t.amount))), was = prev[0], now = cents(Math.abs(last.amount));
        if (prev.some(p => Math.abs(p - was) > Math.max(divRound(was * 2, 100), 25))) continue;
        const up = now - was;
        if (up < 50 || now * 100 <= was * 105 || days(last.date, input.today) > 45) continue;
        out.push(opp("P1_subscription", `price_increase:${last.merchant}`, { title: `${last.merchant} went up ${money(up)} a month`, capability_id: "BILL-002", tier: "T3",
          expected_monthly_cents: up, confidence: "high", merchant: last.merchant,
          action: { type: "cancel_or_downgrade", capability_id: "BILL-003", note: "The delta is the surfaced number; the saving depends on the user's choice." },
          evidence: { rule: "Latest charge at least 5 percent and $0.50 above a steady earlier price.", rows: before.concat([last]).map(t => ({ id: t.id, date: t.date, amount: t.amount, merchant: t.merchant })), computed: { previous_cents: was, new_cents: now, increase_cents: up } },
          verify: { how: "next charge at or below the previous price, or cancel confirmed" } }));
        // The inventory carries the merchant at its new price, dated from the latest charge.
        const next = cluster.interval === "monthly" ? M.addMonths(last.date, 1) : cluster.interval === "quarterly" ? M.addMonths(last.date, 3) : cluster.interval === "yearly" ? M.addMonths(last.date, 12) : M.addDays(last.date, { weekly: 7, biweekly: 14 }[cluster.interval]);
        const row = { key, merchant: last.merchant, amount_cents: now, interval: cluster.interval, monthly_cents: divRound(now * PER_YEAR[cluster.interval], 12), annual_cents: divRound(now * PER_YEAR[cluster.interval], 12) * 12,
          since: txs[0].date, last: last.date, next, occurrences: txs.length, cost_since_first_cents: txs.reduce((a, t) => a + cents(Math.abs(t.amount)), 0), rows: txs.map(t => ({ id: t.id, date: t.date, amount: t.amount, merchant: t.merchant })), price_changed: true };
        const i = inventory.findIndex(x => x.key === key); if (i >= 0) inventory[i] = row; else inventory.push(row);
      }
      inventory.sort((a, b) => a.key.localeCompare(b.key));
      // Annual subscriptions surfaced 14 days before renewal (BILL-011).
      for (const r of rec) if (r.interval === "yearly" && r.nextDate && days(input.today, r.nextDate) >= 0 && days(input.today, r.nextDate) <= 14)
        out.push(opp("P1_subscription", `annual_renewal:${r.merchant}`, { title: `${r.merchant} renews ${r.nextDate} for ${money(cents(r.amount))}`, capability_id: "BILL-011", tier: "T1",
          expected_monthly_cents: 0, one_time_cents: cents(r.amount), confidence: "high", due_on: r.nextDate,
          action: { type: "decide_before_renewal", capability_id: "BILL-003" }, evidence: { rule: "A yearly repeating charge due within 14 days.", rows: r.rows, computed: { next: r.nextDate } },
          verify: { how: "no renewal charge after the date, or the user kept it" } }));
      return { inventory, bills_recurring: bills_recurring.map(r => ({ key: r.key, merchant: r.merchant, amount_cents: cents(r.amount), interval: r.interval, next: r.nextDate, rows: r.rows })), opportunities: out, run_rate_monthly_cents: inventory.reduce((s, i) => s + i.monthly_cents, 0) };
    }

    // P2 Bills at or above market: the public plan price for the same service is the reference, stated as such.
    function bills(input) {
      return (input.bills || []).filter(b => Number.isSafeInteger(b.amount_cents) && Number.isSafeInteger(b.market_cents) && b.market_cents > 0 && b.amount_cents * 100 > b.market_cents * 110)
        .map(b => opp("P2_negotiation", `bill_above_market:${b.name}`, { title: `${b.name} is ${money(b.amount_cents - b.market_cents)} above the current public rate`, capability_id: "BILL-005", tier: "T3",
          expected_monthly_cents: b.amount_cents - b.market_cents, confidence: "medium",
          action: { type: "negotiation_script", note: "Retention-desk script citing the public plan; the user approves the script before any chat runs. Outcomes vary, so medium confidence." },
          evidence: { rule: "Bill more than 10 percent above the provider's current public plan for the same service.", rows: [], computed: { amount_cents: b.amount_cents, market_cents: b.market_cents } },
          verify: { how: "next bill amount lower; the delta books" } }));
    }

    // P3 Fees: the recovery engine finds them; here they are quantified as recurring (monthly) or one-time and routed to a refund request.
    function fees(input) {
      const R = Recovery();
      const rows = (input.transactions || []).map((t, i) => ({ account_id: t.account_id || "acct", provider_transaction_id: String(t.id != null ? t.id : i), fact_hash: "f" + i, currency: "USD", presence: "observed",
        is_pending: !!t.is_pending, is_transfer: !!t.is_transfer, merchant_key: null, merchant_raw: String(t.merchant_raw || ""), amount_cents: cents(t.amount), posted_on: ymd(t.posted_at) }));
      const byAccount = {}; for (const r of rows) (byAccount[r.account_id] = byAccount[r.account_id] || []).push(r);
      const candidates = [];
      for (const acct of Object.keys(byAccount).sort()) candidates.push(...R.scan(byAccount[acct], { today: input.today, accountId: acct }).candidates.filter(c => c.kind === "bank_fee"));
      const byKind = {}; for (const c of candidates) (byKind[c.fee_kind] = byKind[c.fee_kind] || []).push(c);
      const out = [];
      for (const kind of Object.keys(byKind).sort()) {
        const cs = byKind[kind].sort((a, b) => a.evidence[0].transaction_id.localeCompare(b.evidence[0].transaction_id));
        const months = new Set(cs.map(c => month(rows.find(r => r.provider_transaction_id === c.evidence[0].transaction_id).posted_on)));
        const amount = cs[cs.length - 1].amount_cents;
        if (months.size >= 2 && cs.every(c => c.amount_cents === amount))
          out.push(opp("P3_fee", `fee_recurring:${kind}`, { title: `${money(amount)} ${kind.replace(/_/g, " ")} fee every month`, capability_id: "SAVE-004", tier: "T3", expected_monthly_cents: amount, confidence: "high", occurrences: cs.length,
            action: { type: "stop_fee", capability_id: "SAVE-005", options: ["waiver setting (balance or direct deposit)", "refund request", "move the account"], draft: cs[cs.length - 1].action && cs[cs.length - 1].action.text || null },
            evidence: { rule: "The same fee kind and amount in two or more months.", rows: cs.map(c => c.evidence[0]), computed: { months: [...months].sort() } },
            verify: { how: "a month passes with no fee of this kind, or the credit posts" } }));
        else for (const c of cs)
          out.push(opp("P3_fee", `fee_refund:${kind}`, { title: `${money(c.amount_cents)} ${kind.replace(/_/g, " ")} fee`, capability_id: "SAVE-005", tier: "T3", one_time_cents: c.amount_cents, expected_monthly_cents: 0,
            confidence: kind === "overdraft" || kind === "nsf" ? "medium" : "low", candidate_id: c.id,
            action: { type: "refund_request", capability_id: "SAVE-005", draft: c.action && c.action.text || null, sent_by: "user" },
            evidence: { rule: "A posted charge the recovery engine names as a bank fee.", rows: c.evidence, computed: { age_days: c.age_days } },
            verify: { how: "a reversal credit of the same amount posts after the request (recoveryVerdict)" } }));
      }
      return out;
    }

    // P4 Rate: cash above a two-month buffer sitting at a near-zero rate while a high-yield option exists. Arithmetic, labeled with its reference rate.
    function idleCash(input) {
      const accounts = input.accounts || [], M = Monitors();
      const ref = Number.isSafeInteger(input.reference_apy_bps) ? input.reference_apy_bps : 425;
      const own = Math.max(0, ...accounts.filter(a => a.kind === "hysa" || a.kind === "savings").map(a => a.apy_bps || 0));
      const target = Math.max(ref, own);
      // Monthly income: the median of monthly payroll totals in the data; no income found means no buffer can be sized and nothing is flagged.
      const byMonth = {};
      for (const t of M.clean(input.transactions || [])) if (!t.pending && t.amount > 0 && PAYROLL_RE.test(t.merchant)) byMonth[t.date.slice(0, 7)] = (byMonth[t.date.slice(0, 7)] || 0) + cents(t.amount);
      const totals = Object.values(byMonth).sort((a, b) => a - b);
      if (!totals.length) return [];
      const income = totals[totals.length >> 1];
      const out = [];
      for (const a of accounts) {
        if (a.kind !== "checking" || !Number.isSafeInteger(a.balance_cents)) continue;
        const buffer = income * 2, excess = a.balance_cents - buffer, diff = target - (a.apy_bps || 0);
        if (excess <= 0 || diff <= 0) continue;
        const delta = divRound(excess * diff, 120000);
        if (delta < 100) continue;
        out.push(opp("P4_rate", `idle_cash:${a.id}_to_hysa`, { title: `${money(excess)} idle in ${a.id} could earn ${money(delta)} more a month`, capability_id: "SAVE-002", tier: "T0",
          expected_monthly_cents: delta, confidence: "high", excess_cents: excess, buffer_cents: buffer, from_apy_bps: a.apy_bps || 0, to_apy_bps: target, reference: own >= ref ? "the user's own high-yield account" : `a ${(ref / 100).toFixed(2)} percent reference rate`,
          action: { type: "transfer_suggestion", capability_id: "PAY-009", tier: "T3", amount_cents: excess, note: "The suggestion is information; the transfer itself is a confirmed action." },
          evidence: { rule: "Checking balance above two months of payroll income, at a rate below the reference.", rows: [], computed: { balance_cents: a.balance_cents, monthly_income_cents: income, excess_cents: excess, rate_diff_bps: diff } },
          verify: { how: "the transfer posts and the receiving account's rate is at or above the reference" } }));
      }
      return out;
    }

    // P7 Debt ordering: the math of putting an extra payment on the highest APR first. Never a lecture; a number.
    function debtOrdering(input) {
      const debts = (input.debts || []).filter(d => Number.isSafeInteger(d.balance_cents) && d.balance_cents > 0 && Number.isSafeInteger(d.apr_bps));
      const extra = Number.isSafeInteger(input.extra_payment_cents) ? input.extra_payment_cents : 0;
      if (debts.length < 2 || extra <= 0) return [];
      const byApr = debts.slice().sort((a, b) => b.apr_bps - a.apr_bps || a.balance_cents - b.balance_cents);
      const bySize = debts.slice().sort((a, b) => a.balance_cents - b.balance_cents || b.apr_bps - a.apr_bps);
      const delta = divRound(extra * (byApr[0].apr_bps - bySize[0].apr_bps), 120000);
      if (delta <= 0) return [];
      return [opp("P7_debt", `avalanche_vs_snowball:extra_${Math.round(extra / 100)}`, { title: `${money(extra)} extra on ${byApr[0].id} first saves ${money(delta)} in the first month`, capability_id: "SAVE-015", tier: "T0",
        expected_monthly_cents: delta, confidence: "medium", avalanche: byApr.map(d => d.id), snowball: bySize.map(d => d.id),
        action: { type: "plan", capability_id: "CRDT-009", note: "T0 plan; the payment itself is a confirmed action (T3). First-month delta; it grows as balances diverge." },
        evidence: { rule: "Extra payment times the APR difference between the highest-APR debt and the smallest-balance debt, per month.", rows: [], computed: { extra_cents: extra, apr_high_bps: byApr[0].apr_bps, apr_snowball_bps: bySize[0].apr_bps } },
        verify: { how: "the highest-APR balance falls by at least the extra payment in the next statement" } })];
    }

    // P8 Structural: autopay discounts on loans that carry one and are not enrolled.
    function structural(input) {
      const out = [];
      for (const d of input.debts || []) {
        const bps = Number.isSafeInteger(d.autopay_discount_bps) ? d.autopay_discount_bps : (/loan/i.test(String(d.id)) || d.kind === "loan" ? 25 : 0);
        if (!bps || d.autopay === true || !Number.isSafeInteger(d.balance_cents) || d.balance_cents <= 0) continue;
        const delta = divRound(d.balance_cents * bps, 120000);
        if (delta < 50) continue;
        out.push(opp("P8_structural", `autopay_discount:${d.id}`, { title: `Autopay on ${d.id} takes ${(bps / 100).toFixed(2)} percent off the rate: ${money(delta)} a month`, capability_id: "CRDT-013", tier: "T3",
          expected_monthly_cents: delta, confidence: "high", action: { type: "enroll_autopay", capability_id: "CRDT-013", note: "Enrollment is a confirmed action on the servicer; no auto-enrollment." },
          evidence: { rule: "A loan with an autopay rate discount and no autopay on record.", rows: [], computed: { balance_cents: d.balance_cents, discount_bps: bps } },
          verify: { how: "the servicer's rate drops by the discount" } }));
      }
      return out;
    }

    function detect(input) {
      if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.today || ""))) throw new Error("today is required (YYYY-MM-DD)");
      const subs = subscriptions(input);
      const opportunities = [].concat(subs.opportunities, bills(input), fees(input), idleCash(input), debtOrdering(input), structural(input));
      return { today: input.today, inventory: subs.inventory, bills_recurring: subs.bills_recurring, run_rate_monthly_cents: subs.run_rate_monthly_cents, opportunities,
        estimated_monthly_cents: opportunities.reduce((s, o) => s + o.expected_monthly_cents, 0), estimated_one_time_cents: opportunities.reduce((s, o) => s + (o.one_time_cents || 0), 0),
        note: "Estimates. Nothing here is booked until a verify step confirms it from the data." };
    }

    // Verify: read the outcome back from later data. Returns {verified:true, verified_monthly_cents|verified_one_time_cents, evidence} or {verified:false, reason}.
    function verify(o, later) {
      const M = Monitors(), l = later || {};
      const no = reason => ({ verified: false, reason });
      if (o.play === "P1_subscription" && o.action && (o.action.type === "cancel_one" || o.action.type === "cancel_or_downgrade")) {
        const claim = l.cancelClaim; if (!claim) return no("no cancellation on record");
        const v = M.cancelClaimVerdict(claim, l.transactions || [], l.today, l.dataThrough);
        if (v.status !== "confirmed") return no(v.reason);
        const inv = (l.cancelled_monthly_cents != null) ? l.cancelled_monthly_cents : o.expected_monthly_cents;
        return { verified: true, verified_monthly_cents: inv, evidence: v };
      }
      if (o.play === "P2_negotiation") {
        const b = (l.bills || []).find(x => `bill_above_market:${x.name}` === o.key); if (!b) return no("bill not in later data");
        const before = o.evidence.computed.amount_cents; if (!(b.amount_cents < before)) return no("next bill not lower");
        return { verified: true, verified_monthly_cents: before - b.amount_cents, evidence: { before_cents: before, after_cents: b.amount_cents } };
      }
      if (o.play === "P3_fee") {
        if (o.one_time_cents) {
          const v = M.recoveryVerdict({ merchant: o.title, amount: o.one_time_cents / 100, sentOn: l.requestSentOn, isBankFee: true }, l.transactions || []);
          return v.status === "landed" ? { verified: true, verified_one_time_cents: o.one_time_cents, evidence: v.credit } : no("no reversal credit has posted");
        }
        const R = Recovery(), kind = o.key.split(":")[1];
        const since = ymd(l.requestSentOn); if (!since || !l.today || days(since, l.today) < 32) return no("a full month has not passed since the request");
        const rows = (l.transactions || []).map((t, i) => ({ account_id: t.account_id || "acct", provider_transaction_id: String(t.id != null ? t.id : i), fact_hash: "v" + i, currency: "USD", presence: "observed", is_pending: !!t.is_pending, is_transfer: !!t.is_transfer, merchant_key: null, merchant_raw: String(t.merchant_raw || ""), amount_cents: cents(t.amount), posted_on: ymd(t.posted_at) }));
        const after = R.scan(rows, { today: l.today }).candidates.filter(c => c.kind === "bank_fee" && c.fee_kind === kind && rows.find(r => r.provider_transaction_id === c.evidence[0].transaction_id).posted_on > since);
        return after.length ? no(`a ${kind} fee posted again on ${rows.find(r => r.provider_transaction_id === after[0].evidence[0].transaction_id).posted_on}`) : { verified: true, verified_monthly_cents: o.expected_monthly_cents, evidence: { no_fee_since: since, through: l.today } };
      }
      if (o.play === "P4_rate") {
        const from = (l.accounts || []).find(a => a.id === o.key.split(":")[1].split("_to_")[0]); if (!from) return no("account not in later data");
        const moved = o.evidence.computed.balance_cents - from.balance_cents; if (moved <= 0) return no("nothing moved");
        const to = (l.accounts || []).filter(a => a.kind === "hysa" || a.kind === "savings").sort((a, b) => (b.apy_bps || 0) - (a.apy_bps || 0))[0];
        if (!to || (to.apy_bps || 0) < o.to_apy_bps) return no("no receiving account at the reference rate");
        return { verified: true, verified_monthly_cents: divRound(Math.min(moved, o.excess_cents) * (to.apy_bps - o.from_apy_bps), 120000), evidence: { moved_cents: moved, to: to.id, apy_bps: to.apy_bps } };
      }
      if (o.play === "P7_debt") {
        const id = o.avalanche[0], before = (o.evidence && l.before_debts || []).find(d => d.id === id), after = (l.debts || []).find(d => d.id === id);
        if (!before || !after) return no("debt balances not in later data");
        return before.balance_cents - after.balance_cents >= o.evidence.computed.extra_cents ? { verified: true, verified_monthly_cents: o.expected_monthly_cents, evidence: { before_cents: before.balance_cents, after_cents: after.balance_cents } } : no("the extra payment did not land on the highest-APR debt");
      }
      if (o.play === "P8_structural") {
        const id = o.key.split(":")[1], after = (l.debts || []).find(d => d.id === id); if (!after) return no("loan not in later data");
        const beforeApr = (l.before_debts || []).find(d => d.id === id);
        return after.autopay === true && beforeApr && after.apr_bps <= beforeApr.apr_bps - o.evidence.computed.discount_bps ? { verified: true, verified_monthly_cents: o.expected_monthly_cents, evidence: { apr_before_bps: beforeApr.apr_bps, apr_after_bps: after.apr_bps } } : no("rate has not dropped by the discount");
      }
      return no("no verify step for this play");
    }

    // The savings ledger: expected and verified never mix. book() refuses anything a verify step did not confirm.
    function ledger(initial) {
      const entries = Array.isArray(initial) ? initial.slice() : [];
      return {
        entries,
        book(o, v, at) {
          if (!v || v.verified !== true) throw new Error("The ledger books verified deltas only; keep estimates in the queue.");
          if (entries.some(e => e.key === o.key && e.verified_at === ymd(at))) return entries.find(e => e.key === o.key && e.verified_at === ymd(at));
          const e = { play: o.play, key: o.key, action: o.action && o.action.type || null, expected_monthly_cents: o.expected_monthly_cents, verified_monthly_cents: v.verified_monthly_cents || 0, verified_one_time_cents: v.verified_one_time_cents || 0, verified_at: ymd(at), evidence: v.evidence || null };
          entries.push(e); return e;
        },
        summary(asOf) {
          const upto = entries.filter(e => !asOf || e.verified_at <= ymd(asOf));
          return { verified_monthly_cents: upto.reduce((s, e) => s + e.verified_monthly_cents, 0), verified_one_time_cents: upto.reduce((s, e) => s + e.verified_one_time_cents, 0), count: upto.length };
        },
        // "You're saving $X a month more than in <month>, verified": verified monthly run-rate now minus then.
        sinceDelta(since, now) { return this.summary(now).verified_monthly_cents - this.summary(since).verified_monthly_cents; },
        message(since, now) { const d = this.sinceDelta(since, now); return d > 0 ? `You're saving ${money(d)} a month more than in ${ymd(since).slice(0, 7)}, verified.` : null; }
      };
    }

    // The queue: verified dollars first, then estimates weighted by confidence. Each item carries the reason the user cares (doc 01 requires it).
    function rank(opportunities, book) {
      const verified = new Map((book && book.entries || []).map(e => [e.key, e]));
      const score = o => { const v = verified.get(o.key); if (v) return 1e12 + v.verified_monthly_cents * 12 + v.verified_one_time_cents; return (o.expected_monthly_cents * 12 + (o.one_time_cents || 0)) * (WEIGHT[o.confidence] || 0.3); };
      return opportunities.slice().sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key)).map(o => {
        const v = verified.get(o.key);
        const reason = v ? `verified: ${money(v.verified_monthly_cents)} a month` : o.expected_monthly_cents ? `this saves an estimated ${money(o.expected_monthly_cents)} a month (${o.confidence} confidence)` : `an estimated ${money(o.one_time_cents || 0)} one time (${o.confidence} confidence)`;
        return Object.assign({}, o, { verified: !!v, score: score(o), reason, estimate: !v });
      });
    }
    return { detect, verify, ledger, rank, subscriptions, bills, fees, idleCash, debtOrdering, structural, ONE_IS_ENOUGH, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentSave;
