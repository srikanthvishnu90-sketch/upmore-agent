  /* Price-drop claims (owner Methods 3 M3-SHOP-01/02/03, Methods 1 M1-CREATIVE-14; overnight C5): a store that matches
     its own lower price within a window after purchase. The person tells us the store, the old and new price (and the
     purchase day if they know it); the purchase itself comes from their own card rows. The windows and exclusions come
     from the dated offer book, never from code: Target's days, Costco's days, Best Buy's "return period" (which Best
     Buy sets per membership, so it is never turned into a number here). Upmore drafts the request the person sends in
     the store's chat or at the counter; it contacts no one. Pure; tests/price-drop.test.cjs, depth packet PRICE-DROP. */
  const PriceDrop = (() => {
    const money = c => "$" + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const DAY = 86400000;
    const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
    const label = raw => (typeof MerchantLabel !== "undefined" ? MerchantLabel : require("./32-merchant-label.js")).safe(raw);
    const STORES = [
      { id: "target", name: "Target", words: /\btarget\b/i, row: /\btarget\b/i, term: "store.target.price_match_days", channel: "Target's chat in the app or at Guest Services" },
      { id: "costco", name: "Costco", words: /\bcostco\b/i, row: /\bcostco\b/i, term: "store.costco.price_adjust_days", channel: "Costco's online Price Adjustment form, or the membership counter for a warehouse purchase" },
      { id: "bestbuy", name: "Best Buy", words: /\bbest ?buy\b/i, row: /\bbest ?buy|\bbestbuy\b/i, term: "store.bestbuy.price_match_window", channel: "Best Buy's chat or a store's customer service desk" },
    ];
    const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

    // "target dropped the price of my air fryer from $89.99 to $69.99, bought oct 3"
    function parse(message, today) {
      const m = String(message || "");
      const store = STORES.find(s => s.words.test(m));
      if (!store || !/\b(price (?:drop|dropped|went down|match|adjust)|dropped|went down|cheaper now|lower price|on sale now|price adjustment|price match)\b/i.test(m)) return null;
      const amounts = [...m.matchAll(/\$\s?(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)/g)].map(x => Math.round(Number(x[1].replace(/,/g, "")) * 100));
      const fromTo = /\bfrom\s+\$?\s?(\d[\d,]*(?:\.\d{1,2})?)\s+(?:to|down to)\s+\$?\s?(\d[\d,]*(?:\.\d{1,2})?)/i.exec(m);
      let oldC = null, newC = null;
      if (fromTo) { oldC = Math.round(Number(fromTo[1].replace(/,/g, "")) * 100); newC = Math.round(Number(fromTo[2].replace(/,/g, "")) * 100); }
      else if (amounts.length >= 2) { oldC = Math.max(...amounts); newC = Math.min(...amounts); }
      let bought = null;
      const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(m), md = /\b(?:bought|purchased|ordered|got it)\b[^.\d$]*\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(m);
      if (iso) bought = iso[1];
      else if (md) { const y = +today.slice(0, 4), d = `${y}-${String(MON.indexOf(md[1].toLowerCase()) + 1).padStart(2, "0")}-${String(+md[2]).padStart(2, "0")}`; bought = d > today ? `${y - 1}${d.slice(4)}` : d; }
      const item = (/\b(?:(?:of|on|for) (?:my |the |a |an )?|\bmy )([a-z][a-z0-9 \-']{1,40}?)\s+(?:from|went|dropped|is|was|at)\b/i.exec(m) || [])[1] || null;
      return { store, old_cents: oldC, new_cents: newC, bought, item };
    }

    // The purchase on the person's card: that store, money out, on the day they said or else the most recent one whose
    // amount is the old price or the old price plus up to 12% sales tax. Several equally good -> ask.
    function findPurchase(p, rows, today) {
      const store = (rows || []).filter(r => r && r.posted_on && !r.is_pending && Number.isFinite(r.amount_cents) && r.amount_cents < 0 && (!r.currency || r.currency === "USD") && p.store.row.test(label(r.merchant_raw)) && r.posted_on <= today);
      const fits = r => p.old_cents && -r.amount_cents >= p.old_cents && -r.amount_cents <= Math.round(p.old_cents * 1.12);
      let cands = p.bought ? store.filter(r => r.posted_on === p.bought) : store.filter(fits);
      if (p.bought && cands.length > 1) cands = cands.filter(fits).length ? cands.filter(fits) : cands;
      cands.sort((a, b) => (a.posted_on < b.posted_on ? 1 : -1));
      if (!cands.length) return { none: true, store };
      if (cands.length > 1 && cands[0].posted_on === cands[1].posted_on) return { several: cands.slice(0, 4) };
      return { row: cands[0] };
    }

    function answer(message, today, rows, book) {
      const p = parse(message, today);
      if (!p) return null;
      if (p.old_cents == null || p.new_cents == null) return `What did you pay at ${p.store.name}, and what's the price now? Say it like "from $89.99 to $69.99".`;
      if (p.new_cents >= p.old_cents) return `${money(p.new_cents)} isn't lower than ${money(p.old_cents)}, so there's no difference to claim.`;
      const diff = p.old_cents - p.new_cents, t = book.term(p.store.term, today);
      const f = findPurchase(p, rows, today);
      if (f.several) return `I see more than one ${p.store.name} charge that could be it: ${f.several.map(r => `${money(-r.amount_cents)} on ${r.posted_on}`).join(", ")}. Which day did you buy it?`;
      if (f.none) return `I don't see a ${p.store.name} charge ${p.bought ? `on ${p.bought}` : `near ${money(p.old_cents)}`} on your linked cards, so I can't check the window. Tell me the day you bought it, or the amount on your statement.`;
      const r = f.row, age = daysBetween(r.posted_on, today);
      const lines = [];
      const what = p.item ? `the ${p.item}` : "the item";
      if (typeof t.value === "number") {
        if (age > t.value) return [`Your ${p.store.name} charge of ${money(-r.amount_cents)} on ${r.posted_on} is ${age} days old, past ${p.store.name}'s ${t.value}-day window (${t.cite}), so a price adjustment isn't due.`, `From your linked cards, the ${r.posted_on} charge.`].join("\n");
        lines.push(`Your ${p.store.name} charge of ${money(-r.amount_cents)} on ${r.posted_on} is ${age} day${age === 1 ? "" : "s"} old, inside ${p.store.name}'s ${t.value}-day window (${t.cite}).`);
      } else {
        lines.push(`Your ${p.store.name} charge of ${money(-r.amount_cents)} on ${r.posted_on} is ${age} day${age === 1 ? "" : "s"} old. ${p.store.name} matches its own lower price during your ${t.value}, which depends on your membership: check the receipt (${t.cite}).`);
      }
      lines.push(`The difference to ask for is ${money(diff)} (${money(p.old_cents)} then, ${money(p.new_cents)} now), plus the tax on it.`);
      lines.push(`Ask in ${p.store.channel}; I can't contact ${p.store.name} for you. You could send: "Hi, I bought ${what} on ${r.posted_on} for ${money(p.old_cents)} and it's now ${money(p.new_cents)}. Can you adjust my purchase to the current price?"`);
      // The term's own note carries the store's exclusions or "reported" status; say it whenever there is one.
      if (t.note && /excluded|exclusion|discretion|reported/i.test(t.note)) lines.push(`${t.note.charAt(0).toUpperCase()}${t.note.slice(1)}; the store decides, and if they say no, nothing is lost.`);
      lines.push(`After they agree, the credit shows on the same card in a few days; ask me then and I'll look for a ${p.store.name} credit near ${money(diff)}.`);
      lines.push(`From your linked cards, the ${r.posted_on} charge.`);
      return lines.join("\n");
    }

    return { answer, parse, findPurchase, STORES };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = PriceDrop;
