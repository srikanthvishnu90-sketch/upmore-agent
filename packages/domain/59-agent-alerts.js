  /* Alerts (Instinct spec doc 02 ALRT-001..011, doc 01 decision order): the
     detectors that turn today's rows and connector events into the loop's
     inputs, each with its evidence rows and a reason, plus the user's own
     watches ("tell me when checking drops below $500") parsed into conditions
     and evaluated the same way. Quiet hours hold everything but safety and watches; a
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
    const haversine = (p, q) => { const R = 6371, toR = d => d * Math.PI / 180, dLat = toR(q.lat - p.lat), dLon = toR(q.lon - p.lon), s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(p.lat)) * Math.cos(toR(q.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
    const FAILED_RE = /\b(nsf|returned (item|payment)|payment (returned|reversed|failed|declined)|insufficient funds|unpaid item|ach return)\b/i;

    // ALRT-010: a watch in the user's words becomes a condition with a stated trigger; unknown phrasing is refused, never guessed.
    const WATCH_PATTERNS = [
      { re: /^(?:my )?([\w ]+?) (?:drops|falls|goes|is|gets) (?:below|under) \$?([\d,]+(?:\.\d{1,2})?)/i, make: m => ({ kind: "balance_below", account: m[1].trim(), threshold_cents: toCents(m[2]) }) },
      { re: /(?:charge|transaction|purchase)s? (?:over|above|more than) \$?([\d,]+(?:\.\d{1,2})?)/i, make: m => ({ kind: "amount_over", threshold_cents: toCents(m[1]) }) },
      // The same watch in spending words (megadoc L09): "I spend over 100 on one thing", "in one purchase", "at once",
      // "anything over $100 (posts)". The whole condition must be that: a category or a merchant in the words ("on
      // food", "at target") is not one charge over an amount, so it is refused like any other unknown phrasing.
      { re: /^(?:i|we) (?:spend|spent|pay|paid) (?:over|above|more than) \$?([\d,]+(?:\.\d{1,2})?)(?: dollars| bucks)?(?: (?:on|in|for) (?:one|a single|any one|any single|a|1) (?:thing|item|purchase|charge|transaction|order)| at once| in one go)\s*[.!?]*$/i, make: m => ({ kind: "amount_over", threshold_cents: toCents(m[1]) }) },
      { re: /^anything (?:over|above|more than) \$?([\d,]+(?:\.\d{1,2})?)(?: dollars| bucks)?(?: (?:posts|hits|goes through|comes through|shows up|gets charged|is charged)(?: (?:on |to )?my (?:card|cards|account|accounts|bank))?)?\s*[.!?]*$/i, make: m => ({ kind: "amount_over", threshold_cents: toCents(m[1]) }) },
      { re: /^([\w .'&-]+?) charges? (?:me|us)\b/i, make: m => ({ kind: "merchant_charge", merchant: m[1].trim() }) },
      { re: /^(?:my )?(paycheck|payroll|salary|deposit from [\w .'&-]+?|[\w .'&-]+? deposit) (?:lands|arrives|comes in|posts|hits)/i, make: m => ({ kind: "deposit", from: m[1].replace(/^deposit from /i, "").replace(/ deposit$/i, "").trim() }) },
      { re: /^(?:my )?([a-z ]+?) spending (?:goes|is|gets) (?:over|above) \$?([\d,]+(?:\.\d{1,2})?)(?: (?:this|a|per) month)?/i, make: m => ({ kind: "category_month_over", category: m[1].trim(), threshold_cents: toCents(m[2]) }) },
      { re: /^(?:my )?([\w .'&-]+?) (?:bill|subscription|price) (?:goes up|increases|rises|changes)/i, make: m => ({ kind: "bill_increase", merchant: m[1].trim() }) }
    ];
    // Item 38, a refund the person was promised: "tell me if my $45.99 Amazon refund doesn't arrive by Oct 20", "let me
    // know when the refund from Best Buy posts", "alert me if my Delta refund hasn't come in within 7 business days". The
    // merchant is required (the words name it, never guessed); the amount and the deadline are optional. The deadline is
    // kept as said and resolved against the day the watch was set (dueOf), so "within 7 business days" counts from then.
    const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const DOWS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const REFUND_VERB = /\b(?:arrives?|arrived|come(?:s)? (?:in|through|back)|came (?:in|through|back)|posts?|posted|shows? up|showed up|shown up|lands?|landed|hits?|clears?|cleared|goes through|went through|(?:is|isn't|isnt|is not|gets?|got) here|(?:is|isn't|isnt|is not|comes?|came|gets?|got) back)\b/;
    const NEG = "(?:doesn'?t|doesnt|does not|hasn'?t|hasnt|has not|isn'?t|isnt|is not|didn'?t|didnt|did not|don'?t|dont|do not|won'?t|wont|will not|never|still)";
    const GENERIC_PAYER = /^(?:airline|the airline|store|the store|bank|company|merchant|seller|shop|retailer|restaurant|hotel|website|site|app|them|they|it|someone|tax|irs|federal|state|my|the|a|an|our|that|this)$/;
    function refundWatch(cond) {
      let c = String(cond || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
      if (!/\brefund/.test(c)) return null;
      let m;
      // "amazon refunds me", "amazon hasn't refunded me by friday": the payer is the subject.
      if ((m = new RegExp(`^(?:the\\s+|my\\s+)?([a-z][\\w .'&-]*?)\\s+(?:${NEG}\\s+)?refund(?:s|ed)?\\s+(?:me|us)\\b(.*)$`).exec(c))) c = `my ${m[1]} refund arrives${m[2]}`;
      // "i don't get my $200 refund from delta by nov 1", "i get my refund from target": the refund is the object.
      else if ((m = new RegExp(`^(?:i\\s+|we\\s+)?(?:${NEG}\\s+)?(?:get|receive|see)\\s+(.*\\brefund\\b.*)$`).exec(c))) { const k = m[1].search(/\s(?:by|before|until|within|in \d|in the next)\b/); c = k >= 0 ? `${m[1].slice(0, k)} arrives${m[1].slice(k)}` : `${m[1]} arrives`; }
      // "my amazon return doesn't get refunded by oct 20": the return's refund.
      c = c.replace(new RegExp(`\\b(?:return|order|purchase)\\s+(?:${NEG}\\s+)?(?:get|gets|got|is|was|been)\\s+refunded\\b`), "refund arrives");
      if (!/\brefund\b/.test(c) || !REFUND_VERB.test(c)) return null;
      const subject = c.split(REFUND_VERB)[0];
      const amt = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)/.exec(subject) || /\b(\d[\d,]*\.\d{2})\b/.exec(subject) || /\b(?:refund|credit) (?:of|for) (\d[\d,]*(?:\.\d{1,2})?)\b/.exec(subject) || /\b(\d[\d,]*(?:\.\d{1,2})?) (?:dollars? |bucks? )?refund\b/.exec(subject);
      const words = subject.replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g, " ").replace(/\b\d[\d,]*(?:\.\d{1,2})?\b(?: dollars?| bucks?)?/g, " ").replace(/\s+/g, " ").trim().replace(new RegExp(`\\s+${NEG}$`), "");
      const from = /\bfrom\s+(?:the\s+|my\s+)?([a-z][\w .'&-]*?)(?:\s+(?:for|on|of)\b.*)?\s*$/.exec(words);
      const before = /^(?:(?:my|the|our|that|this)\s+)?([a-z][\w .'&-]*?)\s+refund\b/.exec(words);
      const merchant = ((from && /\brefund\b/.test(words.slice(0, from.index)) && from[1]) || (before && before[1]) || "").replace(/\s+(?:order|purchase|return)$/, "").trim();
      if (!merchant || GENERIC_PAYER.test(merchant) || /\b(?:tax|irs)\b/.test(merchant)) return null;
      // The merchant as the person typed it ("REI", "Best Buy"), found again in their own words.
      const at = String(cond || "").toLowerCase().replace(/[’‘]/g, "'").indexOf(merchant), typed = at >= 0 ? String(cond).slice(at, at + merchant.length) : merchant;
      // The deadline, after the verb: a date (Oct 20, October 20th, 10/20, 10/20/2026), the 20th, a weekday, or N
      // (business) days.
      const tail = c.slice(c.search(REFUND_VERB));
      let due = null;
      if ((m = /\b(?:by|before|until|on)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(tail))) due = { kind: "date", m: MONTHS.indexOf(m[1].slice(0, 3)) + 1, d: +m[2], y: m[3] ? +m[3] : null };
      else if ((m = /\b(?:by|before|until|on)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(tail))) due = { kind: "date", m: +m[1], d: +m[2], y: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null };
      else if ((m = /\b(?:by|before|until|on)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/.exec(tail))) due = { kind: "dom", d: +m[1] };
      else if ((m = /\b(?:by|before|until|on)\s+(?:this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(tail))) due = { kind: "dow", dow: DOWS.indexOf(m[1]) };
      else if ((m = /\b(?:in|within|after)\s+(?:the next\s+)?(\d{1,2})(?:\s*(?:-|to)\s*(\d{1,2}))?\s+(business |working )?days?\b/.exec(tail))) due = { kind: "days", n: +(m[2] || m[1]), business: !!m[3] };
      if (due && due.kind === "date" && (due.m < 1 || due.m > 12 || due.d < 1 || due.d > 31)) return null;
      if (due && due.kind === "dom" && (due.d < 1 || due.d > 31)) return null;
      return { kind: "refund_expected", merchant: typed, amount_cents: amt ? toCents(amt[1]) : null, due };
    }
    // The deadline as a date (YYYY-MM-DD), counted from the day the watch was set; null when none was said.
    function dueOf(w) {
      const due = w && w.due, base = typeof w.created_on === "string" ? w.created_on : typeof w.created_at === "string" ? w.created_at.slice(0, 10) : null;
      if (!due || !base) return null;
      const b = dayMs(base), iso = ms => new Date(ms).toISOString().slice(0, 10);
      if (due.kind === "days") { if (!due.business) return iso(b + due.n * DAY); let ms = b, left = due.n; while (left > 0) { ms += DAY; const wd = new Date(ms).getUTCDay(); if (wd !== 0 && wd !== 6) left--; } return iso(ms); }
      if (due.kind === "dom") {
        // "by the 20th": this month's 20th if it hasn't passed, else next month's (a month without that day has none).
        const y0 = +base.slice(0, 4), m0 = +base.slice(5, 7);
        for (const [y, mo] of [[y0, m0], m0 === 12 ? [y0 + 1, 1] : [y0, m0 + 1]]) { const d = new Date(Date.UTC(y, mo - 1, due.d)); const k = iso(d.getTime()); if (d.getUTCMonth() === mo - 1 && k >= base) return k; }
        return null;
      }
      if (due.kind === "dow") { let ms = b + DAY; while (new Date(ms).getUTCDay() !== due.dow) ms += DAY; return iso(ms); }
      if (due.kind === "date") {
        const y0 = +base.slice(0, 4), mk = y => `${y}-${String(due.m).padStart(2, "0")}-${String(due.d).padStart(2, "0")}`;
        const ok = y => { const d = new Date(Date.UTC(y, due.m - 1, due.d)); return d.getUTCMonth() === due.m - 1 ? mk(y) : null; };
        if (due.y) return ok(due.y);
        const same = ok(y0);
        return same && same >= base ? same : ok(y0 + 1);
      }
      return null;
    }
    const dateWords = ymdS => { const [y, m, d] = ymdS.split("-").map(Number); return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}, ${y}`; };
    // A name typed all in lower case gets capitals; one typed with its own capitals ("REI", "eBay") is kept as typed.
    const titleCase = s => (/[A-Z]/.test(String(s)) ? String(s) : String(s).replace(/(^|[\s\-&.])([a-z])/g, (_, a, b) => a + b.toUpperCase()));
    // "Tell me when", "let me know if", "ping me whenever": the preamble is stripped so the condition is what gets parsed.
    const PREAMBLE = /^(?:please )?(?:(?:tell|let|ping|warn|notify|alert|text|message|remind) me(?: know)?|alert|watch)\s*(?:about|for)?\s*(?:when|if|whenever|once)?\s*/i;
    const toCents = s => Math.round(Number(String(s).replace(/,/g, "")) * 100);
    function parseWatch(text, now) {
      const t = String(text || "").trim(), cond = t.replace(PREAMBLE, "").replace(/^(?:when|if|whenever)\s+/i, "").trim();
      const refund = refundWatch(cond);
      if (refund) { const w = Object.assign({ id: null, text: t, created_at: now, status: "active" }, refund); w.restated = restateWatch(w); return { ok: true, watch: w }; }
      for (const p of WATCH_PATTERNS) { const m = cond.match(p.re); if (m) { const w = Object.assign({ id: null, text: t, created_at: now, status: "active" }, p.make(m)); w.restated = restateWatch(w); return { ok: true, watch: w }; } }
      return { ok: false, text: "I can watch a balance below an amount, a charge over an amount, a merchant charging you, a deposit landing, a category's monthly spending over an amount, a bill going up, or a refund you're owed arriving. Which one, and what number?" };
    }
    function restateWatch(w) {
      if (w.kind === "refund_expected") {
        const due = dueOf(w), what = `the ${w.amount_cents != null ? `${money(w.amount_cents)} ` : ""}refund from ${titleCase(w.merchant)}`;
        return `I'll tell you when ${what} posts${due ? `, and if it hasn't by ${dateWords(due)}${w.due && w.due.kind === "days" && w.due.business ? ` (${w.due.n} business days, weekends skipped; bank holidays aren't counted)` : ""}` : w.due ? "" : ""}.`;
      }
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
      // The computed evidence carries the transaction reference (id, merchant, amount, date): the proactive
      // anomaly_check offer (C15) is built from it, so a "no" can open the dispute for this exact charge.
      for (const t of todays.filter(t => t.amount_cents < 0)) {
        const cat = recent.filter(x => x.category === t.category && x.amount_cents < 0), typical = cat.length >= 5 ? divRound(cat.reduce((s, x) => s + -x.amount_cents, 0), cat.length) : null;
        const th = Number.isInteger(input.large_threshold_cents) ? input.large_threshold_cents : null;
        if ((th != null && -t.amount_cents >= th) || (typical != null && -t.amount_cents >= typical * 3 && -t.amount_cents >= 5000)) out.push({ key: `large:${t.id}`, kind: "large_transaction", capability_id: "ALRT-002", severity: "normal", title: `${t.merchant_display} ${money(-t.amount_cents)}`, text: `${t.merchant_display} charged ${money(-t.amount_cents)} today${typical != null ? `, against a typical ${money(typical)} for ${t.category}` : th != null ? `, over your ${money(th)} line` : ""}.${t.is_pending ? " Still pending." : ""}`, evidence: { rows: [t.id], computed: { typical_cents: typical, threshold_cents: th, transaction_id: t.id, merchant: t.merchant_display, amount_cents: -t.amount_cents, posted_on: t.posted_at, currency: t.currency ? String(t.currency).toUpperCase() : "USD" }, source: "your transactions", as_of: t.posted_at }, amount_cents: -t.amount_cents });
      }
      // ALRT-003 international charge (C15): a posted charge whose row carries a currency other than USD. The amount
      // is said in its own currency ("45.00 EUR"), never as dollars; the row's own USD figure is named too when the
      // row carries one (usd_amount_cents / amount_usd_cents / usd_cents) — no rate is ever assumed or applied here.
      for (const t of todays.filter(t => t.amount_cents < 0 && !t.is_pending && t.currency && String(t.currency).toUpperCase() !== "USD")) {
        const cur = String(t.currency).toUpperCase(), fxAmt = `${(Math.abs(t.amount_cents) / 100).toFixed(2)} ${cur}`;
        const usdRaw = [t.usd_amount_cents, t.amount_usd_cents, t.usd_cents].find(v => Number.isSafeInteger(v));
        const usd = usdRaw != null ? Math.abs(usdRaw) : null;
        out.push({ key: `international:${t.id}`, kind: "international_charge", capability_id: "ALRT-003", severity: "normal", title: `${t.merchant_display} ${fxAmt}`, text: `${t.merchant_display} charged ${fxAmt}${usd != null ? ` (${money(usd)} in USD)` : ""} on ${dateWords(t.posted_at)}. A charge in another currency is worth a second look.`, evidence: { rows: [t.id], computed: { currency: cur, foreign_cents: -t.amount_cents, usd_cents: usd, transaction_id: t.id, merchant: t.merchant_display, amount_cents: -t.amount_cents, posted_on: t.posted_at }, source: "your transactions", as_of: t.posted_at }, amount_cents: -t.amount_cents });
      }
      // ALRT-003 unusual pattern: a first-time merchant at a large amount, or a category's 7-day spend at three times its trailing weekly average. Fraud shapes (several first-time merchants in a day, a tiny test charge then a large one) are safety.
      const seen = new Set(recent.map(t => t.merchant_key));
      const firstTimers = todays.filter(t => t.amount_cents < 0 && !seen.has(t.merchant_key));
      const probe = firstTimers.find(t => -t.amount_cents <= 200) && firstTimers.find(t => -t.amount_cents >= 10000);
      if (firstTimers.length >= 3 || probe) out.push({ key: `fraud_pattern:${today}`, kind: "fraud_pattern", capability_id: "SEC-001", severity: "safety", title: probe ? "A test charge then a large one at merchants you have never used" : `${firstTimers.length} first-time merchants today`, text: `${probe ? "A charge under $2.00 followed by a large one" : `${firstTimers.length} charges at merchants you have never used`} today: ${firstTimers.map(t => `${t.merchant_display} ${money(-t.amount_cents)}`).join(", ")}. If these are not yours, I can walk you through locking the card and disputing them.`, evidence: { rows: firstTimers.map(t => t.id), computed: { pattern: probe ? "probe_then_large" : "many_first_time" }, source: "your transactions", as_of: today }, amount_cents: firstTimers.reduce((s, t) => s + -t.amount_cents, 0) });
      // SEC-001 on rows that carry a time or a place: a burst of charges within minutes, the same charge twice within minutes, or two card-present charges too far apart to be one person.
      const timed = todays.filter(t => t.amount_cents < 0 && t.at);
      const burst = timed.filter(t => timed.filter(u => u.account_id === t.account_id && Math.abs(Date.parse(u.at) - Date.parse(t.at)) <= 10 * 60000).length >= 4);
      if (burst.length) out.push({ key: `fraud_burst:${today}`, kind: "fraud_pattern", capability_id: "SEC-001", severity: "safety", title: `${burst.length} charges within ten minutes`, text: `${burst.length} charges on one card within ten minutes: ${burst.map(t => `${t.merchant_display} ${money(-t.amount_cents)}`).join(", ")}. That is a card being run, not a person shopping. If it is not you, lock the card now.`, evidence: { rows: burst.map(t => t.id), computed: { pattern: "velocity" }, source: "your transactions", as_of: today }, amount_cents: burst.reduce((s, t) => s + -t.amount_cents, 0) });
      const dupMin = timed.filter((t, i) => timed.some((u, j) => j < i && u.merchant_key === t.merchant_key && u.amount_cents === t.amount_cents && Math.abs(Date.parse(u.at) - Date.parse(t.at)) <= 5 * 60000));
      for (const t of dupMin) out.push({ key: `fraud_double:${t.id}`, kind: "fraud_pattern", capability_id: "SEC-001", severity: "urgent", title: `${t.merchant_display} charged twice within minutes`, text: `${t.merchant_display} ${money(-t.amount_cents)} posted twice within five minutes. A double tap or a double charge; either way the second one is disputable.`, evidence: { rows: [t.id], computed: { pattern: "double_charge" }, source: "your transactions", as_of: today }, amount_cents: -t.amount_cents });
      const placed = timed.filter(t => t.card_present && t.location && Number.isFinite(t.location.lat));
      for (let i = 1; i < placed.length; i++) { const a = placed[i - 1], b = placed[i]; const km = haversine(a.location, b.location), hours = Math.abs(Date.parse(b.at) - Date.parse(a.at)) / 3600000; if (km > 300 && km / Math.max(hours, 0.01) > 900) out.push({ key: `fraud_travel:${b.id}`, kind: "fraud_pattern", capability_id: "SEC-001", severity: "safety", title: `Card used ${Math.round(km)} km apart within ${hours.toFixed(1)} hours`, text: `${a.merchant_display} (${a.location.name || "one place"}) and ${b.merchant_display} (${b.location.name || "another"}) are ${Math.round(km)} km apart, ${hours.toFixed(1)} hours apart, both card-present. One of them is not you.`, evidence: { rows: [a.id, b.id], computed: { pattern: "impossible_travel", km: Math.round(km), hours: +hours.toFixed(2) }, source: "your transactions", as_of: today }, amount_cents: -b.amount_cents }); }
      if (!(firstTimers.length >= 3 || probe)) for (const t of firstTimers.filter(t => -t.amount_cents >= 20000)) out.push({ key: `unusual:${t.id}`, kind: "unusual_spending", capability_id: "ALRT-003", severity: "normal", title: `First charge from ${t.merchant_display}: ${money(-t.amount_cents)}`, text: `${t.merchant_display} is new to your accounts and charged ${money(-t.amount_cents)} today.`, evidence: { rows: [t.id], computed: { first_time: true, transaction_id: t.id, merchant: t.merchant_display, amount_cents: -t.amount_cents, posted_on: t.posted_at, currency: t.currency ? String(t.currency).toUpperCase() : "USD" }, source: "your transactions", as_of: t.posted_at }, amount_cents: -t.amount_cents });
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
      // SAVE-022 windfall routing: a credit posted today is a windfall when it is well above the person's learned
      // deposit pattern and is not that pattern itself. The learned pattern is the trailing deposits: every
      // non-transfer, non-pending credit in the 90 days before today (at least 3, or there is no pattern to learn).
      // A windfall must exceed twice the median trailing deposit and be at least $100. A deposit that matches its
      // own merchant's trailing median within 25 percent is the regular paycheck pattern (a normal payday can clear
      // twice the overall median when small credits drag that median down), so it never fires. Classification is
      // from descriptor words only, and the words that produced it are named as the evidence. The suggested sweep
      // is computed from the input, never invented: a sweep/autosave rule on the input (SAVE-001 shape: from, to,
      // percent_bps or a fixed amount_cents) names the exact dollars and destination; with no rule, the stated
      // share is 50 percent to a savings account that is actually among the accounts; with no savings account, no
      // destination is named at all. One alert per deposit: the key carries the transaction id, duplicate rows
      // fire once, and a deposit the caller says was already alerted (alerted_keys) never fires again.
      {
        const WINDFALL_CLASSES = [{ classification: "tax refund", words: ["IRS", "TREASURY", "REFUND"] }, { classification: "bonus", words: ["BONUS"] }, { classification: "reimbursement", words: ["REIMB", "EXPENSE"] }];
        const medianOf = xs => { const s = xs.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : divRound(s[m - 1] + s[m], 2); };
        const acctOf = id => accounts.find(a => [a.id, a.nickname, a.kind, a.name].filter(Boolean).some(n => String(n) === String(id))) || null;
        const alerted = new Set([].concat(input.alerted_keys || [], input.sent_keys || [], input.alerted_transaction_ids || [], (input.alerted || []).map(x => typeof x === "string" ? x : x && (x.key || x.id || x.transaction_id))).filter(Boolean).map(String));
        const trailing = all.filter(t => t.amount_cents > 0 && !t.is_transfer && !t.is_pending && t.posted_at < today && daysBetween(t.posted_at, today) <= 90);
        if (trailing.length >= 3) {
          const median = medianOf(trailing.map(t => t.amount_cents));
          const sweepRules = [].concat(input.autosave_rules || [], input.sweep_rules || [], (input.rules || []).filter(r => r && r.to && (r.percent_bps != null || r.percent != null || r.amount_cents != null)));
          const rule = sweepRules.find(r => r.status !== "paused" && acctOf(r.to)) || null;
          const seenIds = new Set();
          for (const t of todays.filter(t => t.amount_cents > 0 && !t.is_transfer && !t.is_pending)) {
            if (seenIds.has(t.id)) continue;
            seenIds.add(t.id);
            const key = `windfall:${t.id}`;
            if (alerted.has(key) || alerted.has(String(t.id))) continue;
            if (t.amount_cents < 10000 || t.amount_cents <= median * 2) continue;
            const same = trailing.filter(u => u.merchant_key === t.merchant_key).map(u => u.amount_cents);
            if (same.length && t.amount_cents <= divRound(medianOf(same) * 125, 100)) continue;
            const descriptor = `${t.merchant_raw || ""} ${t.note || ""}`.toUpperCase();
            const hit = WINDFALL_CLASSES.map(c => ({ classification: c.classification, words: c.words.filter(w => new RegExp(`\\b${w}\\b`).test(descriptor)) })).find(c => c.words.length);
            const classification = hit ? hit.classification : "unusual deposit", words = hit ? hit.words : [];
            const dest = rule ? acctOf(rule.to) : accounts.find(a => a.kind === "savings" && !a.hidden) || null;
            const from = rule && rule.from ? acctOf(rule.from) : accounts.find(a => a.id === t.account_id) || null;
            let sweep = null, pctBps = null;
            if (dest) {
              if (rule && rule.percent_bps == null && rule.percent == null && rule.amount_cents != null) sweep = Math.min(rule.amount_cents, t.amount_cents);
              else { pctBps = rule ? (rule.percent_bps != null ? rule.percent_bps : Math.round(rule.percent * 100)) : 5000; sweep = divRound(t.amount_cents * pctBps, 10000); }
            }
            const label = classification.charAt(0).toUpperCase() + classification.slice(1);
            const suggestion = dest ? `Sweep ${money(sweep)}${pctBps != null ? ` (${pctBps / 100}% of it)` : ""} to ${dest.nickname || dest.name || dest.id}? Reply yes and I'll put up that move for your confirmation; nothing moves without it.` : "No savings account is linked, so I'm not naming a sweep destination; tell me where you'd like part of it to go.";
            out.push({ key, kind: "windfall", capability_id: "SAVE-022", severity: "normal", title: `${label} landed: ${money(t.amount_cents)}`, text: `Your ${money(t.amount_cents)} ${classification} landed${words.length ? ` — the descriptor says ${words.join(", ")}` : ""}, well above your usual ${money(median)} deposit (the median of your last ${trailing.length} deposits). ${suggestion}`, evidence: { rows: [t.id], computed: { classification, evidence_words: words, trailing_median_cents: median, trailing_deposits: trailing.length, threshold_cents: median * 2, sweep_cents: sweep, sweep_percent_bps: pctBps, rule_id: rule ? rule.id || null : null, from_account_id: from ? from.id : null, to_account_id: dest ? dest.id : null }, source: "your transactions", as_of: t.posted_at }, amount_cents: t.amount_cents });
          }
        }
      }
      // ALRT-008 fee charged: any fee today, with the recovery path.
      for (const t of todays.filter(t => t.amount_cents < 0 && t.category === "fees")) out.push({ key: `fee:${t.id}`, kind: "fee_charged", capability_id: "ALRT-008", severity: "normal", title: `Fee: ${t.merchant_display} ${money(-t.amount_cents)}`, text: `${t.merchant_display} charged ${money(-t.amount_cents)} today. Banks often reverse a fee when asked; want the request drafted?`, evidence: { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, amount_cents: -t.amount_cents });
      // ALRT-009 security sign-in: a connector's sign-in event from a new device or place is safety; a known device is silent.
      for (const e of (input.events || []).filter(e => e.kind === "sign_in")) if (e.new_device || e.new_location) out.push({ key: `sign_in:${e.id}`, kind: "security_sign_in", capability_id: "ALRT-009", severity: "safety", title: `New sign-in to ${e.service || "an account"}`, text: `Someone signed in to ${e.service || "an account"} from ${e.new_device ? "a new device" : "a new place"}${e.location ? ` (${e.location})` : ""}${e.at ? ` at ${e.at}` : ""}. If that was not you, change the password there now and I will help with the rest; I never ask for the password.`, evidence: { rows: [e.id], computed: e, source: e.source || e.service || "connector", as_of: e.at || today }, amount_cents: null });
      return out;
    }
    // User watches evaluated against the same rows and balances.
    function evaluateWatches(watches, input) {
      const today = input.today, all = rows(input.transactions, input.rules), out = [];
      // Charges reach Upmore when the bank syncs, often a day or two after their posted date, so a transaction watch reads
      // the last LATE_DAYS days, never before the day the watch was set; each charge fires once by its own key and the
      // once-only delivery log (proactive.ts) keeps it from repeating. Reading only today's posted rows missed most charges.
      const LATE_DAYS = 3;
      for (const w of (watches || []).filter(w => w.status !== "paused" && w.status !== "revoked")) {
        const from = [today ? new Date(dayMs(today) - LATE_DAYS * DAY).toISOString().slice(0, 10) : today, typeof w.created_on === "string" ? w.created_on : ""].sort().slice(-1)[0];
        const todays = all.filter(t => t.posted_at >= from && t.posted_at <= today);
        const on = t => (t.posted_at === today ? "" : ` on ${t.posted_at}`);
        const fire = (title, text, evidence, extra) => out.push(Object.assign({ key: `watch:${w.id || w.kind}:${today}`, kind: "watch", capability_id: "ALRT-010", severity: "normal", title, text: `${text} (you asked me to watch this)`, evidence, watch: w }, extra || {}));
        if (w.kind === "balance_below") { const a = (input.accounts || []).find(a => [a.id, a.nickname, a.kind, a.name].filter(Boolean).some(n => String(n).toLowerCase() === w.account.toLowerCase())); if (a && (Number.isInteger(a.available_cents) ? a.available_cents : a.balance_cents) < w.threshold_cents) fire(`${w.account} is below ${money(w.threshold_cents)}`, `${w.account} is at ${money(Number.isInteger(a.available_cents) ? a.available_cents : a.balance_cents)}, below your ${money(w.threshold_cents)} line.`, { rows: [], computed: { balance_cents: a.balance_cents, threshold_cents: w.threshold_cents }, source: a.source || "your accounts", as_of: a.as_of || today }, { amount_cents: w.threshold_cents - a.balance_cents }); }
        if (w.kind === "amount_over") for (const t of todays.filter(t => t.amount_cents < 0 && -t.amount_cents > w.threshold_cents)) fire(`${t.merchant_display} ${money(-t.amount_cents)}`, `${t.merchant_display} charged ${money(-t.amount_cents)}${on(t)}, over your ${money(w.threshold_cents)} line.`, { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, { key: `watch:${w.id || w.kind}:${t.id}`, amount_cents: -t.amount_cents });
        if (w.kind === "merchant_charge") for (const t of todays.filter(t => t.amount_cents < 0 && (t.merchant_key.includes(w.merchant.toLowerCase()) || t.merchant_display.toLowerCase().includes(w.merchant.toLowerCase())))) fire(`${t.merchant_display} charged ${money(-t.amount_cents)}`, `${t.merchant_display} charged ${money(-t.amount_cents)}${on(t) || " today"}.`, { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, { key: `watch:${w.id || w.kind}:${t.id}`, amount_cents: -t.amount_cents });
        if (w.kind === "deposit") for (const t of todays.filter(t => t.amount_cents > 0 && (/^(paycheck|payroll|salary)$/i.test(w.from) ? t.category === "income" : t.merchant_key.includes(w.from.toLowerCase()) || t.merchant_display.toLowerCase().includes(w.from.toLowerCase())))) fire(`${t.merchant_display} landed`, `${t.merchant_display} landed${on(t)}: ${money(t.amount_cents)}.`, { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, { key: `watch:${w.id || w.kind}:${t.id}`, amount_cents: t.amount_cents });
        if (w.kind === "refund_expected") {
          // A credit from the merchant, from 3 days before the watch was set (the refund may have posted while the bank
          // was syncing). The expected amount matches to the cent; another credit is said, and the watch stays. Overdue
          // once the day after the deadline has come with no matching credit, said once, with what was checked.
          const name = titleCase(w.merchant), mk = String(w.merchant).toLowerCase(), base = typeof w.created_on === "string" ? w.created_on : ymd(w.created_at);
          const since = base ? new Date(dayMs(base) - LATE_DAYS * DAY).toISOString().slice(0, 10) : "";
          const credits = all.filter(t => t.amount_cents > 0 && !t.is_pending && t.posted_at >= since && t.posted_at <= today && (t.merchant_key.includes(mk) || String(t.merchant_display).toLowerCase().includes(mk)));
          const exact = credits.filter(t => w.amount_cents == null || t.amount_cents === w.amount_cents);
          const what = `${w.amount_cents != null ? `${money(w.amount_cents)} ` : ""}refund from ${name}`;
          for (const t of exact) fire(`${name} refund posted`, `The ${what} posted on ${dateWords(t.posted_at)}: ${money(t.amount_cents)} from ${t.merchant_display}.`, { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, { key: `watch:${w.id || w.kind}:posted:${t.id}`, amount_cents: t.amount_cents });
          if (!exact.length) for (const t of credits) fire(`${name} credit, not the refund`, `A ${money(t.amount_cents)} credit from ${t.merchant_display} posted on ${dateWords(t.posted_at)}. That isn't the ${what} you're expecting, so I'm still watching for it.`, { rows: [t.id], computed: {}, source: "your transactions", as_of: t.posted_at }, { key: `watch:${w.id || w.kind}:other:${t.id}`, amount_cents: t.amount_cents });
          const due = dueOf(w), through = all.filter(t => !t.is_pending).map(t => t.posted_at).sort().slice(-1)[0] || null;
          if (due && today > due && !exact.length) fire(`${name} refund is late`, `The ${what} hasn't posted: it was due by ${dateWords(due)}, and I see no matching credit from ${name} in your linked accounts${through ? `, transactions through ${dateWords(through)}` : ""}. If ${name} doesn't sort it out, say "dispute a charge" and I'll help you take it to your card company. Nothing was sent.`, { rows: [], computed: { due_on: due }, source: "your transactions", as_of: through }, { key: `watch:${w.id || w.kind}:overdue`, amount_cents: w.amount_cents || 0 });
        }
        if (w.kind === "category_month_over") { const m = today.slice(0, 7), v = all.filter(t => t.amount_cents < 0 && t.category === w.category && t.posted_at.startsWith(m)).reduce((s, t) => s + -t.amount_cents, 0); if (v > w.threshold_cents) fire(`${w.category} passed ${money(w.threshold_cents)} this month`, `${w.category} is at ${money(v)} this month, past your ${money(w.threshold_cents)} line.`, { rows: all.filter(t => t.category === w.category && t.posted_at.startsWith(m)).map(t => t.id), computed: { month_cents: v }, source: "your transactions", as_of: today }, { key: `watch:${w.id || w.kind}:${m}`, amount_cents: v - w.threshold_cents }); }
        if (w.kind === "bill_increase" && L()) { const r = L().recurring(input.transactions, today, input.rules).find(r => r.direction === "debit" && (r.key.includes(w.merchant.toLowerCase()) || r.merchant.toLowerCase().includes(w.merchant.toLowerCase()))); const t = r && todays.find(x => x.merchant_key === r.key && x.amount_cents < 0); if (r && t && -t.amount_cents > r.amount_cents) fire(`${r.merchant} went up`, `${r.merchant} charged ${money(-t.amount_cents)} today, up from ${money(r.amount_cents)}.`, { rows: [t.id], computed: { was_cents: r.amount_cents }, source: "your transactions", as_of: t.posted_at }, { key: `watch:${w.id || w.kind}:${t.id}`, amount_cents: -t.amount_cents - r.amount_cents }); }
      }
      return out;
    }
    // ALRT-011 quiet hours: everything but safety and the person's own watches waits until the quiet window ends; the held
    // list says when. A watch is something they asked to hear the moment it happens, and the quiet-hours reply promises it
    // ("Only safety alerts and things you asked me to watch come through then").
    function inQuiet(now, quiet) { if (!quiet || !now) return false; const h = new Date(now).getUTCHours() + (quiet.utc_offset_hours || 0), hh = ((h % 24) + 24) % 24; return quiet.start > quiet.end ? (hh >= quiet.start || hh < quiet.end) : (hh >= quiet.start && hh < quiet.end); }
    function quietEnds(now, quiet) { const d = new Date(now); const off = quiet.utc_offset_hours || 0; const endUtc = ((quiet.end - off) % 24 + 24) % 24; const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), endUtc, 0, 0); return t > now ? t : t + DAY; }
    function deliver(firings, now, quiet) {
      const q = inQuiet(now, quiet);
      const deliverNow = firings.filter(f => f.severity === "safety" || f.kind === "watch" || !q), held = firings.filter(f => f.severity !== "safety" && f.kind !== "watch" && q).map(f => Object.assign({}, f, { held_until: quietEnds(now, quiet) }));
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
    const REASONS = { low_balance: "your balance is heading under your buffer", large_transaction: "a charge far above your usual", international_charge: "a charge in another currency", unusual_spending: "spending unlike your pattern", bill_increase: "a bill went up", renewal: "a renewal is coming", payment_failed: "a payment did not go through", deposit_received: "money landed", windfall: "a deposit well above your usual pattern", fee_charged: "a fee hit", bundle: "several things at once" };
    return { parseWatch, restateWatch, dueOf, detect, evaluateWatches, deliver, bundle, run, inQuiet, quietEnds, REASONS };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentAlerts;
