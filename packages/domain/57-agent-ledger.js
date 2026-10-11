  /* Ledger and analytics (Instinct spec doc 02 ACCT, TXN, ANL, CARD, CRDT capabilities):
     the functions over real rows that produce every number the agent says about
     accounts, transactions, spending, cards and debts. Pure: integer cents in and
     out, no floats in totals, no provider calls. Every result names its data
     source and as-of time so the composer can cite them (doc 11). Nothing here
     estimates a balance: a missing rate or a hidden account is reported as such,
     never filled in. Loads after AgentMonitors and MoneyMath (optional). */
  const AgentLedger = (() => {
    const DAY = 86400000;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const cents = t => Number.isInteger(t.amount_cents) ? t.amount_cents : Math.round(Number(t.amount || 0) * 100);
    const ymd = s => String(s || "").slice(0, 10);
    const dayMs = s => Date.parse(ymd(s) + "T00:00:00Z");
    const addDays = (s, n) => new Date(dayMs(s) + n * DAY).toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);
    const monthOf = s => ymd(s).slice(0, 7);
    const daysInMonth = m => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
    const addMonths = (s, n) => { const d = new Date(dayMs(s)); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); };
    const divRound = (n, d) => { const q = Math.trunc(n / d), r = n - q * d; return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q; };
    const sum = arr => arr.reduce((s, x) => s + x, 0);
    const mkey = raw => typeof AgentMonitors !== "undefined" && AgentMonitors.merchantKey ? AgentMonitors.merchantKey(raw) : String(raw || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

    const LIQUID = new Set(["checking", "savings", "cash", "money_market"]);
    const LIABILITY = new Set(["credit_card", "loan", "mortgage", "student_loan", "auto_loan", "line_of_credit", "bnpl"]);
    const ASSET_GROUPS = { cash: ["checking", "savings", "cash", "money_market"], investments: ["brokerage", "crypto"], retirement: ["retirement", "ira", "401k", "hsa"], property: ["property", "vehicle"], other_assets: [] };
    const groupOf = kind => LIABILITY.has(kind) ? "liabilities" : Object.keys(ASSET_GROUPS).find(g => ASSET_GROUPS[g].includes(kind)) || "other_assets";

    // Source and as-of: the connector that reported the rows and the newest timestamp among them; "manual" when the user typed them.
    function provenance(accounts, transactions, today) {
      const sources = [...new Set((accounts || []).map(a => a.source || a.institution || "manual").filter(Boolean))];
      const stamps = (accounts || []).map(a => a.as_of).concat((transactions || []).map(t => t.posted_at)).filter(Boolean).map(String).sort();
      return { source: sources.length ? sources.join(", ") : "your transactions", as_of: stamps.length ? stamps[stamps.length - 1] : today || null };
    }
    const visible = (accounts, o) => (accounts || []).filter(a => (o && o.include_hidden) || !a.hidden);
    const owned = (accounts, o) => !o || !o.owner ? accounts : accounts.filter(a => (a.owners || ["me"]).includes(o.owner));

    // ACCT-001/002/003/013/014: balances and the list, hidden accounts excluded from totals, joint vs individual by owner.
    function balance(account) {
      if (!account) return null;
      const p = provenance([account]);
      return { account_id: account.id, kind: account.kind, balance_cents: account.balance_cents, available_cents: Number.isInteger(account.available_cents) ? account.available_cents : null, currency: account.currency || "USD", source: p.source, as_of: p.as_of, stale: !!account.stale,
        explanation: Number.isInteger(account.available_cents) && account.available_cents !== account.balance_cents ? `${money(account.available_cents)} available of ${money(account.balance_cents)}: ${money(account.balance_cents - account.available_cents)} is pending or on hold.` : null };
    }
    function listAccounts(accounts, opts) {
      const rows = owned(visible(accounts, opts), opts).map(balance);
      const byInstitution = {};
      for (const r of rows) { const inst = (accounts.find(a => a.id === r.account_id) || {}).institution || "manual"; (byInstitution[inst] = byInstitution[inst] || []).push(r); }
      const hidden = (accounts || []).filter(a => a.hidden).map(a => a.id);
      return { accounts: rows, by_institution: byInstitution, hidden_excluded: (opts && opts.include_hidden) ? [] : hidden, count: rows.length, ...provenance(accounts) };
    }
    // ACCT-004/011: net worth from every visible account, liabilities subtracted, foreign currency converted only with a dated rate; otherwise listed as unconverted.
    function netWorth(accounts, opts) {
      const o = opts || {}, fx = o.fx || { rates: {} }, groups = { cash: 0, investments: 0, retirement: 0, property: 0, other_assets: 0, liabilities: 0 }, unconverted = [];
      for (const a of owned(visible(accounts, o), o)) {
        const cur = a.currency || "USD"; let c = a.balance_cents;
        if (cur !== "USD") { const r = fx.rates && fx.rates[cur]; if (!r) { unconverted.push({ account_id: a.id, currency: cur, balance_cents: a.balance_cents }); continue; } c = divRound(a.balance_cents * Math.round(r * 1e6), 1e6); }
        groups[groupOf(a.kind)] += c;
      }
      const assets = groups.cash + groups.investments + groups.retirement + groups.property + groups.other_assets;
      return { net_worth_cents: assets - groups.liabilities, assets_cents: assets, liabilities_cents: groups.liabilities, groups, unconverted, fx_as_of: unconverted.length === 0 && Object.keys(fx.rates || {}).length ? fx.as_of || null : (fx.as_of || null), ...provenance(accounts) };
    }
    // ACCT-018: cash position across liquid accounts only.
    function cashPosition(accounts, opts) {
      const liquid = owned(visible(accounts, opts), opts).filter(a => LIQUID.has(a.kind) && (a.currency || "USD") === "USD");
      return { cash_cents: sum(liquid.map(a => a.balance_cents)), available_cents: sum(liquid.map(a => Number.isInteger(a.available_cents) ? a.available_cents : a.balance_cents)), accounts: liquid.map(a => a.id), ...provenance(accounts) };
    }
    // ACCT-017: balance history from dated snapshots, with a 30-day trend; ANL-017 net worth history is the same over all accounts.
    function balanceHistory(snapshots, opts) {
      const o = opts || {}, rows = (snapshots || []).filter(s => !o.account_id || s.account_id === o.account_id).slice().sort((a, b) => ymd(a.on).localeCompare(ymd(b.on)));
      const byDay = {}; for (const s of rows) byDay[ymd(s.on)] = (byDay[ymd(s.on)] || 0) + s.balance_cents;
      const series = Object.keys(byDay).sort().map(on => ({ on, balance_cents: byDay[on] }));
      if (!series.length) return { series: [], trend: null, source: "snapshots", as_of: null };
      const last = series[series.length - 1], ref = series.filter(p => daysBetween(p.on, last.on) >= 30).pop() || series[0];
      const delta = last.balance_cents - ref.balance_cents;
      return { series, trend: { from: ref.on, to: last.on, delta_cents: delta, direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat" }, source: "snapshots", as_of: last.on };
    }
    function netWorthHistory(snapshots, accounts) {
      const hidden = new Set((accounts || []).filter(a => a.hidden).map(a => a.id)), liab = new Set((accounts || []).filter(a => LIABILITY.has(a.kind)).map(a => a.id));
      const signed = (snapshots || []).filter(s => !hidden.has(s.account_id)).map(s => ({ on: s.on, account_id: s.account_id, balance_cents: liab.has(s.account_id) ? -s.balance_cents : s.balance_cents }));
      return balanceHistory(signed);
    }
    // ACCT-015/016: closed-account candidates (flagged, or zero balance with no activity for 90 days) and duplicates across connectors.
    function closedCandidates(accounts, transactions, today) {
      return (accounts || []).filter(a => a.closed || (a.balance_cents === 0 && !(transactions || []).some(t => t.account_id === a.id && daysBetween(ymd(t.posted_at), today) < 90))).map(a => ({ account_id: a.id, reason: a.closed ? "reported closed by the connector" : "zero balance and no activity in 90 days", action: "confirm and hide, or keep" }));
    }
    function duplicates(accounts) {
      const groups = {};
      for (const a of accounts || []) { if (!a.mask) continue; const k = `${String(a.institution || "").toLowerCase()}|${a.kind}|${a.mask}`; (groups[k] = groups[k] || []).push(a.id); }
      return Object.values(groups).filter(g => g.length > 1).map(ids => ({ account_ids: ids, reason: "same institution, kind and last digits across connectors", action: "keep one; totals count it once" }));
    }
    function dedupe(accounts) { const dup = duplicates(accounts), drop = new Set(dup.flatMap(d => d.account_ids.slice(1))); return { accounts: (accounts || []).filter(a => !drop.has(a.id)), dropped: [...drop], duplicates: dup }; }

    // TXN-003/004: merchant normalization and categorization with user rules that always win over the defaults.
    const DISPLAY = [[/\bamzn\b|amazon/, "Amazon"], [/\bsq \*|square\b/, "Square merchant"], [/\btst\*|toast\b/, "Toast restaurant"], [/\bwholefds|whole foods/, "Whole Foods"], [/\btrader joe/, "Trader Joe's"], [/\bcostco/, "Costco"], [/\bkroger/, "Kroger"], [/\bstarbucks/, "Starbucks"], [/\buber\b(?! ?eats)/, "Uber"], [/\buber ?eats|doordash|grubhub/, "Food delivery"], [/\bnetflix/, "Netflix"], [/\bspotify/, "Spotify"], [/\bapple\.com\/bill|apple com bill/, "Apple"], [/\bgoogle \*?one|google one/, "Google One"], [/\bpayroll|direct dep|dir dep/, "Payroll"], [/\bvenmo/, "Venmo"], [/\bzelle/, "Zelle"], [/\bshell|chevron|exxon|bp\b/, "Fuel"], [/\bcomcast|xfinity/, "Comcast Xfinity"]];
    const CATEGORY_RULES = [["income", /payroll|direct dep|dir dep|salary|deposit from employer/], ["transfers", /transfer|zelle|venmo|cash app|paypal/], ["housing", /rent|mortgage|property mgmt|hoa/], ["utilities", /electric|power|gas co|water|comcast|xfinity|verizon|at&t|t-mobile|internet|mobile/], ["subscriptions", /netflix|spotify|hulu|disney|apple\.com\/bill|apple com bill|google \*?one|microsoft|adobe|prime|peloton|nytimes|planet fit/], ["groceries", /trader joe|kroger|costco|wholefds|whole foods|safeway|aldi|grocery|market/], ["dining", /starbucks|chipotle|restaurant|cafe|coffee|doordash|uber ?eats|grubhub|tst\*|pizza|burger/], ["transport", /uber(?! ?eats)|lyft|shell|chevron|exxon|parking|transit|metro|fuel/], ["fees", /fee|overdraft|nsf|atm/], ["health", /pharmacy|cvs|walgreens|clinic|dental|doctor|hospital/], ["insurance", /insurance|geico|state farm|allstate|progressive/], ["debt_payment", /loan payment|nelnet|sallie|student loan|card payment|autopay/], ["travel", /airline|delta|united|hotel|airbnb|marriott/], ["shopping", /amazon|amzn|target|walmart|best buy|nike|etsy/], ["entertainment", /cinema|theater|ticket|steam|playstation|xbox/]];
    function normalizeMerchant(raw) {
      const k = mkey(raw); const hit = DISPLAY.find(([re]) => re.test(k) || re.test(String(raw || "").toLowerCase()));
      return { raw, key: k, display: hit ? hit[1] : k.replace(/\b\d{3,}\b/g, "").trim().replace(/\b[a-z]/g, ch => ch.toUpperCase()) || String(raw || "") };
    }
    function categorize(t, rules) {
      const text = `${t.merchant_raw || t.merchant || ""} ${t.note || ""}`.toLowerCase(), c = cents(t);
      if (t.category_override) return { category: t.category_override, by: "user override on this transaction" };
      for (const r of rules || []) { const re = r.match instanceof RegExp ? r.match : new RegExp(String(r.match).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); if (re.test(text)) return { category: r.category, by: `your rule: ${r.match}` }; }
      if (t.is_transfer) return { category: "transfers", by: "transfer between your accounts" };
      if (c > 0) { const inc = CATEGORY_RULES.find(([cat, re]) => cat === "income" && re.test(text)); return inc ? { category: "income", by: "default rule" } : { category: "refunds_and_credits", by: "credit without a payroll descriptor" }; }
      const hit = CATEGORY_RULES.find(([cat, re]) => cat !== "income" && re.test(text));
      return hit ? { category: hit[0], by: "default rule" } : { category: "other", by: "no rule matched" };
    }
    function enrich(transactions, rules) { return (transactions || []).map(t => { const m = normalizeMerchant(t.merchant_raw || t.merchant), cat = categorize(t, rules); return Object.assign({}, t, { amount_cents: cents(t), merchant_key: m.key, merchant_display: m.display, category: cat.category, categorized_by: cat.by, posted_at: ymd(t.posted_at) }); }); }

    // TXN-001/002: filters and search over enriched rows.
    function list(transactions, f, rules) {
      const o = f || {};
      return enrich(transactions, rules).filter(t => (!o.account_id || t.account_id === o.account_id) && (!o.from || t.posted_at >= o.from) && (!o.to || t.posted_at <= o.to) && (!o.category || t.category === o.category) && (o.min_cents == null || Math.abs(t.amount_cents) >= o.min_cents) && (o.max_cents == null || Math.abs(t.amount_cents) <= o.max_cents) && (o.pending == null || !!t.is_pending === o.pending) && (!o.merchant || t.merchant_key.includes(mkey(o.merchant)) || t.merchant_display.toLowerCase().includes(String(o.merchant).toLowerCase()))).sort((a, b) => b.posted_at.localeCompare(a.posted_at) || a.id.localeCompare(b.id));
    }
    function search(transactions, query, rules) {
      const q0 = String(query || "").trim().toLowerCase(), date = q0.match(/\b(\d{4}-\d{2}(?:-\d{2})?)\b/), q = q0.replace(/\b\d{4}-\d{2}(?:-\d{2})?\b/g, " "), amt = q.match(/(?:^|\s)\$?(\d+(?:\.\d{1,2})?)(?=\s|$)/), words = q.replace(/(?:^|\s)\$?\d+(?:\.\d{1,2})?(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
      return enrich(transactions, rules).filter(t => (!amt || Math.abs(t.amount_cents) === Math.round(Number(amt[1]) * 100)) && (!date || t.posted_at.startsWith(date[1])) && (!words || t.merchant_key.includes(mkey(words)) || t.merchant_display.toLowerCase().includes(words) || String(t.note || "").toLowerCase().includes(words) || t.category.includes(words)));
    }
    // TXN-011: pending vs posted, in words the user can act on.
    function pendingVsPosted(t) {
      return t.is_pending ? { state: "pending", text: `${normalizeMerchant(t.merchant_raw).display} ${money(Math.abs(cents(t)))} is pending: the merchant authorized it but has not settled. The amount can still change (tips, fuel holds) and it already reduces your available balance.` } : { state: "posted", text: `${normalizeMerchant(t.merchant_raw).display} ${money(Math.abs(cents(t)))} posted on ${ymd(t.posted_at)}: final, counted in your balance.` };
    }
    // TXN-012: CSV with RFC 4180 quoting, cents as dollars with two decimals, never a float in the path.
    function csv(transactions, rules) {
      const rows = enrich(transactions, rules), q = v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const dollars = c => (c < 0 ? "-" : "") + Math.floor(Math.abs(c) / 100) + "." + String(Math.abs(c) % 100).padStart(2, "0");
      return ["id,account_id,posted_at,amount,merchant,category,pending,note"].concat(rows.map(t => [t.id, t.account_id, t.posted_at, dollars(t.amount_cents), t.merchant_display, t.category, t.is_pending ? "pending" : "posted", t.note || ""].map(q).join(","))).join("\n");
    }
    // TXN-017: transfers between own accounts: opposite amounts across two of the user's accounts within three days, matched once each.
    function transfers(transactions, accounts) {
      const own = new Set((accounts || []).map(a => a.id)), rows = enrich(transactions).filter(t => own.has(t.account_id)), used = new Set(), pairs = [];
      for (const t of rows) { if (used.has(t.id) || t.amount_cents >= 0) continue; const m = rows.find(u => !used.has(u.id) && u.id !== t.id && u.account_id !== t.account_id && u.amount_cents === -t.amount_cents && Math.abs(daysBetween(t.posted_at, u.posted_at)) <= 3); if (m) { used.add(t.id); used.add(m.id); pairs.push({ out_id: t.id, in_id: m.id, from: t.account_id, to: m.account_id, amount_cents: -t.amount_cents, on: t.posted_at }); } }
      return { pairs, transfer_ids: [...used], ...provenance(accounts, transactions) };
    }
    const spendRows = (transactions, rules, accounts) => { const tr = new Set(accounts ? transfers(transactions, accounts).transfer_ids : []); return enrich(transactions, rules).filter(t => t.amount_cents < 0 && !t.is_transfer && !tr.has(t.id) && t.category !== "transfers" && t.category !== "debt_payment"); };
    const incomeRows = (transactions, rules) => enrich(transactions, rules).filter(t => t.amount_cents > 0 && t.category === "income");

    // The next date on a cadence. Semimonthly: the 15th after a 1st, the 1st after a 15th.
    const stepFrom = (on, cadence) => cadence === "monthly" ? addMonths(on, 1) : cadence === "quarterly" ? addMonths(on, 3) : cadence === "yearly" ? addMonths(on, 12) : cadence === "weekly" ? addDays(on, 7) : cadence === "biweekly" ? addDays(on, 14) : (Number(on.slice(8, 10)) <= 14 ? `${monthOf(on)}-15` : `${monthOf(addMonths(`${monthOf(on)}-01`, 1))}-01`);
    // TXN-005: recurring transactions, debits and credits, with cadence and next expected date.
    function recurring(transactions, today, rules) {
      const by = {}; for (const t of enrich(transactions, rules)) if (!t.is_transfer) (by[`${t.merchant_key}|${t.amount_cents < 0 ? "d" : "c"}`] = by[`${t.merchant_key}|${t.amount_cents < 0 ? "d" : "c"}`] || []).push(t);
      const out = [];
      for (const [k, txs] of Object.entries(by)) {
        if (txs.length < 2) continue;
        const sorted = txs.slice().sort((a, b) => a.posted_at.localeCompare(b.posted_at)), amts = sorted.map(t => Math.abs(t.amount_cents));
        const median = amts.slice().sort((a, b) => a - b)[Math.floor(amts.length / 2)];
        const steady = amts.filter(a => Math.abs(a - median) <= Math.max(Math.round(median * 0.15), 100)).length / amts.length >= 0.75;
        const gaps = []; for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].posted_at, sorted[i].posted_at));
        // Twice a month covers both every-14-days pay and 1st/15th pay; the label says which.
        const band = g => g >= 6 && g <= 8 ? "weekly" : g >= 12 && g <= 18 ? "twice_monthly" : g >= 27 && g <= 33 ? "monthly" : g >= 85 && g <= 95 ? "quarterly" : g >= 360 && g <= 370 ? "yearly" : null;
        const bands = gaps.map(band).filter(Boolean); if (!bands.length) continue;
        const counts = {}; for (const b of bands) counts[b] = (counts[b] || 0) + 1;
        let top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]; if (counts[top] / gaps.length < 0.75) continue;
        if (top === "twice_monthly") top = gaps.every(g => g >= 13 && g <= 15) ? "biweekly" : "semimonthly";
        // Two visits a week apart are a coincidence, not a cadence: short cadences need three; monthly and longer need two at a steady amount.
        if (sorted.length < 3 && !(steady && ["monthly", "quarterly", "yearly"].includes(top))) continue;
        const last = sorted[sorted.length - 1];
        const next = stepFrom(last.posted_at, top);
        out.push({ key: k.split("|")[0], merchant: last.merchant_display, direction: last.amount_cents < 0 ? "debit" : "credit", category: last.category, cadence: top, amount_cents: median, steady_amount: steady, count: sorted.length, last_on: last.posted_at, next_expected: next, overdue: next < today && daysBetween(next, today) > 3, account_id: last.account_id });
      }
      return out.sort((a, b) => a.next_expected.localeCompare(b.next_expected) || b.amount_cents - a.amount_cents);
    }
    // ANL-007: the next 30 days of expected recurring debits and credits, dated.
    function recurringCalendar(transactions, today, days, rules) {
      const horizon = addDays(today, days || 30), items = [];
      for (const r of recurring(transactions, today, rules)) { let on = r.next_expected; let guard = 0; while (on < today && guard++ < 24) on = stepFrom(on, r.cadence); while (on <= horizon && guard++ < 48) { items.push({ on, merchant: r.merchant, direction: r.direction, amount_cents: r.amount_cents, cadence: r.cadence, category: r.category }); on = stepFrom(on, r.cadence); } }
      items.sort((a, b) => a.on.localeCompare(b.on) || b.amount_cents - a.amount_cents);
      return { from: today, to: horizon, items, debits_cents: sum(items.filter(i => i.direction === "debit").map(i => i.amount_cents)), credits_cents: sum(items.filter(i => i.direction === "credit").map(i => i.amount_cents)), source: "your transactions (recurring pattern)", as_of: today };
    }

    // ANL-001/013/012: spending by category over any window, the merchant leaderboard, the annual report.
    function spendingByCategory(transactions, from, to, rules, accounts) {
      const rows = spendRows(transactions, rules, accounts).filter(t => t.posted_at >= from && t.posted_at <= to), by = {};
      for (const t of rows) { const b = by[t.category] = by[t.category] || { category: t.category, spend_cents: 0, count: 0 }; b.spend_cents += -t.amount_cents; b.count++; }
      const total = sum(rows.map(t => -t.amount_cents)), cats = Object.values(by).sort((a, b) => b.spend_cents - a.spend_cents).map(c => Object.assign(c, { share_bps: total ? divRound(c.spend_cents * 10000, total) : 0 }));
      return { from, to, total_cents: total, categories: cats, ...provenance(accounts, rows) };
    }
    function merchantLeaderboard(transactions, from, to, rules, accounts, limit) {
      const rows = spendRows(transactions, rules, accounts).filter(t => t.posted_at >= from && t.posted_at <= to), by = {};
      for (const t of rows) { const b = by[t.merchant_key] = by[t.merchant_key] || { merchant: t.merchant_display, spend_cents: 0, count: 0, category: t.category }; b.spend_cents += -t.amount_cents; b.count++; }
      return { from, to, merchants: Object.values(by).sort((a, b) => b.spend_cents - a.spend_cents).slice(0, limit || 10), ...provenance(accounts, rows) };
    }
    function annualReport(transactions, year, rules, accounts) {
      const from = `${year}-01-01`, to = `${year}-12-31`, spend = spendingByCategory(transactions, from, to, rules, accounts), inc = incomeRows(transactions, rules).filter(t => t.posted_at >= from && t.posted_at <= to);
      const income = sum(inc.map(t => t.amount_cents)), months = [...new Set(enrich(transactions).filter(t => t.posted_at >= from && t.posted_at <= to).map(t => monthOf(t.posted_at)))].length;
      return { year, months_covered: months, income_cents: income, spend_cents: spend.total_cents, saved_cents: income - spend.total_cents, savings_rate_bps: income ? divRound((income - spend.total_cents) * 10000, income) : null, categories: spend.categories, top_merchants: merchantLeaderboard(transactions, from, to, rules, accounts, 5).merchants, ...provenance(accounts, transactions) };
    }
    // ANL-002/011: income vs spend per month and the savings rate over time.
    function incomeVsSpend(transactions, month, rules, accounts) {
      const from = `${month}-01`, to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
      const income = sum(incomeRows(transactions, rules).filter(t => t.posted_at >= from && t.posted_at <= to).map(t => t.amount_cents)), spend = spendingByCategory(transactions, from, to, rules, accounts).total_cents;
      return { month, income_cents: income, spend_cents: spend, net_cents: income - spend, savings_rate_bps: income ? divRound((income - spend) * 10000, income) : null, ...provenance(accounts, transactions) };
    }
    function savingsRate(transactions, rules, accounts) {
      const months = [...new Set(enrich(transactions).map(t => monthOf(t.posted_at)))].sort();
      const series = months.map(m => incomeVsSpend(transactions, m, rules, accounts)).map(r => ({ month: r.month, savings_rate_bps: r.savings_rate_bps, income_cents: r.income_cents, spend_cents: r.spend_cents }));
      const rated = series.filter(s => s.savings_rate_bps != null);
      return { series, average_bps: rated.length ? divRound(sum(rated.map(s => s.savings_rate_bps)), rated.length) : null, ...provenance(accounts, transactions) };
    }
    // TXN-021/ANL-009/ANL-014: month over month, category trends against the trailing average, and why a month was high.
    function monthOverMonth(transactions, month, rules, accounts) {
      const prev = monthOf(addMonths(`${month}-01`, -1)), a = spendingByCategory(transactions, `${month}-01`, `${month}-31`, rules, accounts), b = spendingByCategory(transactions, `${prev}-01`, `${prev}-31`, rules, accounts);
      const cats = [...new Set(a.categories.concat(b.categories).map(c => c.category))].map(c => { const x = (a.categories.find(k => k.category === c) || {}).spend_cents || 0, y = (b.categories.find(k => k.category === c) || {}).spend_cents || 0; return { category: c, this_cents: x, prior_cents: y, delta_cents: x - y, delta_bps: y ? divRound((x - y) * 10000, y) : null }; }).sort((p, q) => Math.abs(q.delta_cents) - Math.abs(p.delta_cents));
      return { month, prior: prev, total_cents: a.total_cents, prior_total_cents: b.total_cents, delta_cents: a.total_cents - b.total_cents, categories: cats, ...provenance(accounts, transactions) };
    }
    function categoryTrends(transactions, month, rules, accounts, threshold_bps) {
      const back = [1, 2, 3].map(n => monthOf(addMonths(`${month}-01`, -n))), cur = spendingByCategory(transactions, `${month}-01`, `${month}-31`, rules, accounts);
      const hist = back.map(m => spendingByCategory(transactions, `${m}-01`, `${m}-31`, rules, accounts)).filter(s => s.total_cents > 0);
      const out = cur.categories.map(c => { const avg = hist.length ? divRound(sum(hist.map(h => (h.categories.find(k => k.category === c.category) || {}).spend_cents || 0)), hist.length) : null; const bps = avg ? divRound((c.spend_cents - avg) * 10000, avg) : null; return { category: c.category, this_cents: c.spend_cents, trailing_avg_cents: avg, change_bps: bps, flag: bps != null && Math.abs(bps) >= (threshold_bps || 3000) ? (bps > 0 ? "up" : "down") : null, text: bps != null && Math.abs(bps) >= (threshold_bps || 3000) ? `${c.category} ${bps > 0 ? "up" : "down"} ${Math.abs(Math.round(bps / 100))} percent vs your ${hist.length}-month average (${money(avg)} → ${money(c.spend_cents)}).` : null }; });
      return { month, months_compared: hist.length, trends: out.filter(t => t.flag), all: out, ...provenance(accounts, transactions) };
    }
    function anomalyExplain(transactions, month, rules, accounts) {
      const t = categoryTrends(transactions, month, rules, accounts, 0), total = sum(t.all.map(c => c.this_cents)), avgTotal = sum(t.all.map(c => c.trailing_avg_cents || 0));
      const drivers = t.all.filter(c => c.trailing_avg_cents != null && c.this_cents > c.trailing_avg_cents).map(c => ({ category: c.category, over_cents: c.this_cents - c.trailing_avg_cents })).sort((a, b) => b.over_cents - a.over_cents);
      const big = spendRows(transactions, rules, accounts).filter(x => x.posted_at.startsWith(month)).sort((a, b) => a.amount_cents - b.amount_cents).slice(0, 3).map(x => ({ merchant: x.merchant_display, amount_cents: -x.amount_cents, on: x.posted_at }));
      return { month, total_cents: total, trailing_avg_cents: avgTotal, over_cents: total - avgTotal, drivers: drivers.slice(0, 3), largest: big, text: total > avgTotal ? `${monthName(month)} was ${money(total - avgTotal)} above your ${t.months_compared}-month average. ${drivers.slice(0, 2).map(d => `${d.category} explains ${money(d.over_cents)}`).join("; ")}.` : `${monthName(month)} was not above your ${t.months_compared}-month average.`, ...provenance(accounts, transactions) };
    }
    const monthName = m => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    // TXN-020/022: one large transaction explained against the merchant's history and the category's typical amount; all-time history with one merchant.
    function merchantHistory(transactions, merchant, rules) { const k = mkey(merchant), rows = enrich(transactions, rules).filter(t => t.merchant_key.includes(k) || t.merchant_display.toLowerCase().includes(String(merchant).toLowerCase())).sort((a, b) => a.posted_at.localeCompare(b.posted_at)); return { merchant, count: rows.length, total_cents: sum(rows.map(t => -t.amount_cents)), first_on: rows.length ? rows[0].posted_at : null, last_on: rows.length ? rows[rows.length - 1].posted_at : null, average_cents: rows.length ? divRound(sum(rows.map(t => -t.amount_cents)), rows.length) : null, rows, source: "your transactions", as_of: rows.length ? rows[rows.length - 1].posted_at : null }; }
    function explainLarge(transactions, id, rules) {
      const rows = enrich(transactions, rules), t = rows.find(x => x.id === id); if (!t) return null;
      const hist = rows.filter(x => x.merchant_key === t.merchant_key && x.id !== t.id && x.amount_cents < 0), cat = rows.filter(x => x.category === t.category && x.amount_cents < 0 && x.id !== t.id);
      const avgM = hist.length ? divRound(sum(hist.map(x => -x.amount_cents)), hist.length) : null, avgC = cat.length ? divRound(sum(cat.map(x => -x.amount_cents)), cat.length) : null;
      const parts = [`${t.merchant_display} ${money(-t.amount_cents)} on ${t.posted_at}, ${t.category}.`]; if (avgM != null) parts.push(`Your ${hist.length} other charges there average ${money(avgM)}${-t.amount_cents > avgM * 2 ? ", so this is unusual for this merchant" : ""}.`); else parts.push("First charge from this merchant."); if (avgC != null) parts.push(`Typical ${t.category} charge: ${money(avgC)}.`); if (t.is_pending) parts.push("Still pending; the amount can change.");
      return { transaction: t, merchant_average_cents: avgM, category_average_cents: avgC, unusual: avgM != null ? -t.amount_cents > avgM * 2 : hist.length === 0, text: parts.join(" "), source: "your transactions", as_of: t.posted_at };
    }
    // ANL-003/004: budgets per category and pacing: spent so far against the share of the month elapsed; projected overspend flagged.
    function budgets(transactions, budgetsByCategory, today, rules, accounts) {
      const month = monthOf(today), elapsed = Number(today.slice(8, 10)), dim = daysInMonth(month), monthEnd = `${month}-${String(dim).padStart(2, "0")}`;
      // A fixed bill paid once (rent on the 2nd) is not "on pace" to be paid twice: recurring items count once, plus the ones still expected this month; only variable spend scales with the days elapsed.
      const rec = recurring(transactions, today, rules), recKeys = new Set(rec.filter(r => r.direction === "debit").map(r => r.key)), rows0 = spendRows(transactions, rules, accounts).filter(t => t.posted_at >= `${month}-01` && t.posted_at <= today);
      const later = recurringCalendar(transactions, today, dim - elapsed, rules).items.filter(i => i.direction === "debit" && i.on > today && i.on <= monthEnd);
      const rows = Object.entries(budgetsByCategory || {}).map(([category, budget_cents]) => { const mine = rows0.filter(t => t.category === category), fixed = sum(mine.filter(t => recKeys.has(t.merchant_key)).map(t => -t.amount_cents)), variable = sum(mine.filter(t => !recKeys.has(t.merchant_key)).map(t => -t.amount_cents)), spent = fixed + variable, expected = sum(later.filter(i => i.category === category).map(i => i.amount_cents)), projected = fixed + expected + divRound(variable * dim, elapsed), pace_bps = budget_cents ? divRound(projected * 10000, budget_cents) : null; return { category, budget_cents, spent_cents: spent, fixed_cents: fixed, variable_cents: variable, expected_fixed_cents: expected, remaining_cents: budget_cents - spent, day: elapsed, days_in_month: dim, projected_cents: projected, pace_bps, alert: pace_bps != null && pace_bps > 11500 && projected > budget_cents ? `${category}: ${money(spent)} by day ${elapsed}; at this pace ${money(projected)} by month end, ${money(projected - budget_cents)} over the ${money(budget_cents)} budget.` : null }; });
      return { month, budgets: rows, alerts: rows.filter(r => r.alert).map(r => r.alert), ...provenance(accounts, transactions) };
    }
    // ANL-005: safe to spend today: available cash, minus recurring debits due before the next expected income, minus the buffer, each component shown.
    function safeToSpend(input) {
      const today = input.today, cash = cashPosition(input.accounts, input);
      const nextIncome = (recurringCalendar(input.transactions, today, 45, input.rules).items.find(i => i.direction === "credit" && i.category === "income") || { on: addDays(today, 30) }).on;
      const due = recurringCalendar(input.transactions, today, daysBetween(today, nextIncome), input.rules).items.filter(i => i.direction === "debit" && i.on <= nextIncome);
      const dueCents = sum(due.map(i => i.amount_cents)), buffer = Number.isInteger(input.buffer_cents) ? input.buffer_cents : Math.max(10000, divRound(dueCents, 10));
      const cards = (input.accounts || []).filter(a => a.kind === "credit_card" && Number.isInteger(a.statement_balance_cents) && a.due_on && a.due_on <= nextIncome).map(a => ({ account_id: a.id, amount_cents: a.statement_balance_cents, on: a.due_on }));
      const cardCents = sum(cards.map(c => c.amount_cents)), safe = cash.available_cents - dueCents - cardCents - buffer;
      return { today, next_income_on: nextIncome, available_cents: cash.available_cents, upcoming_debits_cents: dueCents, upcoming: due, card_statements_cents: cardCents, card_statements: cards, buffer_cents: buffer, safe_to_spend_cents: safe, text: `Safe to spend today: ${money(safe)}. That is ${money(cash.available_cents)} available, minus ${money(dueCents)} of bills due before your next income on ${nextIncome}${cardCents ? `, minus ${money(cardCents)} of card statements due` : ""}, minus a ${money(buffer)} buffer.`, source: cash.source, as_of: cash.as_of };
    }
    // ANL-006: cash flow forecast at 30/60/90 days from recurring income and debits plus average discretionary spend per day, with the low point.
    function cashflowForecast(input) {
      const today = input.today, cash = cashPosition(input.accounts, input), rules = input.rules, horizons = input.horizons || [30, 60, 90];
      const cal = recurringCalendar(input.transactions, today, Math.max(...horizons), rules).items, recKeys = new Set(recurring(input.transactions, today, rules).map(r => r.key));
      const disc = spendRows(input.transactions, rules, input.accounts).filter(t => !recKeys.has(t.merchant_key) && daysBetween(t.posted_at, today) <= 90 && t.posted_at <= today);
      const span = disc.length ? Math.max(30, Math.min(90, daysBetween(disc.map(t => t.posted_at).sort()[0], today) + 1)) : 90, perDay = disc.length ? divRound(sum(disc.map(t => -t.amount_cents)), span) : 0;
      const points = [], daily = []; let bal = cash.available_cents, low = { on: today, balance_cents: bal };
      for (let d = 1; d <= Math.max(...horizons); d++) { const on = addDays(today, d); for (const i of cal.filter(x => x.on === on)) bal += i.direction === "credit" ? i.amount_cents : -i.amount_cents; bal -= perDay; daily.push({ on, balance_cents: bal }); if (bal < low.balance_cents) low = { on, balance_cents: bal }; if (horizons.includes(d)) points.push({ days: d, on, balance_cents: bal }); }
      return { today, start_cents: cash.available_cents, discretionary_per_day_cents: perDay, discretionary_basis_days: span, recurring_items: cal.length, points, daily, low_point: low, warning: low.balance_cents < 0 ? `Projected to go negative on ${low.on} (${money(low.balance_cents)}) before ${money(0)} buffer.` : null, assumptions: "recurring income and debits repeat on their cadence; discretionary spend continues at the trailing per-day average; nothing else changes", source: cash.source, as_of: cash.as_of };
    }
    // ANL-010: where each paycheck goes: the bills and transfers in the pay period, and what was left.
    function paycheckAllocation(transactions, rules, accounts) {
      const rows = enrich(transactions, rules).sort((a, b) => a.posted_at.localeCompare(b.posted_at)), pays = rows.filter(t => t.category === "income" && t.amount_cents > 0);
      const tr = new Set(accounts ? transfers(transactions, accounts).transfer_ids : []);
      return { paychecks: pays.map((p, i) => { const end = pays[i + 1] ? pays[i + 1].posted_at : addDays(p.posted_at, 14); const period = rows.filter(t => t.posted_at >= p.posted_at && t.posted_at < end && t.id !== p.id); const bills = sum(period.filter(t => t.amount_cents < 0 && ["housing", "utilities", "subscriptions", "insurance", "debt_payment"].includes(t.category)).map(t => -t.amount_cents)), saved = sum(period.filter(t => t.amount_cents < 0 && (tr.has(t.id) || t.category === "transfers")).map(t => -t.amount_cents)), other = sum(period.filter(t => t.amount_cents < 0 && !tr.has(t.id) && !["housing", "utilities", "subscriptions", "insurance", "debt_payment", "transfers"].includes(t.category)).map(t => -t.amount_cents)); return { on: p.posted_at, amount_cents: p.amount_cents, period_end: end, bills_cents: bills, transfers_cents: saved, discretionary_cents: other, left_cents: p.amount_cents - bills - saved - other }; }), ...provenance(accounts, transactions) };
    }
    // ANL-016: goals: progress from the funding account's balance (or a tracked amount), the monthly amount needed, and the date at the current pace.
    function goals(goalList, accounts, transactions, today) {
      return (goalList || []).map(g => { const acct = (accounts || []).find(a => a.id === g.account_id), saved = Number.isInteger(g.saved_cents) ? g.saved_cents : acct ? acct.balance_cents : 0, left = Math.max(0, g.target_cents - saved); const monthsLeft = g.by ? Math.max(1, Math.round(daysBetween(today, g.by) / 30)) : null; const contrib = acct ? sum(enrich(transactions).filter(t => t.account_id === acct.id && t.amount_cents > 0 && daysBetween(t.posted_at, today) <= 90).map(t => t.amount_cents)) : 0, perMonth = divRound(contrib, 3); return { id: g.id, name: g.name, target_cents: g.target_cents, saved_cents: saved, remaining_cents: left, progress_bps: g.target_cents ? divRound(saved * 10000, g.target_cents) : null, by: g.by || null, needed_per_month_cents: monthsLeft ? divRound(left, monthsLeft) : null, current_pace_per_month_cents: perMonth, eta: left === 0 ? today : perMonth > 0 ? addMonths(today, Math.ceil(left / perMonth)) : null, on_track: monthsLeft ? perMonth * monthsLeft >= left : null, source: acct ? (acct.source || acct.institution || "manual") : "tracked by hand", as_of: acct ? acct.as_of || today : today }; });
    }
    // ANL-019: what if a category is cut by an amount per month: yearly saving and the goal it accelerates.
    function whatIf(transactions, change, goalList, accounts, today, rules) {
      // The cut is capped at the category's average over the last three full months: you cannot cut more than you spend.
      const month = monthOf(today), full = [...new Set(enrich(transactions).map(t => monthOf(t.posted_at)))].filter(m => m < month).sort().slice(-3);
      const avg = full.length ? divRound(sum(full.map(m => (spendingByCategory(transactions, `${m}-01`, `${m}-31`, rules, accounts).categories.find(c => c.category === change.category) || {}).spend_cents || 0)), full.length) : 0;
      const cut = Math.min(change.cut_cents, avg || change.cut_cents), yearly = cut * 12;
      const g = (goalList || [])[0] ? goals(goalList, accounts, transactions, today)[0] : null;
      return { category: change.category, cut_per_month_cents: cut, saved_per_year_cents: yearly, goal: g ? { name: g.name, months_sooner: g.remaining_cents && (g.current_pace_per_month_cents + cut) > 0 ? Math.max(0, (g.current_pace_per_month_cents > 0 ? Math.ceil(g.remaining_cents / g.current_pace_per_month_cents) : null) - Math.ceil(g.remaining_cents / (g.current_pace_per_month_cents + cut))) : null } : null, text: `Cut ${change.category} by ${money(cut)} a month and you keep ${money(yearly)} a year${g && g.remaining_cents ? `; ${g.name} arrives ${Math.ceil(g.remaining_cents / Math.max(1, g.current_pace_per_month_cents + cut))} months from now instead of ${g.current_pace_per_month_cents > 0 ? Math.ceil(g.remaining_cents / g.current_pace_per_month_cents) + " months" : "never at the current pace"}` : ""}.`, source: "your transactions", as_of: today };
    }

    // CARD-001/004/005/006/007/008: cards, utilization, the alert before the statement, due dates, minimum vs full, fee vs value.
    function cards(accounts, today) {
      const rows = (accounts || []).filter(a => a.kind === "credit_card" && !a.hidden).map(a => { const util = a.limit_cents ? divRound(a.balance_cents * 10000, a.limit_cents) : null; const due = a.due_on || (a.due_day ? nextDay(today, a.due_day) : null); return { account_id: a.id, name: a.nickname || a.name || a.id, network: a.network || null, issuer: a.institution || null, mask: a.mask || null, balance_cents: a.balance_cents, limit_cents: a.limit_cents || null, utilization_bps: util, statement_balance_cents: Number.isInteger(a.statement_balance_cents) ? a.statement_balance_cents : null, min_payment_cents: Number.isInteger(a.min_payment_cents) ? a.min_payment_cents : null, due_on: due, days_to_due: due ? daysBetween(today, due) : null, statement_on: a.statement_on || (a.statement_day ? nextDay(today, a.statement_day) : null), apr_bps: a.apr_bps || null, annual_fee_cents: a.annual_fee_cents || 0, source: a.source || a.institution || "manual", as_of: a.as_of || today }; });
      const totalBal = sum(rows.map(r => r.balance_cents)), totalLim = sum(rows.map(r => r.limit_cents || 0));
      return { cards: rows, total_balance_cents: totalBal, total_limit_cents: totalLim, total_utilization_bps: totalLim ? divRound(totalBal * 10000, totalLim) : null, ...provenance(accounts.filter(a => a.kind === "credit_card")) };
    }
    const nextDay = (today, day) => { const m = monthOf(today), d = Math.min(day, daysInMonth(m)), cand = `${m}-${String(d).padStart(2, "0")}`; if (cand >= today) return cand; const nm = monthOf(addMonths(`${m}-01`, 1)); return `${nm}-${String(Math.min(day, daysInMonth(nm))).padStart(2, "0")}`; };
    function utilizationAlerts(accounts, today, threshold_bps) {
      const c = cards(accounts, today), th = threshold_bps || 3000, out = [];
      for (const r of c.cards) if (r.utilization_bps != null && r.utilization_bps > th) out.push({ account_id: r.account_id, utilization_bps: r.utilization_bps, statement_on: r.statement_on, pay_down_cents: r.balance_cents - divRound(r.limit_cents * th, 10000), text: `${r.name} is at ${Math.round(r.utilization_bps / 100)} percent of its limit${r.statement_on ? `; the statement closes ${r.statement_on} and that is the number the bureaus see` : ""}. Paying ${money(r.balance_cents - divRound(r.limit_cents * th, 10000))} before then brings it under ${Math.round(th / 100)} percent.` });
      if (c.total_utilization_bps != null && c.total_utilization_bps > th) out.push({ account_id: "all", utilization_bps: c.total_utilization_bps, text: `Across all cards you are at ${Math.round(c.total_utilization_bps / 100)} percent of total limits.` });
      return { alerts: out, threshold_bps: th, source: c.source, as_of: c.as_of };
    }
    function dueDates(accounts, today, days) { return { due: cards(accounts, today).cards.filter(r => r.due_on && daysBetween(today, r.due_on) <= (days || 30)).map(r => ({ account_id: r.account_id, name: r.name, due_on: r.due_on, days_to_due: r.days_to_due, statement_balance_cents: r.statement_balance_cents, min_payment_cents: r.min_payment_cents, autopay: !!(accounts.find(a => a.id === r.account_id) || {}).autopay })).sort((a, b) => a.due_on.localeCompare(b.due_on)), source: "card accounts", as_of: today }; }
    // Minimum vs full: interest for carrying the statement balance one month at the APR, and months to clear it paying the minimum only (amortized).
    function minVsFull(card) {
      const bal = Number.isInteger(card.statement_balance_cents) ? card.statement_balance_cents : card.balance_cents, apr = card.apr_bps || 0, min = Number.isInteger(card.min_payment_cents) ? card.min_payment_cents : Math.max(2500, divRound(bal * 200, 10000));
      if (!bal) return { statement_balance_cents: 0, text: "Nothing is owed on this statement.", source: card.source || card.institution || "manual", as_of: card.as_of || null };
      const interest1 = divRound(bal * apr, 120000);
      let b = bal, months = 0, interest = 0; while (b > 0 && months < 600) { const i = divRound(b * apr, 120000); interest += i; b = b + i - Math.max(min, Math.min(b + i, min)); if (min <= i) { months = Infinity; break; } months++; }
      return { statement_balance_cents: bal, min_payment_cents: min, apr_bps: apr, interest_if_minimum_this_month_cents: interest1, months_to_clear_at_minimum: months, total_interest_at_minimum_cents: months === Infinity ? null : interest, text: months === Infinity ? `The ${money(min)} minimum does not cover the ${money(interest1)} monthly interest at ${(apr / 100).toFixed(2)} percent APR: the balance grows.` : `Paying the ${money(min)} minimum costs ${money(interest1)} in interest this month and takes ${months} months to clear, ${money(interest)} in interest total. Paying the ${money(bal)} statement balance in full costs ${money(0)}.`, source: card.source || card.institution || "manual", as_of: card.as_of || null };
    }
    function annualFeeAudit(card, rewards_last_12m_cents, benefits_used_cents) {
      const fee = card.annual_fee_cents || 0, value = (rewards_last_12m_cents || 0) + (benefits_used_cents || 0), net = value - fee;
      return { account_id: card.id, annual_fee_cents: fee, value_cents: value, net_cents: net, verdict: !fee ? "no fee" : net >= 0 ? "earning its fee" : "costing more than it returns", text: !fee ? `${card.nickname || card.id} has no annual fee.` : `${card.nickname || card.id}: ${money(fee)} fee against ${money(value)} of rewards and benefits used in the last 12 months, net ${money(net)}. ${net >= 0 ? "Keep it." : "Ask the issuer for a retention offer, a no-fee downgrade, or close it after the fee date; closing can lower your available credit."}`, source: card.source || card.institution || "manual", as_of: card.as_of || null };
    }

    // CRDT-008/009/010, ANL-018: the debt inventory and exact amortized payoff plans (avalanche by APR, snowball by balance), with the extra-payment impact.
    function debtInventory(accounts) {
      const rows = (accounts || []).filter(a => LIABILITY.has(a.kind) && !a.hidden && a.balance_cents > 0).map(a => ({ id: a.id, name: a.nickname || a.name || a.id, kind: a.kind, balance_cents: a.balance_cents, apr_bps: a.apr_bps || 0, min_payment_cents: Number.isInteger(a.min_payment_cents) ? a.min_payment_cents : Math.max(2500, divRound(a.balance_cents * 200, 10000)), monthly_interest_cents: divRound(a.balance_cents * (a.apr_bps || 0), 120000), due_on: a.due_on || null }));
      return { debts: rows.sort((a, b) => b.apr_bps - a.apr_bps), total_cents: sum(rows.map(r => r.balance_cents)), monthly_minimums_cents: sum(rows.map(r => r.min_payment_cents)), monthly_interest_cents: sum(rows.map(r => r.monthly_interest_cents)), ...provenance(accounts.filter(a => LIABILITY.has(a.kind))) };
    }
    function amortize(debts, extra_cents, order) {
      const ds = debts.map(d => ({ id: d.id, balance: d.balance_cents, apr: d.apr_bps, min: d.min_payment_cents })), sorted = order === "snowball" ? ds.slice().sort((a, b) => a.balance - b.balance) : ds.slice().sort((a, b) => b.apr - a.apr);
      let months = 0, interest = 0; const payoff = {};
      while (sorted.some(d => d.balance > 0) && months < 600) {
        months++; let budget = extra_cents || 0;
        for (const d of sorted) { if (d.balance <= 0) continue; const i = divRound(d.balance * d.apr, 120000); interest += i; d.balance += i; const pay = Math.min(d.balance, d.min); d.balance -= pay; if (d.min < d.balance + pay && pay < d.min) budget += d.min - pay; }
        for (const d of sorted) { if (d.balance <= 0 || budget <= 0) continue; const pay = Math.min(d.balance, budget); d.balance -= pay; budget -= pay; }
        for (const d of sorted) if (d.balance <= 0 && !payoff[d.id]) { payoff[d.id] = months; budget += 0; }
        // Minimums of cleared debts roll into the extra from the following month.
        extra_cents = (extra_cents || 0) + sorted.filter(d => d.balance <= 0 && payoff[d.id] === months).reduce((s, d) => s + d.min, 0);
      }
      return { months, total_interest_cents: interest, payoff_month: payoff, order: sorted.map(d => d.id) };
    }
    function payoffPlans(accounts, extra_cents) {
      const inv = debtInventory(accounts); if (!inv.debts.length) return { plans: null, text: "No debt with a balance.", source: inv.source, as_of: inv.as_of };
      const av = amortize(inv.debts, extra_cents || 0, "avalanche"), sn = amortize(inv.debts, extra_cents || 0, "snowball");
      return { extra_cents: extra_cents || 0, avalanche: av, snowball: sn, interest_difference_cents: sn.total_interest_cents - av.total_interest_cents, text: `With ${money(extra_cents || 0)} extra a month: avalanche (highest APR first: ${av.order.join(", ")}) clears everything in ${av.months} months for ${money(av.total_interest_cents)} of interest; snowball (smallest balance first: ${sn.order.join(", ")}) takes ${sn.months} months for ${money(sn.total_interest_cents)}. Avalanche saves ${money(sn.total_interest_cents - av.total_interest_cents)}; snowball clears the first debt sooner.`, source: inv.source, as_of: inv.as_of };
    }
    function extraPaymentImpact(accounts, extra_cents) {
      const base = amortize(debtInventory(accounts).debts, 0, "avalanche"), more = amortize(debtInventory(accounts).debts, extra_cents, "avalanche");
      return { extra_cents, months_saved: base.months - more.months, interest_saved_cents: base.total_interest_cents - more.total_interest_cents, base, with_extra: more, text: `${money(extra_cents)} extra a month clears your debt ${base.months - more.months} months sooner and saves ${money(base.total_interest_cents - more.total_interest_cents)} in interest.`, source: "debt accounts", as_of: null };
    }
    function debtPayoffProjection(accounts, extra_cents) { const p = payoffPlans(accounts, extra_cents); return p.plans === null ? p : { months: p.avalanche.months, total_interest_cents: p.avalanche.total_interest_cents, payoff_month: p.avalanche.payoff_month, order: p.avalanche.order, text: p.text, source: p.source, as_of: p.as_of }; }

    return { balance, listAccounts, netWorth, cashPosition, balanceHistory, netWorthHistory, closedCandidates, duplicates, dedupe, normalizeMerchant, categorize, enrich, list, search, pendingVsPosted, csv, transfers, recurring, recurringCalendar, spendingByCategory, merchantLeaderboard, annualReport, incomeVsSpend, savingsRate, monthOverMonth, categoryTrends, anomalyExplain, merchantHistory, explainLarge, budgets, safeToSpend, cashflowForecast, paycheckAllocation, goals, whatIf, cards, utilizationAlerts, dueDates, minVsFull, annualFeeAudit, debtInventory, amortize, payoffPlans, extraPaymentImpact, debtPayoffProjection, provenance, money, LIQUID, LIABILITY };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentLedger;
