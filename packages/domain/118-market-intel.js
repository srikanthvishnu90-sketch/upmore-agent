/* Market and news intelligence (owner's Full Agent Capability List items C17-C21, C23, C25-C27, C31-C39,
   C42-C45): briefings, alerts, explainers, screens and comparisons over a market dataset. DATA RULE: no live
   market feed is connected today, so the only dataset is the DATED STAND-IN file packages/offers/market-data.json
   (the router bundle's MARKET_DATA_JSON); every figure it carries is stand-in data, every reply says so on its
   source line, and the file names the live feeds a real proof needs. Nothing here is investment advice: data
   and math only, no verdicts, no "buy this" (the AdviceGuard stands); a comparison is a side-by-side, and a
   price alert's message names the trade words the person can reply with — the trade itself stays behind its
   own approval card in the trade flow, never placed here. Alerts fire exactly once (the caller's sent-keys).
     data      packages/offers/market-data.json: as_of, quotes (price, prev_close, premarket), holdings (stand-in
               portfolio), watchlist_default, earnings + results, ex_dividends, macro, rates series, ipos,
               spinoffs, halts, analyst_actions, insider_trades, calls, news, universe (screens), funds,
               fundamentals, crypto news, hype events
     watches   agent_proactive_settings.watches kinds set by command() below: price_alert {symbol, op, cents},
               market_brief, earnings_alerts, macro_alerts, rate_watch {below (percent x100)}, ipo_alerts,
               halt_alerts, analyst_alerts, insider_alerts, hype_alerts, market_watchlist {symbols[]}
   Functions:
     command(words, watches, now)   set/list/stop for every watch kind above, restated in the reply
     ask(words) / answer(words, now, opts)   the chat asks: movers (C19), watchlist (C21), digest (C31, through
               AgentNews), risers (C32), explain (C33), deep dive (C34), call takeaways (C37), sector screen
               (C38), compare (C39), crypto (C42), dividend screen (C43), IPO/spin-off radar (C44), and the
               read-backs for C17/C20/C23/C25/C26/C27/C35/C36/C45
     proactive(ctx)                 the pushes: morning briefing (C17), price alerts (C18), earnings warn and
               result (C20), watchlist events (C21), macro day-before (C23), rate watch (C25), IPO and lockup
               dates (C26), halts (C27), analyst actions (C35), insider filings (C36), hype warnings (C45)
   Pure: the clock, the dataset and the person's watches are passed in. */
const MarketIntel = (() => {
  const DAY = 86400000;
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dataOf = (d) => d || (typeof MARKET_DATA_JSON !== "undefined" ? MARKET_DATA_JSON : null);
  const dayMs = (s) => Date.parse(`${s}T00:00:00Z`);
  const ymdOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  const md = (s) => `${MONTHS[Number(s.slice(5, 7)) - 1].slice(0, 3)} ${Number(s.slice(8, 10))}`;
  const mdl = (s) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}, ${s.slice(0, 4)}`;
  const money = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (n) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
  const srcLine = (d, extra) => `Source: ${d.source}${extra ? ` ${extra}` : ""}`;
  const q = (d, sym) => (d.quotes || {})[sym] || null;
  const held = (d, sym) => (d.holdings || []).find((h) => h.symbol === sym) || null;
  const storyFor = (d, sym) => (d.news || []).find((n) => n.symbol === sym) || null;
  const isCrypto = (d, sym) => { const h = held(d, sym); return !!h && h.sector === "crypto"; };

  function position(d, sym) {
    const h = held(d, sym), quote = q(d, sym);
    if (!h || !quote) return null;
    const value = h.shares * quote.price, day = h.shares * (quote.price - quote.prev_close);
    return { h, quote, value, day, dayPct: quote.prev_close ? (quote.price / quote.prev_close - 1) * 100 : 0 };
  }
  function totals(d) {
    let stocks = 0, crypto = 0, dayStocks = 0, dayCrypto = 0;
    for (const h of d.holdings || []) { const p = position(d, h.symbol); if (!p) continue; if (h.sector === "crypto") { crypto += p.value; dayCrypto += p.day; } else { stocks += p.value; dayStocks += p.day; } }
    return { stocks, crypto, dayStocks, dayCrypto, total: stocks + crypto, day: dayStocks + dayCrypto };
  }
  function watchlistOf(watches, d) {
    const w = (watches || []).find((x) => x && x.kind === "market_watchlist" && x.status !== "stopped");
    return w && Array.isArray(w.symbols) && w.symbols.length ? w.symbols.slice() : (d.watchlist_default || []).slice();
  }
  const has = (watches, kind) => (watches || []).some((w) => w && w.kind === kind && w.status !== "stopped");

  // ---- C17: the morning briefing, composed from the dataset (also the proactive push) ----
  function briefing(d, now) {
    const t = totals(d), lines = [`Your stocks before the open, ${mdl(ymdOf(now))}: ${money(t.stocks)} in stocks (${money(t.dayStocks)} so far against yesterday's close) and ${money(t.crypto)} in crypto (${money(t.dayCrypto)}).`];
    const movers = (d.holdings || []).filter((h) => h.sector !== "crypto").map((h) => position(d, h.symbol)).filter(Boolean).sort((a, b) => Math.abs(b.day) - Math.abs(a.day)).slice(0, 3);
    for (const p of movers) { const s = storyFor(d, p.h.symbol); lines.push(`${p.h.symbol} ${pct(p.dayPct)} (${money(p.day)} on your ${p.h.shares} ${p.h.sector === "crypto" ? "coins" : "shares"})${s ? `: ${s.summary.split(". ")[0]}. (${s.source})` : ": no specific news in the dataset; the move is not explained by a story I can cite."}`); }
    const gaps = (d.holdings || []).filter((h) => q(d, h.symbol) && q(d, h.symbol).premarket != null).map((h) => { const quote = q(d, h.symbol); return `${h.symbol} ${pct((quote.premarket / quote.prev_close - 1) * 100)} premarket`; });
    if (gaps.length) lines.push(`Premarket gaps on your holdings: ${gaps.join("; ")}.`);
    const today = ymdOf(now), soon = ymdOf(now + 21 * DAY);
    const earn = (d.earnings || []).filter((e) => e.reports_on >= today && e.reports_on <= soon && held(d, e.symbol));
    if (earn.length) lines.push(`Coming earnings on your holdings: ${earn.map((e) => `${e.symbol} ${mdl(e.reports_on)} ${e.when}, consensus EPS $${e.consensus_eps.toFixed(2)}`).join("; ")}.`);
    const exd = (d.ex_dividends || []).filter((e) => e.ex_date >= today && e.ex_date <= soon && held(d, e.symbol));
    if (exd.length) lines.push(`Ex-dividend dates on your holdings: ${exd.map((e) => `${e.symbol} goes ex-dividend ${mdl(e.ex_date)} at $${e.per_share.toFixed(2)} a share (${money(e.per_share * held(d, e.symbol).shares)} on your shares), pays ${mdl(e.pay_date)}`).join("; ")}.`);
    const mac = (d.macro || []).filter((e) => e.on >= today && e.on <= ymdOf(now + 14 * DAY));
    if (mac.length) lines.push(`Macro ahead: ${mac.map((e) => `${e.name} ${mdl(e.on)} at ${e.time}`).join("; ")}.`);
    lines.push("Reply \"more on NVDA\" (or any holding) for depth on it.");
    lines.push(srcLine(d));
    return lines.join("\n");
  }

  // ---- C19: why is my portfolio down/up — contribution math first, drivers from the news file ----
  function movers(d, now) {
    const t = totals(d), parts = (d.holdings || []).map((h) => position(d, h.symbol)).filter(Boolean).sort((a, b) => a.day - b.day);
    const lines = [`Your portfolio is ${t.day >= 0 ? "up" : "down"} ${money(Math.abs(t.day))} against yesterday's close: stocks ${money(t.dayStocks)}, crypto ${money(t.dayCrypto)}, on ${money(t.total)} total.`];
    for (const p of parts) { if (Math.abs(p.day) < 0.005) continue; const s = storyFor(d, p.h.symbol); lines.push(`${p.h.symbol}: ${money(p.day)} (${pct(p.dayPct)} on ${p.h.shares} ${p.h.sector === "crypto" ? "coins" : "shares"} at ${money(p.quote.price)})${s ? ` — ${s.summary.split(". ")[0]}. (${s.source}, ${s.link})` : " — no specific news in the dataset, so I won't invent a reason."}`); }
    lines.push(srcLine(d, "Prices as of the dataset's as-of time."));
    return lines.join("\n");
  }

  // ---- chat answers ----
  function watchlistAnswer(d, watches) {
    const syms = watchlistOf(watches, d), lines = [`Your watchlist: ${syms.join(", ")}.`];
    for (const sym of syms) { const quote = q(d, sym), s = storyFor(d, sym); if (!quote) { lines.push(`${sym}: no quote in the dataset.`); continue; } lines.push(`${sym} ${money(quote.price)} (${pct((quote.price / quote.prev_close - 1) * 100)} today)${s ? `: ${s.summary.split(". ")[0]}. (${s.source})` : ": no recent news in the dataset."}`); }
    lines.push("Add or drop a name by text: \"watch TSLA for me\" or \"stop watching RKLB\".");
    lines.push(srcLine(d));
    return lines.join("\n");
  }
  function digest(d, now) {
    const News = typeof AgentNews !== "undefined" ? AgentNews : null;
    if (!News) return "The news digest isn't available in this build.";
    const user = { holdings: (d.holdings || []).map((h) => ({ symbol: h.symbol, name: h.name, sector: h.sector })), watchlist: watchlistOf([], d) };
    const stories = (d.news || []).map((n) => ({ id: n.id, title: n.title, summary: n.summary, link: n.link, source: n.source, published_at: Date.parse(n.published_at), entities: n.symbol ? [n.symbol] : [] }));
    const run = News.run(stories, user, { now });
    const b = News.brief(run, {});
    const lines = ["The news that touches your money:"];
    for (const it of b.items) lines.push(`${it.rank}. ${it.title} — ${it.summary} (${it.source}) ${it.link} So what: ${it.why}.`);
    if (b.thin) lines.push("That is everything that touches your money today; I don't pad this.");
    lines.push(srcLine(d));
    return lines.join("\n");
  }
  function risers(d) {
    const up = (d.universe || []).filter((u) => (u.monthly || []).length >= 3 && u.monthly.every((m) => m.pct > 0));
    const lines = [`Up each of the last 3 months (July, August, September 2026) in the dataset's universe, of the ${(d.universe || []).filter((u) => (u.monthly || []).length >= 3).length} names with 3 months of monthly data on file:`];
    for (const u of up) lines.push(`${u.symbol} (${u.name}): ${u.monthly.map((m) => `${m.m.slice(5) === "07" ? "Jul" : m.m.slice(5) === "08" ? "Aug" : "Sep"} ${pct(m.pct)}`).join(", ")}, at ${money(u.price)}. Driver: ${u.driver}.`);
    lines.push("That is a screen result, not a recommendation. To act on one, reply with the trade words (for example \"buy $5 of AMD\") and the trade flow will put up its approval card.");
    lines.push(srcLine(d));
    return lines.join("\n");
  }
  function explain(d, sym) {
    const f = (d.fundamentals || {})[sym];
    if (!f) return `${sym}: I don't have fundamentals for that name in the dataset, so I won't guess. ${srcLine(d)}`;
    const lines = [`${f.name} (${sym}) at ${money(f.price)}: ${f.does}.`, `How it makes money: ${f.makes_money}.`, `The numbers: market cap ${f.market_cap}, revenue (TTM) ${f.revenue_ttm}, net income (TTM) ${f.net_income_ttm}${f.pe ? `, P/E ${f.pe}` : ", no P/E (it loses money)"}${f.ps ? `, price/sales ${f.ps}x` : ""}, cash ${f.cash}.`];
    if (f.peers) lines.push(`Versus real peers on price/sales: ${f.peers.map((p) => `${p.symbol} ${p.ps}x`).join(", ")} — ${sym} trades at ${f.ps}x.`);
    lines.push(`Bull case, with numbers: ${f.bull}.`);
    lines.push(`Bear case, with numbers: ${f.bear}.`);
    lines.push(`Latest quarter: ${f.latest_quarter}.`);
    lines.push(`What would change this picture: ${f.would_change}.`);
    lines.push("Data and math only — whether it belongs in your portfolio is your call.");
    lines.push(srcLine(d));
    return lines.join("\n");
  }
  function deepDive(d, sym) {
    const f = (d.fundamentals || {})[sym];
    if (!f || !f.quarters) return `${sym}: I don't have a deep-dive file for that name in the dataset, so I won't invent one. ${srcLine(d)}`;
    const lines = [`Deep dive: ${f.name} (${sym}) at ${money(f.price)}, market cap ${f.market_cap}.`, `${f.does.charAt(0).toUpperCase() + f.does.slice(1)}. How it makes money: ${f.makes_money}.`, "Recent quarters:"];
    for (const qq of f.quarters) lines.push(`${qq.q}: revenue ${qq.revenue}, EPS $${qq.eps.toFixed(2)} (${qq.note}).`);
    lines.push(`Analyst spread: ${f.analyst_spread}.`);
    lines.push(`Risks: ${f.risks}.`);
    lines.push(`What cannot be known: ${f.unknown}.`);
    lines.push("Every figure above is from the dataset named below; this is research, not a recommendation.");
    lines.push(srcLine(d));
    return lines.join("\n");
  }
  function callTakeaways(d, sym, now) {
    const c = (d.calls || []).find((x) => x.symbol === sym);
    if (!c) return `No earnings call for ${sym} is in the dataset yet. ${srcLine(d)}`;
    if (now && c.on > ymdOf(now)) return `${sym}'s next call is ${mdl(c.on)} — it has not happened yet, so there are no takeaways to give. ${srcLine(d)}`;
    const lines = [`The lines that matter from ${sym}'s call (${mdl(c.on)}):`];
    c.lines.forEach((l, i) => lines.push(`${i + 1}. ${l}`));
    lines.push(srcLine(d, "Takeaways are the dataset's transcript lines, not a press release."));
    return lines.join("\n");
  }
  function sectorScreen(d, text) {
    const capM = /under \$(\d+(?:\.\d+)?)b/i.exec(text || ""), cap = capM ? Number(capM[1]) : 20;
    const all = (d.universe || []).filter((u) => u.theme === "ai infrastructure" || /semiconductor|software|hardware/.test(u.sector || ""));
    const inCap = all.filter((u) => u.market_cap_b != null && u.market_cap_b < cap), out = all.filter((u) => u.market_cap_b != null && u.market_cap_b >= cap);
    const lines = [`Screen: theme "AI infrastructure", market cap under $${cap}B, run over the dataset's universe. Criteria restated so you can re-run it: theme tag plus a semiconductor, software or hardware sector, market cap under $${cap}B.`];
    for (const u of inCap) lines.push(`${u.symbol} (${u.name}): ${money(u.price)}, market cap $${u.market_cap_b}B${u.pe ? `, P/E ${u.pe}` : ", no P/E (loses money)"}. Risk: ${u.risk || "see the filings in the dataset"}.`);
    for (const u of out) lines.push(`${u.symbol} is excluded: market cap $${u.market_cap_b}B is over the $${cap}B cap.`);
    lines.push("A screen result, not a recommendation.");
    lines.push(srcLine(d));
    return lines.join("\n");
  }
  function compare(d, a, b) {
    const fa = (d.funds || {})[a], fb = (d.funds || {})[b];
    if (!fa || !fb) return `I can compare funds the dataset carries (VOO and VTI today). ${srcLine(d)}`;
    const qa = q(d, a), qb = q(d, b);
    const lines = [`${a} vs ${b}, side by side (data only — no verdict):`,
      `Price: ${a} ${qa ? money(qa.price) : "n/a"}; ${b} ${qb ? money(qb.price) : "n/a"}.`,
      `Expense ratio: ${a} ${fa.expense.toFixed(2)}% a year; ${b} ${fb.expense.toFixed(2)}% a year. On $10,000 that is ${money(100 * fa.expense)} vs ${money(100 * fb.expense)} a year — the same, so the fee difference is exactly zero dollars.`,
      `Holdings: ${a} holds ${fa.holdings_count} stocks; ${b} holds ${fb.holdings_count}. By weight, ${fb.overlap_with_voo_pct}% of ${b} is the same stocks as ${a}.`,
      `Concentration: the top 10 stocks are ${fa.top10_pct}% of ${a} and ${fb.top10_pct}% of ${b}.`,
      `Last 12 months in the dataset: ${a} ${pct(fa.ret_1y)}, ${b} ${pct(fb.ret_1y)} — on $10,000 that is ${money(10000 * fa.ret_1y / 100)} vs ${money(10000 * fb.ret_1y / 100)}, a difference of ${money(Math.abs(10000 * (fa.ret_1y - fb.ret_1y) / 100))}.`,
      `Tax note (fact, not advice): both are ETFs; ${b}'s broader index holds more small companies, which turn over more.`,
      "Which one fits is your decision; the numbers above are the whole comparison."];
    lines.push(srcLine(d));
    return lines.join("\n");
  }
  function cryptoDigest(d) {
    const lines = ["Your crypto, numbers only:"];
    for (const sym of ["BTC", "ETH"]) { const p = position(d, sym); if (!p) continue; lines.push(`${sym}: ${p.h.shares} coins at ${money(p.quote.price)} = ${money(p.value)} (${pct(p.dayPct)} today, ${money(p.day)}).`); }
    for (const n of d.crypto_news || []) lines.push(`${n.title}. (${n.source}) ${n.link}`);
    lines.push("Numbers only — nothing here is a suggestion to trade.");
    lines.push(srcLine(d));
    return lines.join("\n");
  }
  function dividendScreen(d) {
    const owned = new Set((d.holdings || []).map((h) => h.symbol));
    const cands = (d.universe || []).filter((u) => u.div_yield != null && !owned.has(u.symbol)).sort((a, b) => b.div_yield - a.div_yield);
    const lines = ["Dividend payers in the dataset you have never owned (screen: a stated yield, payout ratio and 5-year dividend growth):"];
    for (const u of cands) { const trap = u.payout > 100 || u.div_growth_5y < 0; lines.push(`${u.symbol} (${u.name}): yield ${u.div_yield.toFixed(1)}%, payout ratio ${u.payout}%, 5-year dividend growth ${u.div_growth_5y.toFixed(1)}% a year, at ${money(u.price)}.${trap ? ` YIELD TRAP: the payout ratio is ${u.payout}% of earnings and the dividend has shrunk ${Math.abs(u.div_growth_5y).toFixed(1)}% a year for 5 years — the yield is high because the price and the payout are under pressure, per the dataset.` : ""}`); }
    lines.push("A screen result, not a recommendation.");
    lines.push(srcLine(d));
    return lines.join("\n");
  }
  function ipoRadar(d) {
    const ints = (d.interests || []).join(", ");
    const lines = [`Upcoming IPOs and spin-offs matching your stated interests (${ints}):`];
    for (const e of d.ipos || []) lines.push(`${e.name}: ${e.event} — ${mdl(e.on)}. ${e.detail}.`);
    for (const s of d.spinoffs || []) lines.push(`${s.name}: ${s.event} — ${mdl(s.on)}. ${s.detail}.`);
    lines.push("The honest risk picture: new listings have no trading history in the dataset, first-day prices often move double digits either way, and lockup expiries add shares that can be sold. Dates and terms are the dataset's; whether to act is your call.");
    lines.push(srcLine(d));
    return lines.join("\n");
  }

  // ---- routing ----
  const SYMS = ["NVDA", "AAPL", "MSFT", "VOO", "VTI", "ASTS", "RKLB", "TSLA", "IONQ", "AMD", "PLTR", "BTC", "ETH"];
  const NAMES = { TESLA: "TSLA", APPLE: "AAPL", MICROSOFT: "MSFT", NVIDIA: "NVDA", BITCOIN: "BTC", ETHEREUM: "ETH" };
  const symIn = (t) => { const up = ` ${String(t || "").toUpperCase()} `; return SYMS.find((s) => up.includes(` ${s} `) || up.includes(`$${s}`)) || Object.keys(NAMES).find((n) => up.includes(` ${n} `) || up.includes(` ${n}'S `)) && NAMES[Object.keys(NAMES).find((n) => up.includes(` ${n} `) || up.includes(` ${n}'S `))] || null; };
  function ask(words) {
    const t = String(words || "").trim();
    if (command(t, [], 0)) return "command";
    // A definition question ("what is an ipo", "what's a circuit breaker") is the model's, never a market
    // read-back — unless it is about the person's own names ("what is my biggest position" is not ours either,
    // but it is not a definition).
    if (/^what(?:'s| is) (?:a |an |the )?/i.test(t) && !/\bmy\b/i.test(t)) return null;
    if (/why is my portfolio (down|up)|portfolio (down|up) today|what happened to my portfolio/i.test(t)) return "movers";
    if (/^(more on|depth on)\b/i.test(t)) return "explain";
    if (/should i care about/i.test(t)) return "explain";
    if (/explain (this stock|)\s*\$?[a-z]{2,5}\b/i.test(t) && symIn(t)) return "explain";
    if (/deep[- ]?dive|research (whether|on|)\s/i.test(t)) return "deepdive";
    if (/(\bvs\b|\bversus\b|compare)/i.test(t) && symIn(t)) return "compare";
    if (/what('s| has) been going up|up for .* months|going up and why|risers/i.test(t)) return "risers";
    if (/news that matters|news digest|personalized news/i.test(t)) return "digest";
    if (/takeaways|lines that matter|earnings call/i.test(t)) return "call";
    if (/best .* plays|screen|under \$\d/i.test(t)) return "screen";
    if (/dividend (ideas|payers|screen)|solid dividend/i.test(t)) return "divscreen";
    if (/upcoming ipos|new listings|spin-?offs|ipo.*radar/i.test(t)) return "ipo";
    if (/what's happening with my coins|crypto digest|my coins/i.test(t)) return "crypto";
    if (/my watchlist|watchlist briefing/i.test(t)) return "watchlist";
    if (/stock briefing|morning briefing|daily briefing/i.test(t)) return "briefing";
    if (/when do .* report|earnings alerts|warn me before .* report/i.test(t)) return "earnings";
    if (/macro|fed decid|fed decision|cpi|jobs report/i.test(t)) return "macro";
    if (/mortgage|rate-watch|rates? (drop|fall|watch)/i.test(t)) return "rates";
    if (/(ipo|lockup) (calendar|alerts|radar|expir)/i.test(t)) return "ipo";
    if (/halt|circuit breaker/i.test(t)) return "halt";
    if (/analyst/i.test(t)) return "analyst";
    if (/insider|congressional/i.test(t)) return "insider";
    if (/parabolic|hype|going viral/i.test(t)) return "hype";
    if (/explain|care about/i.test(t) && symIn(t)) return "explain";
    return null;
  }
  function answer(words, now, opts) {
    const o = opts || {}, d = dataOf(o.data), kind = ask(words);
    if (!kind || !d) return null;
    const watches = o.watches || [], sym = symIn(words);
    if (kind === "command") { const c = command(words, watches, now); return c ? c.reply : null; }
    if (kind === "movers") return movers(d, now);
    if (kind === "briefing") return briefing(d, now);
    if (kind === "watchlist") return watchlistAnswer(d, watches);
    if (kind === "digest") return digest(d, now);
    if (kind === "risers") return risers(d);
    if (kind === "explain") { const tok = sym || ((/care about ([a-z]{2,5})\b/i.exec(words) || [])[1] || "").toUpperCase(); return tok ? explain(d, tok) : "Name the stock and I'll explain it from the dataset."; }
    if (kind === "deepdive") return sym ? deepDive(d, sym) : "Name the company and I'll do the deep dive from the dataset.";
    if (kind === "call") return sym ? callTakeaways(d, sym, now) : "Name the company and I'll pull its call takeaways.";
    if (kind === "screen") return sectorScreen(d, words);
    if (kind === "compare") { const found = SYMS.filter((s) => new RegExp(`\\b${s}\\b`, "i").test(words)); return found.length >= 2 ? compare(d, found[0], found[1]) : "Name both funds (for example \"VOO versus VTI\") and I'll put them side by side."; }
    if (kind === "crypto") return cryptoDigest(d);
    if (kind === "divscreen") return dividendScreen(d);
    if (kind === "ipo") return ipoRadar(d);
    if (kind === "earnings") { const today = ymdOf(now); const lines = (d.earnings || []).filter((e) => held(d, e.symbol)).map((e) => `${e.symbol} reports ${mdl(e.reports_on)} ${e.when}; consensus EPS $${e.consensus_eps.toFixed(2)}; last quarter it ${e.last_quarter}.`); const res = (d.earnings_results || []).filter((r) => r.reported_on <= today && held(d, r.symbol)).map((r) => resultText(d, r)); return [`Earnings on your holdings:`, ...lines, ...res, srcLine(d)].join("\n"); }
    if (kind === "macro") { const lines = (d.macro || []).map((e) => `${e.name}: ${mdl(e.on)} at ${e.time}. ${e.history}`); return [`Macro calendar:`, ...lines, srcLine(d)].join("\n"); }
    if (kind === "rates") { const s = (d.rates || {}).mortgage30 || [], last = s[s.length - 1]; return last ? `30-year fixed mortgages in the dataset: the best rate on file is ${last.rate.toFixed(3)}% from ${last.lender}, as of ${mdl(last.on)} (it was ${s[0].rate.toFixed(3)}% on ${mdl(s[0].on)}). Set a watch by text: "tell me when 30-year mortgages drop below 6%". ${srcLine(d)}` : "No rate data in the dataset."; }
    if (kind === "halt") { const hs = d.halts || []; return hs.length ? [`Halts and circuit breakers:`, ...hs.map((h) => `${h.symbol} halted ${mdl(h.on)} at ${h.at} (${h.reason}). ${h.detail}. Your position: ${held(d, h.symbol) ? `${held(d, h.symbol).shares} shares` : "not held"}.`), `Market-wide circuit breakers today: none in the dataset.`, srcLine(d)].join("\n") : "No halts in the dataset."; }
    if (kind === "analyst") { const lines = (d.analyst_actions || []).map((a) => `${a.firm} ${a.action} on ${a.symbol} (${mdl(a.on)}): ${a.reason}.`); return [`Analyst actions on your names:`, ...lines, srcLine(d)].join("\n"); }
    if (kind === "insider") { const lines = (d.insider_trades || []).map((a) => `${a.who} ${a.what} (trade date ${mdl(a.on)}; ${a.form} filed ${mdl(a.filed)}).`); return [`Insider and congressional trades on your names:`, ...lines, srcLine(d)].join("\n"); }
    if (kind === "hype") { const hs = d.hype || []; return hs.length ? [`Hype check on your holdings:`, ...hs.map((h) => hypeText(d, h)), srcLine(d)].join("\n") : "Nothing in your holdings is flagged parabolic in the dataset."; }
    return null;
  }
  function resultText(d, r) {
    const p = position(d, r.symbol), beat = r.eps - r.consensus_eps, move = p ? (r.close_after / r.close_before - 1) * 100 : 0;
    const pnl = p ? p.h.shares * (r.close_after - r.close_before) : 0;
    return `${r.symbol} reported: EPS $${r.eps.toFixed(2)} vs $${r.consensus_eps.toFixed(2)} consensus (${beat >= 0 ? "beat" : "miss"} by $${Math.abs(beat).toFixed(2)}), revenue ${r.revenue}. The guidance line that matters: ${r.guidance}. The stock moved ${pct(move)} to ${money(r.close_after)}; on your ${p ? p.h.shares : 0} shares that is ${money(pnl)}.`;
  }
  function hypeText(d, h) {
    const p = position(d, h.symbol);
    return `Hype risk: ${h.symbol} is up ${h.move_5d_pct.toFixed(1)}% in five sessions${p ? ` (your ${p.h.shares} shares are ${money(p.value)})` : ""}. ${h.detail.charAt(0).toUpperCase() + h.detail.slice(1)}. A move like this often round-trips; that is a risk read from the numbers, not a suggestion to trade.`;
  }

  // ---- commands: set / list / stop, restated ----
  const TOGGLES = [["market_brief", /^(?:send|start|turn on) (?:me )?(?:the )?(?:daily )?stock briefing|brief me on my stocks/i, "I'll send your stock briefing before the open every trading day."], ["earnings_alerts", /warn me before my stocks report|earnings alerts on/i, "I'll warn you before each holding reports, and send the result after."], ["macro_alerts", /heads up before the fed|macro (calendar )?reminders on/i, "I'll send a heads-up the day before each Fed decision, CPI release and jobs report."], ["ipo_alerts", /tell me when anything i care about files to go public|ipo alerts on/i, "I'll tell you when anything you care about files to go public, prices, or hits a lockup expiry."], ["halt_alerts", /wake me if one of my stocks halts|halt alerts on/i, "I'll wake you if one of your stocks halts or the market triggers a circuit breaker."], ["analyst_alerts", /tell me when analysts change their mind|analyst (action )?alerts on/i, "I'll tell you when analysts change their mind on your stocks."], ["insider_alerts", /tell me when insiders trade my stocks|insider (trade )?alerts on/i, "I'll tell you when insiders or members of Congress trade your stocks."], ["hype_alerts", /warn me if one of my stocks goes parabolic|hype (risk )?warnings on/i, "I'll warn you if one of your stocks goes parabolic."]];
  function command(words, watches, now) {
    const t = String(words || "").trim(), list = (watches || []).filter((w) => w && w.status !== "stopped").slice();
    let m;
    if ((m = /(?:tell me if|alert me if|tell me when) ([a-z]{2,5}|bitcoin|ethereum) (?:drops? below|falls? below|goes below) \$?([\d,]+(?:\.\d+)?)/i.exec(t)) || (m = /(?:tell me if|alert me if|tell me when) ([a-z]{2,5}|bitcoin|ethereum) (?:rises? above|crosses above|goes above) \$?([\d,]+(?:\.\d+)?)/i.exec(t))) {
      const below = /below/i.test(t), sym = /^bitcoin$/i.test(m[1]) ? "BTC" : /^ethereum$/i.test(m[1]) ? "ETH" : m[1].toUpperCase(), cents = Math.round(Number(m[2].replace(/,/g, "")) * 100);
      // The symbol must be a name the dataset actually quotes — "tell me when my balance drops below $100" is a
      // bank watch (AgentAlerts), never a price alert on a made-up ticker "MY".
      const d0 = dataOf(null); if (d0 && !q(d0, sym)) return null;
      const w = { kind: "price_alert", id: `pa-${sym}-${cents}`, symbol: sym, op: below ? "below" : "above", cents, created_at: now, status: "active" };
      return { watches: list.filter((x) => x.id !== w.id).concat([w]), changed: true, reply: `Set: I'll tell you once if ${sym} ${below ? "drops below" : "rises above"} ${money(cents / 100)}, with the actual price and time. It's checked against the dataset named in my source lines until a live market feed is connected.` };
    }
    if ((m = /tell me when 30-year mortgages drop below ([\d.]+)%/i.exec(t))) {
      const w = { kind: "rate_watch", id: "rate-mortgage30", below_x100: Math.round(Number(m[1]) * 100), created_at: now, status: "active" };
      return { watches: list.filter((x) => x.kind !== "rate_watch").concat([w]), changed: true, reply: `Set: I'll tell you once when the best 30-year fixed rate in the dataset drops below ${Number(m[1]).toFixed(2)}%, with the rate and the lender offering it.` };
    }
    if ((m = /^watch ([a-z]{2,5}(?: and [a-z]{2,5})?) for me/i.exec(t))) {
      const syms = m[1].toUpperCase().split(" AND ");
      const w = { kind: "market_watchlist", id: "market-watchlist", symbols: syms, created_at: now, status: "active" };
      return { watches: list.filter((x) => x.kind !== "market_watchlist").concat([w]), changed: true, reply: `Watching ${syms.join(" and ")} for you: I'll send event-driven updates with the price, the recent news and why it moved.` };
    }
    if ((m = /stop watching ([a-z]{2,5})/i.exec(t))) {
      const sym = m[1].toUpperCase(), cur = watchlistOf(list, dataOf(null) || { watchlist_default: [] });
      const left = cur.filter((s) => s !== sym);
      const w = { kind: "market_watchlist", id: "market-watchlist", symbols: left, created_at: now, status: "active" };
      return { watches: list.filter((x) => x.kind !== "market_watchlist").concat([w]), changed: true, reply: `Stopped watching ${sym}. Your watchlist is now ${left.join(", ") || "empty"}.` };
    }
    if (/^(show|list) my (price )?alerts/i.test(t)) {
      const pas = list.filter((w) => w.kind === "price_alert"), rw = list.filter((w) => w.kind === "rate_watch");
      const parts = pas.map((w) => `${w.symbol} ${w.op} ${money(w.cents / 100)}`).concat(rw.map((w) => `30-year mortgages below ${(w.below_x100 / 100).toFixed(2)}%`));
      // With no market alerts of its own to list, this is the general "show my alerts" read-back's question, not ours.
      if (!parts.length) return null;
      return { watches: list, changed: false, reply: `Your live alerts: ${parts.join("; ")}.` };
    }
    if ((m = /stop (?:the )?([a-z]{2,5}) (?:price )?alert/i.exec(t))) {
      const sym = m[1].toUpperCase(), left = list.filter((w) => !(w.kind === "price_alert" && w.symbol === sym));
      return { watches: left, changed: left.length !== list.length, reply: left.length !== list.length ? `Stopped: the ${sym} price alert is off.` : `There is no ${sym} price alert to stop.` };
    }
    for (const [kind, re, said] of TOGGLES) { if (re.test(t)) { const w = { kind, id: kind, created_at: now, status: "active" }; return { watches: list.filter((x) => x.kind !== kind).concat([w]), changed: true, reply: `Set: ${said}` }; } }
    return null;
  }
  const isMarketWatch = (w) => !!w && (w.kind === "price_alert" || w.kind === "rate_watch" || w.kind === "market_watchlist" || TOGGLES.some(([k]) => k === w.kind));

  // ---- the pushes ----
  function proactive(ctx) {
    const o = ctx || {}, d = dataOf(o.data); if (!d) return [];
    const now = o.now || Date.now(), watches = o.watches || [], sent = new Set(o.sent || []), today = ymdOf(now), out = [];
    const push = (key, cap, text, urgent, cadence) => { if (!sent.has(key)) out.push({ key, cap, text, urgent: !!urgent, cadence: !!cadence }); };
    const dow = new Date(now).getUTCDay(), tradingDay = dow >= 1 && dow <= 5;
    if (has(watches, "market_brief") && tradingDay) push(`market:brief:${today}`, "C17", briefing(d, now), false, true);
    for (const w of watches) {
      if (!w || w.status === "stopped") continue;
      if (w.kind === "price_alert") { const quote = q(d, w.symbol); if (!quote) continue; const hit = w.op === "below" ? quote.price * 100 < w.cents : quote.price * 100 > w.cents; if (hit) push(`price:${w.id}`, "C18", `Price alert: ${w.symbol} is ${money(quote.price)} at the dataset's as-of time (${d.as_of}), ${w.op} your ${money(w.cents / 100)} line. To act, reply with the trade words (for example "buy $5 of ${w.symbol}" or "sell $5 of ${w.symbol}") and the trade flow will put up its approval card — nothing trades from this alert alone. ${srcLine(d)}`, true, false); }
      if (w.kind === "rate_watch") { const s = (d.rates || {}).mortgage30 || [], last = s[s.length - 1], prev = s[s.length - 2]; if (last && last.rate * 100 < w.below_x100 && (!prev || prev.rate * 100 >= w.below_x100)) push("rate:mortgage30", "C25", `Rate watch: 30-year fixed mortgages just dropped below ${(w.below_x100 / 100).toFixed(2)}% — the best offer on file is ${last.rate.toFixed(3)}% from ${last.lender}, as of ${mdl(last.on)}. ${srcLine(d)}`, false, false); }
    }
    if (has(watches, "earnings_alerts")) {
      for (const e of d.earnings || []) { if (!held(d, e.symbol)) continue; if (e.reports_on === ymdOf(now + DAY)) push(`earnings:warn:${e.symbol}:${e.reports_on}`, "C20", `Earnings tomorrow: ${e.symbol} reports ${mdl(e.reports_on)} ${e.when}. Consensus EPS is $${e.consensus_eps.toFixed(2)}; last quarter it ${e.last_quarter}. ${srcLine(d)}`, false, false); }
      for (const r of d.earnings_results || []) { if (!held(d, r.symbol)) continue; if (r.reported_on === ymdOf(now - DAY) || r.reported_on === today) push(`earnings:result:${r.symbol}:${r.reported_on}`, "C20", `${resultText(d, r)} ${srcLine(d)}`, false, false); }
    }
    if (has(watches, "market_watchlist")) {
      for (const sym of watchlistOf(watches, d)) { const quote = q(d, sym), s = storyFor(d, sym); if (!quote || !s) continue; const movePct = (quote.price / quote.prev_close - 1) * 100; if (Math.abs(movePct) >= 3) push(`watchlist:${sym}:${today}`, "C21", `Watchlist: ${sym} is ${money(quote.price)} (${pct(movePct)} today). ${s.summary.split(". ")[0]}. (${s.source}) ${srcLine(d)}`, false, false); }
    }
    if (has(watches, "macro_alerts")) for (const e of d.macro || []) { if (e.on === ymdOf(now + DAY)) push(`macro:${e.id}`, "C23", `Tomorrow: ${e.name}, ${mdl(e.on)} at ${e.time}. ${e.history} ${srcLine(d)}`, false, false); }
    if (has(watches, "ipo_alerts")) {
      for (const e of d.ipos || []) { if (e.on === today) push(`ipo:${e.id}`, "C26", `${e.name} ${e.event} today, ${mdl(e.on)}: ${e.detail}. New listings carry no trading history in the dataset and first prices often move sharply. ${srcLine(d)}`, false, false); }
      for (const s of d.spinoffs || []) { if (s.on === ymdOf(now + 7 * DAY)) push(`spinoff:${s.id}`, "C44", `${s.name}: ${s.event} in 7 days, ${mdl(s.on)}. ${s.detail}. Spin-offs often see forced selling by index funds in the first weeks; that is the dataset's risk note, not a suggestion. ${srcLine(d)}`, false, false); }
    }
    if (has(watches, "halt_alerts")) for (const h of d.halts || []) { if (h.on === today) { const p = position(d, h.symbol); push(`halt:${h.id}`, "C27", `Halt: ${h.symbol} halted today at ${h.at} (${h.reason}) and resumed at ${h.resumed}. ${h.detail}. Your position: ${p ? `${p.h.shares} shares, ${money(p.value)}` : "not held"} — a halt pauses trading; it does not change what the shares are. Market-wide circuit breakers today: none in the dataset. ${srcLine(d)}`, true, false); } }
    if (has(watches, "analyst_alerts")) for (const a of d.analyst_actions || []) { if (a.on === today || a.on === ymdOf(now - DAY)) push(`analyst:${a.id}`, "C35", `Analyst action: ${a.firm} ${a.action} on ${a.symbol} (${mdl(a.on)}). The firm's stated reasoning: ${a.reason}. ${held(d, a.symbol) ? `You hold ${held(d, a.symbol).shares} shares.` : "It's on your watchlist."} ${srcLine(d)}`, false, false); }
    if (has(watches, "insider_alerts")) for (const a of d.insider_trades || []) { if (a.filed <= today && a.filed >= ymdOf(now - 2 * DAY)) push(`insider:${a.id}`, "C36", `Insider/congressional trade: ${a.who} ${a.what} (trade date ${mdl(a.on)}; ${a.form} filed ${mdl(a.filed)}). ${srcLine(d)}`, false, false); }
    if (has(watches, "hype_alerts")) for (const h of d.hype || []) { if (h.on === today) push(`hype:${h.id}`, "C45", `${hypeText(d, h)} ${srcLine(d)}`, true, false); }
    return out;
  }
  return { ask, answer, command, proactive, briefing, movers, totals, position, watchlistOf, isMarketWatch, KIND_PRICE: "price_alert" };
})();
if (typeof module !== "undefined" && module.exports) module.exports = MarketIntel;
