  /* Buy a stock or ETF from a text, end to end (Instinct spec docs 01, 09, 11, 14; depth protocol docs/depth/INV-011.md;
     real-world set C46). The dialogue and state machine over AgentInvest (restatement math), AgentLoop (tiers,
     confirmation, idempotency, crash recovery), AdviceGuard (decision words are refused), Compliance (no partner, no
     order), AgentVoice (what a reply means) and RealWorld (the fill is proof only when read back). One session per
     conversation: start(text) stages or asks, reply(text) approves, corrects or declines, followUp() reconciles,
     today() lists what was bought from memory. Nothing here talks to a broker; the connectors the session is given do:
     read("brokerage_accounts"), read("quote", {symbol}), read("order", {order_id}), read("holdings", {account}) and
     the loop's write/verify for the order itself. Loads after AgentInvest, AgentLoop, AdviceGuard, Compliance,
     AgentVoice, RealWorld. */
  const AgentTrade = (() => {
    const CAPABILITY = "INV-011", DAY = 86400000; // buys; sells are INV-012
    const money = c => { const s = Math.abs(Math.round(c)); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const ymd = ms => new Date(ms).toISOString().slice(0, 10);
    // The person's own calendar day for a time zone (opts.tz, e.g. "America/New_York"); an absent or unknown zone is UTC.
    const localYmd = (ms, tz) => { if (tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); } catch (e) { /* unknown zone: UTC */ } } return ymd(ms); };
    const qty = q => String(Math.round(q * 10000) / 10000);

    // S01: dollars or shares, exactly. A bare integer next to a symbol is ambiguous (500 dollars or 500 shares?) and asks.
    const DOLLARS = /(?:\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\s*(?:shares?|units?))\b|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars|bucks|usd)\b)/i;
    const SHARES = /\b(\d+(?:\.\d+)?)\s*(?:shares?|units?)\b/i;
    const BARE = /\b(?:buy|get|purchase|add|sell)\s+(\d+(?:\.\d+)?)\s+(?!dollars|bucks|usd|shares?|units?)([A-Za-z][A-Za-z.&'-]{0,5})\b/i;
    // "put everything in", "all in", "all my cash": the account's whole buying power, read from the broker and flagged as
    // 100% of the cash before anything else (response-style corpus 3.09). Other vague sizes still ask.
    const ALL_IN = /\b(everything|all my cash|all in|all of my cash|max(?:imum)?|as much as (?:i can|possible))\b/i;
    const VAGUE = /\b(a bunch|some|a little|a lot|whatever)\b/i;
    // "10k of VOO" is $10,000.00; "invest 5000 in X" and "put 300 into X" name dollars (megadoc E14, I03).
    const THOUSANDS = /(?:^|[\s$])(\d+(?:\.\d+)?)\s?k\b/i, INVEST = /\b(?:invest|put)\s+\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s+(?:in|into)\b/i;
    function parseAmount(text) {
      const t = String(text || "");
      const k = THOUSANDS.exec(t); if (k) { const c = Math.round(Number(k[1]) * 100000); return c > 0 ? { notional_cents: c } : { zero: true }; }
      const inv = INVEST.exec(t); if (inv) { const c = Number(inv[1].replace(/,/g, "")) * 100 + Number(((inv[2] || "") + "00").slice(0, 2)); return c > 0 ? { notional_cents: c } : { zero: true }; }
      const d = DOLLARS.exec(t), s = SHARES.exec(t);
      if (d) { const whole = Number((d[1] || d[3]).replace(/,/g, "")), frac = Number(((d[2] || d[4] || "") + "00").slice(0, 2)); const cents = whole * 100 + frac; return cents > 0 ? { notional_cents: cents } : { zero: true }; }
      if (s) { const q = Number(s[1]); return q > 0 ? { quantity: q } : { zero: true }; }
      const b = BARE.exec(t); if (b) { const n = Number(b[1]); if (!(n > 0)) return { zero: true }; return Number.isInteger(n) ? { ambiguous: n, symbol_hint: b[2] } : { quantity: n, symbol_hint: b[2] }; }
      if (ALL_IN.test(t) && !/\bsell\b/i.test(t)) return { all_in: true };
      if (VAGUE.test(t)) return { vague: true };
      return {};
    }
    // Rail 2: every order type and both sides. Prices are read from the words that carry them; nothing is guessed.
    const PX = "\\$\\s?(\\d[\\d,]*)(?:\\.(\\d{1,2}))?";
    const cents = (w, f) => Number(String(w).replace(/,/g, "")) * 100 + Number(((f || "") + "00").slice(0, 2));
    // "Dips to" and "rises to" say the direction; "hits" and "reaches" don't, so their order type follows the live quote at
    // staging (megadoc E06 "buy NVDA when it hits 100": a limit when NVDA is above 100, a stop when below).
    const DIP = "dips|drops|falls|goes down|comes down|gets down|sinks", RISE = "rises|goes up|climbs|breaks", HIT = "hits|reaches|gets to|touches";
    const PXO = "\\$?\\s?(\\d[\\d,]*)(?:\\.(\\d{1,2}))?";
    const WEEKDAY = /\b(?:cancel|expire|expires|good|valid|keep it)\w*\s+(?:it\s+)?(?:by|on|until|till|through|thru)\s+(mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\b|\bby\s+(monday|tuesday|wednesday|thursday|friday|tomorrow|next week|end of (?:the )?week)\b/i;
    function orderTerms(t, side) {
      const out = { type: "market", limit_cents: null, stop_cents: null, trigger_cents: null, trail_percent: null, trail_cents: null, stop_pct_below: null, time_in_force: null, expiry_words: null, consumed: [] };
      const take = m => { if (m) out.consumed.push(m[0]); return m; };
      if (/\btrailing\b/i.test(t)) {
        out.type = "trailing_stop";
        const pc = take(/(\d+(?:\.\d+)?)\s*%/.exec(t)), dl = pc ? null : take(new RegExp(PX).exec(t));
        if (pc) out.trail_percent = Number(pc[1]); else if (dl) out.trail_cents = cents(dl[1], dl[2]);
      } else {
        const stopAt = take(new RegExp(`\\bstop(?:[- ]?loss)?(?:\\s+(?:order|price))?\\s*(?:at|@|of|to)?\\s*${PX}`, "i").exec(t));
        const stopPct = !stopAt && /\bstop\b/i.test(t) ? take(/(\d+(?:\.\d+)?)\s*%\s*(?:below|under|down)/i.exec(t)) : null;
        const limAt = take(new RegExp(`\\b(?:limit(?:\\s+price)?(?:\\s+of)?|at|@)\\s*${PX}`, "i").exec(t.replace(stopAt ? stopAt[0] : "\u0000", " ")));
        const dip = take(new RegExp(`\\b(?:if|when|once) (?:it|the price|price)\\s+(?:${DIP})\\s+(?:to|below|under)\\s*${PXO}\\b`, "i").exec(t));
        const rise = take(new RegExp(`\\b(?:if|when|once) (?:it|the price|price)\\s+(?:${RISE})\\s+(?:to\\s+|above\\s+|over\\s+)?${PXO}\\b`, "i").exec(t));
        const hit = take(new RegExp(`\\b(?:if|when|once) (?:it|the price|price)\\s+(?:${HIT})\\s+${PXO}\\b`, "i").exec(t));
        if (hit) out.trigger_cents = cents(hit[1], hit[2]);
        if (stopAt) out.stop_cents = cents(stopAt[1], stopAt[2]);
        if (stopPct) out.stop_pct_below = Number(stopPct[1]);
        if (limAt) out.limit_cents = cents(limAt[1], limAt[2]);
        // "buy if it dips to $105" is a limit; "sell if it falls to $90" is a stop; "sell if it hits $300" is a limit;
        // "buy if it rises to $110" is a stop.
        if (dip) { if (side === "sell") out.stop_cents = cents(dip[1], dip[2]); else out.limit_cents = cents(dip[1], dip[2]); }
        if (rise) { if (side === "sell") out.limit_cents = cents(rise[1], rise[2]); else out.stop_cents = cents(rise[1], rise[2]); }
        const hasStop = out.stop_cents !== null || out.stop_pct_below !== null;
        out.type = hasStop && out.limit_cents !== null ? "stop_limit" : hasStop ? "stop" : out.limit_cents !== null || out.trigger_cents ? "limit" : "market";
      }
      if (/\b(gtc|good[\s-]*(?:'?til|till|until)[\s-]*(?:cancel(?:l)?ed|canceled)|until i cancel(?: it)?|till i cancel(?: it)?)\b/i.test(t)) out.time_in_force = "gtc";
      else if (/\b(day order|today only|for today|expires? (?:at|by) (?:the )?close)\b/i.test(t)) out.time_in_force = "day";
      const wd = WEEKDAY.exec(t); if (wd) { out.expiry_words = wd[0]; out.consumed.push(wd[0]); }
      return out;
    }
    function parse(text) {
      const t = String(text || "").trim();
      const protect = /\b(?:put|set|place|add)\s+(?:a\s+)?(?:trailing\s+)?stop\b/i.test(t) && /\bmy\b/i.test(t) && !/\bbuy\b/i.test(t);
      const side = (/\bsell\b/i.test(t) && !/\bbuy\b/i.test(t)) || protect ? "sell" : "buy";
      const asset = /\b(btc|bitcoin|eth|ethereum|sol|solana|doge|crypto|coins?|tokens?|memecoin)\b/i.test(t) ? "crypto" : "equity";
      // "What's my order status", "did my buy fill?", "is my VOO order filled" (megadoc E16, E18): a read of the order.
      const STATUS = /\b(?:order status|status of (?:my|the|that) (?:\w+ )?(?:order|buy|sell|trade)|did (?:my|the|that) (?:\w+ )?(?:buy|sell|order|trade|purchase)(?: order)? (?:fill|go through|execute|complete)|(?:is|has) (?:my|the|that) (?:\w+ )?(?:order|buy|sell|trade)(?: order)? (?:filled|done|through|executed|complete|gone through)|did (?:it|that) fill|where(?:'s| is) my (?:\w+ )?(?:order|buy|sell))\b/i;
      // "What's NVDA trading at", "price of VOO", "how much is AAPL a share" (megadoc G09): a quote read, nothing staged.
      const QUOTE = /\b(?:what(?:'s| is| are)\s+([a-z][a-z.]{0,5})(?:\s+stock|\s+shares?)?\s+(?:trading at|at right now|going for|selling for|(?:stock |share )?price(?: right now| now| today)?)|(?:stock |share )?(?:price|quote) (?:of|for|on) ([a-z][a-z.]{0,5})(?: stock| shares?)?(?: right now| now| today)?|how much is ([a-z][a-z.]{0,5}) (?:stock |trading |a share|per share|right now|now|today))\s*[?.!]*\s*$/i;
      // A ticker is a ticker when the words say stock ("trading at", "stock", "a share") or it is written in capitals:
      // "what's the price of gas" is not GAS.
      const qm0 = !/\b(buy|sell|order|should|portfolio|holdings?)\b/i.test(t) ? QUOTE.exec(t) : null;
      const qm = qm0 && (/\b(?:trading at|going for|selling for|stock|shares?|per share)\b/i.test(t) || /^[A-Z][A-Z.]{0,5}$/.test(String(qm0[1] || qm0[2] || qm0[3]))) ? qm0 : null;
      // "How much did I make on NVDA", "am I up on VOO", "my gain on PLTR" (megadoc G03): the position's own cost basis.
      const GAIN = /\b(?:how much (?:did|have) i (?:make|made|lose|lost|gain(?:ed)?|earn(?:ed)?) (?:on|from|with|in) ([a-z][a-z.]{0,5})|am i (?:up|down)(?: or (?:up|down))? (?:on|in) ([a-z][a-z.]{0,5})|(?:what'?s |what is )?my (?:gain|profit|loss|return|p&l|p ?and ?l) (?:on|from|in) ([a-z][a-z.]{0,5}))\b(?:\s+(?:stock|shares?|so far|overall|total))*\s*[?.!]*\s*$/i;
      // Never a ticker: a month, a pronoun, a common money word ("how much did I make in August", "on my house").
      const NOT_TICKER = /^(?:my|the|it|this|that|these|those|a|an|all|total|cash|rent|food|gas|work|me|you|him|her|them|us|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december|today|week|month|year|uber|lyft|ebay|etsy|tips|crypto)$/i;
      const gm0 = !/\b(buy|sell|order|should)\b/i.test(t) ? GAIN.exec(t) : null;
      const gm = gm0 && !NOT_TICKER.test(String(gm0[1] || gm0[2] || gm0[3]).replace(/\.$/, "")) ? gm0 : null;
      const gain_symbol = gm ? String(gm[1] || gm[2] || gm[3]).replace(/\.$/, "") : null;
      const action = gm ? "gain"
        : qm ? "quote"
        : STATUS.test(t) && !/\bcancel\b/i.test(t) ? "status"
        : /\bcancel\b[\w\s$.,'%-]{0,40}\border\b|\bcancel\s+(?:my|the|that)\s+(?:\w+\s+)?(?:limit|stop|buy|sell|trailing)\b/i.test(t) ? "cancel"
        : /\b(change|move|update|raise|lower|modify|bump|adjust)\b[\w\s$.,'%-]{0,40}\b(limit|stop|order|trail|trailing)\b/i.test(t) ? "modify"
        : /\b(portfolio|holdings|positions|what do i own|what am i holding|what'?s in my (?:account|brokerage)|(?:biggest|largest|top|smallest) (?:position|holding|stock))\b/i.test(t) && !/\b(buy|sell)\b/i.test(t) ? "portfolio" : "new";
      const quote_symbol = qm ? String(qm[1] || qm[2] || qm[3]).replace(/\.$/, "") : null;
      const terms = orderTerms(t, side);
      const limit = terms.limit_cents !== null ? { 0: "" } : null; // kept for the scope check below
      const another = /\b(another|again|one more|a second)\b/i.test(t);
      let rest = t; for (const c of terms.consumed) rest = rest.replace(c, " ");
      const amount = parseAmount(rest);
      // Sells name a part of a holding: half, all, a third, 25 percent.
      let fraction = null;
      if (side === "sell") { const f = /\b(half|all|everything|entire|whole position|a third|one third|a quarter|one quarter)\b|\b(\d{1,3})\s*%\s*of\b/i.exec(rest); if (f) fraction = f[2] ? Number(f[2]) / 100 : { half: 0.5, all: 1, everything: 1, entire: 1, "whole position": 1, "a third": 1 / 3, "one third": 1 / 3, "a quarter": 0.25, "one quarter": 0.25 }[f[1].toLowerCase()]; if (protect && !fraction && !amount.quantity && !amount.notional_cents && !amount.ambiguous) fraction = 1; }
      let query = null;
      const of = /\b(?:of|in(?:to)?)\s+(?!my\b|cash\b|savings\b|checking\b)([A-Za-z][A-Za-z0-9.&' -]{0,40}?)(?=\s+(?:in|from|using|at|now|please|and|today|tomorrow|if|with|for|good|gtc|until|till|limit|stop)\b|\s*[,.!?](?=\s|$)|$)/i.exec(rest.replace(/\b(shares?|units?|dollars)\s+of\b/i, "of"));
      if (of) query = of[1].trim();
      else if (amount.symbol_hint) query = amount.symbol_hint;
      else { const up = /\b([A-Z]{1,5}(?:\.[A-Z])?)(?![\w.])(?!\s*\$)/.exec(rest.replace(DOLLARS, " ").replace(/\b(ETF|USD|IRA|ROTH|ET|AM|PM|GTC)\b/g, " ")); if (up) query = up[1]; }
      // A lowercase ticker right after the verb ("buy nvda"): the broker's asset list decides whether it is one.
      if (!query) { const w = /\b(?:buy|sell|get|purchase)\s+(?:some\s+|more\s+)?([a-z]{1,5}(?:\.[a-z])?)(?![\w.])/i.exec(rest); if (w && !/^(it|that|this|them|all|half|my|the|some|more|stock|a|an|now|back|off|out|in|up|with|while|when|during|after|before|at|on|for|and|if|to|from|into|low|high|me|us|you|what|which|any|one|cheap)$/i.test(w[1])) query = w[1]; }
      if (!query) { const my = /\bmy\s+(?!(?:roth|ira|brokerage|account|schwab|fidelity|vanguard account|401k|taxable|order|limit|stop|cash)\b)([A-Za-z][\w.&'-]*)/i.exec(rest); if (my) query = my[1]; }
      if (query) query = query.replace(/\s+(ETF|stock|shares?|order)$/i, "").trim() || null;
      // "I" and "A" are words before they are tickers; money words are not instruments ("with 300 in cash", megadoc F02, H12).
      if (query && (/^(I|A)$/.test(query) && !/(?:\$|\bof\s+)(?:I|A)\b/.test(rest)) || query && /^(cash|savings|checking|my account|the market|stocks?)$/i.test(query)) query = null;
      const acct = /\b(?:in|from|using)\s+(?:my\s+)?((?:schwab|fidelity|vanguard|robinhood|public|roth|ira|brokerage|taxable|401k)[\w -]{0,24}?)(?=\s+account\b|\s*[,.!?]|$)/i.exec(t);
      // A number next to a symbol with a price attached ("buy 10 NVDA at $105") is a share count: notional orders are market only.
      // A bare number on a market buy is dollars ("buy 100 of nvda" is $100.00 of NVDA; owner's response-style corpus 3.01,
      // 3.03 and scenario E61); the card shows the dollars before any yes. A bare number on a sell still asks.
      const bareDollars = !!amount.ambiguous && terms.type === "market" && side === "buy";
      const ambiguous = bareDollars || (amount.ambiguous && terms.type !== "market") ? null : amount.ambiguous || null;
      const quantity = amount.quantity || (amount.ambiguous && terms.type !== "market" ? amount.ambiguous : null);
      return { text: t, side, asset, action, type: terms.type, limit_cents: limit ? terms.limit_cents : null, trigger_cents: terms.trigger_cents, stop_cents: terms.stop_cents, stop_pct_below: terms.stop_pct_below, trail_percent: terms.trail_percent, trail_cents: terms.trail_cents, time_in_force: terms.time_in_force, expiry_words: terms.expiry_words, another, notional_cents: amount.notional_cents || (bareDollars ? amount.ambiguous * 100 : null), all_in: !!amount.all_in && side === "buy", quantity, fraction, ambiguous_number: ambiguous, vague: !!amount.vague && !fraction, zero: !!amount.zero, query: gain_symbol || quote_symbol || query, account: acct ? acct[1].trim() : null };
    }

    // S02: the symbol resolves against real instruments the caller supplies ({symbol, name, type, tradable_at: [account ids] | undefined}); a look-alike one edit away asks.
    function editDistance(a, b) { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0))); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
    function resolve(query, instruments) {
      const q = String(query || "").trim(); if (!q) return { unknown: true };
      const list = instruments || [], up = q.toUpperCase();
      const exact = list.find(i => i.symbol.toUpperCase() === up); if (exact) return { exact };
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const byName = list.filter(i => { const n = String(i.name || "").toLowerCase(); return words.every(w => n.includes(w)); });
      if (byName.length === 1) return { suggest: byName[0], why: "name" };
      if (byName.length > 1) return { ambiguous: byName.slice(0, 4) };
      // A zero for an O or a one for an I is a typed look-alike, never a different instrument; so is one edit.
      const canon = s => String(s).toUpperCase().replace(/0/g, "O").replace(/1/g, "I");
      if (/^[A-Z0-9.]{1,5}$/i.test(q)) { const near = list.map(i => ({ i, d: canon(i.symbol) === canon(up) ? 0 : editDistance(up, i.symbol.toUpperCase()) })).filter(x => x.d <= 1).sort((a, b) => a.d - b.d); if (near.length === 1 || (near.length > 1 && near[0].d === 0 && near[1].d > 0)) return { suggest: near[0].i, why: "lookalike" }; if (near.length > 1) return { ambiguous: near.map(x => x.i).slice(0, 4) }; }
      return { unknown: true };
    }
    // A company named in words ("palantir", "apple"), matched against a list the caller supplies ({symbol, name}): the
    // person's own positions for a sell, the broker's asset list for a buy. Every word the person typed (filler dropped)
    // is a word of the name or starts one, so "palantir" matches "Palantir Technologies Inc. Class A Common Stock" and
    // "pineapple" is never "apple"; the ticker itself matches too. Pure; the flow decides what one, several or none mean.
    const NAME_FILLER = new Set(["the", "a", "an", "my", "of", "stock", "stocks", "share", "shares", "company", "co", "corp", "corporation", "inc", "holding", "holdings", "position", "fund"]);
    const nameWords = s => String(s || "").toLowerCase().replace(/['’.]/g, "").split(/[^a-z0-9&]+/).filter(Boolean);
    function nameMatch(query, list) {
      const q = nameWords(query).filter(w => !NAME_FILLER.has(w)), sym = String(query || "").trim().toUpperCase();
      if (!q.length) return [];
      return (list || []).filter(i => {
        if (String(i.symbol || "").toUpperCase() === sym) return true;
        const n = nameWords(i.name);
        return n.length > 0 && q.every(w => n.some(x => x === w || (w.length >= 3 && x.startsWith(w))));
      });
    }

    // S11: regular session, 9:30 to 16:00 ET, Monday to Friday, less the holidays the caller lists (ymd).
    function etParts(ms) { const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", weekday: "short", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }); const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value; return { weekday: o.weekday, date: `${o.year}-${{ Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" }[o.month]}-${o.day}`, label: `${o.weekday} ${o.month} ${Number(o.day)}`, minutes: Number(o.hour) * 60 + Number(o.minute) }; }
    function marketOpen(ms, holidays) { const p = etParts(ms); if (["Sat", "Sun"].includes(p.weekday)) return false; if ((holidays || []).includes(p.date)) return false; return p.minutes >= 570 && p.minutes < 960; }
    function nextOpen(ms, holidays) { const p = etParts(ms); if (!["Sat", "Sun"].includes(p.weekday) && !(holidays || []).includes(p.date) && p.minutes < 570) return `today's 9:30 ET open`; for (let i = 1; i <= 10; i++) { const q = etParts(ms + i * DAY); if (!["Sat", "Sun"].includes(q.weekday) && !(holidays || []).includes(q.date)) return `the 9:30 ET open on ${q.label}`; } return "the next market open"; }

    function create(opts) {
      const o = opts || {}, clock = o.clock || (() => Date.now());
      const day = ms => localYmd(ms, o.tz); // "today" as the person counts it; idempotency keys stay on the UTC day
      const Invest = typeof AgentInvest !== "undefined" ? AgentInvest : null, Loop = typeof AgentLoop !== "undefined" ? AgentLoop : null, Guard = typeof AdviceGuard !== "undefined" ? AdviceGuard : null, Voice = typeof AgentVoice !== "undefined" ? AgentVoice : null, Comp = o.compliance !== undefined ? o.compliance : (typeof Compliance !== "undefined" ? Compliance : null);
      if (!Invest || !Loop) throw new Error("AgentTrade needs AgentInvest and AgentLoop loaded.");
      const conn = o.connectors; if (!conn || typeof conn.read !== "function") throw new Error("AgentTrade needs connectors with read, write and verify.");
      // A stateless host restores the session from snapshot(): the loop (log, memory, pending confirmation), the orders and the live card.
      const st = o.state || {}, ls = st.loop || {};
      const log = Array.isArray(o.log) ? o.log : Array.isArray(ls.log) ? ls.log : [];
      const loop = Loop.create({ registry: o.registry, connectors: conn, clock, log, memory: o.memory || ls.memory || null, sent: ls.sent, pending: ls.pending || null, control: o.control || null, envelopes: [], confirm_ttl_ms: o.confirm_ttl_ms || 10 * 60000, compliance: Comp, partners: o.partners || {}, kyc: o.kyc || null });
      const freshness = o.quote_freshness_ms || 15 * 60000, holidays = o.holidays || [];
      // A broker adapter that reconciles by client order id learns from the loop log when a write was attempted.
      if (typeof conn.bindLog === "function") conn.bindLog(key => { const e = log.filter(x => x.to === "ACTING" && x.input && x.input.idempotency_key === key).pop(); return e ? e.at : undefined; });
      const orders = Array.isArray(st.orders) ? st.orders : []; // every order this session staged, with its key and read-backs
      let pending = st.pending || null; // { order, confirmation_id }
      const Cards = typeof AgentCards !== "undefined" ? AgentCards : null;

      // S15: nothing leaves without the advice-guard response lint; a message that fails is reported, never sent as advice.
      // A reply starts with a capital even when it opens with an account name ("your Alpaca account ...").
      const say = (outcome, text0, extra) => { const text = typeof text0 === "string" ? text0.charAt(0).toUpperCase() + text0.slice(1) : text0; const lint = Guard ? Guard.response(text) : { ok: true, findings: [] }; return Object.assign({ outcome, text, lint_ok: lint.ok, lint: lint.findings }, extra || {}); };
      const ask = (reason, text, extra) => say("ask", text, Object.assign({ reason }, extra));

      async function readOr(kind, params) { try { const r = await conn.read(kind, params || {}); if (!r || !r.source || !r.as_of) return null; return r; } catch (_) { return null; } }

      // S07: the confirmation restates the exact order: side, size, symbol with name, estimate at the quote with source and as-of, account, type, timing.
      // The card a person answers: two SMS segments at most. Action with the exact amount, where the money goes, the fee
      // and total, the quote it is priced on (source and as-of, on every card), what the order type does, that it queues
      // when the market is closed, that a filled order can't be undone, and LIVE on every live account. The rest is DETAILS.
      const hhmm = ms => new Date(ms).toISOString().slice(11, 16) + " UTC";
      // LIVE on every surface of a person's own live account. Owner rule (2026-10-11): everything is live; there is no paper
      // mode, label or fallback anywhere. A paper account is refused at account selection.
      const MODE = acct => acct && acct.live ? "LIVE: " : "";
      const verb = ord => ord.side === "sell" ? "Sell" : "Buy";
      const tifWords = ord => ord.type === "market" ? null : ord.time_in_force === "gtc" ? "good till canceled" : "day order, expires at today's close";
      function terms(ord) {
        const L = ord.limit_cents !== null && ord.limit_cents !== undefined ? money(ord.limit_cents) : null, S = ord.stop_cents !== null && ord.stop_cents !== undefined ? money(ord.stop_cents) : null;
        if (ord.type === "limit") return { head: ` at a ${L} limit`, note: `Fills only at ${L} or ${ord.side === "buy" ? "lower" : "higher"}` };
        if (ord.type === "stop") return { head: ` if it ${ord.side === "sell" ? "falls" : "rises"} to ${S} (stop)`, note: `A stop ${ord.side === "sell" ? "sells" : "buys"} at market once hit; on a gap it can fill ${ord.side === "sell" ? "below" : "above"} ${S}` };
        if (ord.type === "stop_limit") return { head: ` with a ${S} stop and ${L} limit`, note: `Once ${S} trades it becomes a ${L} limit and may not fill` };
        if (ord.type === "trailing_stop") { const tr = ord.trail_percent ? `${ord.trail_percent}%` : money(ord.trail_cents); return { head: ` with a ${tr} trailing stop`, note: `It trails the ${ord.side === "sell" ? "high" : "low"} by ${tr} and ${ord.side === "sell" ? "sells" : "buys"} at market once hit; a gap can fill past it` }; }
        return { head: "", note: null };
      }
      function cardText(ord, channel) {
        // The amount on the card is the amount that will be spent. A whole-share account turns "$1,200 of VOO" into 2 shares
        // for about $1,024.20; the card says 2 shares and the real figure, never the $1,200 that was asked for.
        const dollars = ord.notional_cents && !ord.leftover_cents;
        const size = dollars ? `${money(ord.notional_cents)} of` : `${qty(ord.quantity)} share${ord.quantity === 1 ? "" : "s"} of`;
        const est = dollars ? "" : `, about ${money(ord.estimated_cents)}${ord.leftover_cents ? ` (whole shares only; ${money(ord.leftover_cents)} stays in cash)` : ""},`;
        const side = ord.side || "buy", V = side === "sell" ? "Sell" : "Buy", T = terms(ord), tif = tifWords(ord);
        const heads = [`${MODE(ord.account)}${V} ${size} ${ord.symbol} (${ord.name})${T.head}${est} in ${ord.account.name}`, `${MODE(ord.account)}${V} ${size} ${ord.symbol}${T.head}${est} in ${ord.account.name}`];
        const quote = `Quote ${money(ord.price_cents)} (${ord.quote_source}, ${hhmm(ord.quote_as_of)})`;
        const timing = ord.market_open ? null : ord.type === "market" ? `Queued until ${ord.when}` : `Works from ${ord.when}`;
        const whens = [[quote, T.note, tif && tif[0].toUpperCase() + tif.slice(1), timing], [quote, T.note, tif === "good till canceled" ? "GTC" : tif ? "Day order" : null, timing], [quote, T.note, timing]];
        for (const w of whens) for (const head of heads) {
          const f = { head, fee_cents: ord.fee_cents || 0, total_cents: ord.estimated_cents + (ord.fee_cents || 0), when: w.filter(Boolean).join(". "), irreversible: true, irreversible_text: "Can't be undone once filled.", expiry_ms: o.confirm_ttl_ms || 10 * 60000 };
          const r = Cards ? Cards.compactText(f, channel || "sms") : { text: `${head}. ${f.fee_cents ? `Fee ${money(f.fee_cents)}, total ${money(f.total_cents)}.` : "No fee."} ${f.when}. Can't be undone once filled. Reply YES or NO within 10 min, or DETAILS.`, segments: { segments: Math.ceil((head.length + f.when.length + 80) / 153) } };
          if (r.segments.segments <= 2) return r.text;
        }
        return `${MODE(ord.account)}${V} ${ord.symbol}: ${money(ord.estimated_cents)}. ${quote}. Reply YES, NO or DETAILS.`;
      }
      function confirmText(ord) {
        const size = ord.notional_cents ? `${money(ord.notional_cents)} of` : `${qty(ord.quantity)} share${ord.quantity === 1 ? "" : "s"} of`;
        const est = ord.notional_cents ? `about ${qty(ord.quantity)} shares at ${money(ord.price_cents)}` : `about ${money(ord.estimated_cents)} at ${money(ord.price_cents)}`;
        const T = terms(ord), tif = tifWords(ord);
        return `${MODE(ord.account)}${verb(ord)} ${size} ${ord.symbol} (${ord.name})${T.head} in ${ord.account.name}: ${est} (${ord.quote_source}, as of ${new Date(ord.quote_as_of).toISOString().slice(11, 16)} UTC), ${ord.type && ord.type !== "market" ? `${ord.type.replace("_", " ")} order, ${tif}` : "market order"}, ${ord.market_open ? (ord.type && ord.type !== "market" ? "works now" : "executes now") : `${ord.type && ord.type !== "market" ? "works from" : "queued until"} ${ord.when}`}. ${T.note ? T.note + ". " : ""}${ord.leftover_cents ? `${money(ord.leftover_cents)} stays in cash because ${ord.account.name} trades whole shares only. ` : ""}${ord.account.live ? `Live order with real money in your own account${Number.isSafeInteger(ord.account.order_cap_cents) ? `; limit ${money(ord.account.order_cap_cents)} per order while Upmore is in testing` : ""}. ` : ""}Reply yes or no.`;
      }

      // The instrument, from the caller's list, or (when the broker can answer) the broker's own asset record for a ticker.
      const notWired = e => /NOT_WIRED|unknown read/i.test(String(e && e.message || e));
      async function instrument(query, side) {
        const res = resolve(query, o.instruments || []);
        if (!res.unknown) return res;
        if (/^[A-Za-z][A-Za-z0-9.]{0,5}$/.test(String(query || ""))) {
          // "Not found" and "could not ask" are different answers: a broker that is down never makes a ticker unknown.
          let a = null; try { a = await conn.read("asset", { symbol: String(query).toUpperCase() }); } catch (e) { if (notWired(e)) return res; return { unreachable: true }; }
          // A record without a symbol is no instrument (a malformed read never becomes a card for "undefined").
          if (a && a.value && a.value.symbol) {
            if (a.value.tradable === false) return { exact: { symbol: a.value.symbol, name: a.value.name, not_tradable: true } };
            return { exact: { symbol: a.value.symbol, name: a.value.name, fractionable: a.value.fractionable } };
          }
        }
        // A buy named by company ("buy $3 of palantir"): the broker's own asset list, used only when exactly one tradable,
        // active instrument matches; several are listed back and asked. A sell never comes here: it names a holding.
        if (side !== "buy" || !query) return res;
        let list = null; try { list = await conn.read("assets", { name: String(query) }); } catch (e) { if (notWired(e)) return res; return { unreachable: true }; }
        const hits = nameMatch(query, (Array.isArray(list && list.value) ? list.value : []).filter(x => x && x.symbol && x.tradable !== false && (!x.status || x.status === "active")));
        if (hits.length === 1) return { exact: { symbol: hits[0].symbol, name: hits[0].name, fractionable: hits[0].fractionable }, by_name: true };
        if (hits.length > 1) return { ambiguous: hits.slice(0, 4), total: hits.length, by_name: true };
        return res;
      }
      // The person's own positions with each company's name (the broker's asset record when the position row has none),
      // read for a sell named by company. Rows with nothing held are left out.
      async function heldNamed(account) {
        const h = await readOr("holdings", { account: account.id });
        if (!h) return null;
        const rows = (h.value || []).map(x => ({ symbol: x.symbol, name: x.name || null, qty: Number(x.qty !== undefined ? x.qty : x.quantity) || 0, fractionable: x.fractionable })).filter(x => x.symbol && x.qty > 0);
        const named = await Promise.all(rows.map(async (x, i) => {
          if (x.name || i >= 50) return x; // at most 50 name look-ups per message; the rest keep their ticker only
          const a = await readOr("asset", { symbol: x.symbol });
          return a && a.value ? Object.assign({}, x, { name: a.value.name || null, fractionable: a.value.fractionable, not_tradable: a.value.tradable === false }) : x;
        }));
        return { rows: named, unnamed: named.filter(x => !x.name).length, source: h.source, as_of: h.as_of };
      }
      const holdingList = rows => rows.slice(0, 5).map(x => `${x.symbol}${x.name ? ` (${x.name})` : ""}`).join(", ") + (rows.length > 5 ? `, and ${rows.length - 5} more` : "");
      // The market session from the broker's clock when it has one, else the regular-hours calendar.
      async function session(now) {
        const mc = await readOr("market_clock");
        if (mc && mc.value && typeof mc.value.is_open === "boolean") { if (mc.value.is_open) return { open: true, when: "now" }; const n = mc.value.next_open ? Date.parse(mc.value.next_open) : NaN; return { open: false, when: Number.isFinite(n) ? `the 9:30 ET open on ${etParts(n).label}` : nextOpen(now, holidays) }; }
        const open = marketOpen(now, holidays); return { open, when: open ? "now" : nextOpen(now, holidays) };
      }
      // Shares held and available to sell, read from the account (the position, else the holdings list).
      async function holding(account, symbol) {
        const p = await readOr("position", { symbol, account: account.id });
        if (p && p.value) return { qty: Number(p.value.qty_available !== undefined ? p.value.qty_available : p.value.qty) || 0, held: Number(p.value.qty) || 0, source: p.source, as_of: p.as_of };
        const h = await readOr("holdings", { account: account.id });
        if (!h) return null;
        const row = (h.value || []).find(x => x.symbol === symbol);
        return { qty: row ? Number(row.qty_available !== undefined ? row.qty_available : (row.qty !== undefined ? row.qty : row.quantity)) || 0 : 0, held: row ? Number(row.qty !== undefined ? row.qty : row.quantity) || 0 : 0, source: h.source, as_of: h.as_of };
      }
      let suggestion = st.suggestion || null; // "Did you mean VOO?" waiting on yes, with the order it is for

      // Brokerage connect: nothing connected, a provider not built, or a connection the broker refused is said plainly, with
      // where to fix it, before anything is read or staged (o.connect = { code, message } from BrokerAccounts.resolve).
      const connectStop = () => o.connect && o.connect.message ? say("blocked", o.connect.message, { reason: "broker_" + (o.connect.code || "connect"), early: true }) : null;
      const noApi = word => { const BA = typeof BrokerAccounts !== "undefined" ? BrokerAccounts : null; return BA && word ? BA.unsupported(word) : null; };
      // A read that failed because the broker refused the person's token (401) is a Reconnect, never "try again later".
      const READ_FAILS = ["broker_unreachable", "accounts_unreadable", "no_quote", "position_unreadable", "cash_unknown", "holdings_unreadable", "symbol_unknown"];
      const gone = () => typeof conn.auth_failed === "function" && conn.auth_failed() === true;
      const BAx = typeof BrokerAccounts !== "undefined" ? BrokerAccounts : typeof require === "function" ? require("./73-broker-accounts.js") : null;
      const RECONNECT = BAx ? BAx.MESSAGES.reconnect("brokerage") : "Your brokerage connection was revoked or has expired, so nothing was placed. Reconnect it in Settings > Brokerage.";
      async function stage(parsed) {
        const r = await stageOnce(parsed);
        if (r && gone() && READ_FAILS.includes(r.reason)) { pending = null; return say("blocked", RECONNECT, { reason: "broker_reconnect" }); }
        return r;
      }
      async function stageOnce(parsed) {
        suggestion = null;
        // Copying someone's portfolio is not built: said plainly, with why a copy would be stale (corpus 3.08, scenario H02).
        if (/\b(copy|copied|copying|mirror|mirrored)\b/i.test(parsed.text || "")) return say("not_built", "Copy trading isn't built yet, so nothing was placed. Public disclosures also arrive late (up to 45 days), so a copy would buy stale positions. Want to see your own holdings instead?", { reason: "copy_not_built" });
        // An investment pitch with a promised return is a scam pattern; nothing is staged (megadoc N01).
        if (/\bguarantee[d]?\b.{0,20}\b(returns?|profits?|gains?|income|\d+\s*%)|\b(double your money|risk[- ]free (?:returns?|profit)|can'?t lose|10x guaranteed)\b/i.test(parsed.text || "")) return say("stop", "That's a scam pattern: nobody can guarantee an investment return. I won't put money into this, and nothing was placed.", { reason: "scam_pattern" });
        // Stops across every holding at once are not built (megadoc E13): one holding at a time.
        if (/\bstop(?:[- ]?loss)?\b/i.test(parsed.text || "") && /\ball (?:of )?my (?:positions|holdings|stocks)|\beverything\b|\bevery (?:position|holding|stock)\b/i.test(parsed.text || "")) return say("not_built", "Stops on every holding at once aren't built yet, so nothing was placed. I can set one stop at a time: name the holding and the price.", { reason: "bulk_stop_not_built" });
        if (parsed.action === "portfolio" || parsed.action === "cancel" || parsed.action === "modify" || parsed.action === "status") { const c = connectStop(); if (c) return c; }
        if (parsed.action === "status") return orderStatus(parsed.text);
        if (parsed.action === "quote") { const c = connectStop(); if (c) return c; return quoteOnly(parsed.query); }
        if (parsed.action === "gain") { const c = connectStop(); if (c) return c; return gainOn(parsed.query); }
        if (parsed.action === "portfolio") return portfolio(parsed.text);
        if (parsed.action === "cancel" || parsed.action === "modify") return manage(parsed);
        // Scope first: crypto belongs to another venue; say so and stage nothing.
        if (parsed.asset === "crypto") return say("refuse", "Upmore can't trade crypto yet, so nothing was placed. Want to name a stock-listed fund instead? I'll put up a card for it.", { reason: "crypto_venue" });
        // Products Upmore does not offer, said plainly before any question (megadoc E20, E21, E25, I01-I08, M10).
        const tx = parsed.text || "";
        if (/\b(options?|calls|puts|call options?|put options?|contracts)\b/i.test(tx) && /\b(buy|sell|trade|yolo|copy)\b/i.test(tx)) return say("refuse", "Upmore can't trade options, so nothing was placed. It can buy or sell stocks and ETFs in your own account.", { reason: "options_unsupported" });
        if (/\b(on margin|margin|shorting|short sell|sell short|go short|leverage[d]?)\b/i.test(tx)) return say("refuse", "Upmore only places cash orders, with no margin or short selling, so nothing was placed.", { reason: "margin_unsupported" });
        // Money into savings or checking is a transfer between the person's own accounts, not an order (megadoc M09).
        if (/\b(?:in|into|to)\s+(?:my\s+)?(savings|checking|emergency fund|bank)\b/i.test(tx)) return say("not_built", "Moving money between your own accounts isn't built yet, so nothing was moved or placed.", { reason: "transfer_not_built" });
        { const priv = /\b(spacex|stripe|openai|anthropic|databricks|chime|discord|epic games|shein|klarna)\b/i.exec(tx);
          if (priv) return say("refuse", `${priv[1].replace(/\b\w/g, c => c.toUpperCase()).replace(/^Spacex$/, "SpaceX").replace(/^Openai$/, "OpenAI")} isn't publicly traded, so Upmore can't buy it, and nothing was placed. Want to name a listed company or fund instead? I'll put up a card for it.`, { reason: "private_unsupported" });
          if (/\b(ipo|ipos|pre[- ]?ipo|private (?:company|shares|stock))\b/i.test(tx)) return say("refuse", "Upmore can't get IPO allocations or private-company shares, so nothing was placed. Once a company lists, want to name its ticker and an amount? I'll put up a card for it.", { reason: "ipo_private_unsupported" }); }
        if (/\b(a|per|each|every)\s+(week|month|day|paycheck|quarter)\b|\b(weekly|monthly|recurring|auto[- ]?invest|automatically|dca|dollar[- ]cost)\b/i.test(tx)) return say("not_built", "Recurring investments aren't built yet, so nothing was scheduled or placed. I can put up a card for a one-time order if you name the amount.", { reason: "recurring_not_built" });
        const side = parsed.side === "sell" ? "sell" : "buy", CAP = side === "sell" ? "INV-012" : CAPABILITY;
        let type = parsed.type || "market";
        // S03: decision words are refused before anything is read or staged. The guard catches the advice shapes; the local
        // list catches an order that leaves the choice of instrument or timing to the agent ("whatever's best", "the dip").
        const DECIDE = /\b(whatever|whichever|best|good one|the dip|dipped|just dropped|hot|winner|winning|pick|choose|recommend|should i|would you|what (do|would) you|pelosi|buffett|congress)\b/i;
        if (Guard) { const g = Guard.request(parsed.text); if (g.decision === "block" || DECIDE.test(parsed.text)) return say("refuse", g.decision === "block" ? "I can't tell you what to buy or sell. If you decide, name the ticker and the amount and I'll put up a card. Want to see your current holdings?" : "That leaves the choice to me, and I don't make it. Name the ticker and the amount and I'll put up a card for exactly that. Want to see your current holdings?", { reason: "advice", rules: g.decision === "block" ? g.reasons : ["decision_left_to_agent"] }); }
        // A broker with no public trading API, named by the person: the honest answer, nothing staged.
        const nope = noApi(parsed.account) || noApi((/\b(fidelity|vanguard|robinhood|sofi)\b/i.exec(parsed.text || "") || [])[1]);
        if (nope) return say("refuse", nope, { reason: "broker_no_public_api" }); // it says nothing was placed and ends on the connect link
        // Nothing connected (or a connection to fix): said before any question about size or symbol and before any read.
        { const c = connectStop(); if (c) return c; }
        // No partner, no order, said first: before any question about size or symbol and before any read, the person
        // learns that orders cannot be placed here yet. The loop's own compliance gate still stands behind this.
        const capRow = o.registry && typeof o.registry.get === "function" ? o.registry.get(CAP) : null;
        if (Comp && capRow) { const cg = Comp.gate(capRow, o.partners || {}, { executes: true, kyc: o.kyc || null }); if (cg && cg.allowed === false) return say("blocked", cg.message || "I can't place orders yet.", { reason: "compliance:" + (cg.reason || cg.requirement), early: true }); }
        // An expiry on a date is not an order type the broker has: day or good-till-canceled, never a silent guess.
        if (parsed.expiry_words && type !== "market") return ask("expiry", `The broker can't expire an order on a date ("${parsed.expiry_words}"). Day order (ends at today's close) or good till canceled (you cancel it by text)? Nothing was placed.`);
        // S01: size.
        if (parsed.fraction && (parsed.quantity || parsed.notional_cents)) return ask("size_conflict", `That names two sizes (${parsed.quantity ? qty(parsed.quantity) + " shares" : money(parsed.notional_cents)} and ${parsed.fraction === 1 ? "all of it" : "a part of it"}). Which one? Nothing was placed.`);
        if (parsed.ambiguous_number) return ask("size_ambiguous", `Is ${parsed.ambiguous_number} dollars or shares of ${(parsed.query || "that").toUpperCase()}?`);
        if (parsed.zero) return ask("size", "The amount has to be above zero. How much: dollars or shares?");
        if (parsed.vague) return ask("size", `How much exactly: a dollar amount or a share count? I don't size orders myself.`);
        if (!parsed.notional_cents && !parsed.quantity && !parsed.all_in && !(side === "sell" && parsed.fraction)) return ask("size", `How much of ${parsed.query ? (parsed.query.length <= 6 && !/\s/.test(parsed.query) ? parsed.query.toUpperCase() : parsed.query) : "it"}: ${side === "sell" ? "shares, dollars, or a part like half" : "dollars or shares"}?`);
        if (parsed.notional_cents && type !== "market") return ask("size", parsed.trigger_cents ? `An order that waits for ${money(parsed.trigger_cents)} needs a share count, not dollars. How many shares?` : `A ${type.replace("_", " ")} order needs a share count, not dollars. How many shares?`);
        // S02: instrument.
        const res = await instrument(parsed.query, side);
        if (res.unreachable) return ask("broker_unreachable", `I can't reach the broker right now, so I can't look up ${String(parsed.query).toUpperCase()}. Nothing was placed.`);
        const symbolAsk = () => {
          if (res.unknown) return ask("symbol_unknown", parsed.query ? `I can't find "${parsed.query}" among listed instruments. Which ticker?` : "Which ticker?");
          if (res.ambiguous) return ask("symbol_ambiguous", res.total > res.ambiguous.length ? `${res.total} listed companies match "${parsed.query}", including ${res.ambiguous.map(i => `${i.symbol} (${i.name})`).join(", ")}. Which ticker?` : `Which one: ${res.ambiguous.map(i => `${i.symbol} (${i.name})`).join(", ")}?`, res.by_name ? { matches: res.ambiguous.map(i => i.symbol) } : undefined);
          if (res.suggest) { suggestion = { parsed, symbol: res.suggest.symbol, at: clock() }; return ask("symbol_suggest", `${res.why === "lookalike" ? `"${parsed.query}" is not a listed symbol, but ${res.suggest.symbol} is one character away` : `Did you mean ${res.suggest.symbol}`}, ${res.suggest.name}? Say yes to use ${res.suggest.symbol}.`, { suggest: res.suggest.symbol }); }
          return null;
        };
        // A sell names something the person holds: anything but an exact ticker is matched against their own positions by
        // company name once the account is known (below), never against the market at large.
        const sellByName = side === "sell" && !res.exact && !!parsed.query;
        if (!sellByName) { const a = symbolAsk(); if (a) return a; }
        let inst = res.exact || null, heldNote = "";
        if (inst && inst.not_tradable) return say("refuse", `${inst.symbol} is not tradable at this broker.`, { reason: "not_tradable" });
        // S05: account.
        const accts = await readOr("brokerage_accounts");
        if (!accts) return ask("accounts_unreadable", "I can't read your brokerage accounts right now, so I can't place anything. Try again once the connection is back.");
        const linked = (accts.value || []).filter(a => a.linked !== false);
        let account = null;
        if (parsed.account) { const q = parsed.account.toLowerCase(); const hits = linked.filter(a => `${a.id} ${a.name}`.toLowerCase().includes(q)); if (hits.length === 1) account = hits[0]; else if (!hits.length) return ask("account_not_linked", `"${parsed.account}" is not a linked brokerage account. Linked: ${linked.map(a => a.name).join(", ") || "none"}.`); else return ask("account_ambiguous", `Which account: ${hits.map(a => a.name).join(" or ")}?`); }
        else if (linked.length === 1) account = linked[0];
        else if (!linked.length) return ask("no_account", "No brokerage account is linked, so there is nowhere to place this.");
        else return ask("account_which", `Which account: ${linked.map(a => a.name).join(" or ")}?`);
        if (account.paper === true) return say("refuse", "That account is a paper (practice) account. Upmore trades only in your own live brokerage account, so nothing was placed.", { reason: "paper_account" });
        if (account.tradable === false) return say("refuse", `${account.name} is view-only here; orders can't be placed in it.`, { reason: "account_view_only" });
        // A sell by company name: exactly one of the person's holdings matches, or the person is asked, never guessed for.
        if (sellByName) {
          const held = await heldNamed(account);
          if (!held) return ask("position_unreadable", `I can't read your positions in ${account.name} right now, so I won't stage a sell. Nothing was placed.`);
          const hits = nameMatch(parsed.query, held.rows), asOf = `${held.source}, as of ${hhmm(held.as_of)}`;
          if (hits.length > 1) return ask("holding_ambiguous", `You hold more than one match for "${parsed.query}" (${asOf}): ${holdingList(hits)}. Which one should I sell?`, { matches: hits.map(x => x.symbol) });
          if (hits.length === 1) { inst = { symbol: hits[0].symbol, name: hits[0].name || hits[0].symbol, fractionable: hits[0].fractionable }; heldNote = `You hold ${qty(hits[0].qty)} ${inst.symbol} (${inst.name}), per ${asOf}. `; if (hits[0].not_tradable) return say("refuse", `${inst.symbol} is not tradable at this broker.`, { reason: "not_tradable" }); }
          else {
            // A typed look-alike of a listed ticker keeps its own question; the yes still has to find a holding.
            if (res.suggest || res.ambiguous) return symbolAsk();
            if (!held.rows.length) return say("stop", `${account.name} shows no positions (${asOf}), so there is nothing to sell. Nothing was placed.`, { reason: "no_position" });
            if (held.unnamed) return ask("holding_names_unreadable", `I can't read the company name of every holding in ${account.name} right now, so I can't tell which one "${parsed.query}" is. Which ticker should I sell?`);
            return ask("holding_unknown", `None of your holdings in ${account.name} matches "${parsed.query}" (${asOf}). You hold ${holdingList(held.rows)}. Which one should I sell?`, { holdings: held.rows.map(x => x.symbol) });
          }
        }
        if (Array.isArray(inst.tradable_at) && !inst.tradable_at.includes(account.id)) return say("refuse", `${inst.symbol} is not tradable in ${account.name}.`, { reason: "not_tradable_here" });
        const fractional = account.fractional !== false && inst.fractionable !== false;
        let allInNote = "";
        if (parsed.all_in) {
          if (!Number.isSafeInteger(account.cash_cents)) return ask("cash_unknown", `I can't read buying power in ${account.name}, so I can't size "everything". How much in dollars?`);
          parsed = Object.assign({}, parsed, { notional_cents: account.cash_cents });
          allInNote = `That's ${money(account.cash_cents)}, 100% of your brokerage cash, into one stock. `;
        }
        // S04: a real quote, fresh, or no number at all. The ask prices a buy, the bid a sell.
        const q = await readOr("quote", { symbol: inst.symbol, side }), now = clock();
        if (!q || !q.value || !Number.isSafeInteger(q.value.price_cents)) return ask("no_quote", `I have no quote for ${inst.symbol}, so I can't estimate the order. Ask again in a moment.`);
        if (now - q.as_of > freshness) return ask("stale_quote", `The ${inst.symbol} quote I have is ${Math.round((now - q.as_of) / 60000)} minutes old, too old to price an order on. Ask again and I'll refresh it.`);
        const price = q.value.price_cents;
        // "When it hits $100": a buy above $100 now waits for it to come down (a limit), below it waits for it to rise (a
        // stop); a sell the other way round. Decided from this quote and said on the card as the order type.
        let hitLim = null, hitStop = null;
        if (Number.isSafeInteger(parsed.trigger_cents)) { if (side === "buy" ? price >= parsed.trigger_cents : price <= parsed.trigger_cents) { type = "limit"; hitLim = parsed.trigger_cents; } else { type = "stop"; hitStop = parsed.trigger_cents; } }
        // Order terms in cents; a stop "15% below" is computed from this quote and shown as a price.
        const stop = hitStop !== null ? hitStop : parsed.stop_pct_below !== null && parsed.stop_pct_below !== undefined ? Math.round(price * (100 - parsed.stop_pct_below) / 100) : parsed.stop_cents;
        const lim = hitLim !== null ? hitLim : parsed.limit_cents;
        if (type === "stop" || type === "stop_limit") { if (side === "sell" && stop >= price) return ask("stop_triggers_now", `A sell stop at ${money(stop)} is at or above the current ${money(price)}, so it would trigger right away. Did you mean a limit to sell at ${money(stop)} or better? Nothing was placed.`); if (side === "buy" && stop <= price) return ask("stop_triggers_now", `A buy stop at ${money(stop)} is at or below the current ${money(price)}, so it would trigger right away. Did you mean a limit? Nothing was placed.`); }
        if (type === "trailing_stop" && !(parsed.trail_percent > 0) && !(parsed.trail_cents > 0)) return ask("trail", "How far should it trail: a percent (like 5%) or a dollar amount?");
        const tif = type === "market" ? "day" : parsed.time_in_force || "day";
        // S06 for sells: the position is read before staging, and "half" is half of what is actually there.
        let quantity, estimated, leftover = 0, held = null;
        if (side === "sell") {
          held = await holding(account, inst.symbol);
          if (!held) return ask("position_unreadable", `I can't read your ${inst.symbol} position in ${account.name} right now, so I won't stage a sell. Nothing was placed.`);
          if (held.qty <= 0 && !heldNote && parsed.query) {
            // The words name a listed ticker the person does not hold, and a company they do hold ("sell my ford": FORD is
            // listed, F is held). The holding is offered back with a question; nothing not held is ever staged for a sale.
            const mine = await heldNamed(account), alt = mine ? nameMatch(parsed.query, mine.rows).filter(x => x.symbol !== inst.symbol) : [];
            if (alt.length === 1) { suggestion = { parsed, symbol: alt[0].symbol, at: clock() }; return ask("holding_suggest", `${account.name} shows no ${inst.symbol} to sell, but you hold ${qty(alt[0].qty)} ${alt[0].symbol} (${alt[0].name}) (${mine.source}, as of ${hhmm(mine.as_of)}). Sell ${alt[0].symbol}? Say yes to use ${alt[0].symbol}.`, { suggest: alt[0].symbol }); }
            if (alt.length > 1) return ask("holding_ambiguous", `${account.name} shows no ${inst.symbol} to sell. You hold more than one match for "${parsed.query}": ${holdingList(alt)}. Which one should I sell?`, { matches: alt.map(x => x.symbol) });
          }
          if (held.qty <= 0) return say("stop", `${account.name} shows no ${inst.symbol} available to sell (${held.source}, as of ${hhmm(held.as_of)}). Nothing was placed.`, { reason: "no_position" });
          if (parsed.fraction) { quantity = held.qty * parsed.fraction; quantity = fractional && !(type === "trailing_stop" || tif !== "day") ? Math.floor(quantity * 10000) / 10000 : Math.floor(quantity); if (quantity <= 0) return ask("whole_shares", `That part of ${qty(held.qty)} ${inst.symbol} is less than one whole share, and this order needs whole shares.`); }
          else if (parsed.notional_cents) quantity = Math.round(parsed.notional_cents * 10000 / price) / 10000;
          else quantity = parsed.quantity;
          if (quantity > held.qty + 1e-9) return say("stop", `${qty(held.qty)} ${inst.symbol} available to sell in ${account.name} (${held.source}, as of ${hhmm(held.as_of)}); selling ${qty(quantity)} needs ${qty(Math.round((quantity - held.qty) * 10000) / 10000)} more. Nothing was placed.`, { reason: "insufficient_shares", shortfall_shares: Math.round((quantity - held.qty) * 10000) / 10000 });
          estimated = parsed.notional_cents && type === "market" ? parsed.notional_cents : Math.round(quantity * (type === "limit" || type === "stop_limit" ? lim : type === "stop" ? stop : price));
        } else if (parsed.notional_cents) {
          if (fractional) { quantity = Math.round(parsed.notional_cents * 10000 / price) / 10000; estimated = parsed.notional_cents; }
          else { quantity = Math.floor(parsed.notional_cents / price); if (quantity < 1) return ask("whole_shares", `${money(parsed.notional_cents)} buys 0 whole shares of ${inst.symbol} at ${money(price)}, and ${account.name} trades whole shares only.`); estimated = quantity * price; leftover = parsed.notional_cents - estimated; }
        } else { quantity = parsed.quantity; if (!fractional && !Number.isInteger(quantity)) return ask("whole_shares", `${account.name} trades whole shares only; ${qty(quantity)} is not a whole number.`); estimated = Math.round(quantity * (type === "limit" || type === "stop_limit" ? lim : type === "stop" ? Math.max(stop, price) : price)); }
        // Fractional shares are day orders of type market, limit, stop or stop_limit only (the broker's rule, said up front).
        if (!Number.isInteger(quantity) && (type === "trailing_stop" || tif !== "day")) return ask("whole_shares", `${qty(quantity)} is a fractional share count, and ${type === "trailing_stop" ? "a trailing stop" : "a good-till-canceled order"} takes whole shares only. How many whole shares?`);
        // The owner's per-order cap on live orders, said before any card (the adapter refuses above it as well).
        const capC = Number.isSafeInteger(account.order_cap_cents) ? account.order_cap_cents : null;
        // A share count that fills at market (or at a stop, or trailing) is held to the cap 2% through the quote, as the adapter does.
        const capEst = order_notional => order_notional ? estimated : type === "limit" || type === "stop_limit" ? estimated : Math.ceil(estimated * 1.02);
        if (capC !== null && allInNote && capEst(true) > capC) return say("stop", `${allInNote}Live orders are limited to ${money(capC)} each while Upmore is in testing, so nothing was placed.`, { reason: "order_cap" });
        if (capC !== null && capEst(parsed.notional_cents && type === "market") > capC) return say("stop", `${heldNote}That's about ${money(capEst(parsed.notional_cents && type === "market"))}; live orders are limited to ${money(capC)} each while Upmore is in testing. Nothing was placed.`, { reason: "order_cap" });
        // S06: buying power, read, before asking for a yes.
        const cash = Number.isSafeInteger(account.cash_cents) ? account.cash_cents : null, fee = Number.isSafeInteger(account.fee_cents) ? account.fee_cents : 0;
        if (side === "buy") {
          if (cash === null) return ask("cash_unknown", `I can't read settled cash in ${account.name}, so I won't stage an order that might bounce.`);
          if (cash < estimated + fee) return say("stop", `${money(cash)} settled in ${account.name} (${accts.source}, as of ${new Date(accts.as_of).toISOString().slice(0, 16).replace("T", " ")} UTC); ${money(estimated + fee)} needs ${money(estimated + fee - cash)} more. Nothing was placed.`, { reason: "insufficient_cash", shortfall_cents: estimated + fee - cash });
        }
        const ses = await session(now), open = ses.open, when = ses.when;
        const order = { side, type, symbol: inst.symbol, name: inst.name, account, quantity, notional_cents: parsed.notional_cents && type === "market" ? parsed.notional_cents : null, price_cents: price, estimated_cents: estimated, fee_cents: fee, leftover_cents: leftover, quote_source: q.source, quote_as_of: q.as_of, market_open: open, when, staged_at: now,
          limit_cents: type === "limit" || type === "stop_limit" ? lim : null, stop_cents: type === "stop" || type === "stop_limit" ? stop : null, trail_percent: type === "trailing_stop" ? parsed.trail_percent || null : null, trail_cents: type === "trailing_stop" ? parsed.trail_cents || null : null, time_in_force: tif, held: held ? held.qty : null, capability_id: CAP };
        // S13: the same order on the same day carries the same key; "another" asks for a new one on purpose.
        const sizeKey = order.notional_cents ? "n" + order.notional_cents : "q" + qty(quantity), termKey = type === "market" ? "" : `:${type}:${order.limit_cents || ""}:${order.stop_cents || ""}:${order.trail_percent || order.trail_cents || ""}:${tif}`;
        const base = `${CAP}:${account.id}:${inst.symbol}:${side}:${sizeKey}${termKey}:${ymd(now)}`;
        const prior = orders.filter(x => x.key === base || x.key.startsWith(base + ":")).length;
        const key = parsed.another && prior ? `${base}:${prior + 1}` : base;
        const sizeWords = order.notional_cents ? money(order.notional_cents) + " of" : qty(quantity) + " shares of";
        const request = { capability_id: CAP, key, idempotency_key: key, params: { symbol: inst.symbol, side, quantity, notional_cents: order.notional_cents, amount_cents: estimated, account: account.id, type, limit_cents: order.limit_cents, stop_cents: order.stop_cents, trail_percent: order.trail_percent, trail_cents: order.trail_cents, time_in_force: tif, paper: !!account.paper, live: !!account.live }, describe: `${account.live ? "LIVE " : ""}${side === "sell" ? "Sell" : "Buy"} ${sizeWords} ${inst.symbol}${terms(order).head} in ${account.name}`, confirm: { action: `${side === "sell" ? "Sell" : "Buy"} ${sizeWords} ${inst.symbol} (${inst.name})`, amount: `about ${money(estimated)}`, recipient: `${inst.symbol} (${inst.name})`, from: account.name, fee: null, when: open ? "executes now" : `queued until ${when}` }, amount_cents: estimated };
        order.key = key; order.request = request;
        const r = await loop.wake({ kind: "message", request });
        if (r.outcome === "awaiting_confirmation") { pending = { order, confirmation_id: r.confirmation_id }; return say("confirm", cardText(order), { confirmation_id: r.confirmation_id, order, details: confirmText(order) }); }
        if (r.outcome === "already_done") { pending = null; const done = orders.find(x => x.key === key); return say("already_done", `${request.describe} was already placed today${done && done.order_id ? ` (order ${done.order_id})` : ""}. I did not place it again; say "another" if you want a second order.`); }
        if (r.outcome === "blocked") { pending = null; return say("blocked", r.message, { reason: r.reason }); }
        pending = null; return say(r.outcome, r.message || null, r);
      }
      // A new request while a card is live replaces it: the old card is declined in the loop first, so nothing stacks.
      async function start(text) { if (pending) { await loop.wake({ kind: "confirmation", confirmation_id: pending.confirmation_id, approved: false }); pending = null; } return stage(parse(text)); }

      // The broker's order record in this flow's words, whether it came from a broker adapter (state) or a fake rail (status).
      function canon(v) {
        if (!v || v.state === undefined) return v;
        const status = { filled: "filled", partial: "partial", partial_final: "partial_final", queued: "queued", working: "working", rejected: "rejected", canceled: "canceled", expired: "expired", replaced: "replaced", pending_cancel: "pending_cancel" }[v.state] || "unknown";
        return { status, quantity: v.qty !== null && v.qty !== undefined ? v.qty : v.filled_qty, filled_quantity: v.filled_qty, fill_price_cents: v.fill_price_cents, filled_at: v.filled_at ? Date.parse(v.filled_at) : null, reason: v.reason, order_id: v.order_id, replaced_by: v.replaced_by, canceled_at: v.canceled_at, side: v.side, type: v.type };
      }
      // S11/S12/S14: the outcome of an approved order, from the broker's record, in the user's words.
      async function settle(r, order) {
        if (r.outcome === "declined") return say("declined", "Okay, not placing it. Nothing was sent to the broker.");
        if (r.outcome === "expired") return say("expired", `${r.message} Prices move; I'll quote it fresh.`);
        if (r.outcome === "failed") return say("failed", `${MODE(order.account)}${r.message} Nothing was placed; ${order.side === "sell" ? `your ${order.symbol} stays in ${order.account.name}` : `${money(order.estimated_cents)} stays in ${order.account.name}`}.`);
        if (r.outcome === "unknown") return say("unknown", `${MODE(order.account)}${r.message} The order may or may not be resting at the broker; I'll read it back by its id before anything else.`);
        if (r.outcome !== "confirmed") return say(r.outcome, r.message || null, r);
        const ref = (r.outcome_record && r.outcome_record.reference) || (String(r.message).match(/ref ([^)]+)\)/) || [])[1] || null;
        order.order_id = ref; if (!orders.includes(order)) orders.push(order);
        if (order.action === "cancel" || order.action === "replace") return fromManaged(order, ref);
        return fromReadback(order, ref);
      }
      // The receipt comes from the broker's record of the order, read back by its id; the module's own words never stand in for it.
      async function fromReadback(order, ref) {
        const rb = ref ? await readOr("order", { order_id: ref }) : null;
        const P = MODE(order.account), sold = order.side === "sell";
        if (!rb || !rb.value) return say("accepted_unread", `${P}The broker accepted the order (id ${ref || "unknown"}) but I can't read its status back yet, so I won't call it filled. I'll follow up.`, { order_id: ref });
        // A snapshot, never the live record: a receipt must say what was read at that moment, and a later mutation of the
        // broker's object must not rewrite what this session believes it reported.
        const s = canon(JSON.parse(JSON.stringify(rb.value))); order.readback = s; order.readback_source = rb.source; order.readback_as_of = rb.as_of;
        const when = ms => new Date(ms).toISOString().slice(11, 16) + " UTC";
        const what = `${sold ? "sell" : "buy"} ${order.notional_cents ? money(order.notional_cents) + " of" : qty(order.quantity) + " shares of"} ${order.symbol}${terms(order).head}`;
        if (s.status === "queued") return say("queued", `${P}Queued: ${what} in ${order.account.name}, order ${ref}, until ${order.when}. Not filled yet; I'll confirm the fill price when ${rb.source} reports it.`, { order_id: ref, proof: evidence(order) });
        if (s.status === "working") return say("working", `${P}Placed, not filled: ${what} in ${order.account.name}, order ${ref}, ${order.type === "market" ? "working" : (order.time_in_force === "gtc" ? "good till canceled" : "working until today's close")} per ${rb.source} (as of ${when(rb.as_of)}). I'll report a fill when the broker does; say "cancel my ${order.symbol} order" to cancel it.`, { order_id: ref, proof: evidence(order) });
        if (s.status === "partial" || s.status === "partial_final") return say("partial", `${P}Partly ${sold ? "sold" : "filled"}: ${qty(s.filled_quantity)} of ${qty(order.quantity)} ${order.symbol} at ${money(s.fill_price_cents)} (${money(Math.round(s.filled_quantity * s.fill_price_cents))}), order ${ref}, ${rb.source} as of ${when(rb.as_of)}. ${s.status === "partial_final" ? `The other ${qty(Math.round((order.quantity - s.filled_quantity) * 10000) / 10000)} will not fill: the broker ended the order.` : `${qty(Math.round((order.quantity - s.filled_quantity) * 10000) / 10000)} still working; I'll report the rest when it fills.`}`, { order_id: ref, proof: evidence(order) });
        if (s.status === "rejected") return say("failed", `${P}The broker rejected order ${ref}: ${s.reason || "no reason given"} (${rb.source}). Nothing was placed; ${sold ? `your ${order.symbol} stays in ${order.account.name}` : `${money(order.estimated_cents)} stays in ${order.account.name}`}.`, { order_id: ref, proof: evidence(order) });
        if (s.status !== "filled") return say("accepted_unread", `${P}Order ${ref} is ${s.status} at ${rb.source}; not filled yet.`, { order_id: ref, proof: evidence(order) });
        const shares = s.filled_quantity !== undefined && s.filled_quantity !== null && s.filled_quantity > 0 ? s.filled_quantity : s.quantity;
        const total = Math.round(shares * s.fill_price_cents);
        s.quantity = shares;
        const hold = await readOr("holdings", { account: order.account.id });
        const pos = hold && (hold.value || []).find(h => h.symbol === order.symbol);
        order.position = pos ? { symbol: pos.symbol, quantity: pos.quantity !== undefined ? pos.quantity : pos.qty } : null;
        loop.remember("facts", { capability_id: order.capability_id || CAPABILITY, value: { order_id: ref, side: order.side || "buy", symbol: order.symbol, quantity: shares, fill_price_cents: s.fill_price_cents, total_cents: total, account: order.account.id, paper: !!order.account.paper, live: !!order.account.live }, source: rb.source, as_of: rb.as_of });
        const now = order.position ? (sold ? `${qty(order.position.quantity)} ${order.symbol} left in that account.` : `Now ${qty(order.position.quantity)} ${order.symbol} in that account.`) : sold ? `No ${order.symbol} left in that account.` : "The position has not shown in the holdings read yet; I'll re-check.";
        return say("filled", `${P}Done: ${sold ? "sold" : "bought"} ${qty(shares)} ${order.symbol} (${order.name}) at ${money(s.fill_price_cents)}, ${money(total)} total${sold ? " proceeds" : ""}, in ${order.account.name}, order ${ref}, filled ${when(s.filled_at)} per ${rb.source} (as of ${when(rb.as_of)}). ${now}`, { order_id: ref, fill: { quantity: s.quantity, fill_price_cents: s.fill_price_cents, total_cents: total, filled_at: s.filled_at }, proof: evidence(order) });
      }
      // The real-world proof (C46, C47) is built from the same read-back, never from this module's own words.
      function evidence(order) { const s = order.readback || {}; return Object.assign({ order_id: order.order_id, status: s.status, market_open: order.market_open, side: order.side || "buy", paper: !!(order.account && order.account.paper), live: !!(order.account && order.account.live) }, s.status === "filled" ? { fill_price_cents: s.fill_price_cents, quantity: s.quantity, filled_at: s.filled_at, position: order.position ? { symbol: order.symbol, quantity: order.position.quantity } : undefined } : {}); }

      // Cancel and change an open order: the order is read back first, the change goes on a card, and the result is what
      // the broker's record says afterwards (canceled only when it says canceled; a replace is a new order with a new id).
      async function openOrders(symbol) {
        const fromSession = orders.filter(x => x.order_id && !x.action && x.readback && ["working", "queued", "partial"].includes(x.readback.status) && (!symbol || x.symbol === symbol.toUpperCase()));
        const live = [];
        for (const x of fromSession) { const rb = await readOr("order", { order_id: x.order_id }); const s = rb && rb.value ? canon(JSON.parse(JSON.stringify(rb.value))) : null; if (s) { x.readback = s; if (["working", "queued", "partial"].includes(s.status)) live.push(x); } }
        return live;
      }
      const SHOPS = /\b(?:uber eats|ubereats|doordash|door dash|grubhub|postmates|instacart|seamless|caviar|gopuff|amazon|walmart|target|costco|best buy|ebay|etsy|wayfair|shein|temu|starbucks|chipotle|domino'?s|pizza hut|mcdonald'?s|apple store|nike|zara|sephora|ulta|chewy)\b/i;
      async function manage(parsed) {
        const sym = parsed.query && /^[A-Za-z]{1,5}$/.test(parsed.query) ? parsed.query.toUpperCase() : null;
        const open = await openOrders(sym);
        // A store or delivery order is not a brokerage order (megadoc K06 "cancel the order from uber eats"): said, with
        // where it can be cancelled. An open stock order for the same word (UBER) is checked first.
        const shop = SHOPS.exec(String(parsed.text || ""));
        if (!open.length && shop) { const name = shop[0].replace(/\b\w/g, c => c.toUpperCase()).replace(/^Doordash$/, "DoorDash").replace(/^Grubhub$/, "Grubhub").replace(/^Ebay$/, "eBay"); return say("answer", `That ${name} order isn't one Upmore placed, so I can't cancel it here. Cancel it in the ${name} app or with ${name} directly; for a charge you want back, say "dispute this charge". Nothing changed.`); }
        if (!open.length) return say("answer", `I don't see an open order${sym ? ` for ${sym}` : ""} that I placed, so there is nothing to ${parsed.action === "cancel" ? "cancel" : "change"}.`);
        if (open.length > 1) return ask("order_which", `Which order: ${open.map(x => `${x.side === "sell" ? "sell" : "buy"} ${qty(x.quantity)} ${x.symbol}${terms(x).head} (order ${x.order_id})`).join(" or ")}?`);
        const target = open[0], P = MODE(target.account);
        const describe = `${target.side === "sell" ? "sell" : "buy"} ${qty(target.quantity)} ${target.symbol}${terms(target).head}`;
        let changes = null, after = null;
        if (parsed.action === "modify") {
          const to = new RegExp(`\\bto\\s*${PX}`, "i").exec(parsed.text), pct = /\bto\s+(\d+(?:\.\d+)?)\s*%/i.exec(parsed.text), sh = /\bto\s+(\d+)\s+shares?\b/i.exec(parsed.text);
          changes = {};
          if (sh) changes.qty = Number(sh[1]);
          else if (pct && target.type === "trailing_stop") changes.trail_percent = Number(pct[1]);
          else if (to) { const c = cents(to[1], to[2]); if (target.type === "limit") changes.limit_cents = c; else if (target.type === "stop") changes.stop_cents = c; else if (target.type === "stop_limit") { if (/\bstop\b/i.test(parsed.text)) changes.stop_cents = c; else changes.limit_cents = c; } else if (target.type === "trailing_stop") changes.trail_cents = c; else return ask("modify_what", `${describe} is a market order; there is no price to change. Cancel it instead?`); }
          if (!Object.keys(changes).length) return ask("modify_what", `What should change on ${describe}: the price ("to $103") or the share count ("to 5 shares")?`);
          after = Object.assign({}, target, { limit_cents: changes.limit_cents !== undefined ? changes.limit_cents : target.limit_cents, stop_cents: changes.stop_cents !== undefined ? changes.stop_cents : target.stop_cents, trail_percent: changes.trail_percent !== undefined ? changes.trail_percent : target.trail_percent, trail_cents: changes.trail_cents !== undefined ? changes.trail_cents : target.trail_cents, quantity: changes.qty !== undefined ? changes.qty : target.quantity });
          const capM = Number.isSafeInteger(target.account.order_cap_cents) ? target.account.order_cap_cents : null;
          if (capM !== null) { const px = after.type === "limit" || after.type === "stop_limit" ? after.limit_cents : Math.ceil(Math.max(after.stop_cents || 0, target.price_cents || 0) * 1.02); const est2 = Math.ceil(after.quantity * px); if (est2 > capM) return say("stop", `That change makes it about ${money(est2)}; live orders are limited to ${money(capM)} each while Upmore is in testing. Nothing was changed.`, { reason: "order_cap" }); }
          if (target.side === "buy") { const est = Math.round(after.quantity * (after.limit_cents || after.stop_cents || target.price_cents)); const accts = await readOr("brokerage_accounts"); const a = accts && (accts.value || []).find(x => x.id === target.account.id); if (!a || !Number.isSafeInteger(a.cash_cents)) return ask("cash_unknown", `I can't read buying power in ${target.account.name}, so I won't change the order.`); if (est > a.cash_cents + target.estimated_cents) return say("stop", `Changing it needs about ${money(est)}; ${target.account.name} has ${money(a.cash_cents)} free plus the ${money(target.estimated_cents)} this order holds. Nothing was changed.`, { reason: "insufficient_cash" }); after.estimated_cents = est; }
        }
        const action = parsed.action === "cancel" ? "cancel" : "replace", key = `${target.capability_id || CAPABILITY}:${action}:${target.order_id}:${JSON.stringify(changes || {})}`;
        const text = action === "cancel" ? `${P}Cancel order ${target.order_id}: ${describe} in ${target.account.name} (${target.readback.status === "partial" ? `partly filled, ${qty(target.readback.filled_quantity)} done` : "not filled"}). Reply YES or NO within ${Math.round((o.confirm_ttl_ms || 10 * 60000) / 60000)} min.`
          : `${P}Change order ${target.order_id}: ${describe} becomes ${after.side === "sell" ? "sell" : "buy"} ${qty(after.quantity)} ${after.symbol}${terms(after).head}. The broker replaces it with a new order. Reply YES or NO within ${Math.round((o.confirm_ttl_ms || 10 * 60000) / 60000)} min.`;
        const request = { capability_id: target.capability_id || CAPABILITY, key, idempotency_key: key, params: { action, order_id: target.order_id, changes: changes || undefined, symbol: target.symbol, paper: !!target.account.paper, live: !!target.account.live }, describe: `${action === "cancel" ? "Cancel" : "Change"} ${P ? "PAPER " : ""}order ${target.order_id} (${describe})`, confirm: { action: action === "cancel" ? "Cancel order" : "Change order", recipient: `${target.symbol} order ${target.order_id}`, from: target.account.name, fee: null, when: "now" } };
        const managed = Object.assign({}, after || target, { action, target, changes, key, request, order_id: null, readback: null });
        const r = await loop.wake({ kind: "message", request });
        if (r.outcome === "awaiting_confirmation") { pending = { order: managed, confirmation_id: r.confirmation_id }; return say("confirm", text, { confirmation_id: r.confirmation_id, order: managed, details: text }); }
        return say(r.outcome, r.message || null, r);
      }
      async function fromManaged(m, ref) {
        const P = MODE(m.account), target = m.target;
        if (m.action === "cancel") {
          const rb = await readOr("order", { order_id: target.order_id }), s = rb && rb.value ? canon(JSON.parse(JSON.stringify(rb.value))) : null;
          if (s) target.readback = s;
          if (s && s.status === "canceled") return say("canceled", `${P}Canceled: order ${target.order_id} (${target.side === "sell" ? "sell" : "buy"} ${qty(target.quantity)} ${target.symbol}) per ${rb.source} (as of ${hhmm(rb.as_of)}). Nothing filled.`, { order_id: target.order_id });
          if (s && s.status === "partial_final") return say("canceled", `${P}Canceled the rest of order ${target.order_id}: ${qty(s.filled_quantity)} ${target.symbol} had already filled at ${money(s.fill_price_cents)} and stay ${target.side === "sell" ? "sold" : "bought"} (${rb.source}).`, { order_id: target.order_id });
          if (s && s.status === "filled") return say("filled", `${P}Too late to cancel: order ${target.order_id} filled at ${money(s.fill_price_cents)} before the cancel reached the broker (${rb.source}).`, { order_id: target.order_id });
          return say("cancel_requested", `${P}Cancel requested for order ${target.order_id}; the broker shows it as ${s ? s.status.replace("_", " ") : "unreadable"} (${rb ? rb.source : "no read-back"}), so I won't call it canceled yet. I'll check again.`, { order_id: target.order_id });
        }
        const rb = ref ? await readOr("order", { order_id: ref }) : null, s = rb && rb.value ? canon(JSON.parse(JSON.stringify(rb.value))) : null;
        if (!s) return say("accepted_unread", `${P}The broker accepted the change (new order ${ref || "unknown"}) but I can't read it back yet, so I won't say it is in place. I'll follow up.`, { order_id: ref });
        const fresh = Object.assign({}, m, { action: undefined, target: undefined, order_id: ref, readback: s, key: m.key + ":new" });
        target.readback = Object.assign({}, target.readback || {}, { status: "replaced" });
        orders.push(fresh);
        return say(s.status === "filled" ? "filled" : "replaced", `${P}Changed: order ${target.order_id} is replaced by order ${ref}, ${fresh.side === "sell" ? "sell" : "buy"} ${qty(fresh.quantity)} ${fresh.symbol}${terms(fresh).head}, ${s.status === "filled" ? `filled at ${money(s.fill_price_cents)}` : s.status} per ${rb.source} (as of ${hhmm(rb.as_of)}).`, { order_id: ref, replaced: target.order_id });
      }
      // The portfolio answer: positions and buying power from the account's own read, LIVE said first.
      // "What's my biggest position" (megadoc G06) leads with it by market value and its share of the positions' value,
      // from the same read; a value the read doesn't carry is said, never estimated.
      async function portfolio(text) {
        const accts = await readOr("brokerage_accounts");
        if (!accts) return ask("accounts_unreadable", "I can't read your brokerage accounts right now.");
        const h = await readOr("holdings", {});
        if (!h) return ask("holdings_unreadable", "I can't read your positions right now.");
        const a = (accts.value || [])[0] || {}, rows = h.value || [];
        const fmt = x => `${qty(x.qty !== undefined ? x.qty : x.quantity)} ${x.symbol}${Number.isSafeInteger(x.market_value_cents) ? ` (${money(x.market_value_cents)})` : ""}`;
        // The source once: "in your Alpaca account (****4417), your Alpaca account" said the account twice.
        const where = a.name || "your account", srcWords = String(h.source || "").toLowerCase().replace(/^your /, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const srcSaid = srcWords && new RegExp(`(^|[^a-z0-9])${srcWords}($|[^a-z0-9])`).test(String(where).toLowerCase()) ? "" : `, ${h.source}`;
        const list = `${a.live ? "LIVE portfolio" : "Portfolio"} in ${where}${srcSaid}, as of ${hhmm(h.as_of)}: ${rows.length ? rows.map(fmt).join(", ") : "no positions"}. Buying power ${Number.isSafeInteger(a.cash_cents) ? money(a.cash_cents) : "unreadable"}.`;
        const which = /\b(biggest|largest|top|smallest)\b/i.exec(String(text || ""));
        if (!which || !rows.length) return say("answer", list, { paper: false, live: !!a.live });
        const valued = rows.filter(x => Number.isSafeInteger(x.market_value_cents));
        if (valued.length < rows.length) return say("answer", `I can't rank your positions: the read doesn't carry a value for ${rows.filter(x => !Number.isSafeInteger(x.market_value_cents)).map(x => x.symbol).join(", ")}.\n${list}`, { paper: false, live: !!a.live });
        const total = valued.reduce((t, x) => t + x.market_value_cents, 0), small = /smallest/i.test(which[1]);
        const pick = valued.slice().sort((x, y) => small ? x.market_value_cents - y.market_value_cents : y.market_value_cents - x.market_value_cents)[0];
        const share = total > 0 ? Math.round((pick.market_value_cents / total) * 1000) / 10 : null;
        return say("answer", `Your ${small ? "smallest" : "biggest"} position is ${pick.symbol}: ${money(pick.market_value_cents)}${share !== null && rows.length > 1 ? `, ${share}% of your positions' value` : rows.length === 1 ? ", your only position" : ""}.\n${list}`, { paper: false, live: !!a.live });
      }

      // Order status (megadoc E16, E18): the latest order placed from this chat, or the one whose ticker the person names,
      // read back from the broker now and said as its record says. Only orders this chat placed are known here; the
      // broker's app lists the rest. A read that fails says the last status read and when, never a guess.
      async function orderStatus(text) {
        const placed = orders.filter(x => x.order_id && !x.action);
        if (!placed.length) return say("answer", "I don't see an order placed from this chat, so there's none to read back. Your brokerage app lists every order.");
        const named = placed.filter(x => new RegExp(`\\b${x.symbol}\\b`, "i").test(String(text || "")));
        const x = (named.length ? named : placed)[(named.length ? named : placed).length - 1];
        const what = `${x.side === "sell" ? "sell" : "buy"} ${x.quantity ? `${qty(x.quantity)} ` : ""}${x.symbol}`;
        const others = placed.length > 1 && !named.length ? ` You placed ${placed.length} orders from this chat; name the ticker for another.` : "";
        const rb = await readOr("order", { order_id: x.order_id }), st = rb && rb.value ? canon(JSON.parse(JSON.stringify(rb.value))) : null;
        if (!st) return say("answer", `I can't read order ${x.order_id} (${what}) back right now.${x.readback && x.readback.status ? ` When I last read it, it was ${String(x.readback.status).replace(/_/g, " ")}.` : ""} Try again in a minute, or check your brokerage app.${others}`, { order_id: x.order_id });
        x.readback = st;
        const per = `per ${rb.source} (as of ${hhmm(rb.as_of)})`;
        if (st.status === "filled") { const n = Number.isFinite(st.quantity) ? st.quantity : x.quantity, tot = Number.isFinite(n) && Number.isSafeInteger(st.fill_price_cents) ? Math.round(n * st.fill_price_cents) : null; return say("answer", `Filled: ${x.side === "sell" ? "sold" : "bought"} ${Number.isFinite(n) ? `${qty(n)} ` : ""}${x.symbol} at ${money(st.fill_price_cents)}${tot !== null ? `, ${money(tot)} total` : ""}, order ${x.order_id}${st.filled_at ? `, filled ${hhmm(st.filled_at)}` : ""}, ${per}.${others}`, { order_id: x.order_id, status: st.status }); }
        if (st.status === "partial" || st.status === "partial_final") return say("answer", `Partly filled: ${qty(st.filled_quantity)} of ${qty(x.quantity)} ${x.symbol} at ${money(st.fill_price_cents)}, order ${x.order_id}, ${per}.${st.status === "partial_final" ? " The broker ended the rest; it won't fill." : " The rest is still working."}${others}`, { order_id: x.order_id, status: st.status });
        if (st.status === "working" || st.status === "queued") return say("answer", `Not filled yet: order ${x.order_id} (${what}${terms(x).head}) is ${st.status === "queued" ? "queued for the next open" : "working"}, ${per}. Ask again anytime, or say "cancel my ${x.symbol} order" to cancel it.${others}`, { order_id: x.order_id, status: st.status });
        if (st.status === "canceled") return say("answer", `Canceled: order ${x.order_id} (${what}), nothing filled, ${per}.${others}`, { order_id: x.order_id, status: st.status });
        if (st.status === "rejected") return say("answer", `The broker rejected order ${x.order_id} (${what}): ${st.reason || "no reason given"}, ${per}. Nothing was placed.${others}`, { order_id: x.order_id, status: st.status });
        if (st.status === "replaced") return say("answer", `Order ${x.order_id} (${what}) was replaced${st.replaced_by ? ` by order ${st.replaced_by}` : ""}, ${per}.${others}`, { order_id: x.order_id, status: st.status });
        return say("answer", `Order ${x.order_id} (${what}) reads ${String(st.status || "unknown").replace(/_/g, " ")}, ${per}.${others}`, { order_id: x.order_id, status: st.status });
      }

      // A quote, nothing else (megadoc G09): the broker's own quote for the ticker, with its source and time; the ask, the
      // price a buy pays, said as such. An unknown ticker or an unreadable quote is said; nothing is staged, nothing advised.
      async function quoteOnly(query) {
        const inst = await instrument(query, "buy");
        if (inst.unreachable) return ask("broker_unreachable", "I can't reach your broker right now, so I don't have a quote. Try again in a minute.");
        const hit = inst.exact || (inst.ambiguous && inst.ambiguous.length === 1 ? inst.ambiguous[0] : null);
        // An asset record without a symbol is no instrument: nothing is quoted from it.
        if (!hit || !hit.symbol) return ask("symbol_unknown", `I don't know the ticker "${String(query || "").toUpperCase()}". Say it like "what's VOO trading at".`);
        const q = await readOr("quote", { symbol: hit.symbol, side: "buy" }), now = clock();
        if (!q || !q.value || !Number.isSafeInteger(q.value.price_cents)) return ask("no_quote", `I have no quote for ${hit.symbol} right now. Ask again in a moment.`);
        const age = Math.round((now - q.as_of) / 60000);
        return say("answer", `${hit.symbol}${hit.name ? ` (${hit.name})` : ""}: ${money(q.value.price_cents)} (${q.source}, ${hhmm(q.as_of)}${age > 15 ? `, ${age} minutes old` : ""}). That's the price a buy would pay right now; it moves while the market is open.`, { symbol: hit.symbol });
      }

      // The gain on a holding (megadoc G03): the shares still held, their cost from the broker's average entry price, and
      // their value now, from the same position read. Shares sold earlier and dividends aren't in that read, so they are
      // said as not counted; a position the read gives no cost or value for is said, never estimated.
      async function gainOn(query) {
        const accts = await readOr("brokerage_accounts");
        if (!accts) return ask("accounts_unreadable", "I can't read your brokerage accounts right now.");
        const a = (accts.value || [])[0] || {};
        const h = await readOr("holdings", { account: a.id });
        if (!h) return ask("holdings_unreadable", "I can't read your positions right now.");
        const sym = String(query || "").toUpperCase(), rows = (h.value || []).filter(x => x && x.symbol && (Number(x.qty !== undefined ? x.qty : x.quantity) || 0) > 0);
        const x = rows.find(r => String(r.symbol).toUpperCase() === sym);
        if (!x) return say("answer", `You don't hold ${sym} in ${a.name || "your account"} (${h.source}, as of ${hhmm(h.as_of)}), so there's no open gain or loss on it here.${rows.length ? ` You hold ${rows.slice(0, 5).map(r => r.symbol).join(", ")}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}.` : ""} Shares sold earlier aren't in this read.`);
        const n = Number(x.qty !== undefined ? x.qty : x.quantity);
        if (!Number.isSafeInteger(x.avg_entry_cents) || !Number.isSafeInteger(x.market_value_cents)) return say("answer", `I can't work out the gain on ${sym}: ${a.name || "your account"} doesn't give ${!Number.isSafeInteger(x.avg_entry_cents) ? "a cost basis" : "a current value"} for it (${h.source}, as of ${hhmm(h.as_of)}). Your brokerage app's position page shows it.`);
        const cost = Math.round(n * x.avg_entry_cents), diff = x.market_value_cents - cost, pct = cost > 0 ? Math.round((diff / cost) * 1000) / 10 : null;
        return say("answer", `${sym}: ${diff >= 0 ? "up" : "down"} ${money(Math.abs(diff))}${pct !== null ? ` (${diff >= 0 ? "+" : "-"}${Math.abs(pct)}%)` : ""} on the ${qty(n)} shares you hold. They cost ${money(cost)} (average ${money(x.avg_entry_cents)} a share, per ${h.source}) and are worth ${money(x.market_value_cents)} now (as of ${hhmm(h.as_of)}). That's unrealized: shares you sold earlier and dividends aren't in this read.`, { symbol: sym });
      }

      async function recheck(ord) {
        const moved = [], now = clock(), market = !ord.type || ord.type === "market";
        const q = await readOr("quote", { symbol: ord.symbol, side: ord.side || "buy" });
        if (!q || !q.value || !Number.isSafeInteger(q.value.price_cents) || now - q.as_of > freshness) moved.push(`I could not re-verify the ${ord.symbol} price`);
        else if (market && q.value.price_cents !== ord.price_cents) moved.push(`${ord.symbol} moved from ${money(ord.price_cents)} to ${money(q.value.price_cents)} (${q.source}, as of ${new Date(q.as_of).toISOString().slice(11, 16)} UTC)`);
        else if (!market && (ord.type === "stop" || ord.type === "stop_limit") && (ord.side === "sell" ? q.value.price_cents <= ord.stop_cents : q.value.price_cents >= ord.stop_cents)) moved.push(`${ord.symbol} is now ${money(q.value.price_cents)}, past the ${money(ord.stop_cents)} stop, so it would trigger at once`);
        const accts = await readOr("brokerage_accounts"), acct = accts && (accts.value || []).find(a => a.id === ord.account.id);
        if (!acct) moved.push(`I could not re-read ${ord.account.name}`);
        else {
          const fee = Number.isSafeInteger(acct.fee_cents) ? acct.fee_cents : 0;
          if (fee !== (ord.fee_cents || 0)) moved.push(`the fee changed from ${money(ord.fee_cents || 0)} to ${money(fee)}`);
          if ((ord.side || "buy") === "buy" && (!Number.isSafeInteger(acct.cash_cents) || acct.cash_cents < ord.estimated_cents + fee)) moved.push(`settled cash in ${ord.account.name} is now ${Number.isSafeInteger(acct.cash_cents) ? money(acct.cash_cents) : "unreadable"}`);
        }
        if (ord.side === "sell") { const h = await holding(ord.account, ord.symbol); if (!h || h.qty + 1e-9 < ord.quantity) moved.push(`${ord.account.name} now has ${h ? qty(h.qty) : "an unreadable number of"} ${ord.symbol} available, less than the ${qty(ord.quantity)} to sell`); }
        if (market && (await session(now)).open !== ord.market_open) moved.push(ord.market_open ? "the market closed, so it would queue instead of filling now" : "the market opened, so it would fill now instead of queuing");
        return moved;
      }
      const restage = ord => Object.assign(parse(`${ord.side === "sell" ? "sell" : "buy"} ${ord.notional_cents ? money(ord.notional_cents) : qty(ord.quantity) + " shares"} of ${ord.symbol} in ${ord.account.name}`), { text: ord.request.describe, type: ord.type || "market", limit_cents: ord.limit_cents || null, stop_cents: ord.stop_cents || null, stop_pct_below: null, trail_percent: ord.trail_percent || null, trail_cents: ord.trail_cents || null, time_in_force: ord.time_in_force || null, fraction: null, expiry_words: null });
      async function reply(text) {
        // "Did you mean VOO? Say yes": a yes re-stages the same order with the suggested symbol; anything else drops it.
        if (suggestion && !pending) {
          const sg = suggestion; suggestion = null;
          if (/^\s*(y|yes|yep|yeah|ok|okay|sure|correct|that one)\s*[.!]*\s*$/i.test(String(text)) && clock() - sg.at <= (o.confirm_ttl_ms || 10 * 60000)) return stage(Object.assign({}, sg.parsed, { query: sg.symbol }));
          if (/^\s*(n|no|nope|never ?mind|stop|cancel)\s*[.!]*\s*$/i.test(String(text))) return say("declined", "Okay. Nothing was placed.");
        }
        const p = pending;
        if (!p) return say("nothing_pending", "There is no order waiting on you.");
        const cls = Voice ? Voice.classify(text, { pending_confirmation: true }) : { type: /^y/i.test(text) ? "confirmation" : "question", approved: /^y/i.test(text) };
        // S10: "yes, but" corrects. The old proposal is dropped and the corrected one is staged afresh with a fresh quote; nothing is written in between.
        if (cls.type === "correction" && !p.order.action) {
          const fix = parse(text), merged = Object.assign({}, restage(p.order), fix.notional_cents ? { notional_cents: fix.notional_cents, quantity: null } : {}, fix.quantity ? { quantity: fix.quantity, notional_cents: null } : {}, fix.query && resolve(fix.query, o.instruments || []).exact ? { query: fix.query } : {}, fix.account ? { account: fix.account } : {});
          await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
          const again = await stage(merged);
          return Object.assign({ corrected: true }, again, again.outcome === "confirm" ? { text: `Got it. ${again.text}` } : {});
        }
        if (cls.type === "hold") return { outcome: "held", text: "Holding it. Nothing was placed. Say yes to place it as shown, or no to drop it." };
        if (cls.type === "confirmation" && cls.approved === false) { const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null; return p.order.action ? say("declined", "Okay, I left the order as it is.") : settle(r, p.order); }
        if (cls.type === "confirmation" && cls.approved === true) {
          if (p.order.action) {
            // Stop-on-change for a cancel or a change: the order is read back right before; if it filled or changed, nothing is sent.
            const rb = await readOr("order", { order_id: p.order.target.order_id }), s = rb && rb.value ? canon(JSON.parse(JSON.stringify(rb.value))) : null;
            if (!s || !["working", "queued", "partial"].includes(s.status)) { await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null; return say("changed", `Stopped: order ${p.order.target.order_id} is now ${s ? s.status : "unreadable"} at the broker, so I sent nothing.`, { moved: ["order status"] }); }
            const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: true }); pending = null; return settle(r, p.order);
          }
          // Stop-on-change: what the person said yes to is re-verified right before the order goes out. If the price, the
          // fee, the buying power or the market session moved, nothing is placed and a fresh card says what moved.
          const moved = await recheck(p.order);
          if (moved.length) {
            await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
            // The broker refused the person's token while re-checking: that is the whole story, said once.
            if (gone()) return say("blocked", RECONNECT, { reason: "broker_reconnect" });
            const again = await stage(restage(p.order));
            return say("changed", `Stopped before placing it: ${moved.join("; ")}. Nothing was placed.${again.outcome === "confirm" ? ` New card: ${again.text}` : ` ${again.text}`}`, { moved, next: again, confirmation_id: again.confirmation_id || null, order: again.order || null });
          }
          const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: true }); pending = null; return settle(r, p.order);
        }
        if (/^\s*(3|details?|more|terms|full terms)\s*[.!?]*\s*$/i.test(String(text))) return say("details", p.order.action ? p.order.request.describe : confirmText(p.order), { details: true });
        return ask("yes_or_no", `Yes or no? ${p.order.action ? p.order.request.describe : cardText(p.order)}`);
      }
      // The follow-up: an unresolved write reconciles through the loop (read back by id, never re-sent); an accepted order that
      // was queued, partial or unread is re-read from the broker's record.
      async function followUp() {
        if (loop.state === "FOLLOW_UP_SCHEDULED") { const r = await loop.wake({ kind: "follow_up" }); const key = (log.filter(e => e.to === "ACTING").pop() || { input: {} }).input.idempotency_key; const order = orders.find(x => x.key === key) || (pending && pending.order) || lastOrder(key); return settle(r, order || { estimated_cents: 0, account: { name: "the account" }, symbol: "?", name: "?", quantity: 0, when: "the next open" }); }
        const open = orders.filter(x => x.order_id && !x.action && (!x.readback || ["queued", "partial", "accepted", "working"].includes(x.readback.status))).pop();
        if (!open) return say("nothing_pending", "No order is waiting on a fill.");
        return fromReadback(open, open.order_id);
      }
      const lastOrder = key => { const e = log.filter(x => x.to === "ACTING" && x.input && x.input.idempotency_key === key).pop(); if (!e) return null; const p = e.input.params || {}; const inst = (o.instruments || []).find(i => i.symbol === p.symbol) || { symbol: p.symbol, name: p.symbol }; const ord = { side: p.side || "buy", type: p.type || "market", symbol: p.symbol, name: inst.name, account: { id: p.account, name: p.account, paper: !!p.paper }, quantity: p.quantity, notional_cents: p.notional_cents || null, estimated_cents: p.amount_cents || 0, limit_cents: p.limit_cents || null, stop_cents: p.stop_cents || null, trail_percent: p.trail_percent || null, trail_cents: p.trail_cents || null, time_in_force: p.time_in_force || "day", when: "the next open", key, capability_id: e.input.capability_id, request: { describe: `${p.side === "sell" ? "Sell" : "Buy"} ${p.symbol}` } }; orders.push(ord); return ord; };
      // S15: "what did you buy today" comes from memory, with the broker named per fill.
      function today(now) { const d = day(now || clock()); const fills = loop.memory.facts.filter(f => (f.capability_id === CAPABILITY || f.capability_id === "INV-012") && f.value && f.value.order_id && day(f.recorded_at) === d); if (!fills.length) return say("answer", `Nothing bought today.`); return say("answer", fills.map(f => `${f.value.side === "sell" ? "sold " : ""}${qty(f.value.quantity)} ${f.value.symbol} at ${money(f.value.fill_price_cents)} (${money(f.value.total_cents)}) in ${f.value.account}, order ${f.value.order_id}, per ${f.source}${f.value.live ? " (LIVE)" : ""}`).join("; ") + "."); }
      const snapshot = () => JSON.parse(JSON.stringify({ loop: loop.snapshot(), orders, pending, suggestion }));
      const accepts = text => !!suggestion && !pending && /^\s*(y|yes|yep|yeah|ok|okay|sure|correct|that one|n|no|nope|never ?mind)\s*[.!]*\s*$/i.test(String(text || ""));
      return { start, reply, followUp, today, portfolio, parse, loop, orders, confirmText, cardText, snapshot, accepts, get awaiting_input() { return !!suggestion && !pending; }, get pending() { return pending ? { confirmation_id: pending.confirmation_id, symbol: pending.order.symbol, estimated_cents: pending.order.estimated_cents } : null; } };
    }
    return { create, parse, parseAmount, resolve, nameMatch, marketOpen, nextOpen, etParts, CAPABILITY };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentTrade;
