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
    const CAPABILITY = "INV-011", DAY = 86400000;
    const money = c => { const s = Math.abs(Math.round(c)); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const ymd = ms => new Date(ms).toISOString().slice(0, 10);
    const qty = q => String(Math.round(q * 10000) / 10000);

    // S01: dollars or shares, exactly. A bare integer next to a symbol is ambiguous (500 dollars or 500 shares?) and asks.
    const DOLLARS = /(?:\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\s*(?:shares?|units?))\b|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars|bucks|usd)\b)/i;
    const SHARES = /\b(\d+(?:\.\d+)?)\s*(?:shares?|units?)\b/i;
    const BARE = /\b(?:buy|get|purchase|add)\s+(\d+(?:\.\d+)?)\s+(?!dollars|bucks|usd|shares?|units?)([A-Za-z][A-Za-z.&'-]{0,5})\b/i;
    const VAGUE = /\b(all my cash|everything|a bunch|some|a little|a lot|whatever|max|as much as)\b/i;
    function parseAmount(text) {
      const t = String(text || "");
      const d = DOLLARS.exec(t), s = SHARES.exec(t);
      if (d) { const whole = Number((d[1] || d[3]).replace(/,/g, "")), frac = Number(((d[2] || d[4] || "") + "00").slice(0, 2)); const cents = whole * 100 + frac; return cents > 0 ? { notional_cents: cents } : { zero: true }; }
      if (s) { const q = Number(s[1]); return q > 0 ? { quantity: q } : { zero: true }; }
      const b = BARE.exec(t); if (b) { const n = Number(b[1]); if (!(n > 0)) return { zero: true }; return Number.isInteger(n) ? { ambiguous: n, symbol_hint: b[2] } : { quantity: n, symbol_hint: b[2] }; }
      if (VAGUE.test(t)) return { vague: true };
      return {};
    }
    function parse(text) {
      const t = String(text || "").trim();
      const side = /\bsell\b/i.test(t) && !/\bbuy\b/i.test(t) ? "sell" : "buy";
      const asset = /\b(btc|bitcoin|eth|ethereum|sol|solana|doge|crypto)\b/i.test(t) ? "crypto" : "equity";
      const limit = /\b(?:at|limit)\s+\$\s?(\d[\d,]*)(?:\.(\d{1,2}))?\b/i.exec(t);
      const another = /\b(another|again|one more|a second)\b/i.test(t);
      const amount = parseAmount(limit ? t.replace(limit[0], " ") : t);
      let query = null;
      const of = /\b(?:of|in(?:to)?)\s+(?!my\b)([A-Za-z][A-Za-z0-9.&' -]{0,40}?)(?=\s+(?:in|from|using|at|now|please|and|today|tomorrow)\b|\s*[,.!?]|$)/i.exec(t.replace(/\b(shares?|units?|dollars)\s+of\b/i, "of"));
      if (of) query = of[1].trim();
      else if (amount.symbol_hint) query = amount.symbol_hint;
      else { const up = /\b([A-Z]{1,5})\b(?!\s*\$)/.exec(t.replace(DOLLARS, " ").replace(/\b(ETF|USD|IRA|ROTH|ET|AM|PM)\b/g, " ")); if (up) query = up[1]; }
      if (query) query = query.replace(/\s+(ETF|stock|shares?)$/i, "").trim() || null;
      const acct = /\b(?:in|from|using)\s+(?:my\s+)?((?:schwab|fidelity|vanguard|robinhood|public|roth|ira|brokerage|taxable|401k)[\w -]{0,24}?)(?=\s+account\b|\s*[,.!?]|$)/i.exec(t);
      return { text: t, side, asset, limit_cents: limit ? Number(limit[1].replace(/,/g, "")) * 100 + Number(((limit[2] || "") + "00").slice(0, 2)) : null, another, notional_cents: amount.notional_cents || null, quantity: amount.quantity || null, ambiguous_number: amount.ambiguous || null, vague: !!amount.vague, zero: !!amount.zero, query, account: acct ? acct[1].trim() : null };
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

    // S11: regular session, 9:30 to 16:00 ET, Monday to Friday, less the holidays the caller lists (ymd).
    function etParts(ms) { const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", weekday: "short", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }); const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value; return { weekday: o.weekday, date: `${o.year}-${{ Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" }[o.month]}-${o.day}`, label: `${o.weekday} ${o.month} ${Number(o.day)}`, minutes: Number(o.hour) * 60 + Number(o.minute) }; }
    function marketOpen(ms, holidays) { const p = etParts(ms); if (["Sat", "Sun"].includes(p.weekday)) return false; if ((holidays || []).includes(p.date)) return false; return p.minutes >= 570 && p.minutes < 960; }
    function nextOpen(ms, holidays) { const p = etParts(ms); if (!["Sat", "Sun"].includes(p.weekday) && !(holidays || []).includes(p.date) && p.minutes < 570) return `today's 9:30 ET open`; for (let i = 1; i <= 10; i++) { const q = etParts(ms + i * DAY); if (!["Sat", "Sun"].includes(q.weekday) && !(holidays || []).includes(q.date)) return `the 9:30 ET open on ${q.label}`; } return "the next market open"; }

    function create(opts) {
      const o = opts || {}, clock = o.clock || (() => Date.now());
      const Invest = typeof AgentInvest !== "undefined" ? AgentInvest : null, Loop = typeof AgentLoop !== "undefined" ? AgentLoop : null, Guard = typeof AdviceGuard !== "undefined" ? AdviceGuard : null, Voice = typeof AgentVoice !== "undefined" ? AgentVoice : null, Comp = o.compliance !== undefined ? o.compliance : (typeof Compliance !== "undefined" ? Compliance : null);
      if (!Invest || !Loop) throw new Error("AgentTrade needs AgentInvest and AgentLoop loaded.");
      const conn = o.connectors; if (!conn || typeof conn.read !== "function") throw new Error("AgentTrade needs connectors with read, write and verify.");
      const log = Array.isArray(o.log) ? o.log : [];
      const loop = Loop.create({ registry: o.registry, connectors: conn, clock, log, memory: o.memory || null, control: o.control || null, envelopes: [], confirm_ttl_ms: o.confirm_ttl_ms || 10 * 60000, compliance: Comp, partners: o.partners || {}, kyc: o.kyc || null });
      const freshness = o.quote_freshness_ms || 15 * 60000, holidays = o.holidays || [];
      const orders = []; // every order this session staged, with its key and read-backs
      let pending = null; // { order, confirmation_id }

      // S15: nothing leaves without the advice-guard response lint; a message that fails is reported, never sent as advice.
      const say = (outcome, text, extra) => { const lint = Guard ? Guard.response(text) : { ok: true, findings: [] }; return Object.assign({ outcome, text, lint_ok: lint.ok, lint: lint.findings }, extra || {}); };
      const ask = (reason, text, extra) => say("ask", text, Object.assign({ reason }, extra));

      async function readOr(kind, params) { try { const r = await conn.read(kind, params || {}); if (!r || !r.source || !r.as_of) return null; return r; } catch (_) { return null; } }

      // S07: the confirmation restates the exact order: side, size, symbol with name, estimate at the quote with source and as-of, account, type, timing.
      function confirmText(ord) {
        const size = ord.notional_cents ? `${money(ord.notional_cents)} of` : `${qty(ord.quantity)} share${ord.quantity === 1 ? "" : "s"} of`;
        const est = ord.notional_cents ? `about ${qty(ord.quantity)} shares at ${money(ord.price_cents)}` : `about ${money(ord.estimated_cents)} at ${money(ord.price_cents)}`;
        return `Buy ${size} ${ord.symbol} (${ord.name}) in ${ord.account.name}: ${est} (${ord.quote_source}, as of ${new Date(ord.quote_as_of).toISOString().slice(11, 16)} UTC), market order, ${ord.market_open ? "executes now" : `queued until ${ord.when}`}. ${ord.leftover_cents ? `${money(ord.leftover_cents)} stays in cash because ${ord.account.name} trades whole shares only. ` : ""}Reply yes or no.`;
      }

      async function stage(parsed) {
        // Scope first: sells, crypto and limit orders belong to other capabilities; say so and stage nothing.
        if (parsed.side === "sell") return say("refuse", "That is a sell; this path places buys only. Say \"sell\" with the share count and I'll route it through the sell path (INV-012), which confirms the same way.", { reason: "sell_is_INV-012" });
        if (parsed.asset === "crypto") return say("refuse", "Crypto trades go through a crypto venue, not the brokerage; that path is separate and not wired yet. Nothing was placed.", { reason: "crypto_venue" });
        if (parsed.limit_cents) return say("refuse", `A limit order is a different capability (resting order with expiry); this path places market orders only. Say it without the price and I'll quote it live, or ask for a limit order.`, { reason: "limit_is_C57" });
        // S03: decision words are refused before anything is read or staged. The guard catches the advice shapes; the local
        // list catches an order that leaves the choice of instrument or timing to the agent ("whatever's best", "the dip").
        const DECIDE = /\b(whatever|whichever|best|good one|the dip|dipped|just dropped|hot|winner|winning|pick|choose|recommend|should i|would you|what (do|would) you|pelosi|buffett|congress)\b/i;
        if (Guard) { const g = Guard.request(parsed.text); if (g.decision === "block" || DECIDE.test(parsed.text)) return say("refuse", g.decision === "block" ? g.redirect : "That leaves the choice to me, and I don't make it: name the ticker and the amount and I'll place exactly that. I can show the data behind any name you're weighing.", { reason: "advice", rules: g.decision === "block" ? g.reasons : ["decision_left_to_agent"] }); }
        // S01: size.
        if (parsed.ambiguous_number) return ask("size_ambiguous", `Is ${parsed.ambiguous_number} dollars or shares of ${(parsed.query || "that").toUpperCase()}?`);
        if (parsed.zero) return ask("size", "The amount has to be above zero. How much: dollars or shares?");
        if (parsed.vague) return ask("size", `How much exactly: a dollar amount or a share count? I don't size orders myself.`);
        if (!parsed.notional_cents && !parsed.quantity) return ask("size", `How much of ${parsed.query ? parsed.query.toUpperCase() : "it"}: dollars or shares?`);
        // S02: instrument.
        const res = resolve(parsed.query, o.instruments || []);
        if (res.unknown) return ask("symbol_unknown", parsed.query ? `I can't find "${parsed.query}" among listed instruments. Which ticker?` : "Which ticker?");
        if (res.ambiguous) return ask("symbol_ambiguous", `Which one: ${res.ambiguous.map(i => `${i.symbol} (${i.name})`).join(", ")}?`);
        if (res.suggest) return ask("symbol_suggest", `${res.why === "lookalike" ? `"${parsed.query}" is not a listed symbol, but ${res.suggest.symbol} is one character away` : `Did you mean ${res.suggest.symbol}`}, ${res.suggest.name}? Say yes to use ${res.suggest.symbol}.`, { suggest: res.suggest.symbol });
        const inst = res.exact;
        // S05: account.
        const accts = await readOr("brokerage_accounts");
        if (!accts) return ask("accounts_unreadable", "I can't read your brokerage accounts right now, so I can't place anything. Try again once the connection is back.");
        const linked = (accts.value || []).filter(a => a.linked !== false);
        let account = null;
        if (parsed.account) { const q = parsed.account.toLowerCase(); const hits = linked.filter(a => `${a.id} ${a.name}`.toLowerCase().includes(q)); if (hits.length === 1) account = hits[0]; else if (!hits.length) return ask("account_not_linked", `"${parsed.account}" is not a linked brokerage account. Linked: ${linked.map(a => a.name).join(", ") || "none"}.`); else return ask("account_ambiguous", `Which account: ${hits.map(a => a.name).join(" or ")}?`); }
        else if (linked.length === 1) account = linked[0];
        else if (!linked.length) return ask("no_account", "No brokerage account is linked, so there is nowhere to place this.");
        else return ask("account_which", `Which account: ${linked.map(a => a.name).join(" or ")}?`);
        if (account.tradable === false) return say("refuse", `${account.name} is view-only here; orders can't be placed in it.`, { reason: "account_view_only" });
        if (Array.isArray(inst.tradable_at) && !inst.tradable_at.includes(account.id)) return say("refuse", `${inst.symbol} is not tradable in ${account.name}.`, { reason: "not_tradable_here" });
        // S04: a real quote, fresh, or no number at all.
        const q = await readOr("quote", { symbol: inst.symbol }), now = clock();
        if (!q || !q.value || !Number.isSafeInteger(q.value.price_cents)) return ask("no_quote", `I have no quote for ${inst.symbol}, so I can't estimate the order. Ask again in a moment.`);
        if (now - q.as_of > freshness) return ask("stale_quote", `The ${inst.symbol} quote I have is ${Math.round((now - q.as_of) / 60000)} minutes old, too old to price an order on. Ask again and I'll refresh it.`);
        const price = q.value.price_cents;
        let quantity, estimated, leftover = 0;
        if (parsed.notional_cents) {
          if (account.fractional !== false) { quantity = Math.round(parsed.notional_cents * 10000 / price) / 10000; estimated = parsed.notional_cents; }
          else { quantity = Math.floor(parsed.notional_cents / price); if (quantity < 1) return ask("whole_shares", `${money(parsed.notional_cents)} buys 0 whole shares of ${inst.symbol} at ${money(price)}, and ${account.name} trades whole shares only.`); estimated = quantity * price; leftover = parsed.notional_cents - estimated; }
        } else { quantity = parsed.quantity; if (account.fractional === false && !Number.isInteger(quantity)) return ask("whole_shares", `${account.name} trades whole shares only; ${qty(quantity)} is not a whole number.`); estimated = Math.round(quantity * price); }
        // S06: buying power, read, before asking for a yes.
        const cash = Number.isSafeInteger(account.cash_cents) ? account.cash_cents : null;
        if (cash === null) return ask("cash_unknown", `I can't read settled cash in ${account.name}, so I won't stage an order that might bounce.`);
        if (cash < estimated) return say("stop", `${money(cash)} settled in ${account.name} (${accts.source}, as of ${new Date(accts.as_of).toISOString().slice(0, 16).replace("T", " ")} UTC); ${money(estimated)} needs ${money(estimated - cash)} more. Nothing was placed.`, { reason: "insufficient_cash", shortfall_cents: estimated - cash });
        const open = marketOpen(now, holidays), when = open ? "now" : nextOpen(now, holidays);
        const order = { symbol: inst.symbol, name: inst.name, account, quantity, notional_cents: parsed.notional_cents || null, price_cents: price, estimated_cents: estimated, leftover_cents: leftover, quote_source: q.source, quote_as_of: q.as_of, market_open: open, when, staged_at: now };
        // S13: the same order on the same day carries the same key; "another" asks for a new one on purpose.
        const base = `${CAPABILITY}:${account.id}:${inst.symbol}:buy:${parsed.notional_cents ? "n" + parsed.notional_cents : "q" + qty(quantity)}:${ymd(now)}`;
        const prior = orders.filter(x => x.key === base || x.key.startsWith(base + ":")).length;
        const key = parsed.another && prior ? `${base}:${prior + 1}` : base;
        const request = { capability_id: CAPABILITY, key, idempotency_key: key, params: { symbol: inst.symbol, side: "buy", quantity, notional_cents: order.notional_cents, amount_cents: estimated, account: account.id, type: "market" }, describe: `Buy ${order.notional_cents ? money(order.notional_cents) + " of" : qty(quantity) + " shares of"} ${inst.symbol} in ${account.name}`, confirm: { action: `Buy ${order.notional_cents ? money(order.notional_cents) + " of" : qty(quantity) + " shares of"} ${inst.symbol} (${inst.name})`, amount: `about ${money(estimated)}`, recipient: `${inst.symbol} (${inst.name})`, from: account.name, fee: null, when: open ? "executes now" : `queued until ${when}` }, amount_cents: estimated };
        order.key = key; order.request = request;
        const r = await loop.wake({ kind: "message", request });
        if (r.outcome === "awaiting_confirmation") { pending = { order, confirmation_id: r.confirmation_id }; return say("confirm", confirmText(order), { confirmation_id: r.confirmation_id, order }); }
        if (r.outcome === "already_done") { pending = null; const done = orders.find(x => x.key === key); return say("already_done", `${request.describe} was already placed today${done && done.order_id ? ` (order ${done.order_id})` : ""}. I did not place it again; say "another" if you want a second order.`); }
        if (r.outcome === "blocked") { pending = null; return say("blocked", r.message, { reason: r.reason }); }
        pending = null; return say(r.outcome, r.message || null, r);
      }
      async function start(text) { return stage(parse(text)); }

      // S11/S12/S14: the outcome of an approved order, from the broker's record, in the user's words.
      async function settle(r, order) {
        if (r.outcome === "declined") return say("declined", "Okay, not placing it. Nothing was sent to the broker.");
        if (r.outcome === "expired") return say("expired", `${r.message} Prices move; I'll quote it fresh.`);
        if (r.outcome === "failed") return say("failed", `${r.message} Nothing was placed; ${money(order.estimated_cents)} stays in ${order.account.name}.`);
        if (r.outcome === "unknown") return say("unknown", `${r.message} The order may or may not be resting at the broker; I'll read it back by its id before anything else.`);
        if (r.outcome !== "confirmed") return say(r.outcome, r.message || null, r);
        const ref = (r.outcome_record && r.outcome_record.reference) || (String(r.message).match(/ref ([^)]+)\)/) || [])[1] || null;
        order.order_id = ref; if (!orders.includes(order)) orders.push(order);
        return fromReadback(order, ref);
      }
      // The receipt comes from the broker's record of the order, read back by its id; the module's own words never stand in for it.
      async function fromReadback(order, ref) {
        const rb = ref ? await readOr("order", { order_id: ref }) : null;
        if (!rb || !rb.value) return say("accepted_unread", `The broker accepted the order (id ${ref || "unknown"}) but I can't read its status back yet, so I won't call it filled. I'll follow up.`, { order_id: ref });
        // A snapshot, never the live record: a receipt must say what was read at that moment, and a later mutation of the
        // broker's object must not rewrite what this session believes it reported.
        const s = JSON.parse(JSON.stringify(rb.value)); order.readback = s; order.readback_source = rb.source; order.readback_as_of = rb.as_of;
        const when = ms => new Date(ms).toISOString().slice(11, 16) + " UTC";
        if (s.status === "queued") return say("queued", `Queued: buy ${order.notional_cents ? money(order.notional_cents) + " of" : qty(order.quantity) + " shares of"} ${order.symbol} in ${order.account.name}, order ${ref}, until ${order.when}. Not filled yet; I'll confirm the fill price when ${rb.source} reports it.`, { order_id: ref, proof: evidence(order) });
        if (s.status === "partial") return say("partial", `Partly filled: ${qty(s.filled_quantity)} of ${qty(order.quantity)} ${order.symbol} at ${money(s.fill_price_cents)} (${money(Math.round(s.filled_quantity * s.fill_price_cents))}), order ${ref}, ${rb.source} as of ${when(rb.as_of)}. ${qty(order.quantity - s.filled_quantity)} still working; I'll report the rest when it fills.`, { order_id: ref, proof: evidence(order) });
        if (s.status === "rejected") return say("failed", `The broker rejected order ${ref}: ${s.reason || "no reason given"} (${rb.source}). Nothing was placed; ${money(order.estimated_cents)} stays in ${order.account.name}.`, { order_id: ref, proof: evidence(order) });
        if (s.status !== "filled") return say("accepted_unread", `Order ${ref} is ${s.status} at ${rb.source}; not filled yet.`, { order_id: ref, proof: evidence(order) });
        const total = Math.round(s.quantity * s.fill_price_cents);
        const hold = await readOr("holdings", { account: order.account.id });
        const pos = hold && (hold.value || []).find(h => h.symbol === order.symbol);
        order.position = pos || null;
        loop.remember("facts", { capability_id: CAPABILITY, value: { order_id: ref, symbol: order.symbol, quantity: s.quantity, fill_price_cents: s.fill_price_cents, total_cents: total, account: order.account.id }, source: rb.source, as_of: rb.as_of });
        return say("filled", `Done: bought ${qty(s.quantity)} ${order.symbol} (${order.name}) at ${money(s.fill_price_cents)}, ${money(total)} total, in ${order.account.name}, order ${ref}, filled ${when(s.filled_at)} per ${rb.source} (as of ${when(rb.as_of)}). ${pos ? `Now ${qty(pos.quantity)} ${order.symbol} in that account.` : "The position has not shown in the holdings read yet; I'll re-check."}`, { order_id: ref, fill: { quantity: s.quantity, fill_price_cents: s.fill_price_cents, total_cents: total, filled_at: s.filled_at }, proof: evidence(order) });
      }
      // The real-world proof (C46) is built from the same read-back, never from this module's own words.
      function evidence(order) { const s = order.readback || {}; return Object.assign({ order_id: order.order_id, status: s.status, market_open: order.market_open }, s.status === "filled" ? { fill_price_cents: s.fill_price_cents, quantity: s.quantity, filled_at: s.filled_at, position: order.position ? { symbol: order.symbol, quantity: order.position.quantity } : undefined } : {}); }

      async function reply(text) {
        const p = pending;
        if (!p) return say("nothing_pending", "There is no order waiting on you.");
        const cls = Voice ? Voice.classify(text, { pending_confirmation: true }) : { type: /^y/i.test(text) ? "confirmation" : "question", approved: /^y/i.test(text) };
        // S10: "yes, but" corrects. The old proposal is dropped and the corrected one is staged afresh with a fresh quote; nothing is written in between.
        if (cls.type === "correction") {
          const fix = parse(text), merged = Object.assign({}, parse(`buy ${p.order.notional_cents ? money(p.order.notional_cents) : qty(p.order.quantity) + " shares"} of ${p.order.symbol} in ${p.order.account.name}`), { text: p.order.request.describe }, fix.notional_cents ? { notional_cents: fix.notional_cents, quantity: null } : {}, fix.quantity ? { quantity: fix.quantity, notional_cents: null } : {}, fix.query && resolve(fix.query, o.instruments || []).exact ? { query: fix.query } : {}, fix.account ? { account: fix.account } : {});
          await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
          const again = await stage(merged);
          return Object.assign({ corrected: true }, again, again.outcome === "confirm" ? { text: `Got it. ${again.text}` } : {});
        }
        if (cls.type === "confirmation" && cls.approved === false) { const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null; return settle(r, p.order); }
        if (cls.type === "confirmation" && cls.approved === true) { const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: true }); pending = null; return settle(r, p.order); }
        return ask("yes_or_no", `Yes or no? ${confirmText(p.order)}`);
      }
      // The follow-up: an unresolved write reconciles through the loop (read back by id, never re-sent); an accepted order that
      // was queued, partial or unread is re-read from the broker's record.
      async function followUp() {
        if (loop.state === "FOLLOW_UP_SCHEDULED") { const r = await loop.wake({ kind: "follow_up" }); const key = (log.filter(e => e.to === "ACTING").pop() || { input: {} }).input.idempotency_key; const order = orders.find(x => x.key === key) || (pending && pending.order) || lastOrder(key); return settle(r, order || { estimated_cents: 0, account: { name: "the account" }, symbol: "?", name: "?", quantity: 0, when: "the next open" }); }
        const open = orders.filter(x => x.order_id && (!x.readback || ["queued", "partial", "accepted", "working"].includes(x.readback.status))).pop();
        if (!open) return say("nothing_pending", "No order is waiting on a fill.");
        return fromReadback(open, open.order_id);
      }
      const lastOrder = key => { const e = log.filter(x => x.to === "ACTING" && x.input && x.input.idempotency_key === key).pop(); if (!e) return null; const p = e.input.params || {}; const inst = (o.instruments || []).find(i => i.symbol === p.symbol) || { symbol: p.symbol, name: p.symbol }; const ord = { symbol: p.symbol, name: inst.name, account: { id: p.account, name: p.account }, quantity: p.quantity, notional_cents: p.notional_cents || null, estimated_cents: p.amount_cents || 0, when: "the next open", key, request: { describe: `Buy ${p.symbol}` } }; orders.push(ord); return ord; };
      // S15: "what did you buy today" comes from memory, with the broker named per fill.
      function today(now) { const d = ymd(now || clock()); const fills = loop.memory.facts.filter(f => f.capability_id === CAPABILITY && f.value && f.value.order_id && ymd(f.recorded_at) === d); if (!fills.length) return say("answer", `Nothing bought today.`); return say("answer", fills.map(f => `${qty(f.value.quantity)} ${f.value.symbol} at ${money(f.value.fill_price_cents)} (${money(f.value.total_cents)}) in ${f.value.account}, order ${f.value.order_id}, per ${f.source}`).join("; ") + "."); }
      return { start, reply, followUp, today, parse, loop, orders, confirmText, get pending() { return pending ? { confirmation_id: pending.confirmation_id, symbol: pending.order.symbol, estimated_cents: pending.order.estimated_cents } : null; } };
    }
    return { create, parse, parseAmount, resolve, marketOpen, nextOpen, etParts, CAPABILITY };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentTrade;
