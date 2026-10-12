  /* "Rent is due and I only have 1900" (megadoc D13): will rent be covered, from the person's own rows. Read-only;
     nothing is paid, moved or sent.
       ask(words)                                  null | { have_cents, rent_cents }   (either null when not said)
       answer(accounts, transactions, words, now, opts)
     Rent: the next payment of a rent that repeats in the person's rows (TheNumbers.projection over 45 days, a payee whose
     name reads as rent: rent, property management, apartments, leasing, a landlord or a rent portal), or the amount they
     say ("rent is 2400"); neither is asked for, never guessed. Cash: the amount they say ("I only have 1900", said as
     theirs) or their linked cash with its as-of. The gap is to the cent. Paychecks and other repeating bills between
     today and the due date are listed with their dates, and what is left after rent on the due date is said; that is a
     projection from repeating rows only, said so. A draft to the landlord (part now, the rest by the next payday after
     the due date) is offered as text the person sends. Pure. Depth packet RENT-SHORT. */
  const RentShort = (() => {
    const TN = typeof TheNumbers !== "undefined" ? TheNumbers : require("./86-the-numbers.js");
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const money = MA.money, DAY = 86400000, HORIZON = 45;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const label = (ymd) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;
    const RENT = /\brent\b|\brental\b|\bproperty (?:mgmt|mgt|management)\b|\bapartments?\b|\blandlord\b|\bleasing\b|\brentcafe\b|\bappfolio\b|\bbuildium\b|\byardi\b/i;
    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|ugh|um|help|upmore)[,!\s]+)*/i;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    const AMT = /\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?:\s*(k)\b)?/;
    const cents = (m) => { if (!m) return null; const n = Number(m[1].replace(/,/g, "")) + (m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0); return Math.round(n * (m[3] ? 1000 : 1) * 100); };
    // Rent is the subject and the worry is covering it: "rent is due and i only have 1900", "i can't pay rent this month",
    // "will i have enough for rent", "am i short on rent", "i don't have enough for rent".
    const ASKS = [
      /\brent\b.{0,40}\b(?:due|coming up|next week|tomorrow|on the \d)\b.{0,40}\b(?:only|just) (?:have|got)\b/,
      /\b(?:only|just) (?:have|got) \$?\d[\d,.]*k?\b.{0,40}\brent\b/,
      /\b(?:can'?t|cannot|can not|won'?t be able to|not able to) (?:afford|pay|make|cover) (?:my |the |this month'?s |next month'?s )?rent\b/,
      /\b(?:do|will) i have enough (?:money |cash )?(?:for|to (?:pay|cover)) (?:my |the )?rent\b/,
      /\b(?:am i|i'?m|i am) (?:going to be |gonna be )?short (?:on|for) (?:my |the )?rent\b/,
      /\b(?:don'?t|do not) have enough (?:money |cash )?(?:for|to (?:pay|cover)) (?:my |the )?rent\b/,
      /\bcan i (?:afford|cover|make) (?:my |the )?rent\b/,
    ];
    const NOT_THIS = /\b(?:did|has|have) (?:my )?rent (?:go|gone|went) through\b|\bpay my rent\b(?!.*\b(?:can'?t|enough|short)\b)|\bsplit\b|\broommate\b|\bset up rent\b|\brent is now\b|\bstop rent\b/;
    function ask(words) {
      const t = clean(words);
      if (!t || t.length > 200 || !/\brent\b/.test(t) || NOT_THIS.test(t) || !ASKS.some((re) => re.test(t))) return null;
      const have = /\b(?:only|just)? ?(?:have|got)\s+(?:about |around |like )?(\$?\d[\d,]*(?:\.\d{1,2})?\s*k?)\b/.exec(t);
      const rent = /\brent (?:is|of|=)\s+(?:about |around )?(\$?\d[\d,]*(?:\.\d{1,2})?\s*k?)\b/.exec(t);
      // "due Nov 1", "due the 1st": the person's own due date wins over the one read from rows.
      const d = /\bdue (?:on )?(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})|the (\d{1,2})(?:st|nd|rd|th))\b/.exec(t);
      const due = d ? (d[1] ? { month: MON.map((m) => m.toLowerCase()).indexOf(d[1]) + 1, day: +d[2] } : { day: +d[3] }) : null;
      return { have_cents: have ? cents(AMT.exec(have[1])) : null, rent_cents: rent ? cents(AMT.exec(rent[1])) : null, due };
    }

    // The next date on or after today for a said due date; a day that doesn't exist is no date.
    function dueFrom(d, today) {
      if (!d) return null;
      const pad = (n) => String(n).padStart(2, "0"), y = +today.slice(0, 4), mo = +today.slice(5, 7);
      const ok = (yy, mm, dd) => dd >= 1 && dd <= new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      if (d.month) { for (const yy of [y, y + 1]) { const s = `${yy}-${pad(d.month)}-${pad(d.day)}`; if (ok(yy, d.month, d.day) && s >= today) return s; } return null; }
      for (let k = 0; k < 3; k++) { const mm = ((mo - 1 + k) % 12) + 1, yy = y + Math.floor((mo - 1 + k) / 12), s = `${yy}-${pad(mm)}-${pad(d.day)}`; if (ok(yy, mm, d.day) && s >= today) return s; }
      return null;
    }
    function answer(accounts, transactions, words, now, opts) {
      const q = typeof words === "string" ? ask(words) : words;
      if (!q) return null;
      const P = TN.projection(accounts, transactions, now, opts, HORIZON);
      if (!P) return null;
      const rentBill = (P.bills || []).find((b) => RENT.test(`${b.name} ${b.key}`));
      const src = [...(P.notes || []), P.source].join("\n");
      if (!rentBill && q.rent_cents == null) return `I don't see a rent payment that repeats in your linked accounts; it may go out under another name, like a Zelle to your landlord or a portal. How much is rent and when is it due? Say it like "rent is 2400 due Nov 1 and I only have 1900".\n${src}`;
      const rentCents = q.rent_cents != null ? q.rent_cents : rentBill.amount_cents;
      const due = dueFrom(q.due, P.today) || (rentBill ? rentBill.on : null);
      const lines = [];
      lines.push(`Rent: ${money(rentCents)}${due ? ` due ${label(due)}` : ""} (${q.rent_cents != null ? "the amount you gave" : `your repeating payment to ${rentBill.name}`}${q.rent_cents != null && rentBill && rentBill.amount_cents !== q.rent_cents ? `; your last one was ${money(rentBill.amount_cents)}` : ""}).`);
      const said = q.have_cents != null;
      if (!said && !P.has_cash) { lines.push("I can't see a checking or savings balance in your linked accounts, so I can't say whether it's covered. Tell me what you have, like \"I only have 1900\"."); lines.push(src); return lines.join("\n"); }
      const have = said ? q.have_cents : P.cash_cents;
      lines.push(`Cash: ${money(have)} (${said ? `what you said${P.has_cash && P.cash_cents !== have ? `; your linked cash reads ${money(P.cash_cents)}` : ""}` : "your linked checking and savings"}).`);
      const gap = rentCents - have;
      lines.push(gap > 0 ? `Short by ${money(gap)} today.` : `Covered today, with ${money(-gap)} left after rent.`);
      // Between today and the due date: paychecks in, other repeating bills out.
      let after = null, nextPay = null;
      if (due) {
        const pays = (P.pays || []).filter((p) => p.on <= due), others = (P.bills || []).filter((b) => b !== rentBill && b.on < due && !RENT.test(`${b.name} ${b.key}`));
        const inC = pays.reduce((a, p) => a + p.amount_cents, 0), outC = others.reduce((a, b) => a + b.amount_cents, 0);
        after = have + inC - outC - rentCents;
        nextPay = (P.pays || []).find((p) => p.on > due) || null;
        if (pays.length || others.length) {
          const parts = [];
          parts.push(pays.length ? `paychecks ${pays.map((p) => `${money(p.amount_cents)} on ${label(p.on)}`).join(" and ")}` : "no paycheck shows up");
          if (others.length) parts.push(`bills ${others.slice(0, 4).map((b) => `${b.name} ${money(b.amount_cents)} on ${label(b.on)}`).join(", ")}${others.length > 4 ? ` and ${others.length - 4} more` : ""}`);
          lines.push(`Before ${label(due)}: ${parts.join("; ")}. With those, ${after >= 0 ? `you'd have ${money(after)} left after rent on ${label(due)}` : `you'd still be ${money(-after)} short on ${label(due)}`}. That counts your repeating paychecks and bills only.`);
        } else lines.push(`No paycheck shows up before ${label(due)} in your linked accounts.`);
      }
      const short = due ? after < 0 : gap > 0;
      if (short) {
        const part = Math.max(0, due ? rentCents + after : have), rest = rentCents - part;
        const by = nextPay ? ` by ${label(nextPay.on)}, when my next paycheck lands` : " soon";
        if (part > 0 && rest > 0) lines.push(`Landlords often take part on time and the rest a few days later if you ask before ${due ? label(due) : "the due date"}. A message you can send:\n"Hi, rent of ${money(rentCents)} is due${due ? ` ${label(due)}` : ""}. I can pay ${money(part)} on time and the remaining ${money(rest)}${by}. Would that work?"`);
        else lines.push(`Landlords often give a few days' grace if you ask before ${due ? label(due) : "the due date"}; your lease says what the late fee is.`);
        lines.push("Nothing was paid, moved or sent.");
      }
      lines.push(src);
      return lines.join("\n");
    }
    return { ask, answer };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = RentShort;
