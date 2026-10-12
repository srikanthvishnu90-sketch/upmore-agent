  /* Buy now, pay later from the person's own bank and card rows (the owner's Full Agent Capability List, section 5 "Buy
     now, pay later", items 85 "Show every BNPL plan in one list with the total still owed" and 87 "Warn before a new BNPL
     plan would push next month negative"; registry CRDT-008 debt inventory, ANL-006 forecast). Read-only, numbers only: no
     advice, nothing paid, paid off or moved (items 84, 86 and 88 are money movement and are not built; the answer says so).
       transactions  agent_financial_transactions rows: account_id, amount_cents (negative = money out), posted_on,
                     merchant_raw, is_pending, is_transfer, currency, fetched_at
       accounts      agent_financial_accounts rows (item 87's cash, read through TheNumbers)
       opts          { tz (IANA zone, default UTC), providers (packages/offers/bnpl-providers.json; the router bundle's
                     BNPL_PROVIDERS_JSON when left out), accounts (list only: adds item 87's heads-up line) }
     Functions:
       detect(raw, providers)                 { provider, merchant } or null: the provider from the descriptor patterns on
                                              file, the store only when the descriptor carries it after "*" or "/"
       plans(transactions, now, opts)         the plans read from the rows (below)
       list(transactions, words, now, opts)   item 85's answer; one provider named in the words narrows it
       check(accounts, transactions, words, now, opts)  item 87: the next 30 days from cash, the repeating bills and
                                              paydays TheNumbers already derives (86-the-numbers.js, projection), and the
                                              pay-later payments read here; a new plan named with an amount ("a $400
                                              Afterpay plan") is laid out on that provider's Pay in 4 terms
       ask(words)                             "list" | "check" | null, conservative (paying, paying off, moving a date,
                                              advice and anything long go on)
     How plans are read: debits whose descriptor names a provider, grouped by provider, store (when named) and amount, then
     chained every 2 weeks (11-17 days apart, at most 4: the Pay in 4 shape every provider on file publishes) or monthly
     (26-35 days). A different first payment 2 weeks before a chain joins it only for a provider whose first payment can
     differ (Zip's fee, Afterpay's large orders). Payments left are said only when the plan's shape makes them certain: a
     Pay in 4 whose first payment is in the rows (the rows reach back past it and no payment from that provider sits 2
     weeks before it); otherwise "up to". A monthly plan's total is never in the rows: said as unknown, never guessed. A
     credit from the provider that equals what a plan has paid marks that plan refunded. Pending rows and other currencies
     are said, never added. Dates are calendar days in the person's zone; a row dated the bank's tomorrow (UTC) is this
     evening's. Pure: rows, the clock and the provider file are passed in. Depth packet BNPL (tests/depth-BNPL.test.cjs). */
  const Bnpl = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const TN = typeof TheNumbers !== "undefined" ? TheNumbers : require("./86-the-numbers.js");
    const LG = typeof AgentLedger !== "undefined" ? AgentLedger : require("./57-agent-ledger.js");
    const money = MA.money, DAY = 86400000, WINDOW = 30, HISTORY_DAYS = 400, NEW_DAYS = 17, GRACE = 3, MONTH_GRACE = 5, OLDER_DAYS = 45, FINISHED_DAYS = 90;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const pad = (n) => String(n).padStart(2, "0");
    const toUtc = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
    const fromUtc = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
    const addDays = (ymd, n) => fromUtc(toUtc(ymd) + n * DAY);
    const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / DAY);
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    function addMonths(ymd, n, day) {
      const y = +ymd.slice(0, 4), m = +ymd.slice(5, 7) - 1 + n, d = day || +ymd.slice(8, 10);
      const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1;
      return `${yy}-${pad(mm)}-${pad(Math.min(d, lastDay(yy, mm)))}`;
    }
    const dateLabel = (ymd, today) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}${today && ymd.slice(0, 4) !== today.slice(0, 4) ? `, ${ymd.slice(0, 4)}` : ""}`;
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const sum = (xs) => xs.reduce((a, x) => a + x, 0);
    const cents = (r) => (r && r.amount_cents !== null && r.amount_cents !== undefined && r.amount_cents !== "" && Number.isFinite(Number(r.amount_cents)) ? Math.round(Number(r.amount_cents)) : NaN);
    const usd = (r) => !r.currency || String(r.currency).toUpperCase() === "USD";
    const dayOf = (r) => (r && typeof r.posted_on === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.posted_on) ? r.posted_on.slice(0, 10) : null);
    const joinAnd = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

    // ---- the provider file ----
    const compiled = new WeakMap();
    function book(providers) {
      const d = providers || (typeof BNPL_PROVIDERS_JSON !== "undefined" ? BNPL_PROVIDERS_JSON : null);
      if (!d || !Array.isArray(d.providers)) throw new Error("Bnpl: the provider file (packages/offers/bnpl-providers.json) was not passed in");
      if (!compiled.has(d)) compiled.set(d, d.providers.map((p) => Object.assign({}, p, { res: p.descriptors.map((s) => new RegExp(s, "i")), every2: p.products.find((x) => x.every_days === 14) || null, monthly: p.products.find((x) => x.cadence === "monthly") || null })));
      return { data: d, list: compiled.get(d) };
    }
    // What follows the provider in a descriptor, after "*" or "/", when it names a store; generic words never do.
    const GENERIC = /^(?:inc|llc|co|com|us|usa|pay|payment|payments|pymt|pmt|loan|loans|installments?|instalments?|ach|debit|purchase|web|ppd|autopay|pay in 4|payin4|pay later|pay monthly)$/i;
    function merchantOf(raw, m) {
      const rest = String(raw).slice(m.index + m[0].length);
      const sep = /^\s*[*\/]\s*(.+)$/.exec(rest);
      if (!sep) return null;
      const s = sep[1].replace(/#\s*\d+/g, " ").replace(/\b\d{3,}\b/g, " ").replace(/\s+/g, " ").trim();
      if (!s || GENERIC.test(s) || !/[a-z]{2}/i.test(s)) return null;
      return MA.display(s);
    }
    function detect(raw, providers) {
      const s = String(raw || "");
      for (const p of book(providers).list) for (const re of p.res) { const m = re.exec(s); if (m) return { provider: p, merchant: merchantOf(s, m) }; }
      return null;
    }

    // ---- plans ----
    function plans(transactions, now, opts) {
      const o = opts || {}, B = book(o.providers), tz = o.tz || "UTC", today = MA.todayIn(now, tz), end = addDays(today, 1), from = addDays(today, -HISTORY_DAYS);
      const rows = (transactions || []).filter((r) => r && Number.isFinite(cents(r)) && dayOf(r) !== null);
      const earliest = rows.filter((r) => !r.is_pending).map(dayOf).sort()[0] || null;
      const seen = [], credits = [], pending = [], foreign = [];
      for (const r of rows) {
        const d = detect(r.merchant_raw, B.data);
        if (!d) continue;
        const x = { row: r, on: dayOf(r), cents: cents(r), provider: d.provider, merchant: d.merchant };
        if (r.is_pending) { if (x.cents < 0) pending.push(x); continue; }
        if (!usd(r)) { if (x.cents < 0) foreign.push(x); continue; }
        if (x.on > end || x.on < from) continue;
        (x.cents < 0 ? seen : credits).push(x);
      }
      const label = (x) => `${x.provider.name}${x.merchant ? `, ${x.merchant}` : ""}`;
      const sameSource = (a, b) => a.provider.id === b.provider.id && (a.merchant === b.merchant || !a.merchant || !b.merchant);
      // Chains of equal payments: every 2 weeks first (at most 4), then monthly among what is left.
      const groups = new Map();
      for (const x of seen.slice().sort((a, b) => a.on.localeCompare(b.on) || a.cents - b.cents)) { const k = `${x.provider.id}|${x.merchant || ""}|${x.cents}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
      const chains = [];
      for (const list of groups.values()) {
        const two = [];
        for (const x of list) {
          const open = two.filter((c) => c.length < 4 && daysBetween(c[c.length - 1].on, x.on) >= 14 - GRACE && daysBetween(c[c.length - 1].on, x.on) <= 14 + GRACE)
            .sort((a, b) => Math.abs(daysBetween(a[a.length - 1].on, x.on) - 14) - Math.abs(daysBetween(b[b.length - 1].on, x.on) - 14));
          if (open.length) open[0].push(x); else two.push([x]);
        }
        const singles = [];
        for (const c of two) (c.length > 1 ? chains.push({ cadence: "biweekly", rows: c }) : singles.push(c[0]));
        const month = [];
        for (const x of singles) {
          const open = month.find((c) => { const g = daysBetween(c[c.length - 1].on, x.on); return g >= 26 && g <= 35; });
          if (open) open.push(x); else month.push([x]);
        }
        for (const c of month) chains.push({ cadence: c.length > 1 ? "monthly" : "single", rows: c });
      }
      // A different first payment two weeks before a short chain, for a provider whose first payment can differ.
      for (const c of chains.filter((c) => c.cadence === "biweekly" && c.rows.length <= 3 && c.rows[0].provider.every2 && c.rows[0].provider.every2.first_may_differ)) {
        const head = c.rows[0];
        const s = chains.find((d) => d.cadence === "single" && !d.used && d.rows[0].provider.id === head.provider.id && d.rows[0].merchant === head.merchant && d.rows[0].cents !== head.cents && daysBetween(d.rows[0].on, head.on) >= 14 - GRACE && daysBetween(d.rows[0].on, head.on) <= 14 + GRACE);
        if (s) { s.used = true; c.first = s.rows[0]; }
      }
      const out = [];
      for (const c of chains.filter((c) => !c.used)) {
        const x = c.rows[c.rows.length - 1], p = x.provider, all = (c.first ? [c.first] : []).concat(c.rows), first = all[0];
        const plan = { provider: p, label: label(x), merchant: x.merchant, amount_cents: -x.cents, first_cents: c.first ? -c.first.cents : null, cadence: c.cadence, seen: all.map((y) => y.on), paid_cents: -sum(all.map((y) => y.cents)), last: x.on, first_on: first.on, product: null, payments: null, first_known: false, left: null, left_max: null, owed_cents: null, next: null, status: "active" };
        if (c.cadence === "biweekly") {
          plan.product = p.every2; plan.payments = p.every2 ? p.every2.payments : null;
          const before = addDays(first.on, -(14 + GRACE));
          plan.first_known = !!earliest && earliest <= before && !seen.some((y) => sameSource(y, first) && y.on >= before && y.on <= addDays(first.on, -(14 - GRACE)));
          plan.left_max = plan.payments ? Math.max(0, plan.payments - all.length) : null;
          if (plan.left_max === 0) plan.status = "finished";
          else {
            plan.left = plan.first_known ? plan.left_max : null;
            plan.next = addDays(x.on, 14);
            const late = daysBetween(plan.next, today);
            if (late > OLDER_DAYS) plan.status = "older"; else if (late > GRACE) plan.status = "unseen";
            if (plan.status === "active" && plan.left !== null) plan.owed_cents = plan.left * plan.amount_cents;
            if (plan.status !== "active") plan.left = null;
          }
        } else if (c.cadence === "monthly") {
          plan.product = p.monthly;
          plan.next = addMonths(x.on, 1);
          const late = daysBetween(plan.next, today);
          if (late > OLDER_DAYS) plan.status = "older"; else if (late > MONTH_GRACE) plan.status = "unseen";
        } else if (daysBetween(x.on, today) > NEW_DAYS) plan.status = "one_off"; // one payment, nothing like it since
        out.push(plan);
      }
      // Money back from a provider: a plan whose payments it equals is refunded; anything else is said, unmatched.
      const unmatched = [];
      for (const cr of credits.sort((a, b) => a.on.localeCompare(b.on))) {
        const hits = out.filter((pl) => pl.status !== "refunded" && pl.cadence !== "single" && pl.provider.id === cr.provider.id && (pl.merchant === cr.merchant || !cr.merchant) && pl.first_on <= cr.on && pl.paid_cents === cr.cents);
        if (hits.length === 1) Object.assign(hits[0], { status: "refunded", refund: { cents: cr.cents, on: cr.on }, left: 0, owed_cents: null, next: null });
        else unmatched.push(cr);
      }
      const order = (a, b) => (a.next || "9999").localeCompare(b.next || "9999") || a.label.localeCompare(b.label) || a.amount_cents - b.amount_cents;
      return {
        today, tz, plans: out.sort(order), finished: out.filter((p) => p.status === "finished" && daysBetween(p.last, today) <= FINISHED_DAYS),
        credits: unmatched, pending, foreign, stale: daysBetween(B.data.checked_on, today) > (B.data.fresh_days || 90) ? B.data.checked_on : null, data: B.data,
      };
    }

    // The payments a plan is expected to make in [today, to]: certain ones, "up to" ones counted at most, a monthly plan's
    // next ones assumed to continue. A late one not posted yet is counted today.
    function instalments(p, today, to) {
      if (p.status !== "active") return [];
      const out = [];
      if (p.cadence === "biweekly") {
        const n = p.left !== null ? p.left : p.left_max;
        for (let k = 0; k < n; k++) { const on = addDays(p.next, 14 * k); if (on > to) break; out.push({ on: on < today ? today : on, cents: p.amount_cents }); }
      } else if (p.cadence === "monthly") {
        for (let k = 0; k < 3; k++) { const on = addMonths(p.last, k + 1, +p.seen[0].slice(8, 10)); if (on > to) break; if (on >= addDays(today, -MONTH_GRACE)) out.push({ on: on < today ? today : on, cents: p.amount_cents }); }
      }
      return out;
    }

    // ---- item 87: the next 30 days ----
    function lowOf(base, events) {
      let b = base.cash_cents, low = null;
      for (let d = 0; d <= WINDOW; d++) {
        const on = addDays(base.today, d);
        b += sum(base.pays.filter((x) => x.on === on).map((x) => x.amount_cents)) - sum(base.bills.filter((x) => x.on === on).map((x) => x.amount_cents)) - sum(events.filter((x) => x.on === on).map((x) => x.cents));
        if (!low || b < low.cents) low = { on, cents: b };
      }
      return low;
    }
    const lowText = (l, today) => `${money(l.cents)} on ${dateLabel(l.on, today)}${l.cents < 0 ? ", below zero" : ""}`;
    function setup(accounts, transactions, now, opts) {
      const o = opts || {}, P = plans(transactions, now, o), base = TN.projection(accounts, transactions, now, { tz: o.tz }, WINDOW);
      if (!base) return { P, base: null };
      // A provider's payments are read here, so the same rows are not also counted as a repeating bill.
      const keys = new Set();
      for (const r of transactions || []) if (r && detect(r.merchant_raw, o.providers)) keys.add(LG.normalizeMerchant(r.merchant_raw).key || String(r.merchant_raw || "").toLowerCase());
      base.bills = base.bills.filter((b) => !keys.has(b.key));
      const counted = P.plans.map((p) => ({ p, due: instalments(p, base.today, base.to) })).filter((x) => x.due.length);
      // The newest plan whose payments left are certain and fall in the window.
      const newest = counted.filter((x) => x.p.cadence === "biweekly" && x.p.left !== null && daysBetween(x.p.first_on, base.today) <= 30).sort((a, b) => b.p.first_on.localeCompare(a.p.first_on) || a.p.label.localeCompare(b.p.label))[0] || null;
      return { P, base, counted, newest, events: counted.flatMap((x) => x.due) };
    }
    const withoutNewest = (S) => S.counted.filter((x) => x !== S.newest).flatMap((x) => x.due);
    function headsUp(accounts, transactions, now, opts) {
      const S = setup(accounts, transactions, now, opts);
      if (!S.base || !S.base.has_cash || !S.newest) return null;
      const t = S.base.today, withIt = lowOf(S.base, S.events), without = lowOf(S.base, withoutNewest(S));
      if (!(withIt.cents < 0 && without.cents >= 0)) return null;
      return `Heads up: with your newest plan (${S.newest.p.label}), your cash is projected to reach ${money(withIt.cents)} on ${dateLabel(withIt.on, t)}; without it, ${money(without.cents)} on ${dateLabel(without.on, t)} (from your cash, repeating bills, paychecks and pay-later payments only; everyday spending isn't counted).`;
    }
    function newPlan(words, P, today) {
      const amount = TN.parseAmount(words);
      if (!amount) return null;
      const B = book(P.data), id = providerIn(words), p = id ? B.list.find((x) => x.id === id) : null;
      if (/\bmonthly\b|\bmonths?\b|\bfinanc/i.test(words)) return { monthly: true, amount, provider: p };
      const each = Math.floor(amount / 4), first = amount - 3 * each, dates = [0, 14, 28, 42].map((n) => addDays(today, n));
      return { amount, provider: p, each, first, dates, due: dates.map((on, k) => ({ on, cents: k === 0 ? first : each })) };
    }
    function check(accounts, transactions, words, now, opts) {
      const S = setup(accounts, transactions, now, opts);
      if (!S.base) return null;
      const t = S.base.today, to = S.base.to, L = [];
      if (!S.base.has_cash) return [`I can't project it: no checking or savings balance is linked, so there's no cash number to start from.`, S.base.source].join("\n");
      const low = lowOf(S.base, S.events);
      L.push(`Next ${WINDOW} days (${dateLabel(t, t)}-${dateLabel(to, t)}), from your cash, repeating bills, paychecks and pay-later payments: lowest ${lowText(low, t)}.`);
      const np = newPlan(words, S.P, t);
      if (np && np.monthly) L.push(`A monthly plan's payment depends on its term and APR, which I don't have, so a new ${money(np.amount)} plan isn't projected.`);
      else if (np) {
        const name = np.provider ? np.provider.name : "pay-later", terms = np.provider ? `${np.provider.name}'s Pay in 4 terms` : "the Pay in 4 terms every provider on file publishes";
        const inWin = np.due.filter((x) => x.on <= to), withIt = lowOf(S.base, S.events.concat(inWin));
        L.push(`With a new ${money(np.amount)} ${name} plan: lowest ${lowText(withIt, t)}.`);
        L.push(`That plan, inferred from ${terms}: 4 payments ${np.first === np.each ? `of ${money(np.each)}` : `(${money(np.first)}, then 3 of ${money(np.each)})`}, the first today, then every 2 weeks (${np.dates.map((d) => dateLabel(d, t)).join(", ")}); ${inWin.length} fall in these ${WINDOW} days (${money(sum(inWin.map((x) => x.cents)))}).`);
        if (np.provider && np.provider.every2 && np.provider.every2.first_note) L.push(`${np.provider.every2.first_note}, which would change the first payment.`);
      } else if (S.newest) {
        const without = lowOf(S.base, withoutNewest(S)), p = S.newest.p;
        L.push(`Your newest plan (${p.label}, first payment ${dateLabel(p.first_on, t)}): without its ${plural(p.left, "payment")} left (${money(p.owed_cents)}), the lowest would be ${lowText(without, t)}.`);
      }
      const byPlan = S.counted.slice().sort((a, b) => a.due[0].on.localeCompare(b.due[0].on) || a.p.label.localeCompare(b.p.label));
      if (byPlan.length) L.push(`Pay-later payments counted: ${byPlan.map((x) => `${x.p.label} ${money(x.p.amount_cents)} ${x.due.map((d) => dateLabel(d.on, t)).join(", ")}${x.p.cadence === "monthly" ? " (monthly, assumed to continue)" : x.p.left === null ? ` (at most; the first payment isn't in your rows)` : ""}`).join("; ")}.`);
      else L.push("Pay-later payments counted: none expected in these 30 days from your rows.");
      const skipped = S.P.plans.filter((p) => p.status === "active" && p.cadence === "single");
      if (skipped.length) L.push(`Not counted: ${skipped.map((p) => `${p.label} ${money(p.amount_cents)}`).join(", ")} (one payment doesn't show the schedule).`);
      const billC = sum(S.base.bills.map((b) => b.amount_cents)), payC = sum(S.base.pays.map((p) => p.amount_cents));
      L.push(`Also counted: ${money(billC)} of repeating bills (${S.base.bills.length})${S.base.pays.length ? ` and ${money(payC)} from ${plural(S.base.pays.length, "payday")}` : "; no paycheck found"}. Not counted: everyday spending that doesn't repeat.`);
      if (S.P.stale) L.push(`The provider terms on file were checked ${dateLabel(S.P.stale, "")}, ${S.P.stale.slice(0, 4)}; they may have changed.`);
      L.push(...S.base.notes, S.base.source);
      return L.join("\n");
    }

    // ---- item 85: the list ----
    const seenText = (p, t) => (p.seen.length <= 4 ? p.seen.map((d) => dateLabel(d, t)).join(", ") : `${dateLabel(p.seen[0], t)} to ${dateLabel(p.seen[p.seen.length - 1], t)}`);
    function nextText(p, t) {
      if (p.next === t) return `Next expected today (${dateLabel(p.next, t)}).`;
      if (p.next < t) return `Next expected ${dateLabel(p.next, t)}, not in your rows yet.`;
      return `Next expected ${dateLabel(p.next, t)}${p.cadence === "monthly" ? " (inferred from the monthly pattern)" : ""}.`;
    }
    function planLine(p, t) {
      const app = p.provider.app;
      if (p.cadence === "single") return `- ${p.label}: 1 payment seen (${money(p.amount_cents)} on ${dateLabel(p.last, t)}). One payment doesn't show the schedule; check ${app}.`;
      const unseen = p.status === "unseen" ? ` The next was expected ${dateLabel(p.next, t)} and isn't in your rows, so what's left isn't certain; check ${app}.` : null;
      if (p.cadence === "monthly") return `- ${p.label}: ${money(p.amount_cents)} a month, ${plural(p.seen.length, "payment")} seen (${seenText(p, t)}).${unseen || ` ${nextText(p, t)} Still owed: not in your bank rows; check ${app}.`}`;
      const head = `- ${p.label}: ${money(p.amount_cents)} every 2 weeks${p.first_cents !== null ? ` after a first payment of ${money(p.first_cents)}${p.product.first_note ? ` (${p.product.first_note})` : ""}` : ""}, `;
      const count = p.first_known ? `${p.seen.length} of ${p.payments} payments seen` : `${plural(p.seen.length, "payment")} seen`;
      if (unseen) return `${head}${count} (${seenText(p, t)}).${unseen}`;
      const left = p.left !== null ? `Left: ${plural(p.left, "payment")}, ${money(p.owed_cents)} (inferred from ${p.provider.name}'s ${p.product.name} pattern).`
        : `Left: up to ${plural(p.left_max, "payment")}, up to ${money(p.left_max * p.amount_cents)} (${p.product.name} has ${p.payments}; the first payment isn't in your rows, so the count isn't certain; check ${app}).`;
      return `${head}${count} (${seenText(p, t)}). ${nextText(p, t)} ${left}`;
    }
    function list(transactions, words, now, opts) {
      const o = opts || {}, P = plans(transactions, now, o), t = P.today, id = providerIn(words), B = book(o.providers);
      const pick = (x) => !id || x.provider.id === id, name = id ? B.list.find((p) => p.id === id).name : null;
      const live = P.plans.filter((p) => pick(p) && (["active", "unseen"].includes(p.status))), L = [];
      const finished = P.finished.filter(pick), refunded = P.plans.filter((p) => pick(p) && p.status === "refunded"), credits = P.credits.filter(pick), pending = P.pending.filter(pick), foreign = P.foreign.filter(pick);
      const older = P.plans.filter((p) => pick(p) && p.status === "older");
      if (!live.length && !finished.length && !refunded.length && !credits.length && !pending.length && !foreign.length && !older.length) {
        const names = B.list.map((p) => p.label || p.name);
        return [`I don't see any ${name || `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`} payments in your bank and card rows.`, "Payments from a card or account that isn't linked won't show here.", MA.txSource(transactions, P.tz)].join("\n");
      }
      L.push(live.length ? `${name || "Buy now, pay later"}: ${plural(live.length, "plan")} in progress in your bank and card rows.` : `${name || "Buy now, pay later"}: no plan in progress in your bank and card rows.`);
      for (const p of live) L.push(planLine(p, t));
      const certain = live.filter((p) => p.owed_cents !== null), unknown = live.filter((p) => p.owed_cents === null);
      if (certain.length) L.push(`Still owed where the plan's shape makes it certain: ${money(sum(certain.map((p) => p.owed_cents)))} in ${plural(certain.length, "plan")} (inferred from the Pay in 4 pattern).`);
      if (unknown.length) L.push(`Not known from your rows: what's left on ${joinAnd([...new Set(unknown.map((p) => p.label))])}. Your bank rows show payments, not balances.`);
      if (finished.length) L.push(`Finished: ${finished.map((p) => `${p.label} ${money(p.amount_cents)} every 2 weeks, ${p.seen.length} of ${p.payments} paid (last ${dateLabel(p.last, t)})`).join("; ")}.`);
      for (const p of refunded) L.push(`Refunded: ${p.label} (${money(p.amount_cents)} ${p.cadence === "monthly" ? "a month" : "every 2 weeks"}, ${p.seen.length} paid): ${money(p.refund.cents)} came back on ${dateLabel(p.refund.on, t)}, so no more payments are counted for it (inferred; check ${p.provider.app}).`);
      for (const c of credits) L.push(`Money back from ${c.provider.name}${c.merchant ? `, ${c.merchant}` : ""}: ${money(c.cents)} on ${dateLabel(c.on, t)}, not matched to a plan's payments; check ${c.provider.app}.`);
      if (older.length) { const last = older.map((p) => p.last).sort().slice(-1)[0]; L.push(`${plural(older.length, "older plan")} with no payment since ${dateLabel(last, t)} ${older.length === 1 ? "isn't" : "aren't"} listed.`); }
      if (pending.length) L.push(`Pending, counted once it posts: ${pending.map((x) => `${x.provider.name}${x.merchant ? `, ${x.merchant}` : ""} ${money(-x.cents)}${x.on ? ` (${dateLabel(x.on, t)})` : ""}`).join("; ")}.`);
      if (foreign.length) L.push(`In another currency, not added into dollars: ${foreign.map((x) => `${x.provider.name}${x.merchant ? `, ${x.merchant}` : ""} ${(Math.abs(x.cents) / 100).toFixed(2)} ${String(x.row.currency).toUpperCase()} (${dateLabel(x.on, t)})`).join("; ")}.`);
      if (live.concat(finished).some((p) => p.provider.bundles)) L.push("Afterpay can take two payments due together as one charge, so a plan can show fewer payments than it made.");
      if (P.stale) L.push(`The provider terms on file were checked ${dateLabel(P.stale, "")}, ${P.stale.slice(0, 4)}; they may have changed.`);
      L.push("Paying a plan, paying one off early or moving a payment date isn't built; this is read from your rows only.");
      if (o.accounts && !id) { const h = headsUp(o.accounts, transactions, now, o); if (h) L.push(h); }
      L.push(MA.txSource(transactions, P.tz));
      return L.join("\n");
    }

    // ---- the asks ----
    const LEAD = String.raw`^\s*(?:hey|hi|ok|okay|so|yo|pls|please|quick q:?)?[,\s]*`;
    const END = String.raw`(?:\s+(?:now|right now|today|pls|please|total|in total))?\s*[?.!]*\s*$`;
    const PROV = String.raw`(?:klarna|affirm|after ?pay|zip ?pay|zip|quad ?pay|paypal pay in (?:4|four)|pay ?in ?(?:4|four)|pay[- ]later|bnpl|buy now,? pay later)`;
    const NOUN = String.raw`(?:plans?|loans?|payments?|balances?|debts?|purchases?|accounts?|installments?|instalments?)`;
    const LIST = [
      new RegExp(LEAD + String.raw`(?:(?:show|list|give|tell|get|pull up)(?: me)?\s+|what are\s+|what'?s\s+|whats\s+|see\s+|check\s+)?(?:all\s+)?(?:of\s+)?(?:my\s+)?(?:current\s+|open\s+|active\s+)?(` + PROV + String.raw`)(?:\s+(` + NOUN + String.raw`))?` + END, "i"),
      new RegExp(LEAD + String.raw`(?:what|how much)(?: money)? do i (?:still )?owe(?: on| to| for)?(?: (?:my|all my))?\s+(` + PROV + String.raw`)(?:\s+(` + NOUN + String.raw`))?` + END, "i"),
      new RegExp(LEAD + String.raw`how much (?:is |do i have )?(?:left|remaining)(?: to pay)? on (?:my |all my )?(` + PROV + String.raw`)(?:\s+(` + NOUN + String.raw`))?` + END, "i"),
      new RegExp(LEAD + String.raw`when(?:'s| is| are) my (?:next )?(` + PROV + String.raw`)\s+(payments?)(?: due)?` + END, "i"),
      new RegExp(LEAD + String.raw`(?:how many|which)\s+(` + PROV + String.raw`)\s+(plans|loans|payments) do i have(?: (?:left|open|going))?` + END, "i"),
      new RegExp(LEAD + String.raw`do i have any (?:open |active )?(` + PROV + String.raw`)\s+(plans|loans|payments)(?: left| open)?` + END, "i"),
      new RegExp(LEAD + String.raw`(?:what'?s |whats |what is )?(?:the )?total (?:i owe|owed|i still owe) (?:on|across|for) (?:all )?(?:my )?(` + PROV + String.raw`)(?:\s+(` + NOUN + String.raw`))?` + END, "i"),
    ];
    const PROV_CHECK = new RegExp(String.raw`\b(?:klarna|affirm|after ?pay|zip ?pay|zip\.co|quad ?pay|paypal pay in (?:4|four)|pay ?in ?(?:4|four)|bnpl|buy now,? pay later|pay[- ]later (?:plans?|payments?|purchases?|loans?))\b|\bzip (?:plans?|payments?)\b`, "i");
    const NEG = /\b(?:push|put|send|take|knock|leave|make)\s+(?:me|my (?:account|balance|checking|cash))\s+(?:into |in )?(?:the )?(?:negative|red|overdraft|overdrawn|below zero|under zero|minus)\b|\b(?:go|be|end up|going|get)\s+(?:into |in )?(?:the )?(?:negative|red|overdrawn|below zero|minus)\b|\boverdraw(?:n)?\b/i;
    const OFF = /\bpay\s*off\b|\bpayoff\b|\bpay (?:it|them|this|that|my|the|klarna|affirm|afterpay|zip)\b|\breschedul|\bextend\b|\bmove (?:my|the|a) (?:payment|due)|\bcancel|\bdispute|\brefund|\bstock\b|\bshares?\b|\bipo\b|\binvest|\bsign up\b|\bapply\b|\bopen an?\b|\bshould\b|\bsafe\b|\blegit\b|\bscam\b|\bcustomer service\b|\bphone\b|\blog ?in\b|\bpassword\b|\bcode\b|\bwould you\b|\brecommend/i;
    function ask(words) {
      const w = String(words || "");
      if (!w.trim() || w.length > 160 || OFF.test(w)) return null;
      if (PROV_CHECK.test(w) && (NEG.test(w) || /\bafford\b/i.test(w))) return "check";
      for (const re of LIST) { const m = re.exec(w); if (m) return /^zip$/i.test(m[1].trim()) && !m[2] ? null : "list"; }
      return null;
    }
    function providerIn(words) {
      const w = String(words || "").toLowerCase();
      if (/\bklarna\b/.test(w)) return "klarna";
      if (/\baffirm\b/.test(w)) return "affirm";
      if (/\bafter ?pay\b/.test(w)) return "afterpay";
      if (/\bzip\b|\bquad ?pay\b/.test(w)) return "zip";
      if (/\bpaypal\b/.test(w)) return "paypal";
      return null;
    }

    return { detect, plans, list, check, ask, providerIn, instalments, WINDOW };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = Bnpl;
