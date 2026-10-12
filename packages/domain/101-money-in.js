  /* Money coming in, from the person's own rows (megadoc M04 "how much am I earning on savings", C08 "did maya pay me
     back?"). Read-only, numbers only:
       ask(words)                               { kind: "interest" } | { kind: "paid", name, amount_cents } | null
       answer(accounts, transactions, words, now, opts)
     Interest: credits whose bank text says interest (never a charge, never "interest charge" or a card's interest) this
     year so far and over the last 12 months, by account, last month apart; the rate is not in bank rows and is never
     made up. A payment from a person: credits in the last 60 days whose text names them (whole word), to the cent, with
     the app it came through when the text says (Zelle, Venmo, Cash App, PayPal); none found says that Venmo, Cash App and
     PayPal money stays in the app until moved to the bank. opts.tz sets the person's today. Pure. Depth packet MONEY-IN. */
  const MoneyIn = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const DAY = 86400000, PAID_WINDOW = 60;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const money = MA.money;
    const cents = (r) => (r && r.amount_cents !== null && r.amount_cents !== undefined && Number.isFinite(Number(r.amount_cents)) ? Math.round(Number(r.amount_cents)) : NaN);
    const usd = (r) => !r.currency || String(r.currency).toUpperCase() === "USD";
    const dayOf = (r) => (typeof r.posted_on === "string" ? r.posted_on.slice(0, 10) : null);
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const label = (ymd, y) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}${y ? `, ${ymd.slice(0, 4)}` : ""}`;
    const key = (s) => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const INTEREST = /\binterest\b|\bint (?:paid|earned|pymt|payment|credit)\b|\bdividend earned\b/i;
    const NOT_INTEREST = /\binterest charge|\bcharge on purchases|\bfinance charge|\bpurchase interest|\bcash advance interest|\binterest adj/i;
    const APPS = [["Zelle", /\bzelle\b/i], ["Venmo", /\bvenmo\b/i], ["Cash App", /\bcash ?app\b|\bsquare cash\b/i], ["PayPal", /\bpaypal\b/i], ["Apple Cash", /\bapple cash\b/i]];

    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|quick q:?|upmore)[,\s]+)*/i;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    const INTEREST_ASK = /^(?:how much (?:interest )?(?:am i|have i been|did i|do i|have i) (?:earn(?:ing|ed)?|make|making|made|get(?:ting)?|got)(?: in interest)? (?:on|from) (?:my )?(?:savings|savings account|hysa|high[- ]yield savings|cash)|how much interest (?:am i|have i|did i|do i) (?:earn(?:ing|ed)?|make|making|made|get(?:ting)?|got)(?: this year| last month| so far)?|(?:what'?s|whats|what is|show me) my (?:savings )?interest(?: earned| income)?(?: this year| so far)?|(?:my )?interest (?:earned|income)(?: this year| so far)?)(?:\s+(?:this year|so far|lately|per month|a month))?$/;
    // "did maya pay me back", "has jake paid me", "did i get the $20 from jake", "did sam send me the money"
    const PAID_ASKS = [
      /^(?:did|has|have)\s+([a-z][a-z'.-]*(?:\s[a-z][a-z'.-]*)?)\s+(?:pay|paid|send|sent|venmo|venmoed|zelle|zelled)\s+(?:me|us)(?:\s+back)?(?:\s+(?:the|my)\s+(?:money|cash|\$?\d[\d,]*(?:\.\d{2})?))?(?:\s+(?:back|yet))*$/,
      /^(?:did|have)\s+i\s+(?:get|got|receive|received)\s+(?:the|my)?\s*(\$?\d[\d,]*(?:\.\d{2})?\s+)?(?:back\s+)?from\s+([a-z][a-z'.-]*(?:\s[a-z][a-z'.-]*)?)(?:\s+yet)?$/,
    ];
    const NOT_A_PERSON = /^(?:it|they|them|he|she|you|my bank|the bank|amazon|my employer|work|the irs|irs|my boss)$/;
    function ask(words) {
      const t = clean(words);
      if (!t || t.length > 120) return null;
      if (INTEREST_ASK.test(t)) return { kind: "interest" };
      let m = PAID_ASKS[0].exec(t);
      if (m && !NOT_A_PERSON.test(m[1])) { const a = /\$?(\d[\d,]*(?:\.\d{2})?)/.exec(t.slice(m.index + m[0].indexOf(m[1]) + m[1].length)); return { kind: "paid", name: m[1], amount_cents: a ? Math.round(Number(a[1].replace(/,/g, "")) * 100) : null }; }
      m = PAID_ASKS[1].exec(t);
      if (m && !NOT_A_PERSON.test(m[2])) { const a = m[1] ? /(\d[\d,]*(?:\.\d{2})?)/.exec(m[1]) : null; return { kind: "paid", name: m[2], amount_cents: a ? Math.round(Number(a[1].replace(/,/g, "")) * 100) : null }; }
      return null;
    }

    const cap = (s) => String(s).replace(/(^|[\s'.-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
    function answer(accounts, transactions, words, now, opts) {
      const q = typeof words === "string" ? ask(words) : words;
      if (!q) return null;
      const tz = (opts && opts.tz) || "UTC", today = MA.todayIn(now, tz), src = MA.txSource(transactions, tz);
      const rows = (transactions || []).filter((r) => r && usd(r) && !r.is_pending && dayOf(r) && Number.isFinite(cents(r)));
      if (!rows.length) return `I don't see any posted transactions in your linked accounts yet, so I can't tell. ${src}`;
      const start = rows.map(dayOf).sort()[0], tomorrow = addDays(today, 1);
      const acct = (id) => { const a = (accounts || []).find((x) => x && x.account_id === id); return a ? MA.acctName(a) : "an account"; };
      if (q.kind === "interest") {
        const credits = rows.filter((r) => cents(r) > 0 && INTEREST.test(String(r.merchant_raw || "")) && !NOT_INTEREST.test(String(r.merchant_raw || "")) && dayOf(r) <= tomorrow);
        const y0 = `${today.slice(0, 4)}-01-01`, from12 = addDays(today, -365);
        const ytd = credits.filter((r) => dayOf(r) >= y0), last12 = credits.filter((r) => dayOf(r) > from12);
        const sum = (list) => list.reduce((a, r) => a + cents(r), 0);
        const lm = (() => { const y = +today.slice(0, 4), m = +today.slice(5, 7), py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return `${py}-${String(pm).padStart(2, "0")}`; })();
        const lastMonth = credits.filter((r) => dayOf(r).startsWith(lm));
        if (!last12.length) return `I don't see any interest paid into your linked accounts since ${label(start > from12 ? start : from12, true)}. The rate isn't in your bank rows, so I can't say what it would be.\n${src}`;
        const by = new Map(); for (const r of ytd) by.set(r.account_id, (by.get(r.account_id) || 0) + cents(r));
        const lines = [`Interest paid to you this year so far: ${money(sum(ytd))}${by.size > 1 ? ` (${[...by.entries()].sort((a, b) => b[1] - a[1]).map(([id, c]) => `${acct(id)} ${money(c)}`).join(", ")})` : by.size === 1 ? `, into ${acct([...by.keys()][0])}` : ""}.${start > y0 ? ` Your linked transactions start ${label(start, true)}, so this covers only from then.` : ""}`];
        lines.push(`Last 12 months: ${money(sum(last12))}. Last month (${MON[+lm.slice(5, 7) - 1]}): ${money(sum(lastMonth))}.`);
        lines.push("The rate isn't in your bank rows, so I can't say it from them.");
        lines.push(src);
        return lines.join("\n");
      }
      // A payment from a person.
      const name = key(q.name), from = addDays(today, -PAID_WINDOW), since = start > from ? start : from;
      const credits = rows.filter((r) => cents(r) > 0 && dayOf(r) >= from && dayOf(r) <= tomorrow && !r.is_transfer && ` ${key(r.merchant_raw)} `.includes(` ${name} `));
      credits.sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || cents(b) - cents(a));
      const via = (r) => { const a = APPS.find(([, re]) => re.test(String(r.merchant_raw || ""))); return a ? ` (${a[0]})` : ""; };
      // The bank's own words for the payment (display-safe), so the person can see it's the Maya they mean.
      const line = (r) => `${money(cents(r))} on ${label(dayOf(r))}${via(r)}, "${MA.display(r.merchant_raw)}"`;
      const who = cap(q.name), lines = [];
      if (q.amount_cents != null) {
        const exact = credits.filter((r) => cents(r) === q.amount_cents);
        if (exact.length) lines.push(`Yes: ${who} sent ${line(exact[0])}.`);
        else lines.push(`I don't see ${money(q.amount_cents)} from ${who} since ${label(since)}.${credits.length ? ` There ${credits.length === 1 ? "is a different payment" : "are other payments"} from ${who}: ${credits.slice(0, 3).map(line).join("; ")}.` : ""}`);
        if (!exact.length) lines.push("Venmo, Cash App and PayPal money stays in the app until it's moved to your bank, so check there too.");
      } else if (credits.length) {
        lines.push(`Yes: ${credits.slice(0, 3).map((r) => `${who} sent ${line(r)}`).join("; ")}.`);
      } else {
        lines.push(`I don't see a payment from ${who} in your linked accounts since ${label(since)}.`);
        lines.push("Venmo, Cash App and PayPal money stays in the app until it's moved to your bank, so check there too.");
      }
      lines.push(src);
      return lines.join("\n");
    }
    return { ask, answer };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = MoneyIn;
