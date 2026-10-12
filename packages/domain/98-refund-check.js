  /* "Did my refund arrive?" (megadoc K07; capability list item 38, the asking half; the watching half is the refund
     watch in 59-agent-alerts.js). Read-only, from the person's own rows, numbers only:
       ask(words)                              the ask, or null: { merchant (as typed) | null, amount_cents | null }
       answer(transactions, words, now, opts)  credits from that merchant (or that look like refunds) in the last 90 days,
                                               newest first, to the cent; a pending credit is said as pending; none is said
                                               with the days checked and the watch offered ("tell me if my Amazon refund
                                               doesn't arrive by ..."), never "it's coming".
     A refund is a credit (money in) that isn't a transfer, pay, interest or a payment from a person (Zelle, Venmo, Cash
     App, PayPal transfers). With a merchant named, its credits are matched on the merchant's whole words (named()); with an amount, the exact cents are matched first and another amount is said as not that refund. With no
     merchant, "a refund" is a credit whose bank text says refund, return or credit, or one from a place the person paid
     in the 120 days before it. opts.tz sets the person's today (UTC by default). Pure: rows and the clock are passed in.
     Depth packet REFUND-CHECK (tests/depth-REFUND-CHECK.test.cjs). */
  const RefundCheck = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const DAY = 86400000, WINDOW = 90, LOOKBACK = 120;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const money = MA.money;
    const cents = (r) => (r && r.amount_cents !== null && r.amount_cents !== undefined && Number.isFinite(Number(r.amount_cents)) ? Math.round(Number(r.amount_cents)) : NaN);
    const usd = (r) => !r.currency || String(r.currency).toUpperCase() === "USD";
    const dayOf = (r) => (typeof r.posted_on === "string" ? r.posted_on.slice(0, 10) : null);
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const label = (ymd) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;
    // Money in that is not a refund: pay, interest, transfers, a person paying you back.
    const NOT_REFUND = /\b(?:payroll|dir(?:ect)? ?dep|salary|interest|dividend|zelle|venmo|cash ?app|paypal (?:transfer|inst)|transfer|deposit from|mobile deposit|atm deposit|cashback reward|reward)\b/i;
    const REFUNDISH = /\b(?:refund|return|reversal|credit|adjustment)\b/i;
    // The merchant's whole words in the bank's text ("AMAZON.COM REFUND" is Amazon, "AMAZONIA CAFE" is not), or the
    // words run together at the start ("BESTBUY 00123" is Best Buy).
    const key = (s) => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    function named(raw, term) {
      const d = key(raw), k = key(term);
      if (!k) return false;
      if (` ${d} `.includes(` ${k} `)) return true;
      const sq = k.replace(/ /g, "");
      return sq.length >= 4 && new RegExp(`^${sq}(?![a-z])`).test(d.replace(/ /g, ""));
    }

    // ---- the person's words ----
    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|quick q:?|upmore)[,\s]+)*/i;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    const GENERIC = /^(?:the|my|a|an|it|them|they|airline|the airline|store|the store|company|bank|merchant|seller|tax|irs|federal|state)$/;
    const ASKS = [
      // "did my refund arrive", "did my amazon refund come in", "has the $45.99 refund from best buy posted yet", "did i get my refund from delta"
      /^(?:did|has|have|(?:is|was)(?=\s+(?:my|the|that)\s))\s+(?:i\s+(?:get|got|receive|received)\s+)?(?:(?:my|the|that|a)\s+)?(.*?\brefund\b.*?)\s*(?:arrive|arrived|come in|came in|come through|come back|come|came|post|posted|show up|shown up|showed up|land|landed|hit|clear|cleared|go through|gone through|get here|got here|in|here|back)?(?:\s+yet)?$/,
      // "did i get refunded", "have i been refunded by amazon yet"
      /^(?:did|have|has)\s+(?:i|we)\s+(?:get|got|been)\s+refunded(?:\s+(?:by|from)\s+(.+?))?(?:\s+yet)?$/,
      // "did amazon refund me", "has delta refunded me yet"
      /^(?:did|has|have)\s+(.+?)\s+refund(?:ed)?\s+(?:me|us)(?:\s+yet)?(?:\s+(?:for|on)\b.*)?$/,
      // "any refunds", "any refund from amazon", "did any refunds come in", "where's my refund"
      // "any refunds coming to me" / "owed to me" is the money-owed answer's (84-money-owed.js), not this one.
      /^(?:any|did any|have any|were there any)\s+(refunds?(?:\s+from\s+[a-z][\w .'&-]*?)?)(?:\s+(?:come in|come through|arrive|post|posted|land|landed|lately|recently|this week|this month))?(?:\s+yet)?$/,
      /^(?:where'?s|where is|wheres)\s+(?:my|the)\s+(.*?\brefund\b.*?)$/,
    ];
    function ask(words) {
      const t = clean(words);
      if (!t || t.length > 140 || !/refund/.test(t)) return null;
      if (/\b(?:tax|irs|state|federal)\s+refund\b|\bhow (?:do|can|to|long)\b|\bshould\b|\bwhy\b|\bcan i\b|\bwill i\b/.test(t)) return null;
      for (let i = 0; i < ASKS.length; i++) {
        const m = ASKS[i].exec(t);
        if (!m) continue;
        const raw = m[1] || "";
        const amt = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)/.exec(raw) || /\b(\d[\d,]*\.\d{2})\b/.exec(raw);
        let merchant = null;
        if (i === 1 || i === 2) merchant = raw || null;
        else {
          const w = raw.replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g, " ").replace(/\b\d[\d,]*\.\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
          const from = /\brefunds?\b.*?\bfrom\s+(?:the\s+|my\s+)?([a-z][\w .'&-]*?)(?:\s+(?:for|on|of)\b.*)?$/.exec(w);
          const before = /^(?:(?:my|the|that|a|any)\s+)?([a-z][\w .'&-]*?)\s+refunds?\b/.exec(w);
          merchant = (from && from[1]) || (before && before[1]) || null;
        }
        merchant = merchant ? merchant.replace(/^(?:my|the|that)\s+/, "").replace(/\s+(?:order|purchase|return)$/, "").trim() : null;
        if (merchant && (GENERIC.test(merchant) || /\d{5,}/.test(merchant))) merchant = null;
        if (merchant && /\b(?:tax|irs)\b/.test(merchant)) return null;
        // The merchant as typed ("REI"), found again in the person's words.
        let typed = merchant;
        if (merchant) { const at = String(words).toLowerCase().replace(/[’‘]/g, "'").indexOf(merchant); if (at >= 0) typed = String(words).slice(at, at + merchant.length); }
        return { merchant: typed, amount_cents: amt ? Math.round(Number(amt[1].replace(/,/g, "")) * 100) : null };
      }
      return null;
    }

    // ---- the answer ----
    const name = (m) => (/[A-Z]/.test(m) ? m : m.replace(/(^|[\s\-&.])([a-z])/g, (_, a, b) => a + b.toUpperCase()));
    function answer(transactions, words, now, opts) {
      const q = typeof words === "string" ? ask(words) : words;
      if (!q) return null;
      const tz = (opts && opts.tz) || "UTC", rows = (transactions || []).filter((r) => r && usd(r) && Number.isFinite(cents(r)) && dayOf(r));
      const today = MA.todayIn(now, tz), from = addDays(today, -WINDOW), to = addDays(today, 1); // tomorrow's UTC date is this evening
      const src = MA.txSource(transactions, tz);
      if (!rows.some((r) => !r.is_pending)) return `I don't see any posted transactions in your linked accounts yet, so I can't tell whether a refund came in. ${src}`;
      const recent = rows.filter((r) => dayOf(r) >= from && dayOf(r) <= to);
      const credit = (r) => cents(r) > 0 && !r.is_transfer && !NOT_REFUND.test(String(r.merchant_raw || ""));
      const start = rows.filter((r) => !r.is_pending).map(dayOf).sort()[0];
      const since = start > from ? start : from;
      const what = `${q.amount_cents != null ? `${money(q.amount_cents)} ` : ""}refund${q.merchant ? ` from ${name(q.merchant)}` : ""}`;
      const line = (r) => `${money(cents(r))} from ${MA.display(r.merchant_raw)}${r.is_pending ? "" : ` on ${label(dayOf(r))}`}`;
      // The watch the person can set, with the date they were given (never one made up here).
      const offer = `If they gave you a date, say "tell me if my ${what} doesn't arrive by" and that date, and I'll watch for it.`;
      let found;
      if (q.merchant) {
        found = recent.filter((r) => credit(r) && named(r.merchant_raw, q.merchant));
      } else {
        // No merchant: a credit whose text says refund/return/credit, or one from a place the person paid shortly before.
        const paid = (r) => rows.some((x) => cents(x) < 0 && dayOf(x) < dayOf(r) && dayOf(x) >= addDays(dayOf(r), -LOOKBACK) && MA.display(x.merchant_raw) === MA.display(r.merchant_raw));
        found = recent.filter((r) => credit(r) && (REFUNDISH.test(String(r.merchant_raw || "")) || paid(r)));
      }
      found.sort((a, b) => (b.is_pending ? 1 : 0) - (a.is_pending ? 1 : 0) || dayOf(b).localeCompare(dayOf(a)) || cents(b) - cents(a));
      const lines = [];
      if (q.amount_cents != null) {
        const exact = found.filter((r) => cents(r) === q.amount_cents), other = found.filter((r) => cents(r) !== q.amount_cents);
        const ep = exact.filter((r) => !r.is_pending), epend = exact.filter((r) => r.is_pending);
        if (ep.length) lines.push(`Yes: ${ep.map(line).join("; ")}.`);
        else if (epend.length) lines.push(`It's pending, not posted yet: ${epend.map(line).join("; ")}.`);
        else lines.push(`I don't see the ${what}: no ${money(q.amount_cents)} credit${q.merchant ? ` from ${name(q.merchant)}` : ""} since ${label(since)}.`);
        if (!exact.length && other.length) lines.push(`${other.length === 1 ? "There is a different credit" : "There are other credits"}: ${other.slice(0, 3).map(line).join("; ")}.`);
        if (!exact.length) lines.push(offer);
      } else if (found.length) {
        const posted = found.filter((r) => !r.is_pending), pend = found.filter((r) => r.is_pending);
        // With a merchant named, a credit from them answers "yes"; with none, which refund was meant isn't known, so the
        // credits that look like refunds are listed for the person to recognize.
        const head = q.merchant ? `Yes, ${posted.length === 1 ? "one credit" : `${posted.length} credits`} from ${name(q.merchant)} since ${label(since)}` : `${posted.length === 1 ? "One credit" : `${posted.length} credits`} that look like refunds since ${label(since)}`;
        lines.push(`${posted.length ? `${head}: ${posted.slice(0, 5).map(line).join("; ")}.` : `Nothing posted yet${q.merchant ? ` from ${name(q.merchant)}` : ""}.`}${pend.length ? ` Pending, not posted yet: ${pend.slice(0, 3).map(line).join("; ")}.` : ""}`);
        if (posted.length > 5) lines.push(`And ${posted.length - 5} more.`);
      } else {
        lines.push(`I don't see ${q.merchant ? `a refund from ${name(q.merchant)}` : "a refund"} in your linked accounts since ${label(since)}: no ${q.merchant ? "credit from them" : "credit that looks like one"}.`);
        lines.push(offer);
      }
      lines.push(src);
      return lines.join("\n");
    }
    return { ask, answer, WINDOW };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = RefundCheck;
