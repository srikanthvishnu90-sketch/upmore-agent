  /* This month against last month and the person's own average, and spending by card (the owner's Full Agent Capability
     List, section 1 "Spending", items 12 and 13; registry TXN-021, ANL-009, CARD-001). Read-only, numbers only: no
     advice, nothing moved. Every number comes from the person's own rows, never from the model:
       accounts      agent_financial_accounts rows: account_id, name, institution, account_kind, status (and mask when a
                     row carries one; the live table has no mask column, so live replies show names only)
       transactions  agent_financial_transactions rows: account_id, amount_cents (negative = money out), posted_on,
                     merchant_raw, is_pending, is_transfer, currency, fetched_at
     Three functions:
       ask(words)                               "compare" | "cards" | null: which of the two a message asks, conservative
                                                (a near miss, advice, another period or another month goes on)
       compare(transactions, words, now, opts)  this month so far against the same days of last month (day 12 vs day 12,
                                                said; Feb's 28 days said on the 29th-31st) and against the average of the
                                                last 3 full months on file (how many said; under one full month, no
                                                average), totals and the 3 categories that changed most in dollars; a
                                                category named in the ask narrows all of it, with that category's average
       byCard(accounts, transactions, words, now, opts)   per linked account or card for the period asked (this month by
                                                default; last month, this year, a named month): the account's name as
                                                stored (a run of 5 or more digits in it never shown; the last 4 only when
                                                the row carries a mask), its total, its share of the whole and its top 3
                                                places; one card named ("my amex", "my chase card") narrows to it
       merchantAsk(words) / merchantSpend(...)  one merchant ("how much am I spending on DoorDash, really?"): totals
                                                across every linked account for the trailing 30 and 90 days, each
                                                against the equal period before it, with order counts and per-order
                                                averages; merchantAsk is the routing predicate (a known merchant
                                                only) for the chat kind money_answers.ts adds for it
     The spending rules are 80-money-answers.js's (the same categories and merchant list, the same isSpend): posted rows
     in US dollars, transfers and card payments left out (so a card paid from checking is never counted twice), a refund
     (a credit from a known merchant, or one that says refund or return) taken off, pending charges and other currencies
     said and not added, spending that matches no category said apart, never guessed into one. "This month" is the
     person's own calendar month (opts.tz, an IANA zone, default UTC). Bank posted dates are UTC, so a row dated the day
     after the person's today is this evening's and counts today (on the last day of a month it counts in that month);
     the earlier months are compared by their own dates, day 1 through the same day. Known limit (as in 93-budgets.js): a
     row dated the 1st that was really the evening before counts in the new month; the rows carry no time of day. Pure:
     rows and the clock are passed in. Depth packet SPEND-VIEWS (tests/depth-SPEND-VIEWS.test.cjs). */
  const SpendingViews = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const money = MA.money, DAY = 86400000;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const pad = (n) => String(n).padStart(2, "0");
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const back = (y, m, k) => { const t = y * 12 + (m - 1) - k; return [Math.floor(t / 12), (t % 12) + 1]; };
    const dateLabel = (ymd, withYear) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}${withYear ? `, ${ymd.slice(0, 4)}` : ""}`;
    const sameMonthRange = (from, to) => (from === to ? dateLabel(from) : `${dateLabel(from)}-${+to.slice(8, 10)}`);
    const cents = (r) => (r && r.amount_cents !== null && r.amount_cents !== undefined && Number.isFinite(Number(r.amount_cents)) ? Math.round(Number(r.amount_cents)) : NaN);
    const usd = (r) => !r.currency || String(r.currency).toUpperCase() === "USD";
    const dayOf = (r) => (typeof r.posted_on === "string" ? r.posted_on.slice(0, 10) : null);
    // The person's category rules (95-category-rules.js) for the call in progress: compare() and byCard() set them on
    // entry and clear them on the way out. Both run start to finish without yielding, so no other call sees them.
    let RULES = null;
    const withRules = (opts, fn) => { RULES = (opts && opts.rules) || null; try { return fn(); } finally { RULES = null; } };
    const groupOf = (r) => { const c = MA.classify(r.merchant_raw, RULES); return c ? c.group : null; };
    const REFUND = /\b(?:refunds?|returns?|reversal|merchandise credit|price adjustment)\b/i;
    const isRefund = (r) => MA.isIncome(r) && (groupOf(r) !== null || REFUND.test(String(r.merchant_raw || "")));
    const GROUP_LABEL = { groceries: "groceries", restaurants: "restaurants", delivery: "delivery", gas: "gas", subscriptions: "subscriptions", transport: "transport", shopping: "shopping" };
    const usable = (rows) => (rows || []).filter((r) => r && Number.isFinite(cents(r)));
    const posted = (rows) => usable(rows).filter((r) => !r.is_pending && usd(r) && dayOf(r) !== null);
    const earliest = (rows) => posted(rows).map(dayOf).sort()[0] || null;
    const within = (r, from, to) => { const d = dayOf(r); return d !== null && d >= from && d <= to; };
    // Net spending of the rows in [from, to] that keep() keeps: charges minus refunds, in cents.
    function net(rows, from, to, keep) {
      let charged = 0, refunded = 0;
      for (const r of posted(rows)) {
        if (!within(r, from, to) || !keep(r)) continue;
        if (MA.isSpend(r)) charged -= cents(r);
        else if (isRefund(r)) refunded += cents(r);
      }
      return { total: charged - refunded, refunded };
    }
    // Net spending per key (a category group or a place) in [from, to]; a row with no key is left out.
    function byKey(rows, from, to, keep, keyOf) {
      const m = new Map();
      for (const r of posted(rows)) {
        if (!within(r, from, to) || !keep(r) || !(MA.isSpend(r) || isRefund(r))) continue;
        const k = keyOf(r);
        if (k !== null) m.set(k, (m.get(k) || 0) - cents(r));
      }
      return m;
    }
    const topPlaces = (rows, from, to, keep) => [...byKey(rows, from, to, keep, (r) => MA.display(r.merchant_raw)).entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
    const pendingOf = (rows, from, to, keep) => usable(rows).filter((r) => r.is_pending && usd(r) && MA.isSpend(r) && keep(r) && (dayOf(r) === null || within(r, from, to)));
    const foreignOf = (rows, from, to, keep) => usable(rows).filter((r) => !r.is_pending && !usd(r) && cents(r) < 0 && !r.is_transfer && keep(r) && within(r, from, to));
    const pendingText = (list) => `${money(list.reduce((s, r) => s - cents(r), 0))} (${list.length} charge${list.length === 1 ? "" : "s"})`;
    const foreignText = (list) => list.map((r) => `${(Math.abs(cents(r)) / 100).toFixed(2)} ${String(r.currency).toUpperCase()}`).join(", ");

    // ---- which ask ----
    const ADVICE = /\b(?:should|could|cut|reduce|lower|stop|budget|tips?|help me|plan|save|limit|afford)\b/;
    const OTHER_PERIOD = /\b(?:this|last|past|next) (?:week|year)\b|\byear to date\b|\bytd\b|\byesterday\b|\btoday\b|\blast \d+ days\b/;
    const MONTH_NAME = /\b(?:january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/;
    const OTHERS = /\b(?:americans?|people|others|other people|national|my friends|my age|the average (?:person|household|american))\b/;
    const LAST_AS_SUBJECT = /\b(?:how (?:did|was|were)|was) last month\b|^\s*last month\b/;
    function isCompare(w) {
      if (ADVICE.test(w) || OTHER_PERIOD.test(w) || MONTH_NAME.test(w) || OTHERS.test(w) || LAST_AS_SUBJECT.test(w)) return false;
      const anchor = /\bspen(?:d|ds|ding|t)\b|\bthis month\b|\bmonth over month\b/.test(w);
      const cmp = /\bcompar(?:e|es|ed|ing|ison)\b|\bstacks? up\b|\bvs\b\.?|\bversus\b|\b(?:more|less)\b[^?.!]*\bthan\b|\bmonth over month\b|\bup or down\b|\b(?:up|down|higher)\b[^?.!]*\b(?:from|than|since)\b/.test(w);
      const base = /\blast month\b|\bthan last\b|\bthe month before\b|\busual(?:ly)?\b|\bnormal(?:ly)?\b|\baverage\b|\btypical(?:ly)?\b|\bbefore\b|\bmonth over month\b/.test(w);
      // "am i spending more this month", "did i spend less this month": this month against the usual, said or not.
      const implicit = /\bspen(?:d|ds|ding|t) (?:more|less)\b[^?.!]*\bthis month\b/.test(w) && !/\bthan\b/.test(w);
      return anchor && ((cmp && base) || implicit);
    }
    // A card or bank named in the ask, or the words "card"/"account" after it.
    const CARD_WORD = /^(?:amex|american express|chase|citi(?:bank)?|discover|capital one|cap one|apple card|venture(?: x)?|quicksilver|savor|sapphire(?: preferred| reserve)?|freedom(?: flex| unlimited)?|platinum|gold|blue cash(?: preferred| everyday)?|bilt|wells fargo|bank of america|bofa|boa|us bank|barclays|synchrony|visa|mastercard|checking|debit|credit|cards?)\b/;
    const NOT_CARD = /\b(?:report|score|limit|line|balance|statement|due|apr|interest|rewards?|points?|offers?|bill|payment|fee|benefits?|perks?|history|number|pin)\b/;
    const PERIOD_TAIL = String.raw`(?:\s+(?:this|last) (?:month|week|year)|\s+so far|\s+in [a-z]+|\s+year to date|\s+today|\s+yesterday)*\s*[?.!]*\s*$`;
    const HOW_MUCH = new RegExp(String.raw`\bhow much (?:did|have|do) i (?:put|charge|charged|spend|spent|run up|use|used) on (?:my|the) (.+?)(\s+(?:card|account))?` + PERIOD_TAIL);
    const WHATS_ON = new RegExp(String.raw`^\s*(?:hey|hi|ok|okay|so|yo)?[,\s]*(?:what'?s|whats|what is|what did i put|what have i put|what'?ve i put|what went|show me what'?s) on my (.+?)(\s+(?:card|account))?` + PERIOD_TAIL);
    const ALL_CARDS = /\b(?:spending|spend|spent|purchases|charges|transactions)\s+(?:broken down\s+)?(?:by|per|on each|for each|across(?: all)?(?: my)?)\s+(?:credit\s+|debit\s+)?(?:card|account)s?\b|\bbreak (?:down )?my (?:spending|purchases|charges) (?:down )?by (?:card|account)\b/;
    const MOST = /\b(?:which|what) (?:credit |debit )?(?:card|account) (?:do|did|have) i (?:use|used|spend|spent|put|charge|charged)(?: (?:the )?most| on (?:the )?most)\b|\b(?:which|what) (?:card|account) (?:carries|has|gets) the most\b|\bmost used card\b/;
    // The card term the ask names ("" = my card(s) in general), or null when it doesn't name one.
    function cardTerm(words) {
      const w = String(words || "").toLowerCase();
      const m = w.match(HOW_MUCH) || w.match(WHATS_ON);
      if (!m) return null;
      const raw = m[1].trim();
      if (NOT_CARD.test(raw) || (!m[2] && !CARD_WORD.test(raw))) return null;
      return raw;
    }
    function ask(words) {
      const w = String(words || "").toLowerCase();
      if (ADVICE.test(w)) return null;
      if (ALL_CARDS.test(w) || MOST.test(w) || cardTerm(w) !== null) return "cards";
      if (isCompare(w)) return "compare";
      return null;
    }

    // ---- this month against last month and the average ----
    const STOP_TERM = /^(?:last|this|the|my|usual|normal|average|before|previous|prior|typical)\b/;
    function narrowing(words, rows) {
      const tg = MA.target(words);
      if (tg.kind === "category") return { what: ` on ${tg.cat.label}`, cat: tg.cat, keep: (r) => tg.cat.groups.includes(groupOf(r)) };
      if (tg.kind === "merchant" && !STOP_TERM.test(tg.term)) {
        const keep = (r) => MA.termMatch(r.merchant_raw, tg.term), seen = posted(rows).filter((r) => MA.isSpend(r) && keep(r));
        if (seen.length) return { what: ` at ${MA.display(seen[seen.length - 1].merchant_raw)}`, merchant: true, keep };
        return { what: "", keep: () => true, note: `No charge in your linked accounts mentions "${tg.term}", and it isn't a category I track, so here is all of your spending.` };
      }
      return { what: "", keep: () => true };
    }
    function monthsLabel(list, y) {
      if (list.length === 1) return `${MONTHS[list[0][1] - 1]}${list[0][0] !== y ? ` ${list[0][0]}` : ""}`;
      const a = list[list.length - 1], b = list[0], years = a[0] !== y || b[0] !== y;
      return `${MON[a[1] - 1]}${years ? ` ${a[0]}` : ""}-${MON[b[1] - 1]}${years ? ` ${b[0]}` : ""}`;
    }
    function compare(transactions, words, now, opts) { return withRules(opts, () => compareIn(transactions, words, now, opts)); }
    function compareIn(transactions, words, now, opts) {
      const tz = (opts && opts.tz) || "UTC", rows = transactions || [], today = MA.todayIn(now, tz);
      if (!posted(rows).length) return `I don't see any posted transactions in your linked accounts yet, so there's nothing to compare. ${MA.txSource(rows, tz)}`;
      const y = +today.slice(0, 4), m = +today.slice(5, 7), d = +today.slice(8, 10), start = earliest(rows);
      const cur = { from: `${y}-${pad(m)}-01`, to: addDays(today, 1) }; // a row dated tomorrow is this evening's
      const [py, pm] = back(y, m, 1), pd = Math.min(d, lastDay(py, pm)), prior = { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(pd)}` };
      const nw = narrowing(words, rows), keep = nw.keep, lines = [];
      if (nw.note) lines.push(nw.note);
      const now$ = net(rows, cur.from, cur.to, keep);
      const split = nw.cat && nw.cat.groups.length > 1 ? nw.cat.groups.map((g) => [g, net(rows, cur.from, cur.to, (r) => groupOf(r) === g).total]).filter((x) => x[1] > 0) : [];
      lines.push(`This month so far (${sameMonthRange(cur.from, today)}), you spent ${money(now$.total)}${nw.what}${split.length > 1 ? `: ${split.map(([g, c]) => `${money(c)} ${GROUP_LABEL[g]}`).join(", ")}` : ""}.${start > cur.from ? ` Your linked transactions start ${dateLabel(start, true)}, so this covers only from then.` : ""}`);
      // Same days of last month.
      const comparable = !(start > prior.to);
      if (!comparable) lines.push(`Your linked transactions start ${dateLabel(start, true)}, so there's nothing from last month to compare with yet.`);
      else {
        const then$ = net(rows, prior.from, prior.to, keep).total, diff = now$.total - then$;
        const days = `day ${d} vs day ${pd}${pd < d ? `, ${MONTHS[pm - 1]}'s last day` : ""}`;
        lines.push(`Same days last month (${sameMonthRange(prior.from, prior.to)}, ${days}): ${money(then$)}, so this month is ${diff === 0 ? "the same" : `${money(Math.abs(diff))} ${diff > 0 ? "more" : "less"}`}.${start > prior.from ? ` Your linked transactions start ${dateLabel(start, true)}, so last month's number may be missing a few days.` : ""}`);
      }
      // The last 3 full months on file, newest first; a month counts only when the linked history covers its 1st.
      const full = [];
      for (let k = 1; k <= 3; k++) { const [yy, mm] = back(y, m, k); if (start > `${yy}-${pad(mm)}-01`) break; full.push([yy, mm]); }
      if (!full.length) lines.push(`Your linked transactions start ${dateLabel(start, true)}, so there isn't a full month on file to average yet.`);
      else {
        const whole = full.map(([yy, mm]) => net(rows, `${yy}-${pad(mm)}-01`, `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}`, keep).total);
        const upTo = full.map(([yy, mm]) => net(rows, `${yy}-${pad(mm)}-01`, `${yy}-${pad(mm)}-${pad(Math.min(d, lastDay(yy, mm)))}`, keep).total);
        const avg = Math.round(whole.reduce((a, b) => a + b, 0) / full.length), avgTo = Math.round(upTo.reduce((a, b) => a + b, 0) / full.length), gap = now$.total - avgTo;
        const over = full.length === 3 ? "the last 3 full months" : `the ${full.length} full month${full.length === 1 ? "" : "s"} on file`;
        lines.push(`Your average over ${over} (${monthsLabel(full, y)}): ${money(avg)} a month${nw.what}, ${money(avgTo)} by day ${d}; this month is ${gap === 0 ? "right at that" : `${money(Math.abs(gap))} ${gap > 0 ? "above" : "below"} that`}.`);
      }
      // The three changes that moved most in dollars: by category group, or by place inside one group or a merchant.
      if (comparable) {
        const byPlace = nw.merchant || (nw.cat && nw.cat.groups.length === 1);
        const keyOf = byPlace ? (r) => MA.display(r.merchant_raw) : (r) => (groupOf(r) ? GROUP_LABEL[groupOf(r)] : null);
        const a = byKey(rows, cur.from, cur.to, keep, keyOf), b = byKey(rows, prior.from, prior.to, keep, keyOf);
        const moves = [...new Set([...a.keys(), ...b.keys()])].map((k) => [k, a.get(k) || 0, b.get(k) || 0]).filter(([, x, z]) => x !== z)
          .sort((p, q) => Math.abs(q[1] - q[2]) - Math.abs(p[1] - p[2]) || p[0].localeCompare(q[0])).slice(0, 3);
        if (moves.length) lines.push(`Biggest changes from the same days last month: ${moves.map(([k, x, z]) => `${k} ${x > z ? "up" : "down"} ${money(Math.abs(x - z))} (${money(x)} vs ${money(z)})`).join(", ")}.`);
      }
      if (now$.refunded > 0) lines.push(`Refunds taken off: ${money(now$.refunded)}.`);
      const pend = pendingOf(rows, cur.from, cur.to, keep), fx = foreignOf(rows, cur.from, cur.to, keep);
      if (pend.length) lines.push(`Pending, not added yet: ${pendingText(pend)}.`);
      if (fx.length) lines.push(`In another currency, not added: ${foreignText(fx)}.`);
      if (!nw.merchant) {
        // What the person's own rules moved into the totals this month, said with its amount.
        const ruled = MA.ruleLine(posted(rows).filter((r) => within(r, cur.from, cur.to) && keep(r) && (MA.isSpend(r) || isRefund(r))), RULES);
        if (ruled) lines.push(ruled);
        const unc = net(rows, cur.from, cur.to, (r) => groupOf(r) === null).total;
        if (unc > 0 && nw.cat) lines.push(`${money(unc)} of your other spending this month matched no category I know, so none of it is counted as ${nw.cat.label}.`);
        else if (unc > 0) {
          const was = comparable ? net(rows, prior.from, prior.to, (r) => groupOf(r) === null).total : null;
          lines.push(`${money(unc)} of this month's spending matched no category I know${was === null ? "" : was > 0 ? ` (${money(was)} the same days last month)` : " (none the same days last month)"}, so it's in the totals but not in the changes.`);
        }
      }
      lines.push(MA.txSource(rows, tz, "Transfers and card payments are left out."));
      return lines.join("\n");
    }

    // ---- spending by card ----
    // The account's name as stored, never a full number: a run of 5 or more digits is dropped; the last 4 only from a mask.
    function nameOf(a) {
      const n = String(MA.acctName(a)).replace(/(?:\d[ -]?){5,}/g, " ").replace(/\s+/g, " ").trim() || "Account";
      const digits = String(a.mask || "").replace(/\D/g, "");
      return digits.length >= 2 ? `${n} (ending ${digits.slice(-4)})` : n;
    }
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const ALIASES = [["amex", "american express"], ["capital one", "cap one"], ["bank of america", "bofa", "boa"], ["wells fargo", "wf"], ["citi", "citibank"], ["us bank", "usbank"]];
    function matchAccounts(term, accounts) {
      const t = norm(term).replace(/\b(?:credit|cards?|accounts?|the|my)\b/g, " ").replace(/\s+/g, " ").trim();
      if (!t || t === "debit") {
        const want = t === "debit" ? ["checking"] : ["credit"], hit = accounts.filter((a) => want.includes(MA.kindOf(a)));
        return hit.length ? hit : accounts;
      }
      const variants = [t].concat(...ALIASES.filter((g) => g.includes(t)).map((g) => g.filter((x) => x !== t)));
      return accounts.filter((a) => { const hay = ` ${norm(`${a.institution || ""} ${a.name || ""}`)} `; return variants.some((v) => hay.includes(` ${v} `)); });
    }
    const TAIL = "Transfers and card payments are left out, so a card paid from checking isn't counted twice.";
    function byCard(accounts, transactions, words, now, opts) { return withRules(opts, () => byCardIn(accounts, transactions, words, now, opts)); }
    function byCardIn(accounts, transactions, words, now, opts) {
      const tz = (opts && opts.tz) || "UTC", rows = transactions || [], today = MA.todayIn(now, tz), w = String(words || "").toLowerCase();
      const list = (accounts || []).filter((a) => a && a.status !== "disconnected");
      if (!posted(rows).length) return `I don't see any posted transactions in your linked accounts yet, so I can't split your spending by card. ${MA.txSource(rows, tz)}`;
      const p = MA.period(w, now, tz), to = p.to === today ? addDays(today, 1) : p.to, short = p.label.replace(/ \(.*\)$/, ""), start = earliest(rows);
      if (start > to) return `Your linked transactions start ${dateLabel(start, true)}, so I can't see ${p.label}: there's nothing from then to add up.\n${MA.txSource(rows, tz, TAIL)}`;
      const tg = MA.target(w), cat = tg.kind === "category" ? tg.cat : null, inCat = (r) => !cat || cat.groups.includes(groupOf(r));
      const known = new Set(list.map((a) => a.account_id));
      const keys = list.map((a) => ({ id: a.account_id, name: nameOf(a), card: MA.kindOf(a) === "credit", keep: (r) => r.account_id === a.account_id && inCat(r) }));
      if (posted(rows).some((r) => !known.has(r.account_id))) keys.push({ id: null, name: "An account that's no longer linked", card: false, keep: (r) => !known.has(r.account_id) && inCat(r) });
      const tally = keys.map((k) => ({ ...k, ...net(rows, p.from, to, k.keep), top: topPlaces(rows, p.from, to, k.keep), pending: pendingOf(rows, p.from, to, k.keep), foreign: foreignOf(rows, p.from, to, k.keep) }));
      const whole = tally.reduce((s, t) => s + t.total, 0), share = (c) => (whole > 0 ? `${Math.round((c * 100) / whole)}%` : null);
      const topText = (t) => t.top.map(([n, c]) => `${n} ${money(c)}`).join(", ");
      const partial = start > p.from ? ` Your linked transactions start ${dateLabel(start, true)}, so this covers only from then.` : "";
      const term = cardTerm(w), lines = [];
      let shown = tally;
      if (term !== null) {
        const hit = new Set(matchAccounts(term, list).map((a) => a.account_id));
        shown = tally.filter((t) => hit.has(t.id));
        if (!shown.length) return `I don't see a linked card or account called "${term.replace(/\s+(?:card|account)$/, "")}". Your linked accounts: ${list.map(nameOf).join(", ")}.\n${MA.txSource(rows, tz)}`;
        for (const t of shown) {
          if (t.total === 0 && !t.refunded) { lines.push(`${t.name}: nothing posted ${p.label}${cat ? ` on ${cat.label}` : ""}.${partial}`); continue; }
          lines.push(`${t.name}: ${money(t.total)}${cat ? ` on ${cat.label}` : ""} ${p.label}${share(t.total) ? `, ${share(t.total)} of the ${money(whole)} you spent${cat ? ` on ${cat.label}` : ""} across your accounts` : ""}.${t.top.length ? ` Top: ${topText(t)}.` : ""}${partial}`);
        }
        const one = shown.length === 1;
        const ref = shown.filter((t) => t.refunded > 0), pend = shown.filter((t) => t.pending.length), fx = shown.filter((t) => t.foreign.length);
        if (ref.length) lines.push(`Refunds taken off: ${ref.map((t) => `${one ? "" : `${t.name} `}${money(t.refunded)}`).join(", ")}.`);
        if (pend.length) lines.push(`Pending, not added yet: ${pend.map((t) => `${one ? "" : `${t.name} `}${pendingText(t.pending)}`).join(", ")}.`);
        if (fx.length) lines.push(`In another currency, not added: ${fx.map((t) => `${one ? "" : `${t.name} `}${foreignText(t.foreign)}`).join(", ")}.`);
        lines.push(MA.txSource(rows, tz, TAIL));
        return lines.join("\n");
      }
      const spent = tally.filter((t) => t.total !== 0 || t.refunded > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      if (MOST.test(w) && spent.length && spent[0].total > 0) lines.push(`Most of it went on ${spent[0].name}: ${money(spent[0].total)} of the ${money(whole)} you spent${cat ? ` on ${cat.label}` : ""} ${p.label}${share(spent[0].total) ? `, ${share(spent[0].total)}` : ""}.${partial}`);
      else lines.push(`Spending${cat ? ` on ${cat.label}` : ""} by card and account ${p.label}, ${money(whole)} in all:`);
      for (const t of spent) lines.push(`- ${t.name}: ${money(t.total)}${share(t.total) ? `, ${share(t.total)}` : ""}${t.top.length ? ` (top: ${topText(t)})` : ""}`);
      if (partial && !MOST.test(w)) lines.push(partial.trim());
      const idle = tally.filter((t) => t.card && t.total === 0 && !t.refunded);
      if (idle.length) lines.push(`Nothing posted on ${idle.map((t) => t.name).join(", ")} ${short}.`);
      const ref = tally.filter((t) => t.refunded > 0), pend = tally.filter((t) => t.pending.length), fx = tally.filter((t) => t.foreign.length);
      if (ref.length) lines.push(`Refunds taken off: ${ref.map((t) => `${t.name} ${money(t.refunded)}`).join(", ")}.`);
      if (pend.length) lines.push(`Pending, not added yet: ${pend.map((t) => `${t.name} ${pendingText(t.pending)}`).join(", ")}.`);
      if (fx.length) lines.push(`In another currency, not added: ${fx.map((t) => `${t.name} ${foreignText(t.foreign)}`).join(", ")}.`);
      if (cat) {
        const unc = net(rows, p.from, to, (r) => groupOf(r) === null).total;
        if (unc > 0) lines.push(`${money(unc)} of your other spending in that period matched no category I know, so none of it is counted as ${cat.label}.`);
      }
      lines.push(MA.txSource(rows, tz, TAIL));
      return lines.join("\n");
    }

    // ---- one merchant, trailing windows (Wave 1 C6: "how much am I spending on DoorDash, really?") ----
    // The merchant the words name: what MoneyAnswers.target reads after "on/at/for/with", or a known merchant named
    // anywhere in the ask. A category ("food") is not a merchant. merchantAsk is the routing predicate: conservative,
    // a known merchant only, no advice, and never when the compare/cards views take the ask — the chat's money answers
    // route it as their own kind (money_answers.ts) and answer with merchantSpend.
    function merchantTermOf(words) {
      const tg = MA.target(words);
      if (tg.kind === "merchant") return tg.term;
      if (tg.kind === "category") return null;
      const w = ` ${String(words || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ")} `;
      for (const [, name] of MA.MERCHANT_NAMES) if (name && name.length >= 4 && w.includes(` ${name.toLowerCase()} `)) return name.toLowerCase();
      return null;
    }
    function merchantAsk(words) {
      const w = String(words || "").toLowerCase();
      if (ADVICE.test(w) || ask(words)) return null;
      // A pasted offer or promo ("Fwd: Your new Amex Offers… Spend $100 or more, earn $20 back, Expires…") names a
      // merchant and says "spend", but it is the card-offers answer's text, not a question about the person's own
      // spending (routing corpus, 2026-10-12).
      if (/^\s*(?:fwd|fw):/i.test(String(words || "")) || /\b(?:spend|buy) \$?[\d,]+(?:\.\d{2})? or more\b/.test(w) || /\bearn\b[^.]*\bback\b/.test(w) || /\boffers?\s*:/.test(w)) return null;
      if (!/\bspen(?:d|ds|ding|t)\b/.test(w)) return null;
      const term = merchantTermOf(words);
      if (!term) return null;
      return MA.MERCHANT_NAMES.some(([, name]) => name && MA.termMatch(name, term)) ? term : null;
    }
    const rangeOf = (from, to) => (from.slice(0, 4) !== to.slice(0, 4) ? `${dateLabel(from, true)}-${dateLabel(to, true)}` : `${dateLabel(from)}-${dateLabel(to)}`);
    // Merchant-level totals across every linked account (the rows are read whole; no account is singled out): the
    // trailing 30 and 90 days against the equal period before each, an order count and a per-order average for both.
    // Charges minus that merchant's refunds; pending said and not added — the same rules as compare() and byCard().
    function merchantSpend(transactions, words, now, opts) { return withRules(opts, () => merchantSpendIn(transactions, words, now, opts)); }
    function merchantSpendIn(transactions, words, now, opts) {
      const tz = (opts && opts.tz) || "UTC", rows = transactions || [], today = MA.todayIn(now, tz), term = merchantTermOf(words);
      if (!term) return null;
      const extra = "Transfers, card payments and pending charges are left out.";
      const keep = (r) => { if (MA.termMatch(r.merchant_raw, term)) return true; const c = MA.classify(r.merchant_raw, RULES); return !!(c && c.name && MA.termMatch(c.name, term)); };
      const charges = posted(rows).filter((r) => keep(r) && MA.isSpend(r));
      if (!charges.length) return `No charge in your linked accounts mentions "${term}", so I won't guess at a total.\n${MA.txSource(rows, tz, extra)}`;
      const name = MA.display(charges[charges.length - 1].merchant_raw), start = earliest(rows);
      const win = (days) => {
        const to = today, from = addDays(today, -(days - 1)), priorTo = addDays(from, -1), priorFrom = addDays(priorTo, -(days - 1));
        const count = (f, t) => posted(rows).filter((r) => within(r, f, t) && keep(r) && MA.isSpend(r)).length;
        return { from, to, priorFrom, priorTo, cur: net(rows, from, to, keep), cnt: count(from, to), pri: net(rows, priorFrom, priorTo, keep), pcnt: count(priorFrom, priorTo) };
      };
      const trend = (w, days) => {
        if (start && start > w.priorTo) return `Your linked transactions start ${dateLabel(start, true)}, so there's no earlier ${days} days to compare with yet.`;
        const d = w.cur.total - w.pri.total, caveat = start && start > w.priorFrom ? ` Your linked transactions start ${dateLabel(start, true)}, so that earlier total may be missing a few days.` : "";
        if (d === 0) return `That's the same as the ${days} days before (${rangeOf(w.priorFrom, w.priorTo)}): ${money(w.pri.total)} (${w.pcnt} order${w.pcnt === 1 ? "" : "s"}).${caveat}`;
        return `That's ${money(Math.abs(d))} ${d > 0 ? "more" : "less"} than the ${days} days before (${rangeOf(w.priorFrom, w.priorTo)}), when it was ${money(w.pri.total)} (${w.pcnt} order${w.pcnt === 1 ? "" : "s"}).${caveat}`;
      };
      const avg = (w) => (w.cnt ? Math.round(w.cur.total / w.cnt) : 0);
      const w30 = win(30), w90 = win(90), lines = [];
      lines.push(`${name}: ${money(w30.cur.total)} in the last 30 days (${rangeOf(w30.from, w30.to)}), ${w30.cnt} order${w30.cnt === 1 ? "" : "s"}, ${money(avg(w30))} an order on average, across all your linked accounts.`);
      lines.push(trend(w30, 30));
      lines.push(`Last 90 days (${rangeOf(w90.from, w90.to)}): ${money(w90.cur.total)}, ${w90.cnt} order${w90.cnt === 1 ? "" : "s"}, ${money(avg(w90))} an order on average.`);
      lines.push(trend(w90, 90));
      if (w90.cur.refunded > 0) lines.push(`Refunds taken off: ${money(w90.cur.refunded)}.`);
      const pend = pendingOf(rows, w90.from, w90.to, keep);
      if (pend.length) lines.push(`Pending, not added yet: ${pendingText(pend)}.`);
      lines.push(MA.txSource(rows, tz, extra));
      return lines.join("\n");
    }

    return { ask, cardTerm, compare, byCard, matchAccounts, merchantAsk, merchantSpend };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = SpendingViews;
