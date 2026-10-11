  /* Save engine (Instinct spec doc 07). Pure and deterministic. Every play
     runs detect -> quantify -> act -> verify -> book. Detectors read the
     user's own normalized rows (AgentMonitors) and return candidates with
     the rows that prove them. Estimates are labeled estimates; the savings
     ledger books an expected delta and a verified delta in separate columns
     that are never summed together. Nothing here sends a message: the
     ranked queue feeds the proactivity budget in the agent loop. */
  const AgentSaveEngine = (() => {
    const floor = (a, b) => Math.floor(a / b);
    // Merchant normalization seed (TXN-004): statement descriptors -> canonical slug. Data, extended as feeds reveal variants.
    const MERCHANTS = [
      ["netflix", /netflix/i], ["spotify", /spotify/i], ["apple_music", /apple\.com\/bill.*(music)|apple music/i], ["icloud", /icloud|apple\.com\/bill.*cupertino/i],
      ["hulu", /\bhulu\b|hlu\*/i], ["disney_plus", /disney ?plus|disneyplus/i], ["youtube_premium", /youtube ?premium|google ?\*youtube/i],
      ["audible", /audible/i], ["peloton_app", /peloton/i], ["duolingo", /duolingo/i], ["headspace", /headspace/i], ["nyt", /nytimes|new york times/i],
      ["adobe_cc", /adobe/i], ["dropbox", /dropbox|dbx\*/i], ["gym", /planet fit/i], ["amazon_prime", /amazon prime|amzn prime|prime membership/i],
      ["chatgpt", /openai|chatgpt/i], ["hbo_max", /hbo ?max|warnermedia|max\*hbo/i], ["paramount", /paramount/i], ["calm", /\bcalm\b|calm\.com|calm\*/i]
    ];
    // Apple bills everything as APPLE.COM/BILL; the slug comes from the recurring amount when the descriptor is ambiguous.
    const APPLE_BY_PRICE = { 1099: "apple_music", 299: "icloud" };
    const CATEGORIES = { music: ["spotify", "apple_music"], storage: ["dropbox", "icloud"], meditation: ["calm", "headspace"] };
    const FEES = [
      ["overdraft_fee", /overdraft|\bod fee\b|insufficient funds|\bnsf\b/i, false],
      ["atm_fee", /atm (fee|surcharge)|non-?bank atm|out[- ]of[- ]network/i, false],
      ["maintenance_fee", /monthly (service|maintenance) fee|maintenance fee|service charge/i, true],
      ["foreign_transaction_fee", /foreign transaction|intl trans|international (transaction|fee)/i, false],
      ["late_fee", /late (payment )?fee|late fee assessed/i, false]
    ];
    const WEIGHT = { high: 1, medium: 0.6, low: 0.3 };
    const slugOf = (raw, amountCents) => {
      const s = String(raw || "");
      if (/apple\.com\/bill/i.test(s) && !/music|icloud/i.test(s) && APPLE_BY_PRICE[amountCents]) return APPLE_BY_PRICE[amountCents];
      for (const [slug, re] of MERCHANTS) if (re.test(s)) return slug;
      return null;
    };
    const cents = dollars => Math.round(Math.abs(dollars) * 100);
    const candidate = (play, key, subtype, monthly, confidence, evidence, action, extra) =>
      Object.assign({ play, key, subtype, expected_monthly_cents: monthly, confidence, estimate: true, evidence, action }, extra || {});

    // Recurring charges grouped by canonical slug, not by raw descriptor: a feed that spells one merchant five ways
    // (AUDIBLE*, AMZN DIGITAL*AUDIBLE K12, Audible Inc M4) is still one subscription. Within a slug, charges cluster
    // by amount (5%) so a price rise shows as two clusters. A cluster is recurring when it has at least two charges in
    // at least two distinct months; two seats billed in the same month are kept (family plans), unlike a strict cadence test.
    function recurringBySlug(input) {
      const groups = new Map();
      for (const t of input.transactions) {
        if (t.is_transfer || !(t.amount < 0)) continue;
        const slug = slugOf(t.merchant_raw, cents(t.amount));
        if (!slug) continue;
        if (!groups.has(slug)) groups.set(slug, []);
        groups.get(slug).push(t);
      }
      const out = new Map();
      for (const [slug, txs] of groups) {
        txs.sort((a, b) => a.posted_at.localeCompare(b.posted_at) || a.id.localeCompare(b.id));
        const clusters = [];
        for (const t of txs) {
          const amt = cents(t.amount);
          // Tolerance 4% or 50 cents: a $1 rise on an $18 plan is a real price change, a tax rounding wobble is not.
          let c = clusters.find(x => Math.abs(x.amount - amt) <= Math.max(x.amount * 0.04, 50));
          if (!c) { c = { amount: amt, txs: [] }; clusters.push(c); }
          c.txs.push(t);
        }
        const items = [];
        for (const c of clusters) {
          const months = new Set(c.txs.map(t => t.posted_at.slice(0, 7)));
          if (c.txs.length < 2 || months.size < 2) continue;
          const last = c.txs[c.txs.length - 1];
          const since = AgentMonitors.daysBetween(last.posted_at, input.today);
          items.push({ slug, amount: c.amount / 100, occurrences: c.txs.length, months: months.size, firstDate: c.txs[0].posted_at, lastDate: last.posted_at,
            dormant: since !== null && since > 62, rows: c.txs.map(t => ({ id: t.id, date: t.posted_at, amount: t.amount, merchant: t.merchant_raw })) });
        }
        if (items.length) out.set(slug, { slug, items, rows: items.flatMap(i => i.rows) });
      }
      return out;
    }

    // P1 subscriptions: duplicates across a category, price rises, converted trials, unused.
    function subscriptions(input, recurring) {
      const out = [], usage = input.usage || {}, usedKey = slug => `merchant:${slug}` in usage ? usage[`merchant:${slug}`] : (slug in usage ? usage[slug] : undefined);
      for (const [cat, slugs] of Object.entries(CATEGORIES)) {
        const present = slugs.filter(s => recurring.has(s) && recurring.get(s).items.some(i => !i.dormant));
        if (present.length >= 2) {
          const cheaper = present.map(s => ({ s, amt: Math.min(...recurring.get(s).items.map(i => cents(i.amount))) })).sort((a, b) => a.amt - b.amt || a.s.localeCompare(b.s))[0];
          out.push(candidate("P1_subscription", `merchant:${cheaper.s}`, "duplicate_service", cheaper.amt, "high",
            { rule: `Two active ${cat} services.`, rows: present.flatMap(s => recurring.get(s).rows), pair: present.map(s => `merchant:${s}`) },
            { capability_id: "BILL-003", tier: "T3", describe: `cancel the ${cat} service you use less` }));
        }
      }
      for (const [slug, e] of recurring) {
        const items = e.items.slice().sort((a, b) => cents(b.amount) - cents(a.amount));
        if (items.length >= 2) {
          const hi = items[0], lo = items[items.length - 1];
          if (hi.lastDate > lo.lastDate && hi.occurrences >= 2 && cents(hi.amount) > cents(lo.amount))
            out.push(candidate("P1_subscription", `merchant:${slug}`, "price_rise", cents(hi.amount) - cents(lo.amount), "high",
              { rule: "Same merchant, latest cycles charge more than earlier cycles.", rows: e.rows, computed: { from_cents: cents(lo.amount), to_cents: cents(hi.amount) } },
              { capability_id: "BILL-006", tier: "T3", describe: "downgrade or cancel after the price rise" }));
        }
        const trial = input.transactions.filter(t => !t.is_transfer && slugOf(t.merchant_raw, 0) === slug && Math.abs(t.amount) <= 1 && t.amount <= 0);
        const full = e.items.filter(i => !i.dormant);
        if (trial.length && full.length && full[0].firstDate > trial[0].posted_at)
          out.push(candidate("P1_subscription", `merchant:${slug}`, "trial_converted", cents(full[0].amount), "high",
            { rule: "A free-trial charge followed by full-price charges.", rows: [...trial.map(t => ({ id: t.id, date: t.posted_at, amount: t.amount, merchant: t.merchant_raw })), ...e.rows] },
            { capability_id: "BILL-003", tier: "T3", describe: "cancel the converted trial" }));
        if (usedKey(slug) === null && full.length)
          out.push(candidate("P1_subscription", `merchant:${slug}`, "unused", cents(full[0].amount), "medium",
            { rule: "No usage signal on record.", rows: e.rows }, { capability_id: "BILL-003", tier: "T3", describe: "cancel the unused subscription" }));
      }
      return out;
    }

    // P2 bill negotiation: bills priced above the current public market rate.
    function negotiation(input) {
      return (input.bills || []).filter(b => Number.isSafeInteger(b.amount_cents) && Number.isSafeInteger(b.market_cents) && b.amount_cents > b.market_cents)
        .map(b => candidate("P2_negotiation", `bill:${b.name}`, "above_market", b.amount_cents - b.market_cents, "medium",
          { rule: "Bill above current public plan pricing.", computed: { amount_cents: b.amount_cents, market_cents: b.market_cents } },
          { capability_id: "BILL-005", tier: "T3", describe: `negotiate ${b.name} toward the market rate` }));
    }

    // P3 fee recovery: every posted fee; recurring account fees count monthly, one-time fees book once.
    function fees(input) {
      const out = [], recurringFee = [];
      for (const t of input.transactions) {
        if (t.is_transfer || t.amount >= 0) continue;
        const f = FEES.find(([, re]) => re.test(t.merchant_raw));
        if (!f) continue;
        if (f[2]) { recurringFee.push(t); continue; }
        out.push(candidate("P3_fee", `txn:${t.id}`, f[0], cents(t.amount), "high",
          { rule: "A posted charge whose description names a bank fee.", rows: [{ id: t.id, date: t.posted_at, amount: t.amount, merchant: t.merchant_raw }] },
          { capability_id: "SAVE-005", tier: "T2", describe: "draft the fee refund request" }, { one_time_cents: cents(t.amount) }));
      }
      if (recurringFee.length)
        out.push(candidate("P3_fee", "merchant:monthly_service_fee", "maintenance_fee", cents(recurringFee[recurringFee.length - 1].amount), "high",
          { rule: "A recurring account fee.", rows: recurringFee.map(t => ({ id: t.id, date: t.posted_at, amount: t.amount, merchant: t.merchant_raw })) },
          { capability_id: "SAVE-005", tier: "T2", describe: "ask for the fee waiver or switch to a no-fee account" }));
      return out;
    }

    // P4 rate: idle cash earning far below market; card balances accruing while that cash sits.
    function rate(input) {
      const out = [], accounts = input.accounts || [], market = (input.market && input.market.hysa_apy_bps) || 400;
      const minIdle = (input.thresholds && input.thresholds.idle_cash_min_cents) || 400000;
      const best = Math.max(market, ...accounts.filter(a => a.kind === "hysa").map(a => a.apy_bps || 0));
      const savings = accounts.filter(a => a.kind === "savings" && a.balance_cents >= minIdle && (a.apy_bps || 0) < best - 100);
      for (const a of savings)
        out.push(candidate("P4_rate", `account:${a.id}`, "idle_cash", floor(floor(a.balance_cents * (best - (a.apy_bps || 0)), 10000), 12), "high",
          { rule: "Savings balance earning far below the best available rate.", computed: { balance_cents: a.balance_cents, apy_bps: a.apy_bps || 0, best_bps: best } },
          { capability_id: "SAVE-002", tier: "T0", describe: "move idle cash to the higher rate (transfer is T3)" }));
      const idle = accounts.filter(a => a.kind === "savings").reduce((s, a) => s + a.balance_cents, 0);
      for (const c of accounts.filter(a => a.kind === "credit_card" && a.balance_cents > 0 && (a.apr_bps || 0) > 0 && idle >= a.balance_cents))
        out.push(candidate("P4_rate", `account:${c.id}`, "card_accruing_while_cash_idle", floor(floor(c.balance_cents * c.apr_bps, 10000), 12), "high",
          { rule: "Card balance accruing interest while savings could clear it.", computed: { balance_cents: c.balance_cents, apr_bps: c.apr_bps, idle_cents: idle } },
          { capability_id: "SAVE-015", tier: "T0", describe: "pay the card from idle savings (payment is T3)" }));
      return out;
    }

    // P7 debt ordering: avalanche vs lowest-balance-first, simulated month by month with the user's extra payment.
    function simulate(debts, extra, order) {
      const bal = {}, apr = {}, mins = {};
      for (const d of debts) { bal[d.id] = d.balance_cents; apr[d.id] = d.apr_bps; mins[d.id] = d.min_payment_cents; }
      let interest = 0, months = 0;
      while (Object.values(bal).some(b => b > 0) && months < 600) {
        months++;
        for (const i of order) { if (bal[i] <= 0) continue; const charge = floor(bal[i] * apr[i], 120000); interest += charge; bal[i] += charge; }
        let budget = extra;
        for (const i of order) { if (bal[i] <= 0) continue; bal[i] -= Math.min(bal[i], mins[i]); }
        for (const i of order) { if (bal[i] <= 0) continue; const pay = Math.min(bal[i], budget); bal[i] -= pay; budget -= pay; if (budget <= 0) break; }
      }
      return { interest, months };
    }
    function debt(input) {
      const debts = (input.debts || []).filter(d => d.balance_cents > 0);
      if (debts.length < 2) return [];
      const extra = (input.market && input.market.debt_extra_payment_cents) || 20000;
      const aval = debts.slice().sort((a, b) => b.apr_bps - a.apr_bps), snow = debts.slice().sort((a, b) => a.balance_cents - b.balance_cents);
      const a = simulate(debts, extra, aval.map(d => d.id)), s = simulate(debts, extra, snow.map(d => d.id));
      const saved = Math.max(0, s.interest - a.interest);
      if (!saved) return [];
      return [candidate("P7_debt", `debt:${aval[0].id}`, "avalanche_ordering", Math.max(1, floor(saved, Math.max(1, a.months))), "medium",
        { rule: "Highest-APR-first saves interest versus lowest-balance-first at the same payment.", computed: { extra_cents: extra, interest_saved_cents: saved, months: a.months, order: aval.map(d => d.id) } },
        { capability_id: "SAVE-015", tier: "T0", describe: "direct extra payments at the highest-APR debt first" })];
    }

    // P8 structural: annual-pay discounts on subscriptions kept, family plans for duplicated household seats.
    function structural(input, recurring, flaggedUnused) {
      const out = [], m = input.market || {}, annual = m.annual_plans || {}, family = m.family_plans || {};
      for (const [slug, e] of recurring) {
        const key = `merchant:${slug}`, active = e.items.filter(i => !i.dormant);
        if (!active.length) continue;
        const a = annual[key];
        if (a && !flaggedUnused.has(key) && active.some(i => cents(i.amount) === a.monthly_cents) && a.monthly_cents - floor(a.annual_cents, 12) > 0)
          out.push(candidate("P8_structural", key, "annual_pay_discount", a.monthly_cents - floor(a.annual_cents, 12), "high",
            { rule: "Monthly price exceeds the annual plan's monthly equivalent.", rows: e.rows, computed: a },
            { capability_id: "SAVE-017", tier: "T3", describe: "switch to annual billing" }));
        const f = family[key];
        if (f) {
          // Two seats a month: the same slug charged twice within each billing cycle.
          const byMonth = {};
          for (const r of e.rows) byMonth[r.date.slice(0, 7)] = (byMonth[r.date.slice(0, 7)] || 0) + 1;
          const months = Object.values(byMonth);
          if (months.length >= 2 && months.filter(n => n >= 2).length >= Math.ceil(months.length * 0.6) && 2 * f.individual_cents > f.family_cents)
            out.push(candidate("P8_structural", key, "family_plan", 2 * f.individual_cents - f.family_cents, "high",
              { rule: "Two individual plans in the household each month.", rows: e.rows, computed: f },
              { capability_id: "SAVE-017", tier: "T3", describe: "consolidate onto the family plan" }));
        }
      }
      return out;
    }

    function detect(input) {
      if (!input || !Array.isArray(input.transactions) || !input.today) throw new Error("detect needs transactions and today.");
      const recurring = recurringBySlug(input);
      const subs = subscriptions(input, recurring);
      const unused = new Set(subs.filter(c => c.subtype === "unused").map(c => c.key));
      const all = [...subs, ...negotiation(input), ...fees(input), ...rate(input), ...debt(input), ...structural(input, recurring, unused)];
      all.forEach(c => { c.id = `${c.play}:${c.subtype}:${c.key}`; });
      return all;
    }

    // Savings ledger: expected (estimate) and verified (observed after a cycle) are separate columns, never summed.
    function ledger(state) {
      const s = state && typeof state === "object" ? state : { entries: [] };
      s.entries = s.entries || [];
      return {
        state: s,
        book(c, actionTaken, at) {
          if (!c || !Number.isSafeInteger(c.expected_monthly_cents)) throw new Error("A booking needs a candidate with an integer expected delta.");
          if (s.entries.some(e => e.id === c.id && e.status !== "rejected")) return s.entries.find(e => e.id === c.id);
          const e = { id: c.id, play: c.play, key: c.key, action: actionTaken || null, booked_at: at || null, expected_monthly_cents: c.expected_monthly_cents,
            verified_monthly_cents: null, verified_at: null, status: "expected" };
          s.entries.push(e); return e;
        },
        verify(id, actualMonthlyCents, at, evidence) {
          const e = s.entries.find(x => x.id === id);
          if (!e) throw new Error("Unknown ledger entry.");
          if (!Number.isSafeInteger(actualMonthlyCents)) throw new Error("A verified delta is an observed integer, never an estimate.");
          e.verified_monthly_cents = actualMonthlyCents; e.verified_at = at || null; e.verification = evidence || null;
          e.status = actualMonthlyCents > 0 ? "verified" : "did_not_hold";
          return e;
        },
        summary() {
          const verified = s.entries.filter(e => e.status === "verified").reduce((n, e) => n + e.verified_monthly_cents, 0);
          const expected = s.entries.filter(e => e.status === "expected").reduce((n, e) => n + e.expected_monthly_cents, 0);
          return { verified_monthly_cents: verified, expected_unverified_monthly_cents: expected, entries: s.entries.length,
            message: verified ? `You're saving $${(verified / 100).toFixed(2)}/month, verified.` : "Nothing verified yet; estimates are estimates until a billing cycle confirms them." };
        }
      };
    }

    // Ranked queue: verified dollars first, then expected dollars weighted by confidence. The proactivity budget decides what surfaces.
    function rank(candidates, ledgerState) {
      const verified = new Map(((ledgerState && ledgerState.entries) || []).filter(e => e.status === "verified").map(e => [e.id, e.verified_monthly_cents]));
      return candidates.slice().sort((a, b) => {
        const va = verified.get(a.id) || 0, vb = verified.get(b.id) || 0;
        if (va !== vb) return vb - va;
        const sa = a.expected_monthly_cents * (WEIGHT[a.confidence] || 0.3), sb = b.expected_monthly_cents * (WEIGHT[b.confidence] || 0.3);
        return sb - sa || a.key.localeCompare(b.key);
      });
    }
    return { detect, ledger, rank, slugOf, simulate, MERCHANTS: MERCHANTS.map(m => m[0]), FEES: FEES.map(f => f[0]) };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentSaveEngine;
