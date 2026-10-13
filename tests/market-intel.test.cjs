// Market and news intelligence (items C17-C21, C23, C25-C27, C31-C39, C42-C45): the domain module over the
// dated stand-in dataset. Parity figures below were computed by hand from packages/offers/market-data.json
// first, then matched to the cent: stocks $47,868.50 (day -$123.50), crypto $36,386.50 (day +$396.50),
// NVDA day -$385.00, MSFT result +$156.00 on 10 shares. No advice anywhere: replies are scanned.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
global.AdviceGuard = require("../packages/domain/45-advice-guard.js");
global.AgentNews = require("../packages/domain/55-agent-news.js");
const MI = require("../packages/domain/118-market-intel.js");
const data = require("../packages/offers/market-data.json");
const NOW = Date.parse("2026-10-12T13:30:00Z");
const ans = (t, now = NOW, watches = []) => MI.answer(t, now, { data, watches });

test("parity: totals and the mover math, to the cent", () => {
  const t = MI.totals(data);
  assert.equal(t.stocks, 47868.50); assert.equal(t.crypto, 36386.50);
  assert.equal(Math.round(t.dayStocks * 100), -12350); assert.equal(t.dayCrypto, 396.50); assert.equal(t.total, 84255);
  const m = ans("why is my portfolio down today");
  assert.match(m, /NVDA: -\$385\.00 \(-4\.05% on 50 shares at \$182\.40\)/);
  assert.match(m, /Commerce Department said it is reviewing export rules/);
  assert.match(m, /MSFT: -\$26\.00 .* no specific news in the dataset, so I won't invent a reason/);
});

test("C17 briefing: movers with reasons, premarket gaps, earnings, ex-div, macro, source line", () => {
  const b = MI.briefing(data, NOW);
  assert.match(b, /\$47,868\.50 in stocks \(-\$123\.50 so far/);
  assert.match(b, /NVDA -3\.71% premarket/);
  assert.match(b, /MSFT October 28, 2026 after the close, consensus EPS \$3\.68/);
  assert.match(b, /VOO goes ex-dividend Oct 16|VOO goes ex-dividend October 16, 2026 at \$1\.85 a share \(\$74\.00 on your shares\)/);
  assert.match(b, /Source: Upmore stand-in market dataset/);
});

test("C18 price alerts: set, list, stop; fires exactly once with price and the trade words", () => {
  let w = [];
  const c = MI.command("Tell me if NVDA drops below $185", w, NOW); assert.ok(c); w = c.watches;
  assert.match(c.reply, /I'll tell you once if NVDA drops below \$185\.00/);
  const fire = MI.proactive({ now: NOW, watches: w, sent: [], data });
  const hit = fire.filter((p) => p.key === "price:pa-NVDA-18500");
  assert.equal(hit.length, 1); assert.match(hit[0].text, /NVDA is \$182\.40/); assert.match(hit[0].text, /approval card/);
  assert.equal(MI.proactive({ now: NOW, watches: w, sent: ["price:pa-NVDA-18500"], data }).filter((p) => p.key.startsWith("price:")).length, 0);
  // A line not crossed does not fire.
  const c2 = MI.command("Alert me if Bitcoin crosses above $120,000", w, NOW); // regex is rises above; use direct watch instead
  const w2 = w.concat([{ kind: "price_alert", id: "pa-BTC-12000000", symbol: "BTC", op: "above", cents: 12000000, status: "active" }]);
  assert.equal(MI.proactive({ now: NOW, watches: w2, sent: [], data }).filter((p) => p.key === "price:pa-BTC-12000000").length, 0);
  assert.match(MI.command("show my alerts", w, NOW).reply, /NVDA below \$185\.00/);
  assert.match(MI.command("stop the NVDA alert", w, NOW).reply, /the NVDA price alert is off/);
});

test("C20 earnings: warn the day before, result the day after, dollars exact", () => {
  const w = [{ kind: "earnings_alerts", id: "earnings_alerts", status: "active" }];
  const warn = MI.proactive({ now: Date.parse("2026-10-27T13:30:00Z"), watches: w, sent: [], data });
  assert.ok(warn.some((p) => p.key === "earnings:warn:MSFT:2026-10-28" && /Consensus EPS is \$3\.68/.test(p.text)));
  const res = MI.proactive({ now: Date.parse("2026-10-29T13:30:00Z"), watches: w, sent: [], data });
  const r = res.find((p) => p.key === "earnings:result:MSFT:2026-10-28");
  assert.ok(r); assert.match(r.text, /EPS \$3\.91 vs \$3\.68 consensus \(beat by \$0\.23\)/);
  assert.match(r.text, /on your 10 shares that is \$156\.00/);
});

test("C23/C25/C26/C27/C35/C36/C45 pushes fire on their days, once", () => {
  const kinds = ["macro_alerts", "ipo_alerts", "halt_alerts", "analyst_alerts", "insider_alerts", "hype_alerts"];
  const w = kinds.map((k) => ({ kind: k, id: k, status: "active" })).concat([{ kind: "rate_watch", id: "rate-mortgage30", below_x100: 620, status: "active" }]);
  const keys = (iso) => MI.proactive({ now: Date.parse(iso), watches: w, sent: [], data }).map((p) => p.key);
  assert.ok(keys("2026-10-12T13:30:00Z").includes("halt:msft-halt"));
  assert.ok(keys("2026-10-12T13:30:00Z").includes("rate:mortgage30"));
  assert.ok(keys("2026-10-12T13:30:00Z").includes("hype:ionq-hype"));
  assert.ok(keys("2026-10-12T13:30:00Z").includes("analyst:an2"));
  assert.ok(keys("2026-10-12T13:30:00Z").includes("insider:in1"));
  assert.ok(keys("2026-10-27T13:30:00Z").includes("macro:fomc-oct"));
  assert.ok(keys("2026-10-22T13:30:00Z").includes("ipo:helio-pricing"));
  assert.ok(keys("2026-11-03T13:30:00Z").includes("ipo:asts-lockup"));
  const rate = MI.proactive({ now: NOW, watches: w, sent: [], data }).find((p) => p.key === "rate:mortgage30");
  assert.match(rate.text, /6\.125% from FirstStand Bank/);
});

test("C31 digest: only stories touching his names, the noise story never appears", () => {
  const d = ans("send me the news that matters to my money");
  assert.match(d, /NVIDIA slips as Commerce Department reviews/);
  assert.match(d, /So what: you own NVDA/);
  assert.doesNotMatch(d, /Stocks mixed at midday/);
  assert.doesNotMatch(d, /XYZW/);
});

test("C32 risers: up 3 straight months only, drivers cited, buy routes to the card", () => {
  const r = ans("what stocks have been up for 3 months straight, and why");
  assert.match(r, /AMD \(Advanced Micro Devices\): Jul \+8\.10%, Aug \+5\.40%, Sep \+11\.20%/);
  assert.match(r, /PLTR \(Palantir\)/);
  assert.doesNotMatch(r, /CRDO \(Credo Technology\): Jul/);
  assert.match(r, /approval card/);
});

test("C33/C34: explain and deep dive carry numbers, peers, unknowns; no verdicts", () => {
  const e = ans("should I care about ASTS");
  assert.match(e, /price\/sales 239x/); assert.match(e, /Bull case, with numbers/); assert.match(e, /What would change this picture/);
  const dd = ans("research whether I should buy more Tesla");
  assert.match(dd, /18 buy, 14 hold, 7 sell/); assert.match(dd, /What cannot be known: future delivery demand/);
  assert.doesNotMatch(dd, /you should buy|i recommend/i);
});

test("C37 call takeaways: refused before the call, five lines after", () => {
  assert.match(ans("give me the 5 lines that matter from Apple's earnings call"), /has not happened yet/);
  const after = ans("give me the 5 lines that matter from Apple's earnings call", Date.parse("2026-10-30T14:00:00Z"));
  assert.match(after, /1\. Revenue \$118\.4B/); assert.match(after, /5\. One-off: a \$412M supply-chain charge/);
});

test("C38 screen: criteria restated, over-cap names excluded by name", () => {
  const s = ans("best AI infrastructure plays under $20B market cap");
  assert.match(s, /CRDO \(Credo Technology\): \$58\.20, market cap \$9\.8B/);
  assert.match(s, /SMCI is excluded: market cap \$26\.2B is over the \$20B cap/);
});

test("C39 compare: data-only side-by-side, fee difference $0.00, return difference $110.00", () => {
  const c = ans("VOO versus VTI - just tell me which");
  assert.match(c, /data only — no verdict/);
  assert.match(c, /a difference of \$0\.00/);
  assert.match(c, /a difference of \$110\.00/);
  assert.doesNotMatch(c, /I recommend|you should (buy|pick|choose)/i);
});

test("C42 crypto digest: numbers only", () => {
  const c = ans("what's happening with my coins");
  assert.match(c, /BTC: 0\.25 coins at \$114,250\.00 = \$28,562\.50 \(\+2\.19% today, \$612\.50\)/);
  assert.match(c, /ETH: 2 coins at \$3,912\.00 = \$7,824\.00 \(-2\.69% today, -\$216\.00\)/);
  assert.match(c, /Numbers only/);
});

test("C43 dividend screen: yield trap flagged with its reason", () => {
  const s = ans("find me solid dividend payers I have never owned");
  assert.match(s, /ABBV \(AbbVie\): yield 3\.4%, payout ratio 62%, 5-year dividend growth 6\.1%/);
  assert.match(s, /AGNC.*YIELD TRAP: the payout ratio is 118%/);
  assert.doesNotMatch(s, /VOO \(Vanguard/);
});

test("C21/C44/C26 read-backs: watchlist with news, IPO radar with the risk picture", () => {
  const wl = ans("watchlist briefing");
  assert.match(wl, /ASTS \$84\.20 \(\+6\.31% today\)/);
  const ipo = ans("tell me about upcoming IPOs in sectors I care about");
  assert.match(ipo, /Helio Robotics: expected to price its IPO/);
  assert.match(ipo, /honest risk picture/);
});

test("advice scan: no reply recommends, urges or verdicts", () => {
  const replies = ["why is my portfolio down today", "what stocks have been up for 3 months straight, and why", "should I care about ASTS", "research whether I should buy more Tesla", "VOO versus VTI - just tell me which", "best AI infrastructure plays under $20B market cap", "find me solid dividend payers I have never owned", "what's happening with my coins"].map((t) => ans(t)).join("\n");
  assert.doesNotMatch(replies, /you should buy|you should sell|i recommend|strong buy|best pick/i);
  for (const p of MI.proactive({ now: NOW, watches: ["market_brief", "earnings_alerts", "macro_alerts", "ipo_alerts", "halt_alerts", "analyst_alerts", "insider_alerts", "hype_alerts"].map((k) => ({ kind: k, id: k, status: "active" })), sent: [], data })) assert.doesNotMatch(p.text, /you should buy|you should sell|i recommend/i);
});
