  /* "What's this charge?" (megadoc K01 "what's this 47.23 charge from SQ *ALLEY", K02 "I don't recognize a charge from ACME
     INC", K05 "this merchant charged me twice"). Read-only, from the person's own rows:
       ask(words)                                 { term, amount_cents, twice } or null
       answer(accounts, transactions, words, now, opts)
     It finds the charge(s) in the last 90 days by the words (whole words of the bank's text) and/or the amount to the cent,
     then says what the statement text itself shows: the payment processor in front of the name (SQ * is Square, TST* is
     Toast, PAYPAL * is PayPal, ...; the business's own label follows it and is never looked up or guessed), whether it
     repeats (a subscription or bill), how many earlier charges came from the same text, and a pending charge's
     authorization note. Two charges of the same amount from the same text within 3 days are said as a possible double
     charge; one charge is never called a double. Nothing is disputed or sent: the dispute flow is named, the person files.
     A dispute ask ("dispute", "unauthorized", "didn't authorize") is the dispute answer's (79-dispute.js), not this.
     opts.tz sets the person's today. Pure. Depth packet CHARGE-CHECK. */
  const ChargeCheck = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const DAY = 86400000, WINDOW = 90, TWICE_DAYS = 3;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const money = MA.money;
    const cents = (r) => (r && r.amount_cents !== null && r.amount_cents !== undefined && Number.isFinite(Number(r.amount_cents)) ? Math.round(Number(r.amount_cents)) : NaN);
    const usd = (r) => !r.currency || String(r.currency).toUpperCase() === "USD";
    const dayOf = (r) => (typeof r.posted_on === "string" ? r.posted_on.slice(0, 10) : null);
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);
    const label = (ymd) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;
    const key = (s) => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    // What the text in front of the name means. Only what statements themselves show; the business after it is its own label.
    const PREFIX = [
      [/^\s*sq\s*\*/i, "SQ * means it was paid through Square, a card reader many small businesses use"],
      [/^\s*tst\s*\*/i, "TST* means it was paid through Toast, a register system restaurants use"],
      [/^\s*(?:paypal|pp|py)\s*\*/i, "PAYPAL * means it was paid through PayPal"],
      [/^\s*sp\s*\*/i, "SP * means it was paid through Shopify, a checkout many online stores use"],
      [/^\s*dd\s*\*|^\s*doordash/i, "DD * means it was a DoorDash order"],
      [/^\s*ic\s*\*|^\s*instacart/i, "IC* means it was an Instacart order"],
      [/^\s*amzn\s+mktp|^\s*amazon\s+mktp/i, "AMZN Mktp means Amazon Marketplace, which covers most Amazon orders"],
      [/^\s*apple\.com\/bill|^\s*apple com bill/i, "APPLE.COM/BILL means an Apple charge: an App Store purchase or a subscription billed through Apple"],
      [/^\s*google\s*\*/i, "GOOGLE * means a Google charge: Google Play, YouTube or another Google service"],
      [/^\s*uber\s*\*?\s*eats/i, "UBER EATS means an Uber Eats order"],
      [/^\s*uber\b/i, "UBER means an Uber ride or an Uber charge"],
      [/^\s*lyft\b/i, "LYFT means a Lyft ride"],
    ];

    // ---- the person's words ----
    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|quick q:?|upmore|um|uh)[,\s]+)*/i;
    const DISPUTE = /\b(?:disput\w*|charge ?backs?|unauthori[sz]ed|(?:didn'?t|did not|never|have not|haven'?t) authori[sz]e[ds]?)\b/i;
    const ASKS = [
      // "what's this 47.23 charge from SQ *ALLEY", "what is this charge from acme", "what is the $12 charge", "whats SQ *ALLEY"
      /^(?:what(?:'s| is|s)|who(?:'s| is|s)|wtf is)\s+(?:this|that|the|a)?\s*(.*?\bcharge\b.*?|[a-z0-9*][a-z0-9 *.&'\/#-]{2,40}?)(?:\s+on my (?:card|statement|account|bank))?$/,
      // "i don't recognize a charge from acme inc", "i dont know what this 12.99 charge is"
      /^i\s+(?:don'?t|dont|do not)\s+(?:recognize|recognise|know)\s+(?:what\s+)?(?:this|that|the|a|an)?\s*(.*?)(?:\s+(?:is|was))?(?:\s+on my (?:card|statement|account|bank))?$/,
      // "why did acme charge me", "why was i charged 47.23 by acme"
      /^why (?:did|is|does)\s+(.+?)\s+charg(?:e|ing)\s+me(.*)$/,
      /^why (?:was|am) i (?:charged|billed)\s+(.*)$/,
      // "this merchant charged me twice", "acme charged me twice", "did acme charge me twice", "was i double charged at acme"
      /^(?:did|has)?\s*(.+?)\s+(?:charged|charge|billed|bill)\s+me\s+(?:twice|two times|double)(.*)$/,
      /^(?:was|did) i (?:get )?(?:double[- ]charged|charged twice|billed twice)(.*)$/,
    ];
    const VAGUE = /^(?:this|that|the|a|an|my|it|merchant|this merchant|the merchant|that merchant|company|store|place|they|them|charge|this charge|that charge)$/;
    function ask(words) {
      const t = String(words || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
      if (!t || t.length > 160 || DISPUTE.test(t)) return null;
      if (/\b(?:fee|fees|interest|rate|apr|refund|subscription|subscriptions|bill|bills|tax|taxes|balance|limit|my (?:balance|credit))\b/.test(t) && !/\bcharge\b/.test(t)) return null;
      for (let i = 0; i < ASKS.length; i++) {
        const m = ASKS[i].exec(t);
        if (!m) continue;
        const twice = i >= 4;
        // Charge-less "what is X" must look like a statement text: a prefix with a star, or "charge" said.
        if (i === 0 && !/\bcharge\b/.test(m[1]) && !/\*/.test(m[1])) return null;
        const rest = [m[1] || "", m[2] || ""].join(" ");
        const amt = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)/.exec(rest) || /\b(\d[\d,]*\.\d{2})\b/.exec(rest);
        let term = rest.replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g, " ").replace(/\b\d[\d,]*\.\d{2}\b/g, " ")
          .replace(/\b(?:charges?|on my (?:card|statement|account|bank)|from|by|at|for|is|was|this|that|the|a|an|me|twice|double|yet|again|month|week|today|yesterday|recently|last)\b/g, " ").replace(/\s+/g, " ").trim();
        // "i dont know what this 12.99 charge is": the "what" left over is not a name.
        term = term.replace(/^(?:what|which|who)\s*/, "").trim();
        if (VAGUE.test(term)) term = "";
        if (!term && !amt && !twice) return null;
        // The text as typed ("SQ *ALLEY"), found again in the person's own words.
        let typed = term;
        if (term) { const at = String(words).toLowerCase().replace(/[’‘]/g, "'").indexOf(term); if (at >= 0) typed = String(words).slice(at, at + term.length); }
        return { term: term ? typed : null, amount_cents: amt ? Math.round(Number(amt[1].replace(/,/g, "")) * 100) : null, twice };
      }
      return null;
    }

    // ---- the answer ----
    function named(raw, term) {
      const d = ` ${key(raw)} `, k = key(term);
      if (!k) return true;
      if (d.includes(` ${k} `)) return true;
      // Typed run together or spaced differently ("BESTBUY" for "BEST BUY", "best buy" for "BESTBUY"): the term without
      // spaces must equal a run of whole words of the bank's text, so "ACME" never matches inside "ACMEPAY".
      const sq = k.replace(/ /g, ""), w = key(raw).split(" ");
      if (sq.length < 4) return false;
      for (let a = 0; a < w.length; a++) { let run = ""; for (let b = a; b < w.length && run.length < sq.length; b++) { run += w[b]; if (run === sq) return true; } }
      return false;
    }
    function answer(accounts, transactions, words, now, opts) {
      const q = typeof words === "string" ? ask(words) : words;
      if (!q) return null;
      const tz = (opts && opts.tz) || "UTC", today = MA.todayIn(now, tz), from = addDays(today, -WINDOW), to = addDays(today, 1);
      const src = MA.txSource(transactions, tz);
      const rows = (transactions || []).filter((r) => r && usd(r) && dayOf(r) && Number.isFinite(cents(r)));
      if (!rows.some((r) => !r.is_pending)) return `I don't see any posted transactions in your linked accounts yet, so I can't find that charge. ${src}`;
      const acct = (id) => { const a = (accounts || []).find((x) => x && x.account_id === id); return a ? MA.acctName(a) : null; };
      const charges = rows.filter((r) => cents(r) < 0 && !r.is_transfer && dayOf(r) >= from && dayOf(r) <= to && (!q.term || named(r.merchant_raw, q.term)) && (q.amount_cents == null || -cents(r) === q.amount_cents));
      charges.sort((a, b) => dayOf(b).localeCompare(dayOf(a)));
      const what = `${q.amount_cents != null ? `${money(q.amount_cents)} ` : ""}charge${q.term ? ` from "${q.term}"` : ""}`;
      if (!charges.length) return `I don't see a ${what} in your linked accounts in the last ${WINDOW} days. If it's still pending or on a card that isn't linked, it won't show here yet; your card's app has the newest charges.\n${src}`;
      // Double charges: the same text and amount within 3 days.
      const pairs = [];
      for (const a of charges) for (const b of charges) if (a !== b && dayOf(a) <= dayOf(b) && key(a.merchant_raw) === key(b.merchant_raw) && cents(a) === cents(b) && daysBetween(dayOf(a), dayOf(b)) <= TWICE_DAYS && !pairs.some((p) => p.includes(a) || p.includes(b))) pairs.push([a, b]);
      const lines = [];
      if (q.twice) {
        if (pairs.length) {
          const [a, b] = pairs[0];
          lines.push(`Yes, it looks like a double charge: ${MA.display(a.merchant_raw)} ${money(-cents(a))} on ${label(dayOf(a))} and again on ${label(dayOf(b))}${a.is_pending || b.is_pending ? " (one is still pending, and a pending charge often drops off when the real one posts)" : ""}.`);
          lines.push(`Ask ${MA.display(a.merchant_raw)} to refund the second one first; if they don't, say "dispute this charge" and I'll draft the dispute for you to file. Nothing was sent.`);
        } else {
          const c = charges[0];
          lines.push(`I see ${charges.length === 1 ? "one charge" : `${charges.length} charges`}${q.term ? ` from ${MA.display(c.merchant_raw)}` : ""} in the last ${WINDOW} days, but no two of the same amount within ${TWICE_DAYS} days: ${charges.slice(0, 4).map((r) => `${money(-cents(r))} on ${label(dayOf(r))}`).join("; ")}.`);
          lines.push("A charge that showed twice and then once usually means a pending hold dropped off. If one is wrong anyway, say \"dispute this charge\".");
        }
        lines.push(src);
        return lines.join("\n");
      }
      const c = charges[0], raw = String(c.merchant_raw || "");
      const others = charges.length - 1;
      lines.push(`${others ? `The latest of ${charges.length} matching charges: ` : ""}${money(-cents(c))} on ${label(dayOf(c))}${acct(c.account_id) ? ` (${acct(c.account_id)})` : ""}, shown by your bank as "${MA.display(raw)}".${c.is_pending ? " It's still pending: hotels, gas stations and restaurants often hold a different amount than they finally charge." : ""}`);
      const p = PREFIX.find(([re]) => re.test(raw));
      if (p) lines.push(`${p[1]}; the name after it is the business's own label, and I can't look up who that is.`);
      const same = rows.filter((r) => r !== c && cents(r) < 0 && key(r.merchant_raw) === key(raw) && dayOf(r) < dayOf(c));
      if (same.length) {
        const gaps = same.map(dayOf).concat([dayOf(c)]).sort();
        const monthly = gaps.length >= 2 && gaps.slice(1).every((d, i) => { const g = daysBetween(gaps[i], d); return g >= 27 && g <= 33; });
        lines.push(`${same.length === 1 ? "One earlier charge" : `${same.length} earlier charges`} came from the same text, the first on ${label(gaps[0])}${monthly ? "; it repeats monthly, so it's likely a subscription or bill you pay" : ""}.`);
      } else lines.push("No earlier charge in your linked accounts came from the same text.");
      if (pairs.length) lines.push(`It shows twice within ${TWICE_DAYS} days at the same amount (${pairs.map(([a, b]) => `${label(dayOf(a))} and ${label(dayOf(b))}`).join("; ")}), which may be a double charge.`);
      lines.push(`If you don't recognize it, ask the business first; if that doesn't fix it, say "dispute this charge" and I'll draft the dispute for you to file. Nothing was sent.`);
      lines.push(src);
      return lines.join("\n");
    }
    return { ask, answer, PREFIX };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = ChargeCheck;
