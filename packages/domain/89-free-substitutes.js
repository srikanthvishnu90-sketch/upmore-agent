  /* Free substitutes (owner Methods 3 M3-SUBS-11 and M3-SHOP-06; overnight D7), [Read] suggestions only.
       Library streaming: next to each paid streaming charge in the person's own rows, Kanopy through a library card. Its
       price is the offer book's term (packages/offers/terms.json, library.kanopy.price_cents: $0 with a participating
       library card, cited with its source and checked date and said as stale past its window), and the dollar gap is the
       person's own charge minus that price. No other library app is named: Hoopla and the rest are not on the owner's
       method cards, so they get "not on file", never a fact from memory.
       Store-brand swaps: from an itemized receipt the person pastes, each national-brand line is named with the store's own
       brand as the swap. No store-brand price is on file, so no gap is computed: the shelf tag has the price.
     Nothing is cancelled, bought or changed here; dropping a paid service is the cancel flow's own card and yes. Merchant
     and receipt text is data: service and brand names are Upmore's own, and only the person's own amounts are repeated.
     Pure; tests in tests/free-substitutes.test.cjs, depth packet SUBSTITUTES (tests/depth-SUBSTITUTES.test.cjs).
     Input to answer(): { message, today: "YYYY-MM-DD", book: OfferBook.create(terms), transactions: chat rows }. */
  const FreeSubstitutes = (() => {
    const DAY = 86400000;
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const ACTIVE_DAYS = 45;
    const KANOPY = "library.kanopy.price_cents";
    const money = c => "$" + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const label = raw => (typeof MerchantLabel !== "undefined" ? MerchantLabel : require("./32-merchant-label.js")).safe(raw);
    const validYmd = s => ISO.test(String(s || "")) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
    const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

    // Paid film and TV streaming, in Upmore's words. Sports-first services (ESPN+) are left out: a library film app is
    // no substitute for live games.
    const STREAMING = Object.freeze([
      { id: "netflix", name: "Netflix", re: /\bnetflix\b/i },
      { id: "hulu", name: "Hulu", re: /\bhulu\b/i },
      { id: "disney", name: "Disney+", re: /\bdisney\s*(?:\+|plus)|\bdisneyplus\b/i },
      { id: "max", name: "Max", re: /\bhbo\s*max\b|\bhbomax\b|\bmax\.com\b/i },
      { id: "peacock", name: "Peacock", re: /\bpeacock\b/i },
      { id: "paramount", name: "Paramount+", re: /\bparamount\s*(?:\+|plus)|\bparamountplus\b/i },
      { id: "appletv", name: "Apple TV+", re: /\bapple\s*tv\b/i },
    ]);

    // National brands a receipt line can name, for detection only: the category is said only where the brand is one
    // kind of product, and medicine says to match the active ingredient on the label.
    const BRANDS = Object.freeze([
      ["Tide", /\btide\b/i, "laundry detergent"], ["Gain", /\bgain\b/i, "laundry detergent"], ["Persil", /\bpersil\b/i, "laundry detergent"],
      ["Cheerios", /\bcheerios\b/i, "cereal"], ["Frosted Flakes", /\bfrosted flakes\b/i, "cereal"], ["Froot Loops", /\bfroot loops\b/i, "cereal"],
      ["Bounty", /\bbounty\b/i, "paper towels"], ["Charmin", /\bcharmin\b/i, "toilet paper"], ["Kleenex", /\bkleenex\b/i, "tissues"],
      ["Ziploc", /\bziploc\b/i, null], ["Glad", /\bglad\b/i, null], ["Clorox", /\bclorox\b/i, null], ["Lysol", /\blysol\b/i, null],
      ["Dawn", /\bdawn\b/i, "dish soap"], ["Cascade", /\bcascade\b/i, "dishwasher detergent"], ["Windex", /\bwindex\b/i, "glass cleaner"],
      ["Advil", /\badvil\b/i, null, true], ["Tylenol", /\btylenol\b/i, null, true], ["Motrin", /\bmotrin\b/i, null, true], ["Aleve", /\baleve\b/i, null, true],
      ["Claritin", /\bclaritin\b/i, null, true], ["Zyrtec", /\bzyrtec\b/i, null, true], ["Benadryl", /\bbenadryl\b/i, null, true],
      ["Coca-Cola", /\bcoca[- ]?cola\b|\bcoke\b/i, "soda"], ["Pepsi", /\bpepsi\b/i, "soda"],
      ["Doritos", /\bdoritos\b/i, "chips"], ["Lay's", /\blay'?s\b/i, "chips"], ["Oreo", /\boreos?\b/i, "sandwich cookies"], ["Ritz", /\britz\b/i, "crackers"],
      ["Philadelphia", /\bphiladelphia\b/i, "cream cheese"], ["Hellmann's", /\bhellmann'?s\b/i, "mayonnaise"],
      ["Skippy", /\bskippy\b/i, "peanut butter"], ["Jif", /\bjif\b/i, "peanut butter"], ["Smucker's", /\bsmucker'?s\b/i, null],
      ["Campbell's", /\bcampbell'?s\b/i, null], ["Barilla", /\bbarilla\b/i, null], ["Ragu", /\bragu\b/i, "pasta sauce"], ["Prego", /\bprego\b/i, "pasta sauce"],
      ["Quaker", /\bquaker\b/i, null], ["Folgers", /\bfolgers\b/i, "coffee"], ["Maxwell House", /\bmaxwell house\b/i, "coffee"], ["Tropicana", /\btropicana\b/i, null],
      ["Huggies", /\bhuggies\b/i, null], ["Pampers", /\bpampers\b/i, null], ["Colgate", /\bcolgate\b/i, null], ["Crest", /\bcrest\b/i, null],
      ["Heinz", /\bheinz\b/i, null], ["Gatorade", /\bgatorade\b/i, "sports drink"], ["Land O Lakes", /\bland o'? ?lakes\b/i, null], ["Kraft", /\bkraft\b/i, null], ["Kellogg's", /\bkellogg'?s\b/i, null],
    ].map(([name, re, category, medicine]) => Object.freeze({ name, re, category, medicine: !!medicine })));

    // A paid streaming service or streaming itself; film and TV words count only next to "library".
    const SVC = String.raw`(?:stream\w*|netflix|hulu|disney\s*(?:\+|plus)|disneyplus|hbo\s*max|peacock|paramount\s*(?:\+|plus)|apple\s*tv\+?)(?![a-z])`;
    const SCREEN = String.raw`(?:${SVC}|movies?\b|films?\b|tv\b|shows?\b|apps?\b)`;
    const LIBRARY = new RegExp(String.raw`\bkanopy\b|\bhoopla\b|\blibrary\b[^.?!]{0,40}\b${SCREEN}|\b${SCREEN}[^.?!]{0,40}\blibrary\b`, "i");
    const FREE = new RegExp(String.raw`\bfree\b(?!\s*trials?)[^.?!]{0,40}\b${SVC}|\b${SVC}[^.?!]{0,40}\bfree\b(?!\s*trials?)|\bwatch\s+(?:movies|films|tv|shows|stuff)\s+(?:for\s+)?free\b(?!\s*trials?)|\bfree\b[^.?!]{0,12}\bway to watch\b`, "i");
    const ALT = new RegExp(String.raw`\b(?:alternatives?|substitutes?|replacements?)\b[^.?!]{0,40}\b${SVC}|\b${SVC}[^.?!]{0,40}\b(?:alternatives?|substitutes?)\b`, "i");
    // A perk a plan or card already includes is the subscription answer's (Walmart+, T-Mobile, Amex); a trial is the
    // trial tracker's; a win-back offer is the win-back answer's.
    const NOT_LIBRARY = /\b(?:t-?\s?mobile|verizon|at&t|walmart\s*(?:\+|plus)?|amex|american express|blue cash|phone plan|carrier|credit card|perks?|included with|comes with|come back|welcome back|rejoin|resubscribe|win[- ]?back)\b/i;
    const STORE = /\bstore[- ]?brands?\b|\bhouse brands?\b|\bprivate[- ]labels?\b|\boff[- ]brand\b|\bgenerics\b|\bgeneric (?:brands?|versions?|swaps?|equivalents?|instead)\b|\b(?:go|going|buy|buying|switch(?:ing)? to|swap(?:ping)? (?:to|for)) generics?\b|\bcheaper brands?\b|\bname[- ]brands?\b[^.?!]{0,60}\b(?:swap|switch|cheaper|instead|generic)\b/i;
    // A prescription's generic is the pharmacy's question, not a grocery swap.
    const PRESCRIPTION = /\b(?:prescriptions?|rx|medications?|pharmacy|insulin|copay)\b/i;

    // "library" or "store_brand", or null.
    // A security, a ticker or a company is never a grocery swap ("should i buy generic AAPL"): that is the advice guard's.
    const MARKETISH = /\b(?:stocks?|shares?|etfs?|crypto|bitcoin|funds?|bonds?|options?|tickers?|invest\w*|portfolio|ipo|apple|tesla|nvidia|amazon|google|microsoft|meta|company|companies)\b|(?:^|\s|\$)[A-Z]{2,5}(?=$|[\s?.,!])/;
    function kind(message) {
      const m = String(message || "");
      if (STORE.test(m) && !PRESCRIPTION.test(m)) return MARKETISH.test(m) && !/\n/.test(m) && !/\d\.\d{2}\b/.test(m) && !BRANDS.some(b => b.re.test(m)) ? null : "store_brand";
      if (NOT_LIBRARY.test(m)) return null;
      if (LIBRARY.test(m) || FREE.test(m) || ALT.test(m)) return "library";
      return null;
    }

    // Itemized lines from a pasted receipt: an item and its price at the end of the line ("TIDE PODS 42CT 13.99 F").
    // Totals, tax and payment lines are skipped.
    const SKIP = /\b(?:sub\s*-?total|total|tax|balance|change|cash|visa|mastercard|amex|discover|debit|credit|tender|savings?|coupon|discount|you saved|points?|rewards?)\b/i;
    function receiptLines(text) {
      const t = String(text || "").slice(0, 20000);
      const pieces = /\n/.test(t) ? t.split(/\r?\n/) : t.split(/[,;]\s*/);
      const out = [];
      for (const raw of pieces) {
        const m = raw.match(/^\s*(.*?[a-z].*?)\s+\$?(\d{1,4}\.\d{2})\s*(?:[a-z]{1,2})?\s*$/i);
        if (!m || SKIP.test(m[1])) continue;
        out.push({ item: m[1], cents: Math.round(Number(m[2]) * 100) });
      }
      return out;
    }
    function swaps(text) {
      const by = new Map();
      for (const line of receiptLines(text)) {
        const b = BRANDS.find(x => x.re.test(line.item));
        if (!b) continue;
        if (!by.has(b.name)) by.set(b.name, { brand: b, cents: [] });
        by.get(b.name).cents.push(line.cents);
      }
      return [...by.values()];
    }

    function storeBrand(message) {
      const lines = receiptLines(message), found = swaps(message);
      if (!lines.length) return "Paste an itemized receipt (each item with its price on its own line) and I'll mark the name brands that have a store-brand swap to look for. I don't have store-brand prices on file, so the shelf tag is where the price difference is.";
      if (!found.length) return "I don't see a national brand I know on that receipt, so there's no store-brand swap to suggest. Store brands may already be what you're buying.";
      const out = ["From the receipt you pasted, name brands with a store-brand swap to look for:"];
      for (const f of found.slice(0, 12)) {
        const paid = f.cents.map(money).join(", ");
        const what = f.brand.category ? `the store's own ${f.brand.category}` : "the store's own version of the same item";
        out.push(`- ${f.brand.name} (${paid} on your receipt): ${what}, if it carries one${f.brand.medicine ? "; match the active ingredient and strength on the label" : ""}.`);
      }
      out.push("I don't have a sourced store-brand price, so I won't guess the gap: the price is on the shelf tag. Compare the unit price (per ounce or per count) on the tag.");
      out.push("Taste or fit may disappoint on a few items, so try one swap at a time. This is a suggestion only; nothing is bought or changed.");
      return out.join("\n");
    }

    // The person's paid streaming: posted charges, money out in dollars, the last one within 45 days.
    function paidStreaming(rows, today) {
      const by = {};
      for (const r of rows || []) {
        if (!r || !validYmd(r.posted_on) || r.is_pending || !Number.isSafeInteger(r.amount_cents) || r.amount_cents >= 0 || (r.currency && r.currency !== "USD") || r.posted_on > today) continue;
        const name = label(r.merchant_raw), s = STREAMING.find(x => x.re.test(name));
        if (s) (by[s.id] = by[s.id] || []).push(r);
      }
      const out = [];
      for (const s of STREAMING) {
        const list = (by[s.id] || []).sort((a, b) => (a.posted_on < b.posted_on ? -1 : a.posted_on > b.posted_on ? 1 : 0));
        if (!list.length) continue;
        const last = list[list.length - 1];
        if (daysBetween(last.posted_on, today) > ACTIVE_DAYS) continue;
        const gap = list.length > 1 ? daysBetween(list[list.length - 2].posted_on, last.posted_on) : null;
        out.push({ service: s, last, monthly: gap !== null && gap >= 25 && gap <= 36 });
      }
      return out;
    }

    function library(message, today, book, rows) {
      const t = book.term(KANOPY, today);
      const lines = [`Kanopy is free with a participating library card; check your library (${t.cite}). Catalogs and monthly limits vary by library.`];
      if (/\bhoopla\b/i.test(message)) lines.push("I don't have Hoopla on file, so I won't say what it costs or carries; your library can tell you.");
      const usable = (rows || []).filter(r => r && validYmd(r.posted_on) && !r.is_pending);
      const through = usable.map(r => r.posted_on).sort().pop();
      if (!usable.length) { lines.push("I don't see a connected card yet, so I can't put it next to what you pay for streaming."); return lines.join("\n"); }
      const paid = paidStreaming(usable, today);
      if (!paid.length) { lines.push(`I don't see a paid streaming charge on your linked cards in the last ${ACTIVE_DAYS} days (rows through ${through}), so there's no gap to show.`); return lines.join("\n"); }
      lines.push("Next to what you pay:");
      for (const p of paid) {
        const gap = -p.last.amount_cents - t.value;
        lines.push(`- ${p.service.name}: ${money(-p.last.amount_cents)} on ${p.last.posted_on}${p.monthly ? ", billed every month" : ""}. The gap is ${money(gap)}${p.monthly ? " a month" : ""} (your charge minus Kanopy's ${money(t.value)}), if your library has Kanopy and it has what you'd watch.`);
      }
      lines.push(`From your linked card rows, through ${through}.`);
      lines.push(`This is a suggestion only; nothing is cancelled or changed. If you'd rather drop one, say "cancel ${paid[0].service.name.toLowerCase()}" and you'll get its own card to approve, one yes each.`);
      return lines.join("\n");
    }

    function answer(input) {
      const o = input || {};
      if (!validYmd(o.today)) throw new Error("free substitutes: today must be a date");
      const k = kind(o.message);
      if (k === "store_brand") return storeBrand(String(o.message));
      if (k === "library") return library(String(o.message), o.today, o.book, o.transactions);
      return null;
    }

    return { answer, kind, receiptLines, swaps, paidStreaming, STREAMING, BRANDS, KANOPY };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = FreeSubstitutes;
