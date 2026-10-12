  /* Rewards math (owner Methods 1, overnight F1-F3): only the math over the person's own card rows, never an application,
     an activation or a call. Cards the person already holds:
       F1 rotating 5% categories: this quarter's categories, activation date and cap come from the offer book (dated,
          sourced); progress is their own spend at merchants that fit, by merchant name (the issuer counts by category
          code, so its total can differ, and the answer says so);
       F2 a welcome-bonus spend target they tell us (amount, months, opened date): spend so far on that card, days left,
          what's needed per week; never a nudge to buy more than they would anyway;
       F3 the annual fee: the fee row, the statement credits that card actually paid back in the year before it, and the
          plain keep / ask / cancel math (asking for a retention offer is theirs to do; Upmore makes no calls).
     Every number cites its source and as-of; a stale offer-book term says it may have changed. Pure; tested in
     tests/rewards-math.test.cjs. */
  const RewardsMath = (() => {
    const money = c => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const DAY = 86400000;
    const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
    const addMonths = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); };
    const quarterOf = ymd => { const y = +ymd.slice(0, 4), q = Math.floor((+ymd.slice(5, 7) - 1) / 3); return { from: `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`, to: new Date(Date.UTC(y, q * 3 + 3, 0)).toISOString().slice(0, 10), q: q + 1, y }; };
    const usd = r => !r.currency || r.currency === "USD";
    const posted = r => r && r.posted_on && !r.is_pending && Number.isFinite(r.amount_cents) && usd(r);
    const purchase = r => posted(r) && r.amount_cents < 0 && !r.is_transfer && !/\b(payment|thank you|autopay|annual fee|membership fee|interest charge|late fee)\b/i.test(r.merchant_raw || "");

    // Which of the person's accounts the message means: the card's own words against account names. One match or none.
    const CARDS = [
      { id: "chase_freedom_flex", words: /freedom ?flex/i, rotating: "card.chase_freedom_flex" },
      { id: "chase_sapphire_preferred", words: /sapphire ?pref/i },
      { id: "chase_sapphire_reserve", words: /sapphire ?res/i },
      { id: "amex_platinum", words: /\b(amex|american express)\b.*\bplat|\bplatinum\b/i },
      { id: "amex_gold", words: /\b(amex|american express)\b.*\bgold\b/i },
      { id: "capital_one_venture", words: /\bventure\b/i },
      { id: "capital_one_savor", words: /\bsavor\b/i },
    ];
    function cardIn(message) { return CARDS.find(c => c.words.test(String(message || ""))) || null; }
    function accountFor(card, accounts) {
      const cards = (accounts || []).filter(a => a && a.status !== "disconnected" && /credit|card/i.test(`${a.account_kind} ${a.name}`));
      const hit = cards.filter(a => card.words.test(`${a.name} ${a.institution || ""}`));
      return { hit: hit.length === 1 ? hit[0] : null, several: hit.length > 1 ? hit : null, cards };
    }
    const asOf = rows => { const d = rows.map(r => r.posted_on).filter(Boolean).sort(); return d.length ? d[d.length - 1] : null; };
    const source = (acct, rows) => `From your linked ${acct.name}, transactions through ${asOf(rows) || "no posted rows yet"}.`;

    // F1. Category match by merchant name, from the card's own category words.
    const CATEGORY_RX = { "grocery stores": /\b(trader joe|kroger|whole ?foods|wholefds|safeway|aldi|publix|wegmans|sprouts|h-e-b|food lion|stop ?& ?shop|meijer|albertsons|vons|ralphs|harris teeter|winco|lidl|giant eagle|grocery|market)\b/i,
      dining: /\b(restaurant|starbucks|chipotle|mcdonald|dunkin|chick-?fil-?a|taco bell|wendy|burger king|doordash|grubhub|uber \*?eats|pizza|cafe|grill|bistro|diner|sushi|thai|kitchen)\b/i,
      "american red cross": /\bred cross\b/i };
    function rotating(card, acct, tx, today, book) {
      const base = card.rotating;
      const cats = book.term(`${base}.q4_2026.categories`, today), by = book.term(`${base}.q4_2026.activate_by`, today), cap = book.term(`${base}.q4_2026.cap_cents`, today), rate = book.term(`${base}.q4_2026.rate`, today);
      const q = quarterOf(today);
      if (q.y !== 2026 || q.q !== 4) return `I only have this card's categories for October to December 2026 (${cats.cite}), so I can't say what counts this quarter.`;
      const names = String(cats.value).split(/,\s*/);
      const rows = tx.filter(r => r.account_id === acct.account_id && purchase(r) && r.posted_on >= q.from && r.posted_on <= today);
      const fits = rows.filter(r => names.some(n => CATEGORY_RX[n] && CATEGORY_RX[n].test(r.merchant_raw || "")));
      const spent = fits.reduce((s, r) => s - r.amount_cents, 0), counted = Math.min(spent, cap.value);
      const left = daysBetween(today, by.value);
      return [
        `${acct.name}: this quarter's ${Math.round(rate.value * 100)}% categories are ${cats.value}, up to ${money(cap.value)} of spend (${cats.cite}).`,
        left >= 0 ? `Activate by ${by.value} (${left} day${left === 1 ? "" : "s"} left); activating is a tap in your card's app or site, and I can't do it for you.` : `The activation date (${by.value}) has passed.`,
        `So far this quarter ${money(spent)} at merchants that fit: ${Math.round(rate.value * 100)}% back on ${money(counted)} is about ${money(Math.round(counted * rate.value))}; ${money(Math.max(0, cap.value - spent))} of the cap is left.`,
        "I match by merchant name; your card counts by the store's category code, so its total can differ a little.",
        source(acct, rows.length ? rows : tx.filter(r => r.account_id === acct.account_id)),
      ].join("\n");
    }

    // F2. A spend target the person states: "$5,000 in 3 months, opened Oct 1".
    function parseTarget(message) {
      const m = String(message || "");
      const amt = /\$\s?([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i.exec(m), months = /\b(\d{1,2})\s*months?\b/i.exec(m), opened = /\b(?:opened|got it|approved)\b[^.\d]*(\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2})/i.exec(m);
      if (!amt || !months) return null;
      const cents = Math.round(Number(amt[1].replace(/,/g, "")) * (amt[2] ? 1000 : 1) * 100);
      return { target_cents: cents, months: +months[1], opened: opened ? opened[1] : null };
    }
    const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    function toYmd(s, today) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const m = /^([a-z]{3})[a-z]*\.? (\d{1,2})$/i.exec(s); if (!m) return null;
      const y = +today.slice(0, 4), mm = MONTHS.indexOf(m[1].toLowerCase()) + 1;
      const d = `${y}-${String(mm).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
      return d > today ? `${y - 1}${d.slice(4)}` : d;
    }
    function spendTarget(t, acct, tx, today) {
      const opened = t.opened ? toYmd(t.opened, today) : null;
      if (!opened) return `When did you open ${acct.name}? Tell me the date (like "opened Oct 1") and I'll count your spend from then.`;
      const deadline = addMonths(opened, t.months);
      const own = tx.filter(r => r.account_id === acct.account_id && posted(r));
      const inWindow = own.filter(r => r.posted_on >= opened && r.posted_on <= today);
      // Returns come off the spend, as issuers count it; payments and statement credits are not returns.
      const returns = inWindow.filter(r => r.amount_cents > 0 && !r.is_transfer && !/\b(payment|thank you|autopay|credit)\b/i.test(r.merchant_raw || ""));
      const spent = Math.max(0, inWindow.filter(purchase).reduce((s, r) => s - r.amount_cents, 0) - returns.reduce((s, r) => s + r.amount_cents, 0));
      const need = Math.max(0, t.target_cents - spent), days = daysBetween(today, deadline);
      const lines = [`${acct.name}: ${money(spent)} of ${money(t.target_cents)} spent since ${opened}; the window closes ${deadline}${days >= 0 ? ` (${days} day${days === 1 ? "" : "s"} left)` : " (passed)"}.`];
      if (need === 0) lines.push("You've reached the target. The bonus usually posts after a statement closes; ask me then and I'll look for it in your transactions.");
      else if (days > 0) lines.push(`${money(need)} to go, about ${money(Math.ceil(need / Math.max(1, days / 7)))} a week. Count only spending you'd do anyway; buying extra to hit a bonus usually costs more than it pays.`);
      else lines.push(`The window has closed ${money(need)} short.`);
      lines.push(`That's purchases minus returns on this card${returns.length ? ` (${money(returns.reduce((x, r) => x + r.amount_cents, 0))} returned)` : ""}; your issuer decides what counts (fees and some payments don't), so its number can differ.`, source(acct, own));
      return lines.join("\n");
    }

    // F3. The annual fee against the credits the card actually paid back.
    function annualFee(acct, tx, today) {
      const own = tx.filter(r => r.account_id === acct.account_id && posted(r));
      const fees = own.filter(r => r.amount_cents < 0 && /\b(annual (membership )?fee|annual fee)\b/i.test(r.merchant_raw || "")).sort((a, b) => (a.posted_on < b.posted_on ? 1 : -1));
      if (!fees.length) return `I don't see an annual fee on ${acct.name} in your linked history. ${source(acct, own)}`;
      const fee = fees[0], from = new Date(Date.parse(`${fee.posted_on}T00:00:00Z`) - 365 * DAY).toISOString().slice(0, 10);
      const credits = own.filter(r => r.amount_cents > 0 && r.posted_on > from && r.posted_on <= fee.posted_on && /\b(credit|statement credit)\b/i.test(r.merchant_raw || "") && !/\b(payment|thank you)\b/i.test(r.merchant_raw || ""));
      const back = credits.reduce((s, r) => s + r.amount_cents, 0), cost = -fee.amount_cents, net = back - cost;
      return [
        `${acct.name}: ${money(cost)} annual fee posted ${fee.posted_on}. In the year before it, the card paid back ${money(back)} in statement credits (${credits.length} credit${credits.length === 1 ? "" : "s"}).`,
        net >= 0 ? `The credits you used covered the fee by ${money(net)}, before any points.` : `The fee is ${money(-net)} more than the credits you used, before points. Your options: keep it if the points make up ${money(-net)}, ask the issuer for a retention offer before deciding (that call or chat is yours; I don't make calls), or downgrade or cancel. Cancelling closes the credit line, which can move your credit score.`,
        "Points aren't counted: I can't see their value from your transactions.",
        source(acct, own),
      ].join("\n");
    }

    // What the message asks, conservatively; a near miss goes on to the model.
    function kind(message) {
      const m = String(message || "");
      if (/\bannual fee\b/i.test(m) && /\b(worth|keep|cancel|pay(?:ing)? for)\b/i.test(m)) return "fee";
      if (/(?:\b\d ?%|\b(?:five percent|rotating|categor(?:y|ies)|activat(?:e|ed|ion)|quarter|progress)\b)/i.test(m) && cardIn(m) && cardIn(m).rotating) return "rotating";
      if (/\b(bonus|spend(?:ing)? (?:target|requirement)|minimum spend)\b/i.test(m) && parseTarget(m)) return "target";
      if (/\bhow close am i\b.*\bbonus\b/i.test(m)) return "target";
      return null;
    }

    function answer(message, today, accounts, tx, book) {
      const k = kind(message);
      if (!k) return null;
      const card = cardIn(message);
      if (!card) return "Which card? Name it (like \"Freedom Flex\" or \"Sapphire Preferred\") and I'll do the math from its own transactions.";
      const { hit, several, cards } = accountFor(card, accounts);
      if (several) return `More than one linked card looks like that (${several.map(a => a.name).join(", ")}). Which one?`;
      if (!hit) return cards.length ? `I don't see that card among your linked cards (${cards.map(a => a.name).join(", ")}). If it's linked under another name, tell me which.` : null;
      if (k === "rotating") return rotating(card, hit, tx, today, book);
      if (k === "fee") return annualFee(hit, tx, today);
      const t = parseTarget(message);
      if (!t) return `What's the bonus target on ${hit.name}? Say it like "$4,000 in 3 months, opened Sep 15".`;
      return spendTarget(t, hit, tx, today);
    }

    return { answer, kind, cardIn, parseTarget, rotating, spendTarget, annualFee, quarterOf, addMonths };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = RewardsMath;
