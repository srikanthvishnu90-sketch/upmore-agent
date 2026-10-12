  /* "I want to save 10000 by June" (megadoc M06): the arithmetic of a savings target, from the person's own rows.
     Read-only; nothing is moved, set aside or saved as a goal.
       ask(words)                                       null | { amount_cents, when }   (when null if no date said)
       answer(accounts, transactions, words, now, opts)
     The target date: a month ("by June" is its last day, the next one to come), a month and day ("by June 15", "6/15"),
     "the end of the year", "in 6 months". No date said is asked, never assumed. Per month: the amount over the calendar
     months from next month through the target's (this month too when the target is in it), and per week. What the
     person keeps: money in minus money out over the last full calendar months their rows cover (up to 3; transfers and
     card payments left out), said as an average; at that pace, where they'd be by the date. Their savings balances are
     said, never assumed to be for this. Pure. Depth packet SAVE-GOAL. */
  const SaveGoal = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const money = MA.money, DAY = 86400000;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const pad = (n) => String(n).padStart(2, "0");
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const label = (ymd, today) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}${!today || today.slice(0, 4) !== ymd.slice(0, 4) ? `, ${ymd.slice(0, 4)}` : ""}`;
    const cents = (r) => (r && Number.isSafeInteger(Number(r.amount_cents)) ? Number(r.amount_cents) : NaN);
    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|um|upmore)[,\s]+)*/i;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    const ASK = /^(?:i (?:want|need|would like|'d like|wanna|plan) to|i'm (?:trying|planning|hoping) to|help me|how (?:do|can|would|should) i|can i|my goal is to|goal:? ?)\s*(?:save|put away|set aside|have saved)\s+\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(k)?\b/;
    function when(t, today) {
      let m;
      const y = +today.slice(0, 4), mo = +today.slice(5, 7);
      if (/\b(?:by|before) (?:the )?end of (?:the |this )?year\b|\bby (?:new year'?s|december 31)\b/.test(t)) return `${y}-12-31`;
      if ((m = /\bin (\d{1,2}) months?\b/.exec(t))) { const k = +m[1]; if (k < 1 || k > 120) return null; const tm = mo + k, ty = y + Math.floor((tm - 1) / 12), mm = ((tm - 1) % 12) + 1; return `${ty}-${pad(mm)}-${pad(Math.min(+today.slice(8, 10), lastDay(ty, mm)))}`; }
      if ((m = /\b(?:by|before|until|in|for) (january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?(?: (\d{1,2})(?:st|nd|rd|th)?)?(?:,? (\d{4}))?\b/.exec(t))) {
        const mm = MONTHS.findIndex((x) => x.startsWith(m[1].slice(0, 3))) + 1;
        let yy = m[3] ? +m[3] : y;
        const day = (yy2) => (m[2] ? +m[2] : lastDay(yy2, mm));
        if (m[2] && (+m[2] < 1 || +m[2] > lastDay(yy, mm))) return null;
        let d = `${yy}-${pad(mm)}-${pad(day(yy))}`;
        if (!m[3] && d <= today) { yy += 1; d = `${yy}-${pad(mm)}-${pad(day(yy))}`; }
        return d > today ? d : null;
      }
      if ((m = /\b(?:by|before) (\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) {
        const mm = +m[1], dd = +m[2]; let yy = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y;
        if (mm < 1 || mm > 12 || dd < 1 || dd > lastDay(yy, mm)) return null;
        let d = `${yy}-${pad(mm)}-${pad(dd)}`; if (!m[3] && d <= today) { yy += 1; d = `${yy}-${pad(mm)}-${pad(dd)}`; }
        return d > today ? d : null;
      }
      return undefined; // no date words at all
    }
    function ask(words) {
      const t = clean(words);
      if (!t || t.length > 160) return null;
      const m = ASK.exec(t);
      if (!m || /\b(?:on|by switching|by canceling|by cancelling|with)\b.{0,20}\b(?:groceries|gas|food|netflix|subscriptions?)\b/.test(t)) return null;
      const amount = Math.round((Number(m[1].replace(/,/g, "")) + (m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0)) * (m[3] ? 1000 : 1) * 100);
      return amount > 0 ? { amount_cents: amount, text: t } : null;
    }
    function answer(accounts, transactions, words, now, opts) {
      const q = typeof words === "string" ? ask(words) : words;
      if (!q) return null;
      const tz = (opts && opts.tz) || "UTC", today = MA.todayIn(now, tz), src = MA.txSource(transactions || [], tz);
      const target = when(q.text || "", today);
      if (target === undefined) return `By when? Say it like "save ${money(q.amount_cents).replace(/\.00$/, "")} by June" or "in 6 months", and I'll work out the monthly amount from your own numbers. Nothing was set up.`;
      if (target === null) return `I couldn't read that date (it needs to be ahead of today). Say it like "by June" or "in 6 months". Nothing was set up.`;
      const y = +today.slice(0, 4), mo = +today.slice(5, 7), ty = +target.slice(0, 4), tm = +target.slice(5, 7);
      // Saving months: next month through the target's (a mid-month target still has that month's deposit); a target this
      // month is counted in weeks.
      const months = (ty * 12 + tm) - (y * 12 + mo);
      const weeks = Math.max(1, Math.ceil((Date.parse(target + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / (7 * DAY)));
      const lines = [];
      const span = months > 0 ? `${months} month${months === 1 ? "" : "s"} (${MON[mo % 12]}${months > 1 ? ` through ${MON[tm - 1]}` : ""})` : null;
      lines.push(months > 0
        ? `To save ${money(q.amount_cents)} by ${label(target, today)}: ${money(Math.ceil(q.amount_cents / months))} a month for ${span}, or about ${money(Math.ceil(q.amount_cents / weeks / 100) * 100)} a week.`
        : `To save ${money(q.amount_cents)} by ${label(target, today)}: about ${money(Math.ceil(q.amount_cents / weeks / 100) * 100)} a week for ${weeks} week${weeks === 1 ? "" : "s"}.`);
      // What the person keeps a month: full calendar months their rows cover, up to the last 3.
      const rows = (transactions || []).filter((r) => r && !r.is_pending && typeof r.posted_on === "string" && Number.isFinite(cents(r)) && (!r.currency || String(r.currency).toUpperCase() === "USD"));
      const first = rows.map((r) => r.posted_on.slice(0, 10)).sort()[0];
      const full = [];
      for (let k = 1; k <= 3; k++) {
        const t2 = mo - k, yy = y + Math.floor((t2 - 1) / 12), mm = ((t2 - 1 + 120) % 12) + 1, start = `${yy}-${pad(mm)}-01`;
        if (!first || first > start) break;
        full.push(`${yy}-${pad(mm)}`);
      }
      if (!full.length) lines.push("Your linked transactions don't cover a full month yet, so I can't say what you keep a month.");
      else {
        const inM = full.map((ym) => rows.filter((r) => r.posted_on.startsWith(ym) && MA.isIncome(r)).reduce((a, r) => a + cents(r), 0));
        const outM = full.map((ym) => rows.filter((r) => r.posted_on.startsWith(ym) && MA.isSpend(r)).reduce((a, r) => a - cents(r), 0));
        const avgIn = Math.round(inM.reduce((a, b) => a + b, 0) / full.length), avgOut = Math.round(outM.reduce((a, b) => a + b, 0) / full.length), kept = avgIn - avgOut;
        const which = full.length === 1 ? MON[+full[0].slice(5, 7) - 1] : `${MON[+full[full.length - 1].slice(5, 7) - 1]}-${MON[+full[0].slice(5, 7) - 1]}`;
        lines.push(`Over the last ${full.length === 1 ? "full month" : `${full.length} full months`} (${which}), ${money(avgIn)} a month came in and ${money(avgOut)} went out${full.length > 1 ? " on average" : ""}: ${kept >= 0 ? `you kept about ${money(kept)} a month` : `${money(-kept)} a month more went out than came in`}.`);
        if (months > 0 && kept > 0) {
          const atPace = kept * months;
          lines.push(`At that pace you'd have about ${money(atPace)} by ${label(target, today)}, ${atPace >= q.amount_cents ? `enough for ${money(q.amount_cents)}` : `${money(q.amount_cents - atPace)} short of ${money(q.amount_cents)}`}.`);
        }
      }
      const sav = (accounts || []).filter((a) => a && a.status !== "disconnected" && MA.kindOf(a) === "savings" && Number.isFinite(Number(a.balance_cents)) && (!a.currency || String(a.currency).toUpperCase() === "USD"));
      if (sav.length) lines.push(`Your savings ${sav.length === 1 ? "account holds" : "accounts hold"} ${money(sav.reduce((a, s) => a + Math.round(Number(s.balance_cents)), 0))} today; if some of it is for this, you need less.`);
      lines.push("This is the math only: nothing is moved or set aside, and goals aren't saved yet.");
      lines.push(src);
      return lines.join("\n");
    }
    return { ask, answer, when };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = SaveGoal;
