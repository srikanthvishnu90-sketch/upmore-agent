  /* "Find me a better savings rate" (megadoc M05): Upmore has no verified, dated source for today's savings rates, so it
     never names a bank or a rate (the chat model would). What it can say is what the person's own savings earned, from
     their rows. Read-only.
       ask(words)                                     null | { kind: "better" | "mine" }
       answer(accounts, transactions, words, now, opts)   opts: { tz }
     For each linked savings account (USD, not disconnected): the interest it was paid in the last full calendar month
     (positive rows on that account whose description reads as interest), and that amount times 12 over today's balance
     as a rough yearly rate, said as rough (the balance may have moved in the month; no compounding). No interest row is
     said as none, never as 0%. Then what changing means: comparing the rate the bank shows with banks' own pages, and
     opening a new account themselves; Upmore opens no accounts and moves nothing. Pure. Depth packet SAVINGS-RATE. */
  const SavingsRate = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const money = MA.money;
    const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|um|upmore|pls|please|can you|could you)[,\s]+)*/i;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    const BETTER = /\b(?:find|show|get|need|want|is there|are there|where (?:can i get|is))(?: me)? (?:a )?(?:better|higher|best|good|bigger)(?: savings| hysa| high[- ]yield(?: savings)?)? (?:savings )?(?:rate|apy|interest(?: rate)?|account)s?\b|\b(?:better|higher|best|good) (?:savings|hysa|high[- ]yield(?: savings)?)(?: account)? (?:rates?|apys?|interest(?: rates?)?)\b|\bbest (?:hysa|high[- ]yield savings(?: account)?)\b/;
    const MINE = /\bwhat (?:apy|interest(?: rate)?|rate) (?:am i getting|do i get|does my savings (?:pay|earn|get)|is my savings (?:getting|earning|paying))\b|\bhow much interest (?:does|did|is) my savings\b|\bis my savings (?:rate|apy|interest) (?:good|bad|low|ok|any good)\b|\bwhat(?:'s| is) my savings (?:rate|apy|interest rate)\b/;
    const NOT = /\b(?:mortgage|credit card|card|loan|car|auto|cd|refinanc|student)\b/;
    function ask(words) {
      const t = clean(words);
      if (!t || t.length > 140 || NOT.test(t)) return null;
      if (MINE.test(t)) return { kind: "mine" };
      if (BETTER.test(t) && /\b(?:savings|hysa|high[- ]yield|apy)\b/.test(t)) return { kind: "better" };
      return null;
    }
    const INTEREST = /\binterest\b|\bint\.? ?(?:pd|paid|pymt|pmt|payment|earned|credit|cr)\b|\bdividend\b|\bapy (?:earned|paid)\b/i;
    const cents = (r) => (r && Number.isSafeInteger(Number(r.amount_cents)) ? Number(r.amount_cents) : NaN);
    function answer(accounts, transactions, words, now, opts) {
      const q = typeof words === "string" ? ask(words) : words;
      if (!q) return null;
      const tz = (opts && opts.tz) || "UTC", today = MA.todayIn(now, tz), src = MA.txSource(transactions || [], tz);
      const y = +today.slice(0, 4), m = +today.slice(5, 7), lm = m === 1 ? 12 : m - 1, ly = m === 1 ? y - 1 : y;
      const ym = `${ly}-${String(lm).padStart(2, "0")}`, month = MON[lm - 1];
      const lines = [];
      if (q.kind === "better") lines.push("I don't have a verified, dated source for today's savings rates, so I won't name banks or rates.");
      const sav = (accounts || []).filter((a) => a && a.status !== "disconnected" && MA.kindOf(a) === "savings" && (!a.currency || String(a.currency).toUpperCase() === "USD"));
      if (!sav.length) {
        lines.push("I don't see a linked savings account, so I can't say what yours earns.");
      } else {
        const rows = (transactions || []).filter((r) => r && !r.is_pending && typeof r.posted_on === "string" && Number.isFinite(cents(r)) && cents(r) > 0 && INTEREST.test(String(r.merchant_raw || "")));
        const first = (transactions || []).map((r) => r && r.posted_on).filter((d) => typeof d === "string").sort()[0];
        for (const a of sav) {
          const name = `${a.name}${a.institution ? ` (${a.institution})` : ""}`;
          const paid = rows.filter((r) => r.account_id === a.account_id && r.posted_on.startsWith(ym)).reduce((s, r) => s + cents(r), 0);
          const bal = Number(a.balance_cents);
          if (!first || first > `${ym}-01`) { lines.push(`Your linked transactions don't cover all of ${month}, so I can't say what ${name} paid in interest.`); continue; }
          if (paid <= 0) { lines.push(`No interest payment shows on ${name} in ${month}.`); continue; }
          const rate = Number.isFinite(bal) && bal > 0 ? Math.round((paid * 12 / bal) * 1000) / 10 : null;
          lines.push(`${name} paid ${money(paid)} in interest in ${month}${rate !== null ? `; times 12 over today's ${money(bal)} balance, that's roughly ${rate.toFixed(1)}% a year (rough: the balance may have moved during the month)` : ""}.`);
        }
      }
      lines.push("To compare, check the rate your bank shows for your account against banks' own pages; switching means opening a new account yourself and moving the money. Upmore doesn't open accounts, and nothing was moved.");
      lines.push(src);
      return lines.join("\n");
    }
    return { ask, answer };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = SavingsRate;
