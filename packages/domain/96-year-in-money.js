  /* Year in money: the annual review (the owner's Full Agent Capability List, section 2 "Reports", item 26: "Year in
     money: annual review, including confirmed dollars Upmore saved or recovered. [Read]"; registry ANL-012, SAVE-007,
     EARN-004). Read-only, numbers only: no advice, nothing moved. Every number comes from the person's own rows, never
     from the model:
       transactions  agent_financial_transactions rows: account_id, amount_cents (negative = money out), posted_on,
                     merchant_raw, is_pending, is_transfer, currency, fetched_at
     Three functions:
       ask(words)                         { year: "this" | "last" | 2025 } for "my year in money", "year in review", "how
                                          did my year go financially", "how did 2026 go", "annual review", "show me my
                                          year", or null. Conservative: "how much did I spend this year" (or last year)
                                          stays the spending answer's, advice ("how can I do better next year"), taxes
                                          and someone else's year go on.
       yearOf(words, now, tz)             the calendar year asked, as a number (the host reads further back for a past
                                          year)
       review(transactions, words, now, opts)   the review as plain text, its source and as-of line last
     What the review says: the period (this calendar year so far in the person's own time zone, opts.tz, default UTC;
     or a named past year); money in and money out with the net (transfers and card payments left out, as in the
     spending answer; refunds taken off what went out, never counted as money in, and said); spending by category with
     MoneyAnswers.classify(raw, opts.rules), the person's category rules (95-category-rules.js) included and said, with
     spending that matches no category said apart, never guessed into one; the top 5 places; the biggest month and the
     quietest full month; what repeating charges (AgentLedger.recurring over the same rows, the bill kinds "what bills
     are coming up" counts) charged in the year; pending charges and other currencies said, never added.
     Coverage: rows that start after Jan 1 are said ("your linked transactions start Mar 4, 2026, so this covers only
     from then"), a past year the rows end inside is said, a year the rows do not reach is never a $0.00 year, and only a
     month the rows cover from its 1st to its last day can be "the quietest full month". opts.capped (the host's row
     cap, when a read hit it) says the start is where the read stopped, not where the history begins.
     Confirmed savings: a dollar Upmore saved or recovered is said only from a confirmed record. None exists that the
     chat can read today: recovery cases carry no recovered amount (agent_recovery_case_json returns recovered_cents
     null, "unavailable_user_report_only"); the save ledger (49-agent-save.js) books verified deltas in memory only; and
     action_ledger rows can be written by the app's own client, so they are no proof. So the review says plainly that
     none is on record and estimates nothing.
     Bank posted dates are UTC: in the current year a row dated the day after the person's today is this evening's and
     counts today (on Dec 31 it counts in the year), as in 94-spending-views.js. Pure: rows and the clock are passed in.
     Depth packet YEAR (tests/depth-YEAR.test.cjs). */
  const YearInMoney = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const LG = typeof AgentLedger !== "undefined" ? AgentLedger : require("./57-agent-ledger.js");
    const money = MA.money, DAY = 86400000;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const pad = (n) => String(n).padStart(2, "0");
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dateLabel = (ymd, withYear) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}${withYear ? `, ${ymd.slice(0, 4)}` : ""}`;
    const cents = (r) => (r && r.amount_cents !== null && r.amount_cents !== undefined && Number.isFinite(Number(r.amount_cents)) ? Math.round(Number(r.amount_cents)) : NaN);
    const usd = (r) => !r.currency || String(r.currency).toUpperCase() === "USD";
    const dayOf = (r) => (typeof r.posted_on === "string" ? r.posted_on.slice(0, 10) : null);
    // The person's category rules for the review in progress: set on entry, cleared on the way out (it never yields).
    let RULES = null;
    const groupOf = (r) => { const c = MA.classify(r.merchant_raw, RULES); return c ? c.group : null; };
    const REFUND = /\b(?:refunds?|returns?|reversal|merchandise credit|price adjustment)\b/i;
    // A refund: a credit from a known merchant, or one that says refund or return. Taken off what went out.
    // A paycheck from a company that is also a store (Target, Costco) is pay, never a refund.
    const PAYROLL = /\b(?:payroll|payrl|direct dep|dir dep|salary)\b/i;
    const isRefund = (r) => MA.isIncome(r) && !PAYROLL.test(String(r.merchant_raw || "")) && (groupOf(r) !== null || REFUND.test(String(r.merchant_raw || "")));
    const usable = (rows) => (rows || []).filter((r) => r && Number.isFinite(cents(r)));
    const posted = (rows) => usable(rows).filter((r) => !r.is_pending && usd(r) && dayOf(r) !== null);
    const within = (r, from, to) => { const d = dayOf(r); return d !== null && d >= from && d <= to; };

    // ---- which ask ----
    const LEAD = String.raw`^\s*(?:(?:hey|hi|ok|okay|so|yo|pls|please|quick q:?|upmore)[,\s]+)*(?:(?:can|could) you\s+|pls\s+|please\s+)?`;
    const END = String.raw`(?:\s+(?:please|pls|so far))?\s*[?.!]*\s*$`;
    const YR = String.raw`(?:20\d\d)`;
    // "for 2025", "this year", "last year", "so far": the year a review names, after its words.
    const WHEN = String.raw`(?:\s+(?:for|in|of|from)?\s*(?:this year|last year|the year|${YR}|so far this year))?`;
    const MONEYISH = String.raw`(?:money |financial |finance |finances |spending |budget )?`;
    const GO = String.raw`(?: (?:go|going|been|look|looking|gone|turn out|turned out|shape up|shaping up))?`;
    const MONEY_HOW = String.raw`(?: (?:for my money|for my finances|financially|money-?wise|with (?:my )?money|in money))`;
    const HOW = String.raw`(?: (?:for me|for my money|for my finances|financially|money-?wise|with (?:my )?money|in money|so far))`;
    const PHRASES = [
      // "my year in money", "year in review", "my 2025 year in review", "last year's year in review for my money"
      String.raw`(?:(?:show|give|send) me |let'?s see |i want to see |i'?d like to see |what'?s |whats |what is )?(?:my |the |a )?(?:${YR}(?:'s)? |this year'?s |last year'?s )?(?:money |financial )?year in (?:money|review|numbers)${WHEN}(?: for my (?:money|finances))?`,
      // "annual review", "annual money review", "my yearly spending report", "year-end recap", "end of year summary"
      String.raw`(?:(?:show|give|send) me |let'?s see |i want |i'?d like |do |run |what'?s |whats )?(?:my |the |a |an )?(?:${YR} |this year'?s |last year'?s )?(?:annual|yearly|year[- ]end|end[- ]of[- ](?:the[- ])?year) ${MONEYISH}(?:review|report|recap|summary|wrap[- ]?up)${WHEN}`,
      // "my money wrapped", "spending wrapped 2025"
      String.raw`(?:(?:show|give|send) me )?(?:my )?(?:${YR} )?(?:money|spending|financial|finance) wrapped(?: ${YR})?`,
      // "how did my year go financially", "how did 2026 go", "how was 2025", "how's my year going money-wise"
      String.raw`how(?:'s| (?:did|was|were|is|has|have)) (?:my (?:${YR}|year)|${YR})${GO}${HOW}*`,
      // "this year" and "last year" on their own are small talk until money is named: "how did last year go financially"
      String.raw`how(?:'s| (?:did|was|were|is|has|have)) (?:the year|this year|last year)${GO}${HOW}*${MONEY_HOW}${HOW}*`,
      // "how did my finances do this year", "how was my money in 2025", "how are my finances looking this year"
      String.raw`how (?:did|have|were|was|are|is|has) my (?:finances|money)(?: (?:do|did|done|go|gone|been|look|looking|looked|doing|going))? (?:this year|last year|for the year|in ${YR}|so far this year)`,
      // "show me my year", "review my year", "recap my 2025", "summarize my year financially", "sum up my last year"
      String.raw`(?:(?:show|give|send) me|review|recap|summarize|summarise|sum up|wrap up|break down) (?:my )?(?:year|${YR}|last year|this year|whole year)(?: (?:in money|in review|financially|money-?wise))?`,
      // "review my finances for the year", "recap my spending this year", "summarize my money in 2025"
      String.raw`(?:review|recap|summarize|summarise|sum up) my (?:finances|money|spending) (?:for (?:the |this |last )?year|this year|last year|in ${YR}|for ${YR})`,
    ];
    const ASKS = PHRASES.map((p) => new RegExp(LEAD + p + END, "i"));
    const tidy = (s) => String(s || "").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
    function ask(words) {
      const w = tidy(words);
      // Whole messages only: advice ("how can I do better next year"), taxes, a portfolio or anything said after the
      // year's words never matches, so it goes on to the model.
      if (!w || !ASKS.some((re) => re.test(w))) return null;
      const lw = w.toLowerCase(), y = lw.match(/\b(20\d\d)\b/);
      if (y) return { year: +y[1] };
      if (/\blast year\b/.test(lw)) return { year: "last" };
      return { year: "this" };
    }
    function yearOf(words, now, tz) {
      const a = ask(words);
      if (!a) return null;
      const y = +MA.todayIn(now, (tz || "UTC")).slice(0, 4);
      return a.year === "this" ? y : a.year === "last" ? y - 1 : a.year;
    }

    // ---- the review ----
    function net(rows, from, to, keep) {
      let charged = 0, refunded = 0;
      for (const r of posted(rows)) {
        if (!within(r, from, to) || !keep(r)) continue;
        if (MA.isSpend(r)) charged -= cents(r);
        else if (isRefund(r)) refunded += cents(r);
      }
      return { total: charged - refunded, refunded };
    }
    function byKey(rows, from, to, keyOf) {
      const m = new Map();
      for (const r of posted(rows)) {
        if (!within(r, from, to) || !(MA.isSpend(r) || isRefund(r))) continue;
        const k = keyOf(r);
        if (k !== null) m.set(k, (m.get(k) || 0) - cents(r));
      }
      return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    }
    // What repeating charges took in the year: AgentLedger.recurring over every posted dollar charge up to the year's
    // end (a yearly renewal needs last year's charge to be seen as one), the kinds "what bills are coming up" counts
    // (groceries, dining and transport repeat but are not bills), grouped by the name the review shows.
    const VARIABLE = new Set(["groceries", "dining", "transport"]);
    function repeating(rows, from, to) {
      const spend = posted(rows).filter((r) => MA.isSpend(r) && dayOf(r) <= to);
      const shaped = spend.map((r, i) => ({ id: `r${i}`, amount_cents: cents(r), posted_at: dayOf(r), merchant_raw: MA.display(r.merchant_raw), is_transfer: false }));
      const rec = LG.recurring(shaped, to).filter((x) => x.direction === "debit" && !VARIABLE.has(x.category));
      if (!rec.length) return null;
      const keys = new Set(rec.map((x) => x.key)), names = new Map();
      let total = 0;
      for (const r of shaped) {
        if (r.posted_at < from || !keys.has(LG.normalizeMerchant(r.merchant_raw).key)) continue;
        total -= r.amount_cents;
        names.set(r.merchant_raw, (names.get(r.merchant_raw) || 0) - r.amount_cents);
      }
      if (total <= 0) return null;
      return { total, names: [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n) };
    }
    const CONFIRMED = "Saved or recovered by Upmore: no confirmed savings are on record yet, so none is counted here (one counts only once its record confirms it, like a fee's credit posting).";
    const TAIL = "Transfers and card payments are left out.";

    function review(transactions, words, now, opts) { RULES = (opts && opts.rules) || null; try { return reviewIn(transactions, words, now, opts); } finally { RULES = null; } }
    function reviewIn(transactions, words, now, opts) {
      // A row whose posted date is not a calendar day is never read as one (a pending row has none and stays).
      const tz = (opts && opts.tz) || "UTC", rows = (transactions || []).filter((r) => r && (r.posted_on == null || /^\d{4}-\d{2}-\d{2}/.test(String(r.posted_on)))), today = MA.todayIn(now, tz), thisYear = +today.slice(0, 4);
      const year = yearOf(words, now, tz) || thisYear, src = (extra) => MA.txSource(rows, tz, extra);
      if (year > thisYear) return `There's no ${year} to review yet: it's ${dateLabel(today, true)} where you are.\n${src()}`;
      const all = posted(rows);
      if (!all.length) return `I don't see any posted transactions in your linked accounts yet, so there's no year to review. ${src()}`;
      const current = year === thisYear, from = `${year}-01-01`, yearEnd = `${year}-12-31`;
      // In the current year a row dated tomorrow is this evening's (on Dec 31 it is still the year's).
      const to = current ? addDays(today, 1) : yearEnd, shownTo = current ? today : yearEnd;
      const days = all.map(dayOf).sort(), start = days[0], end = days[days.length - 1];
      const capped = opts && opts.capped;
      const startText = capped ? `I can read only your newest ${Number(capped).toLocaleString("en-US")} transactions, and they start ${dateLabel(start, true)}` : `Your linked transactions start ${dateLabel(start, true)}`;
      if (start > to) return `${startText}, so I can't see ${year}: there's nothing from then to add up.\n${src(TAIL)}`;
      if (end < from) return `Your linked transactions end ${dateLabel(end, true)}, so there's nothing from ${year} to add up${current ? " yet" : ""}.\n${src(TAIL)}`;
      const coverFrom = start > from ? start : from, coverTo = !current && end < yearEnd ? end : shownTo;
      const label = `${current ? `Your ${year} so far` : `Your ${year}`} (${from === shownTo ? dateLabel(from) : `${dateLabel(from)}-${dateLabel(shownTo)}`})`;
      const lines = [];

      // In and out, with the net. Money in leaves refunds out: they are taken off what went out instead.
      const inRows = all.filter((r) => within(r, from, to) && MA.isIncome(r) && !isRefund(r));
      const moneyIn = inRows.reduce((s, r) => s + cents(r), 0), out = net(rows, from, to, () => true);
      const gap = moneyIn - out.total;
      const netText = gap === 0 ? "the same in as out" : gap > 0 ? `so ${money(gap)} more came in than went out` : `so ${money(-gap)} more went out than came in`;
      let head = moneyIn === 0 && out.total === 0 && out.refunded === 0 ? `${label}: nothing came in or went out, apart from transfers and card payments.` : `${label}: ${money(moneyIn)} in, ${money(out.total)} out, ${netText}.`;
      if (start > from) head += ` ${startText}, so this covers only from then.`;
      if (!current && end < yearEnd) head += ` Your linked transactions end ${dateLabel(end, true)}, so this covers only until then.`;
      lines.push(head);

      // By category, the person's rules included; what matches none is said apart.
      const cats = byKey(rows, from, to, (r) => { const g = groupOf(r); return g ? MA.GROUP_LABEL[g] : null; });
      const unc = net(rows, from, to, (r) => groupOf(r) === null).total;
      if (cats.length || unc > 0) {
        const catText = cats.map(([k, v]) => `${k} ${money(v)}`).join(", ");
        const uncText = unc > 0 ? `${money(unc)} matched no category I know, so it isn't put in one` : "";
        lines.push(cats.length ? `By category: ${catText}${uncText ? `; ${uncText}` : ""}.` : `By category: none of it matched a category I know (${money(unc)}), so it isn't put in one.`);
      }
      const places = byKey(rows, from, to, (r) => MA.display(r.merchant_raw)).slice(0, 5);
      if (places.length) lines.push(`Top places: ${places.map(([k, v]) => `${k} ${money(v)}`).join(", ")}.`);

      // The biggest month on file in the period, and the quietest of the months covered from the 1st to the last day.
      const months = [];
      for (let m = +coverFrom.slice(5, 7); m <= +coverTo.slice(5, 7); m++) {
        const first = `${year}-${pad(m)}-01`, last = `${year}-${pad(m)}-${pad(lastDay(year, m))}`;
        const mTo = current && today.slice(0, 7) === first.slice(0, 7) ? to : last;
        const full = first >= coverFrom && last <= coverTo && !(current && last >= today);
        months.push({ m, total: net(rows, first, mTo, () => true).total, full, partial: current && first.slice(0, 7) === today.slice(0, 7) ? "so far" : first < coverFrom ? `from ${dateLabel(coverFrom)}` : last > coverTo ? `through ${dateLabel(coverTo)}` : "" });
      }
      if (months.length > 1) {
        const big = months.slice().sort((a, b) => b.total - a.total || a.m - b.m)[0];
        const quiet = months.filter((x) => x.full && x !== big).sort((a, b) => a.total - b.total || a.m - b.m)[0];
        if (big.total > 0) lines.push(`Biggest month: ${MONTHS[big.m - 1]}${big.partial ? ` (${big.partial})` : ""}, ${money(big.total)} out.${quiet ? ` Quietest full month: ${MONTHS[quiet.m - 1]}, ${money(quiet.total)}.` : ""}`);
      }

      const rep = repeating(rows, from, to);
      if (rep) lines.push(`Repeating charges (${rep.names.slice(0, 3).join(", ")}${rep.names.length > 3 ? ` and ${rep.names.length - 3} more` : ""}): ${money(rep.total)} charged ${current ? "this year" : `in ${year}`}.`);
      const ruled = MA.ruleLine(all.filter((r) => within(r, from, to) && (MA.isSpend(r) || isRefund(r))), RULES);
      if (ruled) lines.push(ruled);

      // Refunds, pending and other currencies: said, the last two never added.
      const extra = [];
      if (out.refunded > 0) extra.push(`Refunds taken off what went out: ${money(out.refunded)}.`);
      const pend = usable(rows).filter((r) => r.is_pending && usd(r) && MA.isSpend(r) && (dayOf(r) === null || within(r, from, to)));
      if (pend.length) extra.push(`Pending, not added yet: ${money(pend.reduce((s, r) => s - cents(r), 0))} (${pend.length} charge${pend.length === 1 ? "" : "s"}).`);
      const fx = new Map();
      for (const r of usable(rows)) {
        if (r.is_pending || usd(r) || r.is_transfer || !within(r, from, to)) continue;
        const k = `${String(r.currency).toUpperCase()} ${cents(r) < 0 ? "out" : "in"}`;
        fx.set(k, (fx.get(k) || 0) + Math.abs(cents(r)));
      }
      if (fx.size) extra.push(`In another currency, not added: ${[...fx.entries()].map(([k, v]) => `${(v / 100).toFixed(2)} ${k}`).join(", ")}.`);
      if (extra.length) lines.push(extra.join(" "));

      lines.push(CONFIRMED);
      lines.push(src(TAIL));
      return lines.join("\n");
    }

    return { ask, yearOf, review, CONFIRMED };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = YearInMoney;
