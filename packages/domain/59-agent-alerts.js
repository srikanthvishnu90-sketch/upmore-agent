  /* Alerts (Instinct spec doc 02 ALRT-001..011, doc 01 decision order): the
     detectors that turn today's rows and connector events into the loop's
     inputs, each with its evidence rows and a reason, plus the user's own
     watches ("tell me when checking drops below $500") parsed into conditions
     and evaluated the same way. Quiet hours hold everything but safety; a
     busy day is bundled into one message. Pure: nothing here sends. Output is
     the proactive feed's shape (safety, watches, proactive) so AgentProactive
     can merge it. Loads after AgentLedger (optional) and AgentMonitors (optional). */
  const AgentAlerts = (() => {
    const DAY = 86400000;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const cents = t => Number.isInteger(t.amount_cents) ? t.amount_cents : Math.round(Number(t.amount || 0) * 100);
    const ymd = s => String(s || "").slice(0, 10);
    const dayMs = s => Date.parse(ymd(s) + "T00:00:00Z");
    const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);
    const divRound = (n, d) => { const q = Math.trunc(n / d), r = n - q * d; return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q; };
    const L = () => typeof AgentLedger !== "undefined" ? AgentLedger : null;
    const rows = (transactions, rules) => L() ? L().enrich(transactions, rules) : (transactions || []).map(t => Object.assign({}, t, { amount_cents: cents(t), posted_at: ymd(t.posted_at), merchant_display: t.merchant_raw, merchant_key: String(t.merchant_raw || "").toLowerCase(), category: "other" }));
    const FAILED_RE = /\b(nsf|returned (item|payment)|payment (returned|reversed|failed|declined)|insufficient funds|unpaid item|ach return)\b/i;

    // ALRT-010: a watch in the user's words becomes a condition with a stated trigger; unknown phrasing is refused, never guessed.
    const WATCH_PATTERNS = [
      { re: /^(?:my )?([\w ]+?) (?:drops|falls|goes|is|gets) (?:below|under) \$?([\d,]+(?:\.\d{1,2})?)/i, make: m => ({ kind: "balance_below", account: m[1].trim(), threshold_cents: toCents(m[2]) }) },
      { re: /(?:charge|transaction|purchase)s? (?:over|above|more than) \$?([\d,]+(?:\.\d{1,2})?)/i, make: m => ({ kind: "amount_over", threshold_cents: toCents(m[1]) }) },
      { re: /^([\w .'&-]+?) charges? (?:me|us)\b/i, make: m => ({ kind: "merchant_charge", merchant: m[1].trim() }) },
      { re: /^(?:my )?(paycheck|payroll|salary|deposit from [\w .'&-]+?|[\w .'&-]+? deposit) (?:lands|arrives|comes in|posts|hits)/i, make: m => ({ kind: "deposit", from: m[1].replace(/^deposit from /i, "").replace(/ deposit$/i, "").trim() }) },
      { re: /^(?:my )?([a-z ]+?) spending (?:goes|is|gets) (?:over|above) \$?([\d,]+(?:\.\d{1,2})?)(?: (?:this|a|per) month)?/i, make: m => ({ kind: "category_month_over", category: m[1].trim(), threshold_cents: toCents(m[2]) }) },
      { re: /^(?:my )?([\w .'&-]+?) (?:bill|subscription|price) (?:goes up|increases|rises|changes)/i, make: m => ({ kind: "bill_increase", merchant: m[1].trim() }) }
    ];
    // "Tell me when", "let me know if", "ping me whenever": the preamble is stripped so the condition is what gets parsed.
    const PREAMBLE = /^(?:please )?(?:(?:tell|let|ping|warn|notify|alert|text|message) me(?: know)?|alert|watch)\s*(?:about|for)?\s*(?:when|if|whenever|once)?\s*/i;
    const toCents = s => Math.round(Number(String(s).replace(/,/g, "")) * 100);
    function parseWatch(text, now) {
      const t = String(text || "").trim(), cond = t.replace(PREAMBLE, "").replace(/^(?:when|if|whenever)\s+/i, "").trim();
      for (const p of WATCH_PATTERNS) { const m = cond.match(p.re); if (m) { const w = Object.assign({ id: null, text: t, created_at: now, status: "active" }, p.make(m)); w.restated = restateWatch(w); return { ok: true, watch: w }; } }
      return { ok: false, text: "I can watch a balance below an amount, a charge over an amount, a merchant charging you, a deposit landing, a category's monthly spending over an amount, or a bill going up. Which one, and what number?" };
    }
    function restateWatch(w) {
      return { balance_below: `I'll tell you when ${w.account} drops below ${money(w.threshold_cents)}.`, amount_over: `I'll tell you about any charge over ${money(w.threshold_cents)}.`, merchant_charge: `I'll tell you when ${w.merchant} charges you.`, deposit: `I'll tell you when ${w.from} lands.`, category_month_over: `I'll tell you when ${w.category} spending passes ${money(w.threshold_cents)} in a month.`, bill_increase: `I'll tell you when the ${w.merchant} bill goes up.` }[w.kind];
    }

    // Detectors. Each returns firings: { key, kind, capability_id, severity (safety | urgent | normal), title, text, evidence, amount_cents }.
    function detect(input) {
      const today = input.today, rules = input.rules, all = rows(input.transactions, rules), accounts = input.accounts || [], out = [];
      const todays = all.filter(t => t.posted_at === today), recent = all.filter(t => daysBetween(t.posted_at, today) <= 90 && t.posted_at < today);
      const ledger = L();
      // ALRT-001 low balance ahead: the forecast's low point under the buffer before the next income.
      if (ledger && accounts.length && input.transactions) {
        // One full cycle ahead (30 days) with income counted: the dip after rent lands even when it follows a payday.
        const f = ledger.cashflowForecast({ today, accounts, transactions: input.transactions, rules, horizons: [30] });
        const buffer = Number.isInteger(input.buffer_cents) ? input.buffer_cents : 10000;
        const first = (f.daily || []).find(x => x.balance_cents < buffer);
        if (first) out.push({ key: `low_balance:${first.on}`, kind: "low_balance", capability_id: "ALRT-001", severity: f.low_point.balance_cents < 0 ? "urgent" : "normal", title: `Balance goes under ${money(buffer)} on ${first.on}`, text: `Your cash is ${money(f.start_cents)} now; it goes under your ${money(buffer)} buffer on ${first.on} (${money(first.balance_cents)}) and bottoms at ${money(f.low_point.balance_cents)} on ${f.low_point.on}.`, evidence: { rows: f.recurring_items, computed: { start_cents: f.start_cents, first_below: first, low: f.low_point, buffer_cents: buffer }, source: f.source, as_of: f.as_of }, amount_cents: buffer - f.low_point.balance_cents, deadline: dayMs(first.on) });
      }
      // ALRT-002 large transaction: over the user's threshold, or over three times the category's typical charge when there is history.
      for (const t of todays.filter(t => t.amount_cents < 0)) {
        const cat = recent.filter(x => x.category === t.category && x.amount_cents < 0), typical = cat.length >= 5 ? divRound(cat.reduce((s, x) => s + -x.amount_cents, 0), cat.length) : null;
        const th = Number.isInteger(input.large_threshold_cents) ? input.large_threshold_cents : null;
        if ((th != null && -t.amount_cents >= th) || (typical != null && -t.amount_cents >= typical * 3 && -t.amount_cents >= 5000)) out.push({ key: `large:${t.id}`, kind: "large_transaction", capability_id: "ALRT-002", severity: "normal", title: `${t.merchant_display} ${money(-t.amount_cents)}`, text: `${t.merchant_display} charged ${money(-t.amount_cents)} today${typical != null ? `, against a typical ${money(typical)} for ${t.category}` : th != null ? `, over your ${money(th)} line` : ""}.${t.is_pending ? " Still pending." : ""}`, evidence: { rows: [t.id], computed: { typical_cents: typical, threshold_cents: th }, source: "your transactions", as_of: t.posted_at }, amount_cents: -t.amount_cents });
      }
      // ALRT-003 unusual pattern: a first-time merchant at a large amount, or a category's 7-day spend at three times its trailing weekly average. Fraud shapes (several first-time merchants in a day, a tiny test charge then a large one) are safety.
      const seen = new Set(recent.map(t => t.merchant_key));
      const firstTimers = todays.filter(t => t.amount_cents < 0 && !seen.has(t.merchant_key));
      const probe = firstTimers.find(t => -t.amount_cents <= 200) && firstTimers.find(t => -t.amount_cents >= 10000);
      if (firstTimers.length >= 3 || probe) out.push({ key: `fraud_pattern:${today}`, kind: "fraud_pattern", capability_id: "SEC-001", severity: "safety", title: probe ? "A test charge then a large one at merchants you have never used" : `${firstTimers.length} first-time merchants today`, text: `${probe ? "A charge under $2.00 followed by a large one" : `${firstTimers.length} charges at merchants you have never used`} today: ${firstTimers.map(t => `${t.merchant_display} ${money(-t.amount_cents)}`).join(", ")}. If these are not yours, I can walk you through locking the card and disputing them.`, evidence: { rows: firstTimers.map(t => t.id), computed: { pattern: probe ? "probe_then_large" : "many_first_time" }, source: "your transactions", as_of: today }, amount_cents: firstTimers.reduce((s, t) => s + -t.amount_cents, 0) });
      else for (const t of firstTimers.filter(t => -t.amount_cents >= 20000)) out.push({ key: `unusual:${t.id}`, kind: "unusual_spending", capability_id: "ALRT-003", severity: "normal", title: `First charge from ${t.merchant_display}: ${money(-t.amount_cents)}`, text: `${t.merchant_display} is new to your accounts and charged ${money(-t.amount_cents)} today.`, evidence: { rows: [t.id], computed: { first_time: true }, source: "your transactions", as_of: t.posted_at }, amount_cents: -t.amount_cents });
      const week = all.filter(t => t.amount_cents < 0 && daysBetween(t.posted_at, today) < 7), byCat = {};
      for (const t of week) byCat[t.category] = (byCat[t.category] || 0) + -t.amount_cents;
      for (const [c, v] of Object.entries(byCat)) { const prior = recent.filter(t => t.category === c && t.amount_cents < 0 && daysBetween(t.posted_at, today) >= 7 && daysBetween(t.posted_at, today) < 91); const weeks = prior.length ? Math.max(1, Math.round((daysBetween(prior.map(t => t.posted_at).sort()[0], today) - 7) / 7)) : 0; const avg = weeks ? divRound(prior.reduce((s, t) => s + -t.amount_cents, 0), weeks) : null; if (avg != null && avg > 0 && v >= avg * 3 && v >= 10000 && !["housing", "transfers", "debt_payment"].includes(c)) out.push({ key: `pattern:${c}:${today}`, kind: "unusual_spending", capability_id: "ALRT-003", severity: "normal", title: `${c} is ${Math.round(v / avg)}x your usual week`, text: `${money(v)} on ${c} in the last 7 days against your usual ${money(avg)} a week.`, evidence: { rows: week.filter(t => t.category === c).map(t => t.id), computed: { this_week_cents: v, weekly_avg_cents: avg, weeks }, source: "your transactions", as_of: today }, amount_cents: v - avg }); }
      // ALRT-004 bill increase: a recurring debit posted today above its usual amount by 5 percent or more.
      if (ledger) for (const r of ledger.recurring(input.transactions, today, rules).filter(r => r.direction === "debit")) { const t = todays.find(x => x.merchant_key === r.key && x.amount_cents < 0); if (!t) continue; const up = -t.amount_cents - r.amount_cents; if (r.steady_amount && up >= Math.max(100, divRound(r.amount_cents * 500, 10000))) out.push({ key: `bill_increase:${r.key}:${today}`, kind: "bill_increase", capability_id: "ALRT-004", severity: "normal", title: `${r.merchant} went up ${money(up)}`, text: `${r.merchant} charged ${money(-t.amount_cents)} today; it had been ${money(r.amount_cents)} ${r.cadence}. That is ${money(up * (r.cadence === "monthly" ? 12 : r.cadence === "weekly" ? 52 : 1))} a year if it stays.`, evidence: { rows: [t.id], computed: { was_cents: r.amount_cents, now_cents: -t.amount_cents, cadence: r.cadence }, source: "your transactions", as_of: t.posted_at }, amount_cents: up }); }
      // ALRT-005 subscription renewal: a yearly or quarterly recurring charge expected within 7 days, or a flagged annual renewal.
      if (ledger) for (const r of ledger.recurring(input.transactions, today, rules).filter(r => r.direction === "debit" && (r.cadence === "yearly" || r.cadence === "quarterly") && daysBetween(today, r.next_expected) >= 0 && daysBetween(today, r.next_expected) <= 7)) out.push({ key: `renewal:${r.key}:${r.next_expected}`, kind: "renewal", capability_id: "ALRT-005", severity: "normal", title: `${r.merchant} renews ${r.next_expected} for ${money(r.amount_cents)}`, text: `${r.merchant} is due to renew on ${r.next_expected} for ${money(r.amount_cents)} (${r.cadence}). Keep, cancel, or switch to monthly?`, evidence: { rows: [], computed: { cadence: r.cadence, last_on: r.last_on }, source: "your transactions", as_of: r.last_on }, amount_cents: r.amount_cents, deadline: dayMs(r.next_expected) });
      for (const s of input.renewals || []) if (daysBetween(today, s.renews_on) >= 0 && daysBetween(today, s.renews_on) <= 7) out.push({ key: `renewal:${s.name}:${s.renews_on}`, kind: "renewal", capability_id: "ALRT-005", severity: "normal", title: `${s.name} renews ${s.renews_on} for ${money(s.amount_cents)}`, text: `${s.name} renews on ${s.renews_on} for ${money(s.amount_cents)}. Keep, cancel, or switch to monthly?`, evidence: { rows: [], computed: s, source: s.source || "your subscriptions", as_of: today }, amount_cents: s.amount_cents, deadline: dayMs(s.renews_on) });
      // ALRT-006 payment failed: a connector event, or a returned-payment descriptor today.
      for (const e of (input.events || []).filter(e => e.kind === "payment_failed")) out.push({ key: `payment_failed:${e.id}`, kind: "payment_failed", capability_id: "ALRT-006", severity: "urgent", title: `${e.payee || "A payment"} failed`, text: `${e.payee ? `Your ${e.payee} payment` : "A payment"} of ${money(e.amount_cents)} failed${e.reason ? ` (${e.reason})` : ""}. ${e.retry_by ? `Retry by ${e.retry_by} to avoid a late fee. ` : ""}Want me to set up the retry? You approve it.`, evidence: { rows: [e.id], computed: e, source: e.source || "your bank", as_of: e.at || today }, amount_cents: e.amount_cents, deadline: e.retry_by ? dayMs(e.retry_by) : null });
      for (const t of todays.filter(t => FAILED_RE.test(t.merchant_raw || "") || FAILED_RE.test(t.note || ""))) out.push({ key: `payment_failed:${t.id}`, kind: "payment_failed", capability_id: "ALRT-006", severity: "urgent", title: `Returned payment: ${t.merchant_display}`, text: `${t.merchant_display} posted today for ${money(Math.abs(t.amount_cents))}: a payment was returned or declined. Check the payee before it is retried.`, evidence: { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, amount_cents: Math.abs(t.amount_cents) });
      // ALRT-007 deposit received: a credit today at or above 80 percent of a recurring income amount, or any credit over the user's line.
      if (ledger) { const incomes = ledger.recurring(input.transactions, today, rules).filter(r => r.direction === "credit" && r.category === "income"); for (const t of todays.filter(t => t.amount_cents > 0 && t.category === "income")) { const r = incomes.find(i => i.key === t.merchant_key); if (r && t.amount_cents >= divRound(r.amount_cents * 8000, 10000)) out.push({ key: `deposit:${t.id}`, kind: "deposit_received", capability_id: "ALRT-007", severity: "normal", title: `${t.merchant_display} landed: ${money(t.amount_cents)}`, text: `${t.merchant_display} landed: ${money(t.amount_cents)}${t.amount_cents !== r.amount_cents ? ` (usually ${money(r.amount_cents)})` : ""}.`, evidence: { rows: [t.id], computed: { usual_cents: r.amount_cents }, source: "your transactions", as_of: t.posted_at }, amount_cents: t.amount_cents }); } }
      // ALRT-008 fee charged: any fee today, with the recovery path.
      for (const t of todays.filter(t => t.amount_cents < 0 && t.category === "fees")) out.push({ key: `fee:${t.id}`, kind: "fee_charged", capability_id: "ALRT-008", severity: "normal", title: `Fee: ${t.merchant_display} ${money(-t.amount_cents)}`, text: `${t.merchant_display} charged ${money(-t.amount_cents)} today. Banks often reverse a fee when asked; want the request drafted?`, evidence: { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, amount_cents: -t.amount_cents });
      // ALRT-009 security sign-in: a connector's sign-in event from a new device or place is safety; a known device is silent.
      for (const e of (input.events || []).filter(e => e.kind === "sign_in")) if (e.new_device || e.new_location) out.push({ key: `sign_in:${e.id}`, kind: "security_sign_in", capability_id: "ALRT-009", severity: "safety", title: `New sign-in to ${e.service || "an account"}`, text: `Someone signed in to ${e.service || "an account"} from ${e.new_device ? "a new device" : "a new place"}${e.location ? ` (${e.location})` : ""}${e.at ? ` at ${e.at}` : ""}. If that was not you, change the password there now and I will help with the rest; I never ask for the password.`, evidence: { rows: [e.id], computed: e, source: e.source || e.service || "connector", as_of: e.at || today }, amount_cents: null });
      return out;
    }
    // User watches evaluated against the same rows and balances.
    function evaluateWatches(watches, input) {
      const today = input.today, all = rows(input.transactions, input.rules), todays = all.filter(t => t.posted_at === today), out = [];
      for (const w of (watches || []).filter(w => w.status !== "paused" && w.status !== "revoked")) {
        const fire = (title, text, evidence, extra) => out.push(Object.assign({ key: `watch:${w.id || w.kind}:${today}`, kind: "watch", capability_id: "ALRT-010", severity: "normal", title, text: `${text} (you asked me to watch this)`, evidence, watch: w }, extra || {}));
        if (w.kind === "balance_below") { const a = (input.accounts || []).find(a => [a.id, a.nickname, a.kind, a.name].filter(Boolean).some(n => String(n).toLowerCase() === w.account.toLowerCase())); if (a && (Number.isInteger(a.available_cents) ? a.available_cents : a.balance_cents) < w.threshold_cents) fire(`${w.account} is below ${money(w.threshold_cents)}`, `${w.account} is at ${money(Number.isInteger(a.available_cents) ? a.available_cents : a.balance_cents)}, below your ${money(w.threshold_cents)} line.`, { rows: [], computed: { balance_cents: a.balance_cents, threshold_cents: w.threshold_cents }, source: a.source || "your accounts", as_of: a.as_of || today }, { amount_cents: w.threshold_cents - a.balance_cents }); }
        if (w.kind === "amount_over") for (const t of todays.filter(t => t.amount_cents < 0 && -t.amount_cents > w.threshold_cents)) fire(`${t.merchant_display} ${money(-t.amount_cents)}`, `${t.merchant_display} charged ${money(-t.amount_cents)}, over your ${money(w.threshold_cents)} line.`, { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, { key: `watch:${w.id || w.kind}:${t.id}`, amount_cents: -t.amount_cents });
        if (w.kind === "merchant_charge") for (const t of todays.filter(t => t.amount_cents < 0 && (t.merchant_key.includes(w.merchant.toLowerCase()) || t.merchant_display.toLowerCase().includes(w.merchant.toLowerCase())))) fire(`${t.merchant_display} charged ${money(-t.amount_cents)}`, `${t.merchant_display} charged ${money(-t.amount_cents)} today.`, { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, { key: `watch:${w.id || w.kind}:${t.id}`, amount_cents: -t.amount_cents });
        if (w.kind === "deposit") for (const t of todays.filter(t => t.amount_cents > 0 && (/^(paycheck|payroll|salary)$/i.test(w.from) ? t.category === "income" : t.merchant_key.includes(w.from.toLowerCase()) || t.merchant_display.toLowerCase().includes(w.from.toLowerCase())))) fire(`${t.merchant_display} landed`, `${t.merchant_display} landed: ${money(t.amount_cents)}.`, { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, { key: `watch:${w.id || w.kind}:${t.id}`, amount_cents: t.amount_cents });
        if (w.kind === "category_month_over") { const m = today.slice(0, 7), v = all.filter(t => t.amount_cents < 0 && t.category === w.category && t.posted_at.startsWith(m)).reduce((s, t) => s + -t.amount_cents, 0); if (v > w.threshold_cents) fire(`${w.category} passed ${money(w.threshold_cents)} this month`, `${w.category} is at ${money(v)} this month, past your ${money(w.threshold_cents)} line.`, { rows: all.filter(t => t.category === w.category && t.posted_at.startsWith(m)).map(t => t.id), computed: { month_cents: v }, source: "your transactions", as_of: today }, { key: `watch:${w.id || w.kind}:${m}`, amount_cents: v - w.threshold_cents }); }
        if (w.kind === "bill_increase" && L()) { const r = L().recurring(input.transactions, today, input.rules).find(r => r.direction === "debit" && (r.key.includes(w.merchant.toLowerCase()) || r.merchant.toLowerCase().includes(w.merchant.toLowerCase()))); const t = r && todays.find(x => x.merchant_key === r.key && x.amount_cents < 0); if (r && t && -t.amount_cents > r.amount_cents) fire(`${r.merchant} went up`, `${r.merchant} charged ${money(-t.amount_cents)} today, up from ${money(r.amount_cents)}.`, { rows: [t.id], computed: { was_cents: r.amount_cents }, source: "your transactions", as_of: t.posted_at }, { key: `watch:${w.id || w.kind}:${t.id}`, amount_cents: -t.amount_cents - r.amount_cents }); }
      }
      return out;
    }
    // ALRT-011 quiet hours: everything but safety waits until the quiet window ends; the held list says when.
    function inQuiet(now, quiet) { if (!quiet || !now) return false; const h = new Date(now).getUTCHours() + (quiet.utc_offset_hours || 0), hh = ((h % 24) + 24) % 24; return quiet.start > quiet.end ? (hh >= quiet.start || hh < quiet.end) : (hh >= quiet.start && hh < quiet.end); }
    function quietEnds(now, quiet) { const d = new Date(now); const off = quiet.utc_offset_hours || 0; const endUtc = ((quiet.end - off) % 24 + 24) % 24; const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), endUtc, 0, 0); return t > now ? t : t + DAY; }
    function deliver(firings, now, quiet) {
      const q = inQuiet(now, quiet);
      const deliverNow = firings.filter(f => f.severity === "safety" || !q), held = firings.filter(f => f.severity !== "safety" && q).map(f => Object.assign({}, f, { held_until: quietEnds(now, quiet) }));
      return { now: deliverNow, held, quiet: q, held_until: q ? quietEnds(now, quiet) : null };
    }
    // ALRT-012 fatigue guard at the alert layer: three or more ordinary items at once become one bundle. Safety, urgent items and the user's own watches are never folded in.
    function bundle(firings) {
      const keep = firings.filter(f => f.severity !== "normal" || f.kind === "watch"), rest = firings.filter(f => f.severity === "normal" && f.kind !== "watch");
      rest.sort((a, b) => (b.amount_cents || 0) - (a.amount_cents || 0));
      if (rest.length < 3) return { items: keep.concat(rest), bundled: false };
      const text = `${rest.length} things today: ${rest.map(f => f.title).join("; ")}. Say which one you want first.`;
      return { items: keep.concat([{ key: `bundle:${rest.map(f => f.key).join("|").slice(0, 80)}`, kind: "bundle", capability_id: "ALRT-012", severity: "normal", title: `${rest.length} things today`, text, members: rest, evidence: { rows: rest.flatMap(f => f.evidence && f.evidence.rows || []), computed: { count: rest.length }, source: "your transactions", as_of: null } }]), bundled: true };
    }
    // The whole pass, in the proactive feed's shape: safety beats everything, user watches and urgent items are standing watches, the rest proactive.
    function run(input, opts) {
      const o = opts || {}, now = o.now || dayMs(input.today) + 12 * 3600000;
      const firings = detect(input).concat(evaluateWatches(input.watches, input));
      const d = deliver(firings, now, input.quiet);
      const b = bundle(d.now);
      const out = { safety: [], watches: [], proactive: [], held: d.held, quiet: d.quiet, held_until: d.held_until, firings: firings.length };
      for (const f of b.items) { const item = { key: f.key, text: f.text, reason: f.kind === "watch" ? "you asked me to watch this" : REASONS[f.kind] || f.kind, evidence: f.evidence, capability_id: f.capability_id, amount_cents: f.amount_cents || null, deadline: f.deadline || null, urgent: f.severity === "urgent", title: f.title, members: f.members }; if (f.severity === "safety") out.safety.push(item); else if (f.kind === "watch" || f.severity === "urgent") out.watches.push(item); else out.proactive.push(item); }
      return out;
    }
    const REASONS = { low_balance: "your balance is heading under your buffer", large_transaction: "a charge far above your usual", unusual_spending: "spending unlike your pattern", bill_increase: "a bill went up", renewal: "a renewal is coming", payment_failed: "a payment did not go through", deposit_received: "money landed", fee_charged: "a fee hit", bundle: "several things at once" };
    return { parseWatch, restateWatch, detect, evaluateWatches, deliver, bundle, run, inQuiet, quietEnds, REASONS };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentAlerts;
