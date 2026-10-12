  /* Card-linked offers (owner Methods 1 card M1-CARD-08 "Card-linked offers auto-adding"; overnight F4). The person pastes
     or forwards a list of offers (Amex Offers, Chase Offers, BankAmeriDeals and the like). Each offer's merchant, reward
     ($ or %, or points), minimum spend, cap, expiry, enroll-by date and card come ONLY from the pasted text ("per the
     offer you pasted"); a term that is not there is said to be missing, never filled in. Each offer is matched against
     the person's own posted purchases over the last 180 days, per account, and sorted into: likely to use anyway (their
     own typical purchase and what it would earn), out of their way (said plainly, with "count only spending you'd do
     anyway"), already expired, and which expire soonest. An offer on a card that is not linked is said as such.
     M1-CARD-08's "How Upmore runs it", within the standing rules: step 1 (match usual merchants to the offers) is built
     here; step 2 is the person's own tap: Upmore never adds, activates or enrolls an offer (the method's one-time
     approval to add offers is not built: no issuer access, and activation stays with the person); step 3 (confirm the
     credit posted) is left to a later ask over the rows. Merchant names shown back go through MerchantLabel.safe, and a
     look-alike descriptor never matches (TARGET offer vs TARGETED ADS LLC). Instructions inside pasted text change
     nothing. Pure; tests in tests/card-offers.test.cjs, depth packet CARD-OFFERS. */
  const CardOffers = (() => {
    const money = c => "$" + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const DAY = 86400000;
    const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
    const label = raw => (typeof MerchantLabel !== "undefined" ? MerchantLabel : require("./32-merchant-label.js")).safe(raw);
    const WINDOW = 180, RECENT = 90, MAX_OFFERS = 30;

    // Offer programs and the issuer each one belongs to; `card` tells that issuer's cards apart in account names.
    const PROGRAMS = [
      { id: "amex", name: "Amex Offers", issuer: "American Express", words: /\b(?:amex|american express) offers?\b/i, card: /\b(?:amex|american express)\b/i },
      { id: "chase", name: "Chase Offers", issuer: "Chase", words: /\bchase offers?\b/i, card: /\bchase\b/i },
      { id: "bofa", name: "BankAmeriDeals", issuer: "Bank of America", words: /\bbank ?ameri ?deals?\b|\bbofa deals?\b/i, card: /\bbank of america\b|\bbofa\b|\bbankamericard\b/i },
      { id: "citi", name: "Citi Merchant Offers", issuer: "Citi", words: /\bciti (?:merchant )?offers?\b/i, card: /\bciti(?:bank)?\b/i },
      { id: "capone", name: "Capital One Offers", issuer: "Capital One", words: /\bcapital ?one offers?\b/i, card: /\bcapital ?one\b/i },
      { id: "wells", name: "My Wells Fargo Deals", issuer: "Wells Fargo", words: /\bwells fargo deals?\b/i, card: /\bwells fargo\b/i },
      { id: "usbank", name: "U.S. Bank Deals", issuer: "U.S. Bank", words: /\bu\.?s\.? bank deals?\b/i, card: /\bu\.?s\.? bank\b/i },
    ];
    // A named card in the paste ("Chase Offers on my Sapphire Preferred"): which card, and its issuer.
    const CARD_NAMES = [
      { name: "Freedom Flex", issuer: "chase", rx: /\bfreedom ?flex\b/i }, { name: "Freedom Unlimited", issuer: "chase", rx: /\bfreedom unlimited\b/i },
      { name: "Sapphire Preferred", issuer: "chase", rx: /\bsapphire ?pref/i }, { name: "Sapphire Reserve", issuer: "chase", rx: /\bsapphire ?res/i },
      { name: "Amex Gold", issuer: "amex", rx: /\b(?:amex|american express) gold\b|\bgold card\b/i }, { name: "Amex Platinum", issuer: "amex", rx: /\b(?:amex|american express) platinum\b|\bplatinum card\b/i },
      { name: "Blue Cash Everyday", issuer: "amex", rx: /\bblue cash everyday\b/i }, { name: "Blue Cash Preferred", issuer: "amex", rx: /\bblue cash preferred\b/i },
      { name: "Customized Cash Rewards", issuer: "bofa", rx: /\bcustomized cash\b/i }, { name: "Unlimited Cash Rewards", issuer: "bofa", rx: /\bunlimited cash rewards\b/i },
      { name: "Double Cash", issuer: "citi", rx: /\bdouble cash\b/i }, { name: "Custom Cash", issuer: "citi", rx: /\bcustom cash\b/i },
      { name: "Venture", issuer: "capone", rx: /\bventure ?x?\b card|\bcapital one venture\b/i }, { name: "Savor", issuer: "capone", rx: /\bsavor ?(?:one)?\b card|\bcapital one savor\b/i },
    ];
    const programById = id => PROGRAMS.find(p => p.id === id) || null;

    // ---- Parsing the pasted text ------------------------------------------------------------------------------------
    const AMT = "(\\d{1,5}(?:,\\d{3})*(?:\\.\\d{1,2})?)";
    const cents = s => Math.round(Number(String(s).replace(/,/g, "")) * 100);
    const PCT_RX = /(\d{1,2}(?:\.\d{1,2})?)\s?%\s*(?:cash\s*)?back\b/i;
    const DOLLAR_RX = new RegExp(`(up to\\s+(?:a total of\\s+)?|max(?:imum)?\\s+(?:of\\s+)?)?(?:a\\s+)?\\$\\s?${AMT}\\s*(?:cash\\s*back|back|(?:in\\s+)?statement credits?|credit)\\b`, "i");
    const POINTS_RX = /(?:^|[^\w$])\+?(\d{1,3}(?:,\d{3})+|\d{1,6})(x)?\s*(?:additional\s+|bonus\s+|extra\s+)?(?:membership rewards(?:®)?\s+|ultimate rewards(?:®)?\s+|thankyou\s+)?(points?|miles)\b(\s+(?:per|for every|on every|for each)\s+(?:eligible\s+)?(?:\$1|dollar))?/i;
    const MIN_RXS = [
      new RegExp(`\\bspend(?:ing)?\\s+(?:at least\\s+|a minimum of\\s+)?\\$\\s?${AMT}`, "i"),
      new RegExp(`\\b(?:purchases?|orders?|transactions?)\\s+of\\s+(?:at least\\s+)?\\$\\s?${AMT}`, "i"),
      new RegExp(`\\bmin(?:imum|\\.)?\\s*(?:purchase|spend|order)?\\s*(?:of\\s*)?:?\\s*\\$\\s?${AMT}`, "i"),
      new RegExp(`\\$\\s?${AMT}\\s*(?:\\+|or more)\\s*(?:purchase|spend|order)`, "i"),
      new RegExp(`\\$\\s?${AMT}\\s*minimum\\b`, "i"),
      new RegExp(`\\b(?:back|credit)\\s+(?:on|with)\\s+(?:a\\s+)?(?:(?:single\\s+)?purchases?\\s+of\\s+)?\\$\\s?${AMT}`, "i"),
    ];
    const CAP_RX = new RegExp(`\\b(?:up to|max(?:imum)?|capped at|cap of)\\s*(?:of\\s+)?(?:a total of\\s+)?\\$\\s?${AMT}`, "i");
    const TIMES_RX = /\bup to (\d{1,2}|two|three|four|five) (?:times|uses|purchases|transactions)\b/i;
    const WORDNUM = { two: 2, three: 3, four: 4, five: 5 };
    const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const DATE = "(\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|\\d{4}-\\d{2}-\\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?)";
    const ENROLL_RX = new RegExp(`\\b(?:enroll(?:ment)?|add(?: the offer)?|activate|save(?: the offer)?|opt in)\\s+(?:by|before)\\s*:?\\s*${DATE}`, "i");
    const EXPIRY_RX = new RegExp(`\\b(?:expires?|exp\\.?|expiring|expiration(?: date)?|valid (?:through|thru|until)|good (?:through|thru)|ends|through|thru|until|use by|offer ends)\\s*(?:on\\s*)?:?\\s*${DATE}`, "i");
    const REL_RX = /\b(?:expires?|ends) in (\d{1,3}) days?\b|\b(\d{1,3}) days? left\b/i;
    const TODAY_RX = /\b(?:expires|ends) today\b|\blast day\b/i, TOMORROW_RX = /\b(?:expires|ends) tomorrow\b/i;

    // A date as pasted, to ISO. A month and day without a year is the next one on or after today (said as such).
    function toDate(s, today) {
      const t = String(s || "").trim().toLowerCase();
      let y = null, mo, d;
      let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
      if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
      else if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t))) { mo = +m[1]; d = +m[2]; if (m[3]) y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; }
      else if ((m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/.exec(t))) { mo = MON.indexOf(m[1]) + 1; d = +m[2]; if (m[3]) y = +m[3]; }
      else return null;
      if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
      const yearGiven = y !== null;
      if (!yearGiven) { y = +today.slice(0, 4); if (`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` < today) y += 1; }
      const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) return null;
      return { iso, yearGiven, text: String(s).trim() };
    }

    function reward(text) {
      const p = PCT_RX.exec(text);
      if (p) return { kind: "percent", pct: Number(p[1]) };
      const d = DOLLAR_RX.exec(text);
      if (d) return { kind: "dollar", cents: cents(d[2]), upTo: !!d[1] };
      const pt = POINTS_RX.exec(text);
      if (pt) { const n = Number(pt[1].replace(/,/g, "")); return { kind: "points", text: `${pt[2] ? `${n}x` : n.toLocaleString("en-US")} ${pt[3].toLowerCase().replace(/^point$/, "points").replace(/^mile$/, "miles")}${pt[4] ? " per dollar" : ""}` }; }
      return null;
    }

    // Merchant words in an offer line: "at Walgreens", "Walgreens: ...", "Walgreens 5% back". Never a program name.
    // A sentence is not a store: a verb or an offer word inside the name means the words were misread.
    const NOT_NAME_WORD = /\b(?:says?|said|is|are|was|were|has|have|had|gives?|got|gets?|will|would|can|could|should|does|do|did|offers?|deals?)\b/i;
    const NOT_MERCHANT = /^(?:i|we|you|they|he|she|least|checkout|participating|select|eligible|any|your|my|a|an|once|the card|this|that|it|all|most|for|on|in|of|by|to|and|or|but|so|if)(?=\s|$)|\b(?:offers?|deals?|spend|earn|get|expires?|enroll|added?|activate|back|cash|statement|purchase|minimum|points?|miles|days?|left|system|assistant|user|ignore|reply|subject|fwd|from|to)$/i;
    const MERCH = "([A-Za-z0-9][A-Za-z0-9&'’.\\- ]{0,40}?)";
    const AT_RX = new RegExp(`\\b(?:at|with)\\s+(?:the\\s+|participating\\s+|select\\s+)?${MERCH}(?=\\s*(?:[,;:!()]|\\.(?:\\s|$)|\\s-\\s|$|\\s+(?:and|through|thru|until|by|online|in[- ]store|on|when|up|get|earn|expires?|exp|ends|for|or|using|from|via|to|is|are|was|if)\\b))`, "i");
    // A name leading the line starts with a capital, as an app or email writes it ("i got $10 back" is not a store).
    const MERCH_CAP = "([A-Z0-9][A-Za-z0-9&'’.\\- ]{0,40}?)";
    const LEAD_SEP_RX = new RegExp(`^${MERCH_CAP}\\s*(?:[:|–—]|\\s-)\\s+`);
    const LEAD_REWARD_RX = new RegExp(`^${MERCH_CAP}\\s+(?=\\+?\\$|\\d{1,2}(?:\\.\\d+)?\\s?%|[Ss]pend\\b|[Ee]arn\\b|[Gg]et\\b)`);
    // Once the message names a program ("chase offers: walgreens 5% back"), a lowercase lead name counts too.
    const LEAD_SEP_LOOSE = new RegExp(LEAD_SEP_RX.source.replace(MERCH_CAP, MERCH), "i"), LEAD_REWARD_LOOSE = new RegExp(LEAD_REWARD_RX.source.replace(MERCH_CAP, MERCH), "i");
    // A program lead-in on the offer's own line: "Chase Offers: ", "here are my amex offers: ", "amex offer ".
    const PROGRAM_PREFIX = /^.*?\b(?:offers?|deals?)\b(?:\s+(?:i have|for you|for me|on (?:my|your) [a-z ]{2,30}?))?\s*(?:[:\-–—]\s*|\s+(?=[a-z0-9]))/i;
    function cleanMerchant(s) {
      const t = String(s || "").replace(/\s+/g, " ").replace(/[\s.,'’-]+$/, "").trim();
      if (!t || t.length < 2 || NOT_MERCHANT.test(t) || NOT_NAME_WORD.test(t) || t.split(" ").length > 5 || /\d{1,2}\/\d{1,2}/.test(t) || PROGRAMS.some(p => p.words.test(t)) || CARD_NAMES.some(c => c.rx.test(t)) || /\d\s?%|\$/.test(t)) return null;
      // The pasted name is outside text: what is shown, and matched, is its MerchantLabel.safe form.
      const safe = label(t);
      return safe === "Unknown merchant" || safe.length < 2 ? null : safe;
    }
    function merchantIn(text, loose, depth) {
      for (const m of text.matchAll(new RegExp(AT_RX.source, "gi"))) { const c = cleanMerchant(m[1]); if (c) return c; }
      const pre = !depth && PROGRAM_PREFIX.exec(text);
      if (pre && programIn(pre[0])) { const c = merchantIn(text.slice(pre[0].length), true, 1); if (c) return c; }
      const sep = (loose ? LEAD_SEP_LOOSE : LEAD_SEP_RX).exec(text);
      if (sep) { const c = cleanMerchant(sep[1]); if (c) return c; }
      const lead = (loose ? LEAD_REWARD_LOOSE : LEAD_REWARD_RX).exec(text);
      if (lead) { const c = cleanMerchant(lead[1]); if (c) return c; }
      // "Amex Offers I have: Walgreens spend $50+ ...": a rejected lead-in before a colon, then the rest.
      if (sep && !depth) return merchantIn(text.slice(sep[0].length), loose, 1);
      return null;
    }
    // A line that is only a name (Chase's app copies "Walgreens" and "5% cash back" on separate lines).
    function bareName(text) {
      const t = text.replace(/[.:]+$/, "").trim();
      if (t.length < 2 || t.length > 40 || /[$%?!]/.test(t) || t.split(/\s+/).length > 5 || /\d{3,}/.test(t)) return null;
      if (/\b(?:offers?|deals?|expires?|enroll|added?|activate|exp|days? left|back|cash|points?|miles|card|system|ignore|which|what|should|these|here|my|hi|hey|hello|thanks?|thank you|fyi|ok|okay|please|pls|upmore|help|also|fwd|subject|sent|to|from|date)\b/i.test(t)) return null;
      return cleanMerchant(t);
    }

    function details(o, text, today) {
      const e = ENROLL_RX.exec(text);
      if (e && !o.enroll_by) { const dt = toDate(e[1], today); if (dt) o.enroll_by = dt; }
      const rest = e ? text.replace(e[0], " ") : text;
      if (!o.expires) {
        const x = EXPIRY_RX.exec(rest), rel = REL_RX.exec(rest);
        if (x) { const dt = toDate(x[1], today); if (dt) o.expires = dt; }
        else if (rel) { const n = +(rel[1] || rel[2]); o.expires = { iso: addDays(today, n), yearGiven: true, relative: n }; }
        else if (TODAY_RX.test(rest)) o.expires = { iso: today, yearGiven: true, relative: 0 };
        else if (TOMORROW_RX.test(rest)) o.expires = { iso: addDays(today, 1), yearGiven: true, relative: 1 };
      }
      if (o.min_cents == null) for (const rx of MIN_RXS) { const m = rx.exec(rest); if (m) { o.min_cents = cents(m[1]); break; } }
      if (o.cap_cents == null && o.reward && o.reward.kind === "percent") { const c = CAP_RX.exec(rest); if (c) o.cap_cents = cents(c[1]); }
      if (o.times == null) { const t = TIMES_RX.exec(rest); if (t) o.times = WORDNUM[t[1].toLowerCase()] || +t[1]; }
      for (const m of rest.matchAll(new RegExp(`\\$\\s?${AMT}`, "g"))) o.amounts.push(cents(m[1]));
    }
    // A dollar amount in the offer that is not its reward, minimum or cap ("$10 back on $50" said some other way) is
    // kept: the answer then says it couldn't place it and states no earnings, rather than guess.
    function unplaced(o) {
      const known = [o.min_cents, o.cap_cents, o.reward.kind === "dollar" ? o.reward.cents : null].filter(x => x != null);
      return [...new Set(o.amounts.filter(a => !known.includes(a)))];
    }

    function chunksOf(text) {
      const lines = String(text || "").replace(/\r/g, "").split(/\n|[\u2022\u00B7\u25CF]/).map(s => s.replace(/^\s*(?:[-*>]|\d{1,2}[.)])\s+/, "").trim()).filter(Boolean);
      // One line holding several offers ("...get $10 back; Target 5% back...") splits on ; or " | ".
      const out = [];
      for (const l of lines) {
        const many = (l.match(new RegExp(PCT_RX.source, "gi")) || []).length + (l.match(new RegExp(DOLLAR_RX.source, "gi")) || []).filter(x => !/^(?:up to|max)/i.test(x)).length;
        if (many < 2) { out.push(l); continue; }
        if (/;|\s[|/]\s/.test(l)) { out.push(...l.split(/;|\s[|/]\s/).map(s => s.trim()).filter(Boolean)); continue; }
        // Comma-separated: a new offer starts at a piece with its own reward, "spend" or "at <store>" once the current
        // one has its reward; "up to $10" and "expires 11/30" stay with the offer before them.
        let cur = "", has = false;
        for (const piece of l.split(/,\s*/)) {
          const rw = reward(piece), starts = (!!rw && !(rw.kind === "dollar" && rw.upTo)) || /\bspend\b/i.test(piece) || /\bat\s+[A-Za-z0-9]/i.test(piece);
          if (has && starts) { out.push(cur.trim()); cur = ""; has = false; }
          cur += (cur ? ", " : "") + piece; has = has || !!reward(piece);
        }
        if (cur.trim()) out.push(cur.trim());
      }
      return out;
    }
    const programIn = text => PROGRAMS.find(p => p.words.test(text)) || null;
    const cardIn = text => CARD_NAMES.find(c => c.rx.test(text)) || null;

    // Every offer in the text, with only the terms the text gives.
    function parse(message, today) {
      const loose = PROGRAMS.some(p => p.words.test(String(message || "")));
      const parts = chunksOf(message).map(text => ({ text, reward: reward(text), name: null }));
      for (const p of parts) if (!p.reward) p.name = bareName(p.text);
      const firstName = parts.findIndex(p => p.name), firstBare = parts.findIndex(p => p.reward && !merchantIn(p.text, loose));
      const nameFirst = firstName >= 0 && (firstBare < 0 || firstName < firstBare);
      const offers = [];
      let program = null, card = null, pendingName = null, last = null;
      for (const p of parts) {
        const prog = programIn(p.text), named = cardIn(p.text);
        if (prog) { program = prog; if (!named) card = null; }
        if (named) { card = named; if (!prog) program = programById(named.issuer); }
        if (p.reward) {
          if (offers.length >= MAX_OFFERS) { last = null; continue; }
          const o = { merchant: merchantIn(p.text, loose), reward: p.reward, min_cents: null, cap_cents: null, times: null, expires: null, enroll_by: null, program, card, amounts: [] };
          if (!o.merchant && pendingName) { o.merchant = pendingName; pendingName = null; }
          details(o, p.text, today);
          offers.push(o); last = o;
        } else if (p.name) {
          if (!nameFirst && last && !last.merchant) last.merchant = p.name; else pendingName = p.name;
        } else if (last) details(last, p.text, today);
      }
      // One program named anywhere in the message covers offers that came before it.
      const progs = [...new Set(parts.map(p => programIn(p.text)).filter(Boolean))];
      if (progs.length === 1) for (const o of offers) if (!o.program) o.program = progs[0];
      return { offers, programs: progs, truncated: chunksOf(message).filter(t => reward(t)).length > MAX_OFFERS };
    }

    // ---- Is this an offer list (or an ask about one)? ----------------------------------------------------------------
    const CUE = /\b(?:offers?|deals?|expires?|exp\.|enroll|add(?:ed)? to (?:card|your card)|days? left|valid (?:through|thru|until)|card[- ]linked)\b/i;
    const ASK_RX = /\b(?:amex|american express|chase|citi|capital ?one|bofa|wells fargo|card[- ]linked)\s+(?:merchant\s+)?offers\b(?!\s+(?:a|an|the|up to|new|free|no|you|\$|\d))|\bbank ?ameri ?deals\b|\b(?:add|activate|enroll(?: in)?|load|clip)\s+(?:all\s+)?(?:of\s+)?(?:my\s+|the\s+)?(?:amex|american express|chase|citi|capital ?one|card[- ]linked)\s+offers\b|\bcard[- ]linked offers?\b/i;
    const NOT_OFFER = /\b(?:dispute|chargeback|refund(?:ed)?|charged me|overcharged|price (?:drop|dropped|match|adjust\w*)|dropped the price)\b/i;
    const NOT_ASK = /\b(?:checking|savings|sign[- ]?up|welcome|bonus(?:es)?|apply|application|open an account|credit card offers|pre-?approved|refinanc\w*|loan)\b/i;
    function kind(message, today) {
      const m = String(message || "");
      if (!m.trim()) return null;
      const t = today || new Date().toISOString().slice(0, 10);
      const p = parse(m, t);
      const program = p.programs.length > 0 || /\bcard[- ]linked offers?\b/i.test(m);
      if (!program && NOT_OFFER.test(m)) return null;
      // "is this offer email real?" is a scam question, not a list to match (the guards and the model answer it).
      if (/\b(?:is (?:it|this|that) (?:real|legit\w*|a scam|fake)|scam|phishing|fraud\w*)\b/i.test(m)) return null;
      // A one-line question ("any deals with 5% back at costco?", "did the amex offer's $10 credit post?") is a question,
      // not a paste: with no program named it is never an offer list, and with one named it is only when a store was read.
      const question = !/\n/.test(m.trim()) && (/\?\s*$/.test(m.trim()) || /^(?:any|are|is|do|does|did|can|could|should|what|which|how|where|who|why|will|would)\b/i.test(m.trim()));
      if (!program && question) return null;
      if (p.offers.length && (program || CUE.test(m)) && p.offers.some(o => o.merchant || (program && !question))) return "offers";
      if (ASK_RX.test(m) && !NOT_ASK.test(m)) return "ask";
      return null;
    }

    // ---- Matching an offer's merchant to the person's rows ------------------------------------------------------------
    // Tokens: uppercase, apostrophes gone, processor prefixes (SQ *, TST*) dropped, store numbers after the name dropped,
    // a plural or possessive S folded (WALGREENS = WALGREEN). The offer's words must be the row's first words, whole:
    // TARGET matches "TARGET T-1234" and "TARGET.COM", never "TARGETED ADS LLC".
    const STOP = new Set(["THE", "INC", "LLC", "CO", "CORP", "COM", "WWW", "US", "USA", "S"]);
    const TAIL = new Set(["PHARMACY", "STORE", "STORES", "SHOP", "ONLINE", "MARKET", "SUPERMARKET", "OUTLET", "INSTORE", "IN", "AND", "COM"]);
    const ALIAS = { AMAZON: ["AMZN"], WALMART: ["WMSUPERCENTER"], WHOLEFOOD: ["WHOLEFD", "WHOLEFDSMKT"] };
    const stem = t => (t.length > 3 && /S$/.test(t) && !/SS$/.test(t) ? t.slice(0, -1) : t);
    function tokens(s, isRow) {
      let t = String(s || "").toUpperCase().replace(/[’']/g, "");
      t = t.replace(/^\s*(?:SQ|TST|SP|PP|PAYPAL|PY|BT|IC|FS|CKE|SQU)\s*\*\s*/, "");
      const out = [];
      for (const w of t.split(/[^A-Z0-9]+/).filter(Boolean)) {
        if (STOP.has(w)) continue;
        if (isRow && out.length && /\d/.test(w)) break; // a store number ends the name
        out.push(stem(w));
      }
      return out;
    }
    function sameMerchant(offerName, rowRaw) {
      const o = tokens(offerName, false);
      while (o.length > 1 && TAIL.has(o[o.length - 1])) o.pop();
      if (!o.length) return false;
      const key = o.join(""), keys = [key].concat(ALIAS[key] || []);
      if (key.length < 3 && o.length === 1 && !/^\d/.test(key)) return false;
      const r = tokens(rowRaw, true);
      for (let k = 1; k <= Math.min(r.length, o.length + 1); k++) if (keys.includes(r.slice(0, k).join(""))) return true;
      return false;
    }

    // ---- The person's own rows --------------------------------------------------------------------------------------
    const usd = r => !r.currency || r.currency === "USD";
    const purchase = r => r && r.posted_on && !r.is_pending && Number.isFinite(r.amount_cents) && r.amount_cents < 0 && usd(r) && !r.is_transfer && !/\b(payment|thank you|autopay|annual fee|interest charge|late fee)\b/i.test(r.merchant_raw || "");
    const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2)) : 0; };
    function habit(o, rows, today) {
      const from = addDays(today, -WINDOW), from90 = addDays(today, -RECENT);
      const hits = rows.filter(r => purchase(r) && r.posted_on > from && r.posted_on <= today && sameMerchant(o.merchant, r.merchant_raw));
      const qual = o.min_cents != null ? hits.filter(r => -r.amount_cents >= o.min_cents) : hits;
      return { hits, qual, n: hits.length, n90: hits.filter(r => r.posted_on > from90).length, q90: qual.filter(r => r.posted_on > from90).length, typical: median(qual.map(r => -r.amount_cents)), typicalAll: median(hits.map(r => -r.amount_cents)) };
    }

    // Which linked card the offer is on: the named card, else the program's issuer; one, several or none.
    const isCard = a => a && a.status !== "disconnected" && /credit|card/i.test(`${a.account_kind || ""} ${a.name || ""}`);
    function cardFor(o, accounts) {
      const cards = (accounts || []).filter(isCard);
      if (o.card) { const hit = cards.filter(a => o.card.rx.test(`${a.name || ""} ${a.institution || ""}`)); return { cards, hit: hit.length === 1 ? hit[0] : null, several: hit.length > 1 ? hit : null, named: o.card.name }; }
      if (!o.program) return { cards, unknown: true };
      const hit = cards.filter(a => o.program.card.test(`${a.name || ""} ${a.institution || ""}`));
      return { cards, hit: hit.length === 1 ? hit[0] : null, several: hit.length > 1 ? hit : null };
    }

    // ---- Wording ----------------------------------------------------------------------------------------------------
    const pct = n => `${n}%`;
    function rewardWords(o) {
      const r = o.reward;
      let s = r.kind === "percent" ? `${pct(r.pct)} back` : r.kind === "dollar" ? `${r.upTo ? "up to " : ""}${money(r.cents)} back` : r.text;
      if (o.min_cents != null) s = `spend ${money(o.min_cents)} or more, get ${s}`;
      else if (r.kind === "dollar") s += " (no minimum spend in what you pasted)";
      if (r.kind === "percent") s += o.cap_cents != null ? `, up to ${money(o.cap_cents)}` : " (no cap in what you pasted)";
      if (o.times) s += `, up to ${o.times} times`;
      return s;
    }
    function expiryWords(o, today) {
      const e = o.expires;
      if (!e) return "no expiry date in what you pasted";
      if (e.relative === 0) return "expires today";
      if (e.relative != null) return `expires in ${e.relative} day${e.relative === 1 ? "" : "s"} (counted from today)`;
      return e.yearGiven ? `expires ${e.iso}` : `expires ${e.text} (no year in what you pasted)`;
    }
    function earnWords(o, h) {
      const r = o.reward, odd = unplaced(o);
      if (odd.length) return `the offer also says ${odd.map(money).join(" and ")}, which I couldn't place (a minimum?), so I won't say what it earns; check the terms in your card's app`;
      if (r.kind === "points") return "it pays in points, which I don't turn into dollars";
      if (r.kind === "dollar" && r.upTo) return `it says "up to ${money(r.cents)}", so what one purchase earns depends on terms you didn't paste`;
      if (r.kind === "dollar") return `one qualifying purchase earns the ${money(r.cents)}`;
      const raw = Math.round(h.typical * r.pct / 100), got = o.cap_cents != null ? Math.min(raw, o.cap_cents) : raw;
      return `${pct(r.pct)} of that is ${money(got)}${o.cap_cents != null && raw > o.cap_cents ? ` (the ${money(o.cap_cents)} cap)` : ""}`;
    }
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    function byAccount(h, accounts) {
      const names = new Map((accounts || []).map(a => [a.account_id, a.name]));
      const counts = new Map();
      for (const r of h.hits) { const k = names.get(r.account_id) || "another account"; counts.set(k, (counts.get(k) || 0) + 1); }
      const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (counts.size > 1 ? `${k} (${n})` : k));
      return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
    }

    function answer(message, today, accounts, tx) {
      const k = kind(message, today);
      if (!k) return null;
      const NEVER = "Adding an offer is your tap in your card's app or site; I don't add, activate or enroll anything.";
      const p = parse(message, today);
      if (k === "ask" || !p.offers.length) {
        const wantsAdd = /\b(?:add|activate|enroll|load|clip)\b/i.test(message);
        return [wantsAdd ? "I can't add or activate offers for you; that's your tap in the card's app or site." : "I can't see your offers list myself.",
          "Paste the offers (copy them from your card's app or the email, one per line) and I'll check each one against where you already shop, by your own transactions."].join(" ");
      }
      const rows = (tx || []).filter(r => r && r.posted_on);
      const offers = p.offers;
      const read = offers.filter(o => o.merchant), unread = offers.filter(o => !o.merchant);
      const anyData = rows.some(purchase) || (accounts || []).length > 0;
      const lines = [`From the ${plural(offers.length, "offer")} you pasted (terms per the offer you pasted; I haven't checked them with the card issuer):`];
      const likely = [], away = [], expired = [];
      for (const o of read) {
        const name = label(o.merchant);
        const head = `${name}: ${rewardWords(o)}; ${expiryWords(o, today)}${o.enroll_by ? `; add by ${o.enroll_by.yearGiven ? o.enroll_by.iso : `${o.enroll_by.text} (no year in what you pasted)`}` : ""}.`;
        if (o.expires && o.expires.yearGiven && o.expires.iso < today) { expired.push(`- ${name}: expired ${o.expires.iso}, per the date you pasted.`); continue; }
        if (!anyData) { away.push(`- ${head}`); continue; }
        const h = habit(o, rows, today);
        const c = cardFor(o, accounts);
        const onCard = c.hit ? h.hits.filter(r => r.account_id === c.hit.account_id).length : null;
        const where = h.n ? `, on ${byAccount(h, accounts)}` : "";
        const cardNote = c.hit && h.n && onCard === 0 ? ` You've paid there with other accounts; the offer counts only on your ${c.hit.name}.`
          : !c.hit && !c.unknown && !c.several && h.n ? " It counts only if you pay with the card the offer is on, which isn't linked." : "";
        if (h.q90 >= 1 && h.qual.length >= 2) {
          const minPart = o.min_cents != null ? `; ${h.qual.length} of them were ${money(o.min_cents)} or more` : "";
          likely.push(`- ${head} You bought there ${plural(h.n, "time")} in the last ${WINDOW} days (${h.n90} in the last ${RECENT})${where}${minPart}, typically ${money(h.typical)}: ${earnWords(o, h)}.${cardNote}`);
        } else {
          let why;
          if (!h.n) why = `No purchases there in the last ${WINDOW} days on your linked accounts.`;
          else if (h.n === 1) why = `One purchase there in the last ${WINDOW} days: ${money(-h.hits[0].amount_cents)} on ${h.hits[0].posted_on}${where}${o.min_cents != null && -h.hits[0].amount_cents < o.min_cents ? `, under the ${money(o.min_cents)} minimum` : ""}.`;
          else if (o.min_cents != null && h.qual.length < 2) why = `You shop there (${plural(h.n, "purchase")} in the last ${WINDOW} days${where}), but ${h.qual.length ? "only 1 was" : "none was"} ${money(o.min_cents)} or more; your typical purchase there is ${money(h.typicalAll)}.`;
          else if (!h.n90) why = `${plural(h.n, "purchase")} there in the last ${WINDOW} days${where}, none in the last ${RECENT}.`;
          else why = `${plural(h.qual.length, "purchase")} of ${money(o.min_cents)} or more there in the last ${WINDOW} days${where}, none in the last ${RECENT}.`;
          away.push(`- ${head} ${why}${cardNote}`);
        }
      }
      if (likely.length) lines.push("", "Likely to use anyway, from your own spending:", ...likely);
      if (away.length) {
        lines.push("", anyData ? "You'd have to go out of your way for these:" : "Nothing is linked, so I can't tell where you already shop. What you pasted:", ...away);
        if (anyData) lines.push("Count only spending you'd do anyway; buying something just to use an offer usually costs more than it pays.");
      }
      if (expired.length) lines.push("", "Already expired:", ...expired);
      const live = read.filter(o => o.expires && !(o.expires.yearGiven && o.expires.iso < today)).sort((a, b) => (a.expires.iso < b.expires.iso ? -1 : a.expires.iso > b.expires.iso ? 1 : 0));
      if (live.length) lines.push("", `Expiring soonest: ${live.slice(0, 3).map(o => `${label(o.merchant)} ${o.expires.yearGiven ? `${o.expires.iso} (${o.expires.iso === today ? "today" : `${plural(daysBetween(today, o.expires.iso), "day")} left`})` : `${o.expires.text} (no year given)`}`).join("; ")}.`);
      else if (read.length && !expired.length) lines.push("", "None of the offers you pasted shows an expiry date.");
      if (unread.length) lines.push(`I couldn't tell the store for ${plural(unread.length, "offer")} (${unread.map(rewardWords).join("; ")}); paste each offer on its own line with the store's name.`);
      if (p.truncated) lines.push(`I read the first ${MAX_OFFERS} offers; paste the rest separately.`);
      // Which card each offer is on, once per program or named card.
      const seen = new Set(), cardLines = [];
      for (const o of read) {
        const key = `${o.program ? o.program.id : "-"}|${o.card ? o.card.name : "-"}`;
        if (seen.has(key)) continue; seen.add(key);
        const c = cardFor(o, accounts), what = o.card ? o.card.name : o.program ? o.program.name : null;
        if (c.unknown) cardLines.push("You didn't say which card these offers are on; each offer works only on the card it was added to.");
        else if (c.hit) cardLines.push(`${what}: on your ${c.hit.name}.`);
        else if (c.several) cardLines.push(`${what}: you have ${c.several.length} linked ${o.program ? o.program.issuer : ""} cards (${c.several.map(a => a.name).join(", ")}); an offer works only on the card it was added to, so check which one shows it.`.replace("  ", " "));
        else if (c.named) cardLines.push(`${what}: I don't see a card named ${c.named} among your linked cards${c.cards.length ? ` (${c.cards.map(a => a.name).join(", ")})` : ""}, so I can't see what you put on it.`);
        else cardLines.push(`${what}: none of your linked cards looks like a${/^[AEIOU]/.test(o.program.issuer) ? "n" : ""} ${o.program.issuer} card${c.cards.length ? ` (${c.cards.map(a => a.name).join(", ")})` : ""}, so I can't see what you put on it.`);
      }
      if (cardLines.length && anyData) lines.push("", ...cardLines);
      lines.push(NEVER);
      if (anyData) {
        const used = rows.filter(r => purchase(r) && r.posted_on > addDays(today, -WINDOW) && r.posted_on <= today).map(r => r.posted_on).sort();
        lines.push(used.length ? `From your linked accounts: posted purchases ${used[0]} through ${used[used.length - 1]}.` : `From your linked accounts: no posted purchases in the last ${WINDOW} days.`);
      }
      return lines.join("\n");
    }

    return { answer, kind, parse, sameMerchant, toDate, habit, cardFor, PROGRAMS, WINDOW };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = CardOffers;
