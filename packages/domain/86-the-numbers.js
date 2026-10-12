  /* The numbers (owner's capability list section 1; overnight duties E1-E7), answered from code over the person's own
     rows, never by the model. The same row shapes as MoneyAnswers (80-money-answers.js):
       accounts      agent_financial_accounts rows: account_id, name, institution, account_kind, balance_cents,
                     available_cents, balance_as_of, fetched_at, status, currency
       transactions  agent_financial_transactions rows: account_id, provider_transaction_id, amount_cents (negative =
                     money out), posted_on, merchant_raw, is_pending, is_transfer, currency, fetched_at
     Six answers, each { kind, text, math, ...numbers }; text ends with its source and as-of line, math is the inputs and
     arithmetic line by line ("show me the math", E7):
       safeToSpend(accounts, tx, now)         E1 cash now minus the bills due on or before the next payday, minus any
                                              scheduled transfers due by then (opts.scheduled_transfers: { on, amount_cents,
                                              name }) and minus the person's buffer (opts.buffer_cents), total and per
                                              day; the payday is read from the person's own deposits; none found: 30 days,
                                              said so. Callers that pass neither get the old bills-only figure.
       upcoming(accounts, tx, now)            E2 every bill, payday and renewal in the next 30 days on one dated list
       runway(accounts, tx, now)              E3 days of cash at the average daily outflow over the last 90 days
       afford(accounts, tx, words, now)       E4 "can I afford $X (by when)": yes with what is left, or the earliest day;
                                              goal impact from opts.goals ({ name, target_cents, saved_cents,
                                              monthly_cents, target_date } or a savings_goal watch { name, target_cents,
                                              by, account }, saved read from its account, monthly derived from its date)
       netWorth(accounts, now)                E5 what is owned minus what is owed; unknown types and other currencies apart
       forecast(accounts, tx, now)            E6 90 days ahead on repeating bills, paychecks and scheduled transfers,
                                              assumptions listed; below zero (or below opts.buffer_cents) it offers one
                                              specific fix: delay a named bill by exact days to a named date, or move an
                                              exact amount from a named savings account to checking, in trigger words
     Repeating bills come from AgentLedger.recurring (57-agent-ledger.js); money formatting and as-of times from
     MoneyAnswers. Paydays are fitted here: weekly, every 14 days, twice a month (two days of the month, paid early when
     the day falls on a weekend or a holiday) or monthly. All money is integer cents; other currencies are never added
     into dollars; a balance more than a day old is said; no linked account returns null (the caller's nothing-linked
     line answers). Pure: rows and the clock are passed in; opts.tz (an IANA zone, default UTC) sets the person's day. */
  const TheNumbers = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : typeof require === "function" ? require("./80-money-answers.js") : null;
    const LG = typeof AgentLedger !== "undefined" ? AgentLedger : typeof require === "function" ? require("./57-agent-ledger.js") : null;
    const HOUR = 3600 * 1000, DAY = 24 * HOUR, STALE_MS = DAY;
    const HORIZON = 90, UPCOMING_DAYS = 30, FALLBACK_DAYS = 30, LATE_GRACE = 5, BASIS_DAYS = 90, MIN_BASIS = 14;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const MONTHS = [/\bjan(?:uary)?\b/, /\bfeb(?:ruary)?\b/, /\bmar(?:ch)?\b/, /\bapr(?:il)?\b/, /\bmay\b/, /\bjune?\b/, /\bjuly?\b/, /\baug(?:ust)?\b/, /\bsept?(?:ember)?\b/, /\boct(?:ober)?\b/, /\bnov(?:ember)?\b/, /\bdec(?:ember)?\b/];
    const CASH_KINDS = ["checking", "savings", "cash"], ASSET_KINDS = ["investment"], DEBT_KINDS = ["credit", "loan"];
    const VARIABLE = new Set(["groceries", "dining", "transport"]); // repeats, but not a fixed bill
    const PAYROLL = /payroll|direct dep|dir dep|salary|paycheck|wages/i;
    const NOT_INCOME = /\btransfer\b|\brefund|\breversal\b|\binterest\b|\bcash ?back\b|\breturn\b|\bdispute\b/i;
    // Not spending: money moved between the person's own accounts, and a card payment when the card itself is linked (its
    // purchases are counted on the card instead, so the payment would count them twice).
    const MOVED = /\b(?:online transfer|transfer (?:to|from)|internal transfer)\b/i;
    const CARD_PAYMENT = /\b(?:credit card payment|card payment|payment thank you|credit crd|crd autopay|card autopay)\b/i;
    const TRANSFER_WORD = /\btransfer\b/i;

    const money = (c) => MA.money(c);
    const pad = (n) => String(n).padStart(2, "0");
    const sum = (xs) => xs.reduce((a, x) => a + x, 0);
    const ms = (v) => { if (v == null || v === "") return NaN; const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v); return Number.isFinite(t) ? t : NaN; };
    function todayIn(now, tz) {
      const p = {};
      for (const x of new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms(now)))) p[x.type] = x.value;
      return `${p.year}-${p.month}-${p.day}`;
    }
    // Calendar days as YYYY-MM-DD strings, worked in UTC so no zone or DST change shifts them.
    const toUtc = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
    const fromUtc = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
    const addDays = (ymd, n) => fromUtc(toUtc(ymd) + n * DAY);
    const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / DAY);
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
    const dow = (ymd) => new Date(toUtc(ymd)).getUTCDay(); // 0 Sunday .. 6 Saturday
    // Month stepping with the day clamped to the month (Jan 31 + 1 month is Feb 28, or Feb 29 in a leap year). `day`
    // overrides the start's day: a bill seen on the 31st stays on the last day after a short month.
    function addMonths(ymd, n, day) {
      const y = +ymd.slice(0, 4), m = +ymd.slice(5, 7) - 1 + n, d = day || +ymd.slice(8, 10);
      const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1;
      return `${yy}-${pad(mm)}-${pad(Math.min(d, lastDay(yy, mm)))}`;
    }
    function dateLabel(ymd, today) { const y = +ymd.slice(0, 4); return `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}${today && y !== +today.slice(0, 4) ? `, ${y}` : ""}`; }
    function rangeLabel(from, to, today) {
      if (from === to) return dateLabel(from, today);
      if (from.slice(0, 7) === to.slice(0, 7)) return `${dateLabel(from, today)}-${+to.slice(8, 10)}`;
      return `${dateLabel(from, today)}-${dateLabel(to, today)}`;
    }
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const lowerMedian = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

    // ---- accounts ----
    const active = (accounts) => (accounts || []).filter((a) => a && a.status !== "disconnected");
    // The same reading as the balance answer: the person's own type first; a name that says what it is; else unknown.
    function kindOf(a) {
      const k = String(a.account_kind || "unknown").toLowerCase();
      if (k === "credit_card") return "credit";
      if (k !== "unknown") return k;
      const n = String(a.name || "").toLowerCase();
      if (/\bchecking\b/.test(n)) return "checking";
      if (/\bsavings?\b|\bmoney market\b/.test(n)) return "savings";
      if (/\bcredit card\b|\bcredit\b/.test(n)) return "credit";
      return "unknown";
    }
    const hasBal = (a) => a.balance_cents !== null && a.balance_cents !== undefined && a.balance_cents !== "" && Number.isFinite(Number(a.balance_cents));
    const foreign = (a) => !!a.currency && String(a.currency).toUpperCase() !== "USD";
    const asOfMs = (a) => { const b = ms(a.balance_as_of); return Number.isFinite(b) ? b : ms(a.fetched_at); };
    const acctName = (a) => { const n = String(a.name || a.account_id || "Account").trim(), i = String(a.institution || "").trim(); return i && !n.toLowerCase().includes(i.toLowerCase()) ? `${i} ${n}` : n; };
    const bal = (a) => Math.round(Number(a.balance_cents));
    const foreignText = (a) => `${MA.money(bal(a)).replace("$", "")} ${String(a.currency).toUpperCase()}`;

    // Cash now: checking, savings and cash in dollars, each at the lower of its balance and what is available (pending
    // charges already taken out). Everything else is listed, never counted.
    function cashOf(accounts) {
      const list = active(accounts);
      const rows = list.filter((a) => CASH_KINDS.includes(kindOf(a)) && hasBal(a) && !foreign(a)).map((a) => {
        const b = bal(a), av = a.available_cents === null || a.available_cents === undefined || !Number.isFinite(Number(a.available_cents)) ? null : Math.round(Number(a.available_cents));
        const used = av === null ? b : Math.min(b, av);
        return { account: a, name: acctName(a), balance_cents: b, available_cents: av, used_cents: used, basis: av !== null && av < b ? "available" : "balance" };
      });
      return { list, rows, cents: sum(rows.map((r) => r.used_cents)), foreign: list.filter((a) => foreign(a) && hasBal(a) && CASH_KINDS.includes(kindOf(a))) };
    }
    // As-of facts for the accounts an answer used: the oldest time, the stale ones, the undated ones.
    function freshness(accts, now) {
      const times = accts.map(asOfMs).filter(Number.isFinite);
      return { oldest: times.length ? Math.min(...times) : NaN, stale: accts.filter((a) => Number.isFinite(asOfMs(a)) && ms(now) - asOfMs(a) > STALE_MS), undated: accts.filter((a) => !Number.isFinite(asOfMs(a))), failed: accts.filter((a) => a.sync_error === true) };
    }
    function staleLines(f, now, tz) {
      const out = [];
      if (f.stale.length) {
        const worst = f.stale.slice().sort((a, b) => asOfMs(a) - asOfMs(b))[0], hrs = Math.floor((ms(now) - asOfMs(worst)) / HOUR);
        const age = hrs >= 48 ? `${Math.floor(hrs / 24)} days` : `${hrs} hours`;
        out.push(f.stale.length === 1
          ? `Heads up: ${acctName(worst)} was last updated ${MA.timeLabel(asOfMs(worst), tz)}, ${age} ago, so its real balance may have changed.`
          : `Heads up: ${f.stale.length} balances are more than a day old (the oldest, ${acctName(worst)}, was last updated ${MA.timeLabel(asOfMs(worst), tz)}, ${age} ago), so the real numbers may have changed.`);
      }
      if (f.failed.length) out.push(`The last sync of ${f.failed.map(acctName).join(", ")} failed, so ${f.failed.length === 1 ? "that balance" : "those balances"} may be out of date.`);
      if (f.undated.length) out.push(`${f.undated.map(acctName).join(", ")} didn't say when ${f.undated.length === 1 ? "its balance was" : "their balances were"} taken.`);
      return out;
    }

    // ---- transactions ----
    const usdRow = (r) => !r.currency || String(r.currency).toUpperCase() === "USD";
    const centsOf = (r) => (r.amount_cents === null || r.amount_cents === undefined || r.amount_cents === "" ? NaN : Math.round(Number(r.amount_cents)));
    // Posted dollar rows up to today, in the ledger's shape. Pending rows, future dates and other currencies are left out.
    function posted(transactions, today) {
      return (transactions || []).filter((r) => r && !r.is_pending && usdRow(r) && typeof r.posted_on === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.posted_on) && r.posted_on.slice(0, 10) <= today && Number.isFinite(centsOf(r)))
        .map((r) => ({ id: String(r.provider_transaction_id == null ? "" : r.provider_transaction_id), account_id: r.account_id, amount_cents: centsOf(r), posted_at: r.posted_on.slice(0, 10), merchant_raw: String(r.merchant_raw || ""), is_transfer: !!r.is_transfer }));
    }
    const foreignTx = (transactions) => (transactions || []).filter((r) => r && !usdRow(r)).length;
    const keyOf = (raw) => LG.normalizeMerchant(raw).key || String(raw || "").toLowerCase();
    // A readable name: the balance answer's own merchant names first, else the descriptor without card-network noise and
    // store numbers. Nothing invented.
    function nameOf(raw) {
      const c = MA.classify(raw);
      if (c && c.name) return c.name;
      const s = String(raw || "").replace(/^(?:sq|tst|sp|pp|paypal|py)\s*\*\s*/i, "").replace(/\b(?:pos|debit|purchase|checkcard|check card|recurring|ach|ppd|web)\b/gi, " ").replace(/#\s*\d+|\b\d{3,}\b|[*#]/g, " ").replace(/\s+/g, " ").trim();
      return s ? s.toLowerCase().replace(/(^|[\s\-\/])([a-z])/g, (_, a, b) => a + b.toUpperCase()) : String(raw || "Unknown").trim() || "Unknown";
    }

    // ---- paydays, from the person's own deposits ----
    // A date paid on anchor A in its month: on the day, or early when every day after it up to the anchor is a weekend
    // day, allowing one weekday holiday (a Monday holiday paid the Friday before).
    function anchorDate(ym, a) { const y = +ym.slice(0, 4), m = +ym.slice(5, 7), end = lastDay(y, m); return `${ym}-${pad(a === "last" ? end : Math.min(a, end))}`; }
    function paidFor(date, ad) {
      if (date === ad) return true;
      const gap = daysBetween(date, ad);
      if (gap < 1 || gap > 4) return false;
      let weekdays = 0;
      for (let i = 1; i <= gap; i++) { const w = dow(addDays(date, i)); if (w !== 0 && w !== 6) weekdays++; }
      return weekdays <= 1 && dow(date) !== 0 && dow(date) !== 6;
    }
    // The anchor in the date's own month that it was paid for (or the next month's when paid early across a month end).
    function matchAnchor(date, a) {
      const ym = date.slice(0, 7), next = addMonths(`${ym}-01`, 1).slice(0, 7);
      for (const m of [ym, next]) { const ad = anchorDate(m, a); if (paidFor(date, ad)) return ad; }
      return null;
    }
    function semimonthlyFit(dates) {
      const days = [...new Set(dates.map((d) => +d.slice(8, 10)))], cands = days.concat(["last"]);
      let best = null;
      for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
        const a = cands[i], b = cands[j], na = a === "last" ? 31 : a, nb = b === "last" ? 31 : b;
        if (Math.abs(na - nb) < 10 || Math.abs(na - nb) > 20) continue;
        const seen = new Set(); let ok = true, exact = 0;
        for (const d of dates) {
          const hit = matchAnchor(d, a) || matchAnchor(d, b);
          if (!hit || seen.has(hit)) { ok = false; break; }
          seen.add(hit); if (hit === d) exact++;
        }
        if (ok && (!best || exact > best.exact || (exact === best.exact && b === "last"))) best = { anchors: [a, b].sort((x, y) => (x === "last" ? 31 : x) - (y === "last" ? 31 : y)), exact };
      }
      return best;
    }
    function monthlyFit(dates) {
      const cands = [...new Set(dates.map((d) => +d.slice(8, 10)))].concat(["last"]);
      let best = null;
      for (const a of cands) {
        const seen = new Set(); let ok = true, exact = 0;
        for (const d of dates) { const hit = matchAnchor(d, a); if (!hit || seen.has(hit)) { ok = false; break; } seen.add(hit); if (hit === d) exact++; }
        if (ok && (!best || exact > best.exact || (exact === best.exact && a === "last"))) best = { anchors: [a], exact };
      }
      return best;
    }
    // Which cadence a payer's deposit dates follow, or null. Every 14 days and twice a month look alike over a few dates;
    // the one that puts more deposits exactly on its schedule wins, and a tie with every gap exactly 14 days is biweekly.
    function fitCadence(dates) {
      const n = dates.length;
      if (n < 2) return null;
      const gaps = []; for (let i = 1; i < n; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));
      const mean = daysBetween(dates[0], dates[n - 1]) / (n - 1);
      // The schedule's base: the deposit most others fall exactly 7 or 14 days from (a holiday-early one is not the base).
      const aligned = (step) => { let best = { exact: 0, base: dates[n - 1] }; for (let j = n - 1; j >= 0; j--) { const e = dates.filter((d, i) => daysBetween(dates[j], d) === step * (i - j)).length; if (e > best.exact) best = { exact: e, base: dates[j] }; } return best; };
      if (n >= 3 && gaps.every((g) => g >= 6 && g <= 8) && Math.abs(mean - 7) <= 0.5) return { cadence: "weekly", days: 7, label: "every week", base: aligned(7).base };
      let bi = null, semi = null;
      if (n >= 3 && gaps.every((g) => g >= 12 && g <= 16) && Math.abs(mean - 14) <= 0.5) {
        const al = aligned(14);
        bi = { cadence: "biweekly", days: 14, label: "every 14 days", exact: al.exact, base: al.base };
      }
      if (n >= 3 && gaps.every((g) => g >= 9 && g <= 21)) { const s = semimonthlyFit(dates); if (s) semi = { cadence: "semimonthly", days: 15, anchors: s.anchors, exact: s.exact, label: `twice a month (the ${s.anchors.map(ordinal).join(" and the ")})` }; }
      if (bi && semi) return bi.exact > semi.exact || (bi.exact === semi.exact && gaps.every((g) => g === 14)) ? bi : semi;
      if (bi || semi) return bi || semi;
      if (gaps.every((g) => g >= 26 && g <= 35)) { const m = monthlyFit(dates); if (m) return { cadence: "monthly", days: 31, anchors: m.anchors, label: `monthly (the ${ordinal(m.anchors[0])})` }; }
      return null;
    }
    function ordinal(a) { if (a === "last") return "last day"; const s = a % 10 === 1 && a !== 11 ? "st" : a % 10 === 2 && a !== 12 ? "nd" : a % 10 === 3 && a !== 13 ? "rd" : "th"; return `${a}${s}`; }
    // Expected pay dates after today, up to and including `to`.
    function payDates(s, today, to) {
      const out = [];
      if (s.cadence === "weekly" || s.cadence === "biweekly") {
        // A date already paid early (the last deposit a few days before it) is not expected again.
        for (let k = 1; k < 400; k++) { const d = addDays(s.base, s.days * k); if (d > to) break; if (d > today && daysBetween(s.last, d) >= s.days - 3) out.push(d); }
        return out;
      }
      // A pay day that falls on a weekend is expected the Friday before, the way these deposits are matched.
      const paid = new Set(s.dates.flatMap((d) => s.anchors.map((a) => matchAnchor(d, a)).filter(Boolean)));
      const early = (ad) => (dow(ad) === 6 ? addDays(ad, -1) : dow(ad) === 0 ? addDays(ad, -2) : ad);
      for (let k = 0, ym = today.slice(0, 7); k < 6 + Math.ceil(daysBetween(today, to) / 28); k++, ym = addMonths(`${ym}-01`, 1).slice(0, 7))
        for (const a of s.anchors) { const ad = anchorDate(ym, a), on = early(ad); if (on > today && on <= to && !paid.has(ad)) out.push(on); }
      return out.sort();
    }
    // Each payer whose deposits keep a schedule: a payroll descriptor, or $100 or more each time. A payer two schedules
    // behind has stopped and is left out. Same-day deposits from one payer (a split deposit) count as one payday.
    function payStreams(rows, today) {
      const by = new Map();
      for (const t of rows) if (t.amount_cents > 0 && !t.is_transfer && !NOT_INCOME.test(t.merchant_raw)) { const k = keyOf(t.merchant_raw); if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
      const out = [];
      for (const [key, txs] of [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const perDay = new Map();
        for (const t of txs) if (daysBetween(t.posted_at, today) <= 200) perDay.set(t.posted_at, (perDay.get(t.posted_at) || 0) + t.amount_cents);
        const dates = [...perDay.keys()].sort().slice(-8), amounts = dates.map((d) => perDay.get(d));
        const fit = fitCadence(dates);
        if (!fit) continue;
        const payroll = txs.some((t) => PAYROLL.test(t.merchant_raw)), amount = lowerMedian(amounts), last = dates[dates.length - 1];
        if (!payroll && amount < 10000) continue;
        if (daysBetween(last, today) > 2 * fit.days + LATE_GRACE) continue;
        out.push({ key, payer: nameOf(txs[txs.length - 1].merchant_raw), cadence: fit.cadence, label: fit.label, days: fit.days, anchors: fit.anchors || null, base: fit.base || null, amount_cents: amount, steady: amounts.every((x) => Math.abs(x - amount) <= Math.max(Math.round(amount * 0.05), 100)), dates, last, payroll });
      }
      return out.sort((a, b) => (b.payroll - a.payroll) || b.amount_cents - a.amount_cents || a.key.localeCompare(b.key));
    }

    // ---- bills and renewals, from AgentLedger.recurring over the same rows ----
    const CADENCE_DAYS = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 31, quarterly: 92, yearly: 366 };
    const CADENCE_WORD = { weekly: "weekly", biweekly: "every 2 weeks", semimonthly: "twice a month", monthly: "monthly", quarterly: "quarterly", yearly: "yearly" };
    function nthAfter(last, cadence, k, day) {
      if (cadence === "weekly") return addDays(last, 7 * k);
      if (cadence === "biweekly") return addDays(last, 14 * k);
      if (cadence === "monthly") return addMonths(last, k, day);
      if (cadence === "quarterly") return addMonths(last, 3 * k, day);
      if (cadence === "yearly") return addMonths(last, 12 * k, day);
      let on = last; for (let i = 0; i < k; i++) on = +on.slice(8, 10) <= 14 ? `${on.slice(0, 7)}-15` : addMonths(`${on.slice(0, 7)}-01`, 1); // the 1st and the 15th
      return on;
    }
    function billsOf(rows, transactions, today) {
      const debits = rows.filter((t) => !(t.amount_cents < 0 && TRANSFER_WORD.test(t.merchant_raw)));
      const rec = LG.recurring(debits, today).filter((r) => r.direction === "debit" && !VARIABLE.has(r.category));
      const live = [], stopped = [];
      for (const r of rec) (daysBetween(r.last_on, today) > 2 * CADENCE_DAYS[r.cadence] + LATE_GRACE ? stopped : live).push(r);
      // A charge for the bill already pending is already out of the available balance, so its next date is not counted twice.
      const pendingKeys = new Set((transactions || []).filter((t) => t && t.is_pending && usdRow(t) && centsOf(t) < 0).map((t) => keyOf(t.merchant_raw)));
      // The descriptor to name it by, and for a bill charged at a month's end lately (the 28th or later), its latest day,
      // so a bill on the 31st comes back to the 31st after February. Otherwise its last charge's day is used.
      const monthEndDay = (ds) => (ds.some((d) => d >= 28) ? Math.max(...ds) : undefined);
      const rawOf = new Map(), daysOf = new Map();
      for (const t of debits.slice().sort((a, b) => a.posted_at.localeCompare(b.posted_at))) if (t.amount_cents < 0) { const k = keyOf(t.merchant_raw); rawOf.set(k, t.merchant_raw); if (!daysOf.has(k)) daysOf.set(k, []); daysOf.get(k).push(+t.posted_at.slice(8, 10)); }
      const bills = live.map((r) => ({ key: r.key, name: rawOf.has(r.key) ? nameOf(rawOf.get(r.key)) : r.merchant, cadence: r.cadence, amount_cents: r.amount_cents, steady: r.steady_amount, count: r.count, last_on: r.last_on, renewal: r.cadence === "quarterly" || r.cadence === "yearly", pending: pendingKeys.has(r.key), day: monthEndDay((daysOf.get(r.key) || []).slice(-3)) }));
      return { bills: bills.sort((a, b) => a.key.localeCompare(b.key)), stopped };
    }
    // Dated occurrences from today to `to`. One a few days late and not seen yet is still expected, counted today.
    function occurrences(bills, today, to) {
      const out = [];
      for (const b of bills) {
        let skippedPending = !b.pending;
        for (let k = 1; k < 500; k++) {
          const on = nthAfter(b.last_on, b.cadence, k, b.day);
          if (on > to) break;
          if (on < today && daysBetween(on, today) > LATE_GRACE) continue;
          if (!skippedPending && on <= addDays(today, 3)) { skippedPending = true; continue; }
          skippedPending = true;
          out.push({ on: on < today ? today : on, expected: on, late: on < today, name: b.name, amount_cents: b.amount_cents, cadence: b.cadence, renewal: b.renewal, steady: b.steady, key: b.key, direction: "out" });
        }
      }
      return out.sort((a, b) => a.on.localeCompare(b.on) || b.amount_cents - a.amount_cents || a.name.localeCompare(b.name));
    }

    // ---- shared inputs ----
    // The person's buffer (a settings value, cents) and their scheduled transfers ({ on, amount_cents, name } — money
    // already committed to leave the cash pool on a date, not yet in any balance). Both are optional inputs: a caller
    // that passes neither gets the bills-only figures this module has always produced. A bad value is ignored, never
    // guessed: a non-finite or negative buffer is no buffer; a transfer with no readable date or amount is left out.
    const bufferOf = (opts) => { const b = Math.round(Number(opts && opts.buffer_cents)); return Number.isFinite(b) && b > 0 ? b : 0; };
    function scheduledOf(opts, today) {
      const raw = (opts && (opts.scheduled_transfers || opts.scheduledTransfers)) || [];
      const out = [];
      for (const s of Array.isArray(raw) ? raw : []) {
        if (!s || typeof s !== "object") continue;
        const on = String(s.on || s.due_on || s.date || s.posted_on || "").slice(0, 10), amt = Math.round(Number(s.amount_cents != null ? s.amount_cents : s.amount));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || on < today || !Number.isFinite(amt) || amt === 0) continue;
        out.push({ on, amount_cents: Math.abs(amt), name: String(s.name || s.label || s.merchant || "Scheduled transfer").trim() || "Scheduled transfer" });
      }
      return out.sort((a, b) => a.on.localeCompare(b.on) || b.amount_cents - a.amount_cents || a.name.localeCompare(b.name));
    }
    function inputs(accounts, transactions, now, opts) {
      const tz = (opts && opts.tz) || "UTC", today = todayIn(now, tz), rows = posted(transactions, today);
      const cash = cashOf(accounts), streams = payStreams(rows, today), { bills, stopped } = billsOf(rows, transactions, today);
      const pay = streams.find((s) => s.payroll) ? streams.filter((s) => s.payroll) : streams;
      const nextPays = pay.map((s) => ({ s, on: payDates(s, today, addDays(today, 62))[0] })).filter((x) => x.on).sort((a, b) => a.on.localeCompare(b.on));
      const payday = nextPays[0] || null;
      const cardLinked = active(accounts).some((a) => kindOf(a) === "credit");
      const synced = (transactions || []).map((r) => ms(r && r.fetched_at)).filter(Number.isFinite).sort((a, b) => b - a)[0];
      return { tz, today, now, opts: opts || {}, accounts: active(accounts), rows, cash, streams, bills, stopped, payday, cardLinked, synced, fresh: freshness(cash.rows.map((r) => r.account), now), foreignTx: foreignTx(transactions), buffer_cents: bufferOf(opts), scheduled: scheduledOf(opts, today) };
    }
    const scheduledDue = (I, to) => I.scheduled.filter((s) => s.on <= to);
    const scheduledLine = (s, today) => `${s.name} ${money(s.amount_cents)} (${dateLabel(s.on, today)})`;
    function txThrough(I) {
      const d = I.rows.map((r) => r.posted_at).sort().slice(-1)[0], synced = I.synced;
      return `${d ? `transactions through ${dateLabel(d)}, ${d.slice(0, 4)}` : "no posted transactions yet"}${Number.isFinite(synced) ? `, synced ${MA.timeLabel(synced, I.tz)}` : ""}`;
    }
    function sourceLine(I, accts, withTx) {
      const used = accts || I.cash.rows.map((r) => r.account), f = freshness(used, I.now);
      const insts = [...new Set(active(used).map((a) => String(a.institution || "").trim()).filter(Boolean))];
      const asOf = Number.isFinite(f.oldest) ? `balances as of ${MA.timeLabel(f.oldest, I.tz)}` : "balances with no as-of time";
      return `From your linked accounts${insts.length ? ` (${insts.join(", ")})` : ""}: ${asOf}${withTx ? `; ${txThrough(I)}` : ""}.`;
    }
    function notCounted(I) {
      const out = [];
      if (I.cash.foreign.length) out.push(`${I.cash.foreign.map((a) => `${acctName(a)} (${foreignText(a)})`).join(", ")} ${I.cash.foreign.length === 1 ? "is" : "are"} in another currency, so ${I.cash.foreign.length === 1 ? "it isn't" : "they aren't"} added into dollars.`);
      if (I.foreignTx) out.push(`${plural(I.foreignTx, "transaction")} in other currencies ${I.foreignTx === 1 ? "isn't" : "aren't"} counted.`);
      return out;
    }
    const billLine = (o, today) => `${dateLabel(o.on, today)}: ${o.name}, ${o.steady ? "" : "about "}${money(o.amount_cents)} (${o.renewal ? `${CADENCE_WORD[o.cadence]} renewal` : `${CADENCE_WORD[o.cadence]} bill`}${o.late ? `, expected ${dateLabel(o.expected, today)} and not posted yet` : ""})`;
    const payLine = (p, today) => `${dateLabel(p.on, today)}: payday, ${p.s.steady ? "" : "about "}${money(p.s.amount_cents)} from ${p.s.payer} (${p.s.label})`;
    const streamText = (s, today) => `${s.steady ? "" : "about "}${money(s.amount_cents)} ${s.label} from ${s.payer} (read from ${plural(s.dates.length, "deposit")}, the last on ${dateLabel(s.last, today)})`;
    const NO_CASH = "No checking or savings balance is linked, so there's no cash number to start from.";

    // ---- E1 safe to spend ----
    function safeToSpend(accounts, transactions, now, opts) {
      if (!active(accounts).length) return null;
      const I = inputs(accounts, transactions, now, opts), t = I.today;
      if (!I.cash.rows.length) return { kind: "safe", text: `Safe to spend: I can't work it out. ${NO_CASH}\n${sourceLine(I, active(accounts), true)}`, math: [NO_CASH], safe_cents: null };
      const end = I.payday ? I.payday.on : addDays(t, FALLBACK_DAYS), days = Math.max(1, daysBetween(t, end));
      const due = occurrences(I.bills, t, end), billsCents = sum(due.map((o) => o.amount_cents));
      const sched = scheduledDue(I, end), schedCents = sum(sched.map((s) => s.amount_cents)), buffer = I.buffer_cents;
      const safe = I.cash.cents - billsCents - schedCents - buffer;
      const perDay = safe > 0 ? Math.floor(safe / days) : 0;
      const until = I.payday ? `until payday (${dateLabel(end, t)})` : `over the next ${FALLBACK_DAYS} days (to ${dateLabel(end, t)})`;
      const lines = [];
      if (safe > 0) lines.push(`Safe to spend ${until}: ${money(safe)}, about ${money(perDay)} a day for ${plural(days, "day")}.`);
      else if (schedCents || buffer) lines.push(`Safe to spend ${until}: ${money(0)}. Bills due by then come to ${money(billsCents)}${schedCents ? `, scheduled transfers due by then come to ${money(schedCents)}` : ""}${buffer ? `, and your buffer is ${money(buffer)}` : ""} — ${money(billsCents + schedCents + buffer)} in all, ${money(-safe)} more than your ${money(I.cash.cents)} in cash.`);
      else lines.push(`Safe to spend ${until}: ${money(0)}. Bills due by then come to ${money(billsCents)}, ${money(-safe)} more than your ${money(I.cash.cents)} in cash.`);
      if (safe > 0) {
        const parts = [due.length ? `${money(I.cash.cents)} in cash minus ${money(billsCents)} of bills due by then: ${due.map((o) => `${o.name} ${money(o.amount_cents)} (${dateLabel(o.on, t)})`).join(", ")}` : `your ${money(I.cash.cents)} in cash; no repeating bill is due before then`];
        if (schedCents) parts.push(`minus ${money(schedCents)} of scheduled transfers due by then: ${sched.map((s) => scheduledLine(s, t)).join(", ")}`);
        if (buffer) parts.push(`minus your ${money(buffer)} buffer`);
        lines.push(`That's ${parts.join(", ")}.`);
      }
      if (!I.payday) lines.push(`I couldn't find a regular paycheck in your deposits, so this counts the next ${FALLBACK_DAYS} days instead of until payday.`);
      else lines.push(`Pay: ${streamText(I.payday.s, t)}.`);
      const cards = active(accounts).filter((a) => kindOf(a) === "credit" && hasBal(a) && !foreign(a) && bal(a) < 0);
      if (cards.length) lines.push(`Card balances (${money(-sum(cards.map(bal)))} owed) aren't subtracted; a card payment counts only when it repeats from your accounts.`);
      lines.push(...notCounted(I), ...staleLines(I.fresh, now, I.tz), sourceLine(I, null, true));
      const subtractions = [money(billsCents), ...(schedCents ? [money(schedCents)] : []), ...(buffer ? [money(buffer)] : [])];
      const math = [`Cash now: ${money(I.cash.cents)}`, ...I.cash.rows.map((r) => `  + ${r.name}: ${money(r.used_cents)} (${r.basis === "available" ? `available; balance ${money(r.balance_cents)}` : "balance"})`),
        `Bills due on or before ${dateLabel(end, t)}: ${money(billsCents)}`, ...due.map((o) => `  - ${billLine(o, t)}`),
        ...(schedCents ? [`Scheduled transfers due on or before ${dateLabel(end, t)}: ${money(schedCents)}`, ...sched.map((s) => `  - ${scheduledLine(s, t)}`)] : []),
        ...(buffer ? [`Buffer: ${money(buffer)}`] : []),
        `${money(I.cash.cents)} - ${subtractions.join(" - ")} = ${money(safe)}${safe > 0 ? "" : ` (below zero, so ${money(0)} is safe to spend)`}`,
        safe > 0 ? `${money(safe)} / ${plural(days, "day")} = ${money(perDay)} a day (rounded down to the cent; ${money(safe - perDay * days)} left over)` : `Per day: ${money(0)}`,
        I.payday ? `Payday: ${streamText(I.payday.s, t)}; next expected ${dateLabel(end, t)}.` : `Payday: none found in your deposits, so ${FALLBACK_DAYS} days is used.`];
      return { kind: "safe", text: lines.join("\n"), math, safe_cents: Math.max(0, safe), raw_cents: safe, cash_cents: I.cash.cents, bills_cents: billsCents, bills: due, scheduled: sched, scheduled_cents: schedCents, buffer_cents: buffer, per_day_cents: perDay, days, until: end, payday_found: !!I.payday, payday: I.payday ? I.payday.on : null, today: t };
    }

    // ---- E2 upcoming ----
    function upcoming(accounts, transactions, now, opts) {
      if (!active(accounts).length) return null;
      const I = inputs(accounts, transactions, now, opts), t = I.today, to = addDays(t, UPCOMING_DAYS);
      const bills = occurrences(I.bills, t, to), pays = I.streams.flatMap((s) => payDates(s, t, to).map((on) => ({ on, s })));
      const items = bills.map((o) => ({ on: o.on, out: o.amount_cents, line: billLine(o, t), o })).concat(pays.map((p) => ({ on: p.on, in: p.s.amount_cents, line: payLine(p, t), p })))
        .sort((a, b) => a.on.localeCompare(b.on) || (a.p ? -1 : 0) - (b.p ? -1 : 0) || a.line.localeCompare(b.line));
      const outC = sum(bills.map((o) => o.amount_cents)), inC = sum(pays.map((p) => p.s.amount_cents));
      const lines = [items.length ? `Coming up in the next ${UPCOMING_DAYS} days (${rangeLabel(t, to, t)}): ${money(outC)} out in ${plural(bills.length, "bill")}, ${money(inC)} in from ${plural(pays.length, "payday")}.` : `Coming up in the next ${UPCOMING_DAYS} days (${rangeLabel(t, to, t)}): nothing repeating that I can see in your transactions.`];
      for (const i of items) lines.push(`- ${i.line}`);
      if (!I.streams.length) lines.push("I couldn't find a regular paycheck in your deposits, so no payday is on the list.");
      if (I.stopped.length) lines.push(`${plural(I.stopped.length, "repeating charge")} that ${I.stopped.length === 1 ? "seems" : "seem"} to have stopped (nothing for two cycles) ${I.stopped.length === 1 ? "is" : "are"} left out.`);
      lines.push("Dates are read from the pattern of past charges and deposits, so they're expected, not promised.");
      lines.push(...notCounted(I).filter((l) => /transaction/.test(l)), `From your linked accounts: ${txThrough(I)}.`);
      const math = [`Window: ${rangeLabel(t, to, t)}`, ...I.bills.map((b) => `Bill: ${b.name}, ${CADENCE_WORD[b.cadence]}, ${money(b.amount_cents)}${b.steady ? "" : " (median; the amount varies)"}, from ${plural(b.count, "charge")}, the last on ${dateLabel(b.last_on, t)}`),
        ...I.streams.map((s) => `Pay: ${streamText(s, t)}`), `Out: ${bills.map((o) => money(o.amount_cents)).join(" + ") || money(0)} = ${money(outC)}`, `In: ${pays.map((p) => money(p.s.amount_cents)).join(" + ") || money(0)} = ${money(inC)}`];
      return { kind: "upcoming", text: lines.join("\n"), math, items: items.map((i) => ({ on: i.on, kind: i.p ? "payday" : i.o.renewal ? "renewal" : "bill", name: i.p ? i.p.s.payer : i.o.name, amount_cents: i.p ? i.p.s.amount_cents : i.o.amount_cents, direction: i.p ? "in" : "out" })), out_cents: outC, in_cents: inC, from: t, to };
    }

    // ---- everyday outflow over the last 90 days (E3 runway; E4 and E6 name it) ----
    function outflow(I, excludeKeys) {
      const from = addDays(I.today, -(BASIS_DAYS - 1)), first = I.rows.map((r) => r.posted_at).sort()[0];
      const start = first && first > from ? first : from, basis = first ? daysBetween(start, I.today) + 1 : 0;
      const rows = I.rows.filter((r) => r.amount_cents < 0 && !r.is_transfer && !MOVED.test(r.merchant_raw) && !(I.cardLinked && CARD_PAYMENT.test(r.merchant_raw)) && r.posted_at >= start && (!excludeKeys || !excludeKeys.has(keyOf(r.merchant_raw))));
      return { from: start, basis, total: sum(rows.map((r) => -r.amount_cents)), count: rows.length, enough: basis >= MIN_BASIS, short: !!first && first > from };
    }

    // ---- E3 runway ----
    function runway(accounts, transactions, now, opts) {
      if (!active(accounts).length) return null;
      const I = inputs(accounts, transactions, now, opts), t = I.today, o = outflow(I);
      const tail = [...notCounted(I), ...staleLines(I.fresh, now, I.tz), sourceLine(I, I.cash.rows.length ? null : active(accounts), true)];
      if (!I.cash.rows.length) return { kind: "runway", text: [`Runway: I can't work it out. ${NO_CASH}`, ...tail].join("\n"), math: [NO_CASH], days: null };
      if (!o.enough) return { kind: "runway", text: [`Runway: I can't measure it yet. Your transactions cover only ${plural(o.basis, "day")}, and I need at least ${MIN_BASIS} to average your spending.`, ...tail].join("\n"), math: [`History: ${plural(o.basis, "day")} (need ${MIN_BASIS})`], days: null };
      if (o.total === 0) return { kind: "runway", text: [`Runway: no spending posted since ${dateLabel(o.from, t)}, so there's no daily rate to measure your ${money(I.cash.cents)} in cash against.`, ...tail].join("\n"), math: [`Spending since ${dateLabel(o.from, t)}: ${money(0)}`], days: null };
      if (I.cash.cents <= 0) return { kind: "runway", text: [`Runway: none. Your cash is ${money(I.cash.cents)}, and you've averaged ${money(Math.round(o.total / o.basis))} a day of spending.`, ...tail].join("\n"), math: [`Cash now: ${money(I.cash.cents)}`], days: 0 };
      const days = Math.floor(I.cash.cents * o.basis / o.total), perDay = Math.round(o.total / o.basis), until = addDays(t, days);
      const window = `${o.short ? `since your transactions start (${rangeLabel(o.from, t, t)})` : `over the last ${BASIS_DAYS} days (${rangeLabel(o.from, t, t)})`}`;
      const lines = [`Runway: about ${plural(days, "day")}. Your ${money(I.cash.cents)} in cash lasts to around ${dateLabel(until, t)} at your average spending of ${money(perDay)} a day ${window}, if no money came in.`];
      if (o.short) lines.push(`Your linked transactions start ${dateLabel(o.from, t)}, so that's ${plural(o.basis, "day")} of history, not ${BASIS_DAYS}.`);
      lines.push(`Transfers between your accounts${I.cardLinked ? " and payments to your linked cards (their purchases count instead)" : ""} aren't counted as spending.`, ...tail);
      const math = [`Cash now: ${money(I.cash.cents)}`, ...I.cash.rows.map((r) => `  + ${r.name}: ${money(r.used_cents)}`), `Spending ${window}: ${money(o.total)} in ${plural(o.count, "charge")}`,
        `${money(o.total)} / ${plural(o.basis, "day")} = ${money(perDay)} a day`, `${money(I.cash.cents)} / ${money(perDay)} a day = ${(I.cash.cents * o.basis / o.total).toFixed(1)} -> ${plural(days, "day")} (whole days, rounded down)`, `${dateLabel(t, t)} + ${plural(days, "day")} = ${dateLabel(until, t)}`];
      return { kind: "runway", text: lines.join("\n"), math, days, until, per_day_cents: perDay, spend_cents: o.total, basis_days: o.basis, cash_cents: I.cash.cents };
    }

    // ---- E6 forecast (and the engine E4 reads) ----
    // mod.shift moves one bill occurrence ({ key, from_on, to_on }); mod.add_cents adds money in from today (a transfer
    // into the pool the bills are paid from). Both exist so a forecast fix is verified on this same projection, never
    // asserted from different arithmetic.
    function project(I, days, mod) {
      const t = I.today, to = addDays(t, days), m = mod || {};
      let bills = occurrences(I.bills, t, to);
      if (m.shift) bills = bills.map((o) => (o.key === m.shift.key && o.on === m.shift.from_on ? { ...o, on: m.shift.to_on, expected: o.on, shifted: true } : o));
      const sched = scheduledDue(I, to), pays = I.streams.flatMap((s) => payDates(s, t, to).map((on) => ({ on, s })));
      const daily = []; let b = I.cash.cents + (m.add_cents || 0);
      for (let d = 0; d <= days; d++) {
        const on = addDays(t, d), outC = sum(bills.filter((o) => o.on === on).map((o) => o.amount_cents)) + sum(sched.filter((s) => s.on === on).map((s) => s.amount_cents)), inC = sum(pays.filter((p) => p.on === on).map((p) => p.s.amount_cents));
        b += inC - outC; daily.push({ on, d, balance_cents: b, in_cents: inC, out_cents: outC });
      }
      return { daily, bills, pays, scheduled: sched, in_cents: sum(pays.map((p) => p.s.amount_cents)), out_cents: sum(bills.map((o) => o.amount_cents)) + sum(sched.map((s) => s.amount_cents)) };
    }
    const lowOf = (daily) => daily.reduce((m, x) => (x.balance_cents < m.balance_cents ? x : m), daily[0]);
    // One specific fix for a projection whose low point is under the line (zero, or the person's buffer): first a bill
    // delay — the smallest delay of one bill due on or before the low day whose shifted projection never goes under
    // the line; failing that, a transfer of exactly the shortfall from the person's fullest savings account to their
    // checking, in the words that trigger it. Null when neither single move gets back to the line.
    function forecastFix(I, P, threshold) {
      const low = lowOf(P.daily);
      if (low.balance_cents >= threshold) return null;
      const cands = P.bills.filter((o) => o.on <= low.on).sort((a, b) => b.amount_cents - a.amount_cents || a.on.localeCompare(b.on) || a.name.localeCompare(b.name));
      const seen = new Set();
      for (let delay = 1; delay <= 30; delay++) for (const o of cands) {
        const k = `${o.key}|${o.on}`;
        if (delay === 1) { if (seen.has(k)) continue; seen.add(k); }
        const toOn = addDays(o.on, delay), P2 = project(I, HORIZON, { shift: { key: o.key, from_on: o.on, to_on: toOn } }), low2 = lowOf(P2.daily);
        if (low2.balance_cents >= threshold) return { type: "delay_bill", name: o.name, key: o.key, amount_cents: o.amount_cents, from_on: o.on, to_on: toOn, delay_days: delay, new_low_cents: low2.balance_cents, new_low_on: low2.on, threshold_cents: threshold };
      }
      const need = threshold - low.balance_cents;
      const savings = I.cash.rows.filter((r) => kindOf(r.account) === "savings").sort((a, b) => b.used_cents - a.used_cents)[0];
      const checking = I.cash.rows.filter((r) => kindOf(r.account) === "checking")[0];
      if (savings && checking && savings.used_cents >= need) {
        const P2 = project(I, HORIZON, { add_cents: need }), low2 = lowOf(P2.daily);
        if (low2.balance_cents >= threshold) return { type: "transfer", amount_cents: need, from_account: savings.name, to_account: checking.name, from_account_id: savings.account.account_id, to_account_id: checking.account.account_id, instruction: `move ${money(need)} from ${savings.name} to ${checking.name}`, new_low_cents: low2.balance_cents, new_low_on: low2.on, threshold_cents: threshold };
      }
      return null;
    }
    function fixLine(fix, t, threshold) {
      const line = threshold > 0 ? `your ${money(threshold)} buffer` : "zero";
      if (fix.type === "delay_bill") return `Fix: delay ${fix.name} (${money(fix.amount_cents)}) by ${plural(fix.delay_days, "day")}, from ${dateLabel(fix.from_on, t)} to ${dateLabel(fix.to_on, t)}. With that change the lowest point is ${money(fix.new_low_cents)} on ${dateLabel(fix.new_low_on, t)}, at or above ${line}.`;
      return `Fix: ${fix.instruction} — send "${fix.instruction}" to do it. With that move the lowest point is ${money(fix.new_low_cents)} on ${dateLabel(fix.new_low_on, t)}, at or above ${line}.`;
    }
    function forecast(accounts, transactions, now, opts) {
      if (!active(accounts).length) return null;
      const I = inputs(accounts, transactions, now, opts), t = I.today;
      if (!I.cash.rows.length) return { kind: "forecast", text: `90-day forecast: I can't work it out. ${NO_CASH}\n${sourceLine(I, active(accounts), true)}`, math: [NO_CASH], points: [] };
      const P = project(I, HORIZON), pts = [30, 60, 90].map((d) => P.daily[d]), low = lowOf(P.daily), threshold = I.buffer_cents, fix = forecastFix(I, P, threshold);
      const ev = outflow(I, new Set(I.bills.map((b) => b.key))), evDay = ev.enough && ev.basis ? Math.round(ev.total / ev.basis) : null;
      const lines = [`90-day forecast, from your repeating bills and paychecks only: ${pts.map((p) => `${money(p.balance_cents)} on ${dateLabel(p.on, t)} (${p.d} days)`).join(", ")}. Lowest: ${money(low.balance_cents)} on ${dateLabel(low.on, t)}${low.balance_cents < 0 ? ", below zero" : threshold && low.balance_cents < threshold ? `, below your ${money(threshold)} buffer` : ""}.`,
        ...(fix ? [fixLine(fix, t, threshold)] : low.balance_cents < threshold ? [`Fix: no single bill delay of up to 30 days and no savings transfer I can name from these rows gets the balance back to ${threshold ? `your ${money(threshold)} buffer` : "zero"} on its own.`] : []), "Assumptions:",
        `- Starts from ${money(I.cash.cents)} in cash (${I.cash.rows.map((r) => r.name).join(", ")}).`,
        I.streams.length ? `- Paychecks: ${I.streams.map((s) => streamText(s, t)).join("; ")}.` : "- Paychecks: none found in your deposits, so no money comes in.",
        I.bills.length ? `- Bills: ${I.bills.map((b) => `${b.name} ${b.steady ? "" : "about "}${money(b.amount_cents)} ${CADENCE_WORD[b.cadence]}`).join("; ")}.` : "- Bills: no repeating bill found.",
        ...(P.scheduled.length ? [`- Scheduled transfers: ${P.scheduled.map((s) => scheduledLine(s, t)).join("; ")}.`] : []),
        ...(threshold ? [`- Your buffer: ${money(threshold)} — the forecast fix is measured against it.`] : []),
        evDay !== null ? `- Not included: everyday spending that doesn't repeat (it averaged ${money(evDay)} a day ${ev.short ? `since ${dateLabel(ev.from, t)}` : `over the last ${BASIS_DAYS} days`}, about ${money(evDay * HORIZON)} over 90 days), one-off bills, and anything new.` : "- Not included: everyday spending (not enough history to average it), one-off bills, and anything new."];
      lines.push(...notCounted(I), ...staleLines(I.fresh, now, I.tz), sourceLine(I, null, true));
      const math = [`Start: ${money(I.cash.cents)} cash on ${dateLabel(t, t)}`, ...P.pays.map((p) => `  + ${dateLabel(p.on, t)}: ${p.s.payer} ${money(p.s.amount_cents)}`), ...P.bills.map((o) => `  - ${dateLabel(o.on, t)}: ${o.name} ${money(o.amount_cents)}`),
        `${money(I.cash.cents)} + ${money(P.in_cents)} in - ${money(P.out_cents)} out = ${money(P.daily[HORIZON].balance_cents)} on ${dateLabel(P.daily[HORIZON].on, t)}`, ...pts.map((p) => `Day ${p.d} (${dateLabel(p.on, t)}): ${money(p.balance_cents)}`), `Lowest: ${money(low.balance_cents)} on ${dateLabel(low.on, t)}`];
      return { kind: "forecast", text: lines.join("\n"), math: [...math, ...(fix ? [`Fix: ${fix.type === "delay_bill" ? `delay ${fix.name} ${money(fix.amount_cents)} by ${plural(fix.delay_days, "day")} (${dateLabel(fix.from_on, t)} -> ${dateLabel(fix.to_on, t)}); the shifted projection's lowest point is ${money(fix.new_low_cents)} on ${dateLabel(fix.new_low_on, t)}` : `${fix.instruction}; ${money(low.balance_cents)} + ${money(fix.amount_cents)} = ${money(low.balance_cents + fix.amount_cents)} at the low point, and the shifted projection's lowest point is ${money(fix.new_low_cents)} on ${dateLabel(fix.new_low_on, t)}`}`] : [])], start_cents: I.cash.cents, in_cents: P.in_cents, out_cents: P.out_cents, points: pts.map((p) => ({ days: p.d, on: p.on, balance_cents: p.balance_cents })), low: { on: low.on, balance_cents: low.balance_cents }, daily: P.daily, everyday_per_day_cents: evDay, threshold_cents: threshold, fix };
    }

    // The inputs another read-only check builds on (97-bnpl.js, capability list item 87): cash now, the repeating bills and
    // paydays dated over the next `days`, and this module's own source and stale lines, so a check over the same rows
    // never derives them a second way. Null with no linked account.
    function projection(accounts, transactions, now, opts, days) {
      if (!active(accounts).length) return null;
      const I = inputs(accounts, transactions, now, opts), to = addDays(I.today, days);
      return { today: I.today, to, tz: I.tz, cash_cents: I.cash.cents, cash_rows: I.cash.rows, has_cash: I.cash.rows.length > 0, bills: occurrences(I.bills, I.today, to),
        pays: I.streams.flatMap((s) => payDates(s, I.today, to).map((on) => ({ on, payer: s.payer, amount_cents: s.amount_cents }))),
        notes: [...notCounted(I), ...staleLines(I.fresh, now, I.tz)], source: sourceLine(I, I.cash.rows.length ? null : active(accounts), true) };
    }

    // ---- E4 affordability ----
    // "$600", "$1,250.50", "$2k", "600 dollars". Null when no amount is named.
    function parseAmount(words) {
      const w = String(words || "").toLowerCase();
      // A bare number right after "afford a/an" is dollars ("can i afford a 900 trip", megadoc L12); a number of
      // months, days or a percent is not.
      let m = w.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(\s?k\b)?/) || w.match(/\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(\s?k)?\s*(?:dollars|bucks|usd)\b/)
        || w.match(/\bafford (?:a |an )?(\d{1,3}(?:,\d{3})+|\d{2,7})(?:\.(\d{1,2}))?(\s?k\b)?(?!\s*(?:%|percent|months?|years?|days?|weeks?|hours?|minutes?|am\b|pm\b|x\b))/);
      if (!m) return null;
      const c = Number(m[1].replace(/,/g, "")) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0), k = m[3] ? 1000 : 1;
      const cents = c * k;
      return Number.isSafeInteger(cents) && cents > 0 && cents <= 1e9 ? cents : null;
    }
    function monthDay(w, today) {
      let m = w.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.? (\d{1,2})(?:st|nd|rd|th)?\b/), mm, dd;
      if (m) { mm = MONTHS.findIndex((re) => re.test(m[1])) + 1; dd = +m[2]; }
      else if ((m = w.match(/\b(\d{1,2})\/(\d{1,2})\b/))) { mm = +m[1]; dd = +m[2]; }
      else return null;
      if (mm < 1 || mm > 12 || dd < 1) return null;
      let y = +today.slice(0, 4);
      if (dd > lastDay(y, mm) && !(mm === 2 && dd === 29)) return null;
      let d = `${y}-${pad(mm)}-${pad(Math.min(dd, lastDay(y, mm)))}`;
      if (d < today) { y += 1; if (dd > lastDay(y, mm)) return null; d = `${y}-${pad(mm)}-${pad(dd)}`; }
      return d;
    }
    // When the words say it would happen: a window of days, from today at the earliest.
    function parseWindow(words, today) {
      const w = String(words || "").toLowerCase(), y = +today.slice(0, 4), m = +today.slice(5, 7);
      const monthWin = (yy, mm, label) => ({ from: `${yy}-${pad(mm)}-01` < today ? today : `${yy}-${pad(mm)}-01`, to: `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}`, label });
      let n, d;
      if (/\bnext month\b/.test(w)) { const nm = addMonths(`${today.slice(0, 7)}-01`, 1); return monthWin(+nm.slice(0, 4), +nm.slice(5, 7), `next month (${rangeLabel(nm, `${nm.slice(0, 8)}${pad(lastDay(+nm.slice(0, 4), +nm.slice(5, 7)))}`, today)})`); }
      if (/\bthis month\b/.test(w)) return { from: today, to: `${today.slice(0, 8)}${pad(lastDay(y, m))}`, label: `this month (by ${dateLabel(`${today.slice(0, 8)}${pad(lastDay(y, m))}`, today)})` };
      const wd = (dow(today) + 6) % 7; // Monday = 0
      if (/\bthis weekend\b/.test(w)) { const sat = addDays(today, 5 - wd), sun = addDays(today, 6 - wd); return { from: sat < today ? today : sat, to: sun, label: `this weekend (${rangeLabel(sat < today ? today : sat, sun, today)})` }; }
      if (/\bnext week\b/.test(w)) { const mon = addDays(today, 7 - wd); return { from: mon, to: addDays(mon, 6), label: `next week (${rangeLabel(mon, addDays(mon, 6), today)})` }; }
      if (/\bthis week\b/.test(w)) { const sun = addDays(today, 6 - wd); return { from: today, to: sun, label: `this week (by ${dateLabel(sun, today)})` }; }
      if (/\btomorrow\b/.test(w)) { d = addDays(today, 1); return { from: d, to: d, label: `tomorrow (${dateLabel(d, today)})` }; }
      if ((n = w.match(/\bin (\d{1,3}|a|one|two|three) (day|week|month)s?\b/))) {
        const k = { a: 1, one: 1, two: 2, three: 3 }[n[1]] || +n[1];
        d = n[2] === "day" ? addDays(today, k) : n[2] === "week" ? addDays(today, 7 * k) : addMonths(today, k);
        return { from: d, to: d, label: `in ${n[1]} ${n[2]}${k === 1 ? "" : "s"} (${dateLabel(d, today)})` };
      }
      if ((n = w.match(/\b(by|before|on|for)\b(.*)/)) && (d = monthDay(n[2], today))) return n[1] === "on" || n[1] === "for" ? { from: d, to: d, label: `on ${dateLabel(d, today)}` } : { from: today, to: n[1] === "before" ? (addDays(d, -1) < today ? today : addDays(d, -1)) : d, label: `${n[1]} ${dateLabel(d, today)}` };
      const named = MONTHS.findIndex((re) => re.test(w.replace(/\bmay i\b/g, "")));
      if (named >= 0 && /\b(?:in|for|during)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(w)) {
        const mm = named + 1, yy = mm >= m ? y : y + 1;
        return monthWin(yy, mm, `in ${MON[mm - 1]}${yy !== y ? ` ${yy}` : ""}`);
      }
      return { from: today, to: today, label: "today" };
    }
    // ---- goal impact (C9) ----
    // A goal as the caller supplies it: { name, target_cents, saved_cents, monthly_cents, target_date } or the person's
    // stored savings_goal watch { kind, name, target_cents, by, account } — saved is then that account's balance, and
    // the monthly amount is what reaching the target by its date takes (the goal answer's own arithmetic, 114).
    // Contributions land monthly, so a purchase pushes completion by whole monthly steps: the time to re-save the
    // amount at the goal's monthly rate, rounded up to the next contribution.
    const centsField = (g, keys) => { for (const k of keys) { const v = Math.round(Number(g[k])); if (Number.isFinite(v)) return v; } return null; };
    const monthsBetween = (a, b) => (+b.slice(0, 4) * 12 + +b.slice(5, 7)) - (+a.slice(0, 4) * 12 + +a.slice(5, 7));
    function normalizeGoals(I, opts) {
      const raw = (opts && (opts.goals || opts.savings_goals)) || [];
      const out = [];
      for (const g of Array.isArray(raw) ? raw : []) {
        if (!g || typeof g !== "object" || !String(g.name || "").trim()) continue;
        const target = centsField(g, ["target_cents", "target"]);
        if (target === null || target <= 0) continue;
        let saved = centsField(g, ["saved_cents", "saved", "saved_so_far_cents"]);
        if (saved === null && g.account) {
          const want = String(g.account).trim().toLowerCase();
          const hit = I.accounts.filter((a) => { const nm = acctName(a).toLowerCase(), bare = String(a.name || "").toLowerCase(); return nm === want || bare === want || nm.includes(want) || bare.includes(want) || want.includes(bare); });
          if (hit.length === 1 && hasBal(hit[0])) saved = bal(hit[0]);
        }
        if (saved === null) saved = g.account ? null : 0;
        if (saved === null) continue; // a tied account that cannot be read: no saved figure, no guessed impact
        const targetDate = String(g.target_date || g.by || g.target_on || g.date || "").slice(0, 10);
        const by = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : null;
        let monthly = centsField(g, ["monthly_cents", "monthly_contribution_cents", "monthly", "contribution_cents"]);
        if ((monthly === null || monthly <= 0) && by && target > saved) { const m = monthsBetween(I.today, by); if (m >= 1) monthly = Math.ceil((target - saved) / m); }
        out.push({ name: String(g.name).trim(), target_cents: target, saved_cents: saved, monthly_cents: monthly, target_date: by, same_pool: !(g.from_same_pool === false || g.same_pool === false || g.pool === "separate") });
      }
      return out;
    }
    function goalImpacts(I, opts, amount) {
      const goals = normalizeGoals(I, opts), impacts = [];
      for (const g of goals) {
        if (!g.same_pool || g.target_cents <= g.saved_cents || !g.monthly_cents || g.monthly_cents <= 0) continue;
        let oldDate, newDate, slip;
        if (g.target_date) { slip = Math.ceil(amount / g.monthly_cents); oldDate = g.target_date; newDate = addMonths(oldDate, slip); }
        else {
          const monthsOld = Math.ceil((g.target_cents - g.saved_cents) / g.monthly_cents), monthsNew = Math.ceil((g.target_cents - g.saved_cents + amount) / g.monthly_cents);
          slip = monthsNew - monthsOld; oldDate = addMonths(I.today, monthsOld); newDate = addMonths(I.today, monthsNew);
        }
        if (slip <= 0) continue; // the amount fits in the slack before the goal's next monthly step: it does not slip
        impacts.push({ name: g.name, target_cents: g.target_cents, saved_cents: g.saved_cents, monthly_cents: g.monthly_cents, amount_cents: amount, slip_months: slip, old_date: oldDate, new_date: newDate });
      }
      return { goals, impacts };
    }
    const goalLine = (g, t) => `Goal impact: buying this delays your ${g.name} goal — it would finish ${dateLabel(g.new_date, t)} instead of ${dateLabel(g.old_date, t)}, ${plural(g.slip_months, "month")} later. That is the time to re-save ${money(g.amount_cents)} at ${money(g.monthly_cents)} a month, on top of the ${money(g.target_cents - g.saved_cents)} still to save toward ${money(g.target_cents)} (you have ${money(g.saved_cents)} saved).`;

    function afford(accounts, transactions, words, now, opts) {
      if (!active(accounts).length) return null;
      const amount = parseAmount(words);
      if (!amount) return null;
      const I = inputs(accounts, transactions, now, opts), t = I.today, win = parseWindow(words, t), head = `For ${money(amount)} ${win.label}`;
      const src = [...notCounted(I), ...staleLines(I.fresh, now, I.tz), sourceLine(I, I.cash.rows.length ? null : active(accounts), true)];
      if (!I.cash.rows.length) return { kind: "afford", text: [`${head}: I can't tell. ${NO_CASH}`, ...src].join("\n"), math: [NO_CASH], amount_cents: amount, answer: null };
      const horizonEnd = addDays(t, HORIZON);
      if (win.from > horizonEnd) return { kind: "afford", text: [`${head}: that's past the ${HORIZON} days I forecast (to ${dateLabel(horizonEnd, t)}), so I won't guess.`, ...src].join("\n"), math: [`Forecast ends ${dateLabel(horizonEnd, t)}; ${win.label} starts after it.`], amount_cents: amount, answer: null };
      const S = safeToSpend(accounts, transactions, now, opts);
      const P = project(I, HORIZON), ev = outflow(I, new Set(I.bills.map((b) => b.key))), evTotal = ev.enough ? ev.total : 0, evBasis = ev.enough ? ev.basis : 1;
      // What could go on day d and leave the balance at or above $0 every day after it through the forecast, once
      // everyday spending at its 90-day average is taken out day by day. Scheduled transfers are already out of P's
      // daily balances; the room is then measured above the person's buffer (the same line safeToSpend holds).
      const net = P.daily.map((x) => x.balance_cents - Math.round(evTotal * x.d / evBasis));
      const room = new Array(net.length); for (let d = net.length - 1, lo = Infinity; d >= 0; d--) { lo = Math.min(lo, net[d]); room[d] = lo - I.buffer_cents; }
      const evNote = ev.enough ? `everyday spending at your ${ev.short ? "" : `${BASIS_DAYS}-day `}average (${money(Math.round(ev.total / ev.basis))} a day)` : "no everyday spending (not enough history to average it)";
      const lines = [], fromD = daysBetween(t, win.from), toD = Math.min(HORIZON, daysBetween(t, win.to));
      let yes = null;
      if (fromD === 0 && amount <= S.safe_cents) yes = { d: 0, left: S.safe_cents - amount, now: true };
      for (let d = Math.max(1, fromD); !yes && d <= toD; d++) if (room[d] >= amount) yes = { d, left: room[d] - amount };
      let later = null;
      if (!yes) for (let d = Math.max(1, toD + 1); d <= HORIZON; d++) if (room[d] >= amount) { later = d; break; }
      const per = S.days ? Math.floor(Math.max(0, S.safe_cents - amount) / S.days) : 0;
      if (yes && yes.now) lines.push(`${head}: yes. It fits in your safe to spend of ${money(S.safe_cents)} ${S.payday_found ? `until payday (${dateLabel(S.until, t)})` : `over the next ${FALLBACK_DAYS} days`}, leaving ${money(yes.left)} (about ${money(per)} a day).`);
      else if (yes) lines.push(`${head}: yes, from ${dateLabel(P.daily[yes.d].on, t)}. Spent then, your balance stays at least ${money(yes.left)} through ${dateLabel(horizonEnd, t)}, counting your repeating bills and paychecks and ${evNote}.`);
      else {
        lines.push(`${head}: not on these numbers.${fromD === 0 ? ` Your safe to spend ${S.payday_found ? `until payday (${dateLabel(S.until, t)})` : `over the next ${FALLBACK_DAYS} days`} is ${money(S.safe_cents)}.` : ""}`);
        lines.push(later ? `The earliest day it fits is ${dateLabel(P.daily[later].on, t)}, counting your repeating bills and paychecks and ${evNote}.` : `It doesn't fit on any day in the next ${HORIZON} days, counting your repeating bills and paychecks and ${evNote}.`);
      }
      const G = goalImpacts(I, opts, amount);
      if (G.impacts.length) for (const g of G.impacts) lines.push(goalLine(g, t));
      else if (G.goals.length) lines.push(`Goal impact: no goal slips — none of the ${plural(G.goals.length, "goal")} supplied (${G.goals.map((g) => g.name).join(", ")}) is set back by this amount on its monthly contribution (already funded, not funded from this pool, or the amount fits in the slack before its next monthly step).`);
      else lines.push("Goal impact: none stated — no savings goals were supplied with this ask, so no goal slip is counted.");
      lines.push(...src);
      const pick = yes ? yes.d : later;
      const safeParts = `${money(S.cash_cents)} cash - ${money(S.bills_cents)} bills${S.scheduled_cents ? ` - ${money(S.scheduled_cents)} scheduled transfers` : ""}${S.buffer_cents ? ` - ${money(S.buffer_cents)} buffer` : ""} due by ${dateLabel(S.until, t)}`;
      const math = [`Amount: ${money(amount)}; window: ${win.label}`, `Safe to spend now: ${money(S.safe_cents)} (${safeParts})`,
        ...(yes && yes.now ? [`${money(S.safe_cents)} - ${money(amount)} = ${money(yes.left)} left; / ${plural(S.days, "day")} = ${money(per)} a day`] : [
          `Projected balance each day = cash + paychecks - bills - everyday spending (${money(evTotal)} over ${plural(evBasis, "day")}, spread by day)`,
          ...(pick !== null && pick !== undefined ? [`On ${dateLabel(P.daily[pick].on, t)}: the lowest projected balance from then through ${dateLabel(horizonEnd, t)} is ${money(room[pick])}; ${money(room[pick])} - ${money(amount)} = ${money(room[pick] - amount)}`] : [`The most room on any day through ${dateLabel(horizonEnd, t)}: ${money(Math.max(...room.slice(1)))}, less than ${money(amount)}`])]),
        ...G.impacts.map((g) => `Goal ${g.name}: ${money(g.target_cents)} - ${money(g.saved_cents)} = ${money(g.target_cents - g.saved_cents)} to save at ${money(g.monthly_cents)} a month; re-saving ${money(g.amount_cents)} takes ${plural(g.slip_months, "month")} of monthly steps: ${dateLabel(g.old_date, t)} -> ${dateLabel(g.new_date, t)}`)];
      return { kind: "afford", text: lines.join("\n"), math, amount_cents: amount, window: win, answer: yes ? "yes" : "no", on: pick !== null && pick !== undefined ? P.daily[pick].on : null, left_cents: yes ? yes.left : null, safe_cents: S.safe_cents, goal_impacts: G.impacts, goals_supplied: G.goals.length };
    }

    // ---- E5 net worth ----
    function netWorth(accounts, now, opts) {
      const list = active(accounts);
      if (!list.length) return null;
      const tz = (opts && opts.tz) || "UTC", today = todayIn(now, tz);
      const own = [], owe = [], apart = [], missing = [];
      for (const a of list) {
        const k = kindOf(a);
        if (!hasBal(a)) { missing.push(a); continue; }
        if (foreign(a)) { apart.push({ a, why: `${foreignText(a)}, another currency, not added into dollars` }); continue; }
        if (CASH_KINDS.includes(k) || ASSET_KINDS.includes(k)) own.push({ a, cents: bal(a), kind: k });
        else if (DEBT_KINDS.includes(k)) owe.push({ a, cents: bal(a), kind: k });
        else apart.push({ a, why: k === "unknown" ? "type not set, so I don't know if it's owned or owed" : `type "${k}", so I don't know if it's owned or owed` });
      }
      const ownC = sum(own.map((x) => x.cents)), owedC = sum(owe.filter((x) => x.cents < 0).map((x) => -x.cents)), favorC = sum(owe.filter((x) => x.cents > 0).map((x) => x.cents));
      const net = ownC - owedC + favorC, used = own.concat(owe).map((x) => x.a);
      const I = { tz, today, now, rows: [], cash: { rows: [] }, fresh: freshness(used, now) };
      const lines = [used.length ? `Net worth: ${money(net)}. That's ${money(ownC + favorC)} you own minus ${money(owedC)} you owe, across ${plural(used.length, "account")}.` : "Net worth: I can't add it up. None of your linked accounts has a type and a dollar balance I can count."];
      if (own.length) { lines.push("Owned:"); for (const x of own) lines.push(`- ${acctName(x.a)}: ${money(x.cents)}`); }
      if (owe.length) { lines.push("Owed:"); for (const x of owe) lines.push(`- ${acctName(x.a)}: ${x.cents <= 0 ? `${money(-x.cents)} owed` : `${money(x.cents)} in your favor`}`); }
      if (apart.length) { lines.push("Not counted:"); for (const x of apart) lines.push(`- ${acctName(x.a)} (${x.why})`); }
      if (missing.length) lines.push(`${missing.map(acctName).join(", ")} didn't report a balance, so ${missing.length === 1 ? "it isn't" : "they aren't"} counted.`);
      if (apart.some((x) => /type/.test(x.why))) lines.push("Set an account's type in the app and it will be counted.");
      lines.push("This is today's number from your balances; net worth over time isn't tracked yet.");
      lines.push(...staleLines(I.fresh, now, tz), sourceLine(I, used.length ? used : list, false));
      const math = [`Owned: ${own.map((x) => money(x.cents)).join(" + ") || money(0)} = ${money(ownC)}`, `Owed: ${owe.filter((x) => x.cents < 0).map((x) => money(-x.cents)).join(" + ") || money(0)} = ${money(owedC)}`,
        ...(favorC ? [`Credit in your favor on owed accounts: ${money(favorC)}`] : []), `${money(ownC)}${favorC ? ` + ${money(favorC)}` : ""} - ${money(owedC)} = ${money(net)}`,
        ...apart.map((x) => `Left out: ${acctName(x.a)} (${x.why})`), ...missing.map((a) => `Left out: ${acctName(a)} (no balance reported)`)];
      return { kind: "networth", text: lines.join("\n"), math, net_cents: net, owned_cents: ownC, owed_cents: owedC, favor_cents: favorC, counted: used.length, apart: apart.map((x) => x.a.account_id), missing: missing.map((a) => a.account_id) };
    }

    // ---- E7 show the math ----
    const LABEL = { safe: "safe to spend", upcoming: "what's coming up", runway: "runway", afford: "affordability", networth: "net worth", forecast: "the 90-day forecast" };
    // Which answer the words name, if any.
    function topicOf(words) {
      const w = String(words || "").toLowerCase();
      if (/\bsafe[- ]to[- ]spend\b|\bcan (?:i )?spend\b|\bspend(?:able)?\b/.test(w)) return "safe";
      if (/\bnet ?worth\b/.test(w)) return "networth";
      if (/\brunway\b|\bhow long\b/.test(w)) return "runway";
      if (/\bforecast\b|\bprojection\b|\b90 days?\b/.test(w)) return "forecast";
      if (/\bafford\b/.test(w)) return "afford";
      if (/\bbills?\b|\bupcoming\b|\bcoming up\b|\bpaydays?\b|\brenewals?\b/.test(w)) return "upcoming";
      return null;
    }
    // Which of these answers a reply was, from its first words (the replies above always open the same way).
    function kindOfReply(text) {
      const s = String(text || "").trim();
      const m = s.match(/^The math for (safe to spend|what's coming up|runway|affordability|net worth|the 90-day forecast):/);
      if (m) return Object.keys(LABEL).find((k) => LABEL[k] === m[1]);
      if (/^Safe to spend\b/.test(s)) return "safe";
      if (/^Coming up in the next\b/.test(s)) return "upcoming";
      if (/^Runway:/.test(s)) return "runway";
      if (/^For \$[\d,]+\.\d\d\b/.test(s)) return "afford";
      if (/^Net worth:/.test(s)) return "networth";
      if (/^90-day forecast\b/.test(s)) return "forecast";
      return null;
    }
    function answer(kind, accounts, transactions, words, now, opts) {
      if (kind === "safe") return safeToSpend(accounts, transactions, now, opts);
      if (kind === "upcoming") return upcoming(accounts, transactions, now, opts);
      if (kind === "runway") return runway(accounts, transactions, now, opts);
      if (kind === "afford") return afford(accounts, transactions, words, now, opts);
      if (kind === "networth") return netWorth(accounts, now, opts);
      if (kind === "forecast") return forecast(accounts, transactions, now, opts);
      return null;
    }
    const MATH_MENU = "I can show the math for \"can I afford\" once I know the amount: ask \"can I afford $600 next month\", then \"show me the math\".";
    // opts.previous: the conversation's last messages, newest first ({ role, content }), so a bare "show me the math"
    // explains the answer just given; "can I afford" reads its amount back from the person's own question. A bare ask
    // after any other answer (the model's own arithmetic, a balance) is not this module's: null, and the model explains.
    function showMath(accounts, transactions, words, now, opts) {
      if (!active(accounts).length) return null;
      const prev = (opts && opts.previous) || [], lastBot = prev.find((m) => m && m.role === "assistant"), lastKind = lastBot ? kindOfReply(lastBot.content) : null;
      let kind = topicOf(words), ask = words;
      if (!kind) kind = lastKind;
      if (!kind) return null;
      if (kind === "afford") {
        const asked = prev.filter((m) => m && m.role === "user").map((m) => String(m.content || "")).find((c) => /\bafford\b/i.test(c) && parseAmount(c));
        if (parseAmount(words)) ask = words; else if (asked) ask = asked; else return MATH_MENU;
      }
      const r = answer(kind, accounts, transactions, ask, now, opts);
      if (!r) return null;
      const lastLine = r.text.split("\n").slice(-1)[0];
      return [`The math for ${LABEL[kind]}:`, ...r.math, lastLine].join("\n");
    }

    return { safeToSpend, upcoming, runway, afford, netWorth, forecast, projection, answer, showMath, topicOf, kindOfReply, parseAmount, parseWindow, fitCadence, payStreams, payDates, todayIn, LABEL, MATH_MENU, HORIZON, STALE_MS };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = TheNumbers;
