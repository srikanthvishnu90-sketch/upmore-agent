  /* "What subscriptions do I have?" (megadoc J03; capability list section 3 inventory, BILL-001 in chat). Read-only, from
     the person's own rows: the charges that repeat (AgentLedger.recurring, 57-agent-ledger.js) at services the chat counts
     as subscriptions (MoneyAnswers.classify with the person's category rules, the same as "how much did I spend on
     subscriptions") or that the ledger files as subscriptions.
       ask(words)                               the ask, or null
       answer(transactions, words, now, opts)   each one with its latest charge to the cent, how often, when last charged
                                                (and the earlier price when it changed), one with no charge for a full
                                                cycle and a week said as possibly ended, the monthly and yearly total,
                                                what can't show (a new one before its second charge, a card not linked)
     Nothing is cancelled here: the cancel flow is named, and it asks for its own yes. opts.tz sets the person's today;
     opts.rules are their category rules. Pure: rows and the clock are passed in. Depth packet SUBS-LIST. */
  const SubscriptionList = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const LG = typeof AgentLedger !== "undefined" ? AgentLedger : require("./57-agent-ledger.js");
    const DAY = 86400000, LOOKBACK = 400;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const money = MA.money;
    const cents = (r) => (r && r.amount_cents !== null && r.amount_cents !== undefined && Number.isFinite(Number(r.amount_cents)) ? Math.round(Number(r.amount_cents)) : NaN);
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const label = (ymd) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;
    // How often, and what one charge comes to in a month (exact cents: a yearly $99.00 is $8.25 a month).
    const EVERY = { weekly: ["a week", 52, 12], biweekly: ["every 2 weeks", 26, 12], semimonthly: ["twice a month", 24, 12], monthly: ["a month", 1, 1], quarterly: ["a quarter", 1, 3], yearly: ["a year", 1, 12] };
    const GRACE = { weekly: 7, biweekly: 7, semimonthly: 7, monthly: 7, quarterly: 14, yearly: 30 };

    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|pls|please|quick q:?|upmore)[,\s]+)*(?:(?:can|could) (?:you|u) (?:please )?|please )?/i;
    const ASK = /^(?:(?:what|which) subscriptions (?:do i have|am i paying(?: for)?|do i pay(?: for)?|are (?:on|charging) my (?:card|cards|account|accounts))|(?:list|show|give|tell)(?: me)? (?:all )?(?:of )?my subscriptions|(?:all )?my subscriptions|what am i subscribed to|what (?:am i|do i) pay(?:ing)? for every month|how many subscriptions (?:do i have|am i paying(?: for)?)|(?:what are )?my (?:recurring|monthly) (?:subscriptions|charges)(?: list)?)(?:\s+(?:right now|now|currently|these days))?$/;
    function ask(words) {
      const t = String(words || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
      return t && t.length <= 100 && ASK.test(t) ? { all: true } : null;
    }

    function answer(transactions, words, now, opts) {
      const q = typeof words === "string" ? ask(words) : words;
      if (!q) return null;
      const tz = (opts && opts.tz) || "UTC", rules = (opts && opts.rules) || null, today = MA.todayIn(now, tz);
      const src = MA.txSource(transactions, tz);
      const posted = (transactions || []).filter((r) => r && !r.is_pending && (!r.currency || String(r.currency).toUpperCase() === "USD") && typeof r.posted_on === "string" && Number.isFinite(cents(r)));
      if (!posted.length) return `I don't see any posted transactions in your linked accounts yet, so I can't list your subscriptions. ${src}`;
      const from = addDays(today, -LOOKBACK);
      const rows = posted.filter((r) => r.posted_on.slice(0, 10) >= from && r.posted_on.slice(0, 10) <= addDays(today, 1))
        .map((r) => ({ id: String(r.provider_transaction_id == null ? "" : r.provider_transaction_id), account_id: r.account_id, amount_cents: cents(r), posted_at: r.posted_on.slice(0, 10), merchant_raw: String(r.merchant_raw || ""), is_transfer: !!r.is_transfer }));
      const enriched = LG.enrich(rows);
      const subs = [];
      for (const rec of LG.recurring(rows, today)) {
        if (rec.direction !== "debit" || !EVERY[rec.cadence]) continue;
        const mine = enriched.filter((t) => t.merchant_key === rec.key && t.amount_cents < 0).sort((a, b) => a.posted_at.localeCompare(b.posted_at));
        if (!mine.length) continue;
        const last = mine[mine.length - 1], c = MA.classify(last.merchant_raw, rules);
        if (!((c && c.group === "subscriptions") || (!c && rec.category === "subscriptions"))) continue;
        const prev = mine.length > 1 ? mine[mine.length - 2] : null;
        const lapsed = addDays(rec.next_expected, GRACE[rec.cadence]) < today;
        const [word, n, per] = EVERY[rec.cadence];
        subs.push({ name: (c && c.name) || rec.merchant, last, prev, cadence: rec.cadence, word, monthly: Math.round((-last.amount_cents * n) / per), lapsed, next: rec.next_expected });
      }
      if (!subs.length) return `I don't see any subscriptions repeating in your linked accounts. A new one shows after its second charge, and one billed to a card that isn't linked can't show here.\n${src}`;
      subs.sort((a, b) => Number(a.lapsed) - Number(b.lapsed) || b.monthly - a.monthly || a.name.localeCompare(b.name));
      const active = subs.filter((s) => !s.lapsed), ended = subs.filter((s) => s.lapsed);
      const line = (s) => `- ${s.name}: ${money(-s.last.amount_cents)} ${s.word}, last charged ${label(s.last.posted_at)}${s.prev && s.prev.amount_cents !== s.last.amount_cents ? ` (it was ${money(-s.prev.amount_cents)} before)` : ""}`;
      const lines = [];
      if (active.length) {
        const m = active.reduce((a, s) => a + s.monthly, 0);
        lines.push(`${active.length === 1 ? "1 subscription repeats" : `${active.length} subscriptions repeat`} in your linked accounts, about ${money(m)} a month (${money(m * 12)} a year):`);
        for (const s of active) lines.push(line(s));
      }
      if (ended.length) {
        lines.push(`${ended.length === 1 ? "This one hasn't" : "These haven't"} charged for a full cycle, so ${ended.length === 1 ? "it" : "they"} may have ended:`);
        for (const s of ended) lines.push(`${line(s)}; expected about ${label(s.next)}`);
      }
      lines.push(`A new subscription shows after its second charge, and one billed to a card that isn't linked can't show here. Say "cancel ${(active[0] || subs[0]).name}" to start a cancellation; nothing is cancelled until you say yes to it.`);
      lines.push(src);
      return lines.join("\n");
    }
    return { ask, answer };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = SubscriptionList;
