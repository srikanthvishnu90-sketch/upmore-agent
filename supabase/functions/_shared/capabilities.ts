// Upmore deterministic capability paths.
// These answer WITHOUT the model: faster, fully deterministic, and every
// number comes from verified route cards or live market data — never invented.
// They return complete replies and bypass the grounding post-check (which is
// only for model output).

import type { RouteCard } from "./agent.ts";

// ---------- shared ----------

const fresh = (r: RouteCard): boolean =>
  r.status === "verified" &&
  !!r.verified_at &&
  Date.now() - new Date(r.verified_at).getTime() < 7 * 24 * 3600 * 1000;

const catchesOf = (r: RouteCard): string[] =>
  Array.isArray(r.catches) ? r.catches : r.catches ? [String(r.catches)] : [];

// Curated app-store links for the core 15 (stable, hand-checked).
export const APP_LINKS: Record<string, { ios?: string; android?: string }> = {
  R0119: { ios: "https://apps.apple.com/app/fetch-rewards/id1304433084", android: "https://play.google.com/store/apps/details?id=com.fetchrewards.fetchrewards" },
  R0118: { ios: "https://apps.apple.com/app/ibotta-cash-back-rewards/id559765125", android: "https://play.google.com/store/apps/details?id=com.ibotta.android" },
  R0116: { ios: "https://apps.apple.com/app/rakuten-coupons-cash-back/id328264585", android: "https://play.google.com/store/apps/details?id=com.rakuten.android" },
  R0140: { ios: "https://apps.apple.com/app/swagbucks/id639773064", android: "https://play.google.com/store/apps/details?id=com.swagbucks.mobile" },
  R0446: { ios: "https://apps.apple.com/app/google-opinion-rewards/id736535642", android: "https://play.google.com/store/apps/details?id=com.google.android.apps.paidtasks" },
  R0355: { ios: "https://apps.apple.com/app/microsoft-bing/id345323231", android: "https://play.google.com/store/apps/details?id=com.microsoft.bing" },
};

// ---------- 1. "make me $X" ----------

// Honest earning math per route. dollars_per_hour is a CONSERVATIVE blended
// rate (accounts for availability, not the advertised best case). model tells
// how the money actually arrives.
interface CashMath {
  dollars_per_hour: number | null;
  model: "hourly" | "needs_spend" | "windfall" | "slow" | "credit_only" | "bonus_wait";
  math: string;      // one-line honest math, e.g. "~$10/hr of studies"
  min_cashout: string;
  catch: string;     // biggest catch in one line
}
const CASH_MATH: Record<string, CashMath> = {
  R0221: { dollars_per_hour: 15, model: "hourly", math: "tests pay ~$10 per 20 min when available; blended ~$15/hr", min_cashout: "$10 per test, paid ~7 days later via PayPal", catch: "You must pass a practice test, and paid tests aren't always available." },
  R0220: { dollars_per_hour: 10, model: "hourly", math: "studies pay at least $8/hr, typically ~$10/hr", min_cashout: "~$6.50 (£5) via PayPal", catch: "Studies appear in waves — some days are quiet." },
  R0292: { dollars_per_hour: 30, model: "hourly", math: "Typical $30–$350 per case, ~1–2 hrs each — but only when a case is offered to you", min_cashout: "per case; payment terms stated upfront", catch: "Cases are scarce; you can't count on one being there today." },
  R0140: { dollars_per_hour: 3, model: "hourly", math: "surveys run ~$0.20–$2 each; realistic ~$3/hr", min_cashout: "100 SB (~$1); first redemption needs ID verification (days)", catch: "Slow grind — $20 takes many hours, and first payout is delayed by verification." },
  R0118: { dollars_per_hour: null, model: "needs_spend", math: "cash back on groceries you're already buying; $20 min to withdraw", min_cashout: "$20 to withdraw", catch: "You have to spend money on groceries first — it's savings, not earnings." },
  R0119: { dollars_per_hour: null, model: "needs_spend", math: "~25+ pts per receipt ≈ a few cents; $20 takes hundreds of receipts", min_cashout: "$10 in points for first gift card", catch: "Very slow — months of receipts to reach $20." },
  R0116: { dollars_per_hour: null, model: "slow", math: "1–15% cash back, but pays quarterly (Feb/May/Aug/Nov)", min_cashout: "$5.01", catch: "Payout takes 3–14 weeks to confirm, then quarterly. Too slow for fast cash." },
  R0446: { dollars_per_hour: null, model: "credit_only", math: "$0.10–$1.00 per survey — paid as Google Play credit, NOT cash", min_cashout: "n/a — credit only", catch: "It's Play Store credit, not spendable cash. Doesn't count toward $20 cash." },
  R0355: { dollars_per_hour: null, model: "slow", math: "~$5–$10/month in gift cards from daily searching", min_cashout: "gift card thresholds", catch: "Months to reach $20, and it's gift cards, not cash." },
  R0213: { dollars_per_hour: null, model: "slow", math: "passive points for keeping the app installed; slow trickle", min_cashout: "varies", catch: "Passive but very slow — not a $20 plan." },
  R0295: { dollars_per_hour: null, model: "windfall", math: "either $0 or a surprise — can't be planned", min_cashout: "n/a", catch: "Most searches find nothing. Check once, don't count on it." },
  R0302: { dollars_per_hour: null, model: "windfall", math: "$5–$1000+ per settlement, but payouts take months", min_cashout: "n/a", catch: "Slow and uncertain — not a plan for $20 this week." },
  R0098: { dollars_per_hour: null, model: "bonus_wait", math: "Your friend gets $100; your referral bonus varies by your offer — requires their direct deposit", min_cashout: "n/a — referral bonus", catch: "Needs a friend to sign up and fund — out of your control; pays after all qualifying steps." },
  R0096: { dollars_per_hour: null, model: "bonus_wait", math: "$25–$300+ bonus with direct deposit; weeks to pay", min_cashout: "n/a — bank bonus", catch: "Bigger payout, but weeks out and needs direct deposit." },
  R0036: { dollars_per_hour: null, model: "bonus_wait", math: "$400 bonus with qualifying direct deposit; pays in ~10 business days after qualifying", min_cashout: "n/a — bank bonus", catch: "Biggest payout here, but you need real direct deposits and patience." },
};

const MAKE_X_RX = /\bmake me\s*\$?\s?(\d{1,4})\b|\bi need\s*\$?\s?(\d{1,4})\b.{0,20}\b(fast|quick|today|now|asap)\b|\bearn\s*\$?\s?(\d{1,4})\b.{0,20}\b(fast|quick|today)\b|\bi want to make (some |extra )?money\b|\bhelp me make (some |extra )?money\b|\b(trying to make (some |extra )?money)\b/i;
const VAGUE_OPENER_RX = /i want to make (some |extra )?money|help me make (some |extra )?money|trying to make (some |extra )?money/i;

export function tryMakeMeX(message: string, routes: RouteCard[]): string | null {
  const m = message.match(MAKE_X_RX);
  if (!m) return null;
  // Vague openers ("i want to make money") anchor on a concrete $20 plan.
  const target = VAGUE_OPENER_RX.test(message)
    ? 20
    : parseInt(m[1] ?? m[2] ?? m[4] ?? "0", 10);
  if (!target || target <= 0 || target > 10000) return null;
  const live = routes.filter(fresh).filter((r) => (r.lane ?? "Standard") === "Standard");
  if (!live.length) return null;

  // Rank verified routes by honest hours to reach the target.
  const ranked = live
    .map((r) => ({ r, cm: CASH_MATH[r.route_id] }))
    .filter((x) => x.cm)
    .map((x) => ({
      ...x,
      hours: x.cm.model === "hourly" && x.cm.dollars_per_hour
        ? target / x.cm.dollars_per_hour
        : Infinity,
    }))
    .sort((a, b) => a.hours - b.hours);

  const pick = ranked.find((x) => x.hours < Infinity);
  if (!pick) {
    // Nothing verified can earn cash on a schedule — say so honestly.
    return (
      `Real talk on $${target}: none of my verified routes can get you there on a schedule — ` +
      `they're cashback (needs spending), slow trickles, or one-time windfalls.\n\n` +
      `The closest honest plays:\n` +
      live.slice(0, 3).map((r) => {
        const cm = CASH_MATH[r.route_id];
        return `• ${r.provider} (${r.route_id}) — ${cm ? cm.math : r.payout_text ?? ""}`;
      }).join("\n") +
      `\n\nWant the full step-by-step for any of these?`
    );
  }

  const { r, cm, hours } = pick;
  const steps = r.steps.slice(0, 5).map((s, i) => `${i + 1}. ${s.text}`).join("\n");
  const links = APP_LINKS[r.route_id];
  const linkLine = r.provider_url +
    (links?.ios || links?.android ? `\nApp: ${links.ios ?? links.android}` : "");
  const honest =
    hours <= 4
      ? `about ${Math.max(1, Math.round(hours))} hour${Math.round(hours) === 1 ? "" : "s"} of work`
      : `roughly ${Math.round(hours)} hours of work`;
  const others = ranked.filter((x) => x.r.route_id !== r.route_id && x.hours < Infinity).slice(0, 2);

  return (
    `Fastest honest path to $${target}: **${r.provider}** (${r.route_id}).\n\n` +
    `The math: ${cm.math}, so $${target} ≈ ${honest}. ` +
    `Cash out: ${cm.min_cashout}.\n\n` +
    `Steps:\n${steps}\n\n` +
    `Start here: ${linkLine}\n\n` +
    `Biggest catch: ${cm.catch}` +
    (others.length
      ? `\n\nAlso real: ` + others.map((x) => `${x.r.provider} (~${Math.round(x.hours)}h)`).join(", ") + `.`
      : "") +
    `\n\nWant me to walk you through step 1?`
  );
}

// ---------- 2. quantitative stock screen ----------

const STOCK_RX = /\bstocks?\b/i;
const STOCK_INTENT_RX = /\b(invest|buy|pick|recommend|good|best|should i|which|analyze|research|screen|worth)\b/i;

const UNIVERSE = ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","JPM","V","XOM","UNH","WMT","MA","PG","JNJ","COST","HD","BAC","NFLX","AMD","CRM","ORCL","ABBV","KO"];

interface QRow { sym: string; name: string; px: number; mom: number; distHi: number; vol: number; trend: number; score: number }

async function fetchFactors(sym: string): Promise<QRow | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1y&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(9000) }
    );
    if (!res.ok) return null;
    const j = await res.json();
    const meta = j?.chart?.result?.[0]?.meta;
    const closes: (number | null)[] = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const c = closes.filter((x): x is number => typeof x === "number" && x > 0);
    if (c.length < 120 || !meta) return null;
    const px = c[c.length - 1];
    const mom = c[c.length - 21] / c[Math.max(0, c.length - 252)] - 1;
    const hi = Math.max(...c);
    const distHi = px / hi - 1;
    const rets: number[] = [];
    for (let i = 1; i < c.length; i++) rets.push(Math.log(c[i] / c[i - 1]));
    const w = rets.slice(-60);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const vol = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length) * Math.sqrt(252);
    const ma200 = c.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, c.length);
    return { sym, name: String(meta.longName ?? sym), px, mom, distHi, vol, trend: px / ma200 - 1, score: 0 };
  } catch {
    return null;
  }
}

export async function tryQuantStocks(message: string): Promise<string | null> {
  if (!STOCK_RX.test(message) || !STOCK_INTENT_RX.test(message)) return null;
  // "free stock" promos are kind-D rewards, not investing questions.
  if (/\bfree stocks?\b/i.test(message)) return null;

  const rows = (await Promise.all(UNIVERSE.map(fetchFactors))).filter(
    (r): r is QRow => r !== null
  );
  if (rows.length < 10) {
    return (
      `I tried to pull live market data for a quantitative screen, but the data feed didn't come through. ` +
      `I won't guess at prices — ask me again in a bit, or ask about a verified earning route instead.`
    );
  }
  const z = (vals: number[], v: number) => {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
    return (v - mean) / sd;
  };
  const moms = rows.map((r) => r.mom), dhs = rows.map((r) => r.distHi),
        vols = rows.map((r) => r.vol), trs = rows.map((r) => r.trend);
  for (const r of rows) {
    // Equal-weighted 4-factor composite: momentum, value (below 52w high =
    // cheaper), low volatility, trend above 200-day average.
    r.score = (z(moms, r.mom) + z(dhs.map((x) => -x), -r.distHi) + z(vols.map((x) => -x), -r.vol) + z(trs, r.trend)) / 4;
  }
  rows.sort((a, b) => b.score - a.score);
  const top = rows.slice(0, 5);
  const fmtPct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const lines = top.map((r, i) =>
    `${i + 1}. ${r.sym} (${r.name}) — $${r.px.toFixed(2)} — score ${r.score >= 0 ? "+" : ""}${r.score.toFixed(2)}\n` +
    `   momentum ${fmtPct(r.mom)}, ${fmtPct(-r.distHi)} below 52w high, vol ${fmtPct(r.vol)}, ${r.trend >= 0 ? "above" : "below"} 200-day avg`
  );
  const asof = new Date().toISOString().slice(0, 10);
  return (
    `Straight talk first: stocks aren't fixed income — prices move both ways and you can lose money. ` +
    `This is a quantitative screen, not financial advice and not a prediction.\n\n` +
    `I screened ${rows.length} large-cap US stocks on 4 technical factors (data as of ${asof}):\n` +
    `momentum (12–1 mo return), pullback (distance below 52-week high), low volatility (60-day), trend (vs 200-day avg). ` +
    `Each factor z-scored across the group, equal-weighted into one composite. ` +
    `Technical-only: this uses price history alone, no company fundamentals or true valuation.\n\n` +
    `Top 5 by composite score:\n${lines.join("\n")}\n\n` +
    `What the model is saying: these five currently combine the strongest recent momentum with the calmest price action ` +
    `relative to their own highs. It is NOT saying they will go up — past patterns don't predict the future.\n\n` +
    `If you want to act on any of this, do your own research on the company's actual business or talk to a fiduciary advisor — ` +
    `I can't execute trades. And if the goal is a sure $20, my verified earning routes beat stock-picking every time.`
  );
}

// ---------- 3. gambling / prediction-market guard ----------

const GAMBLE_RX = /\bpolymarket\b|\bkalshi\b|prediction markets?\b|\bpoly\s?market\b|\bsportsbook\b|\bparlay\b|\bfanduel\b|\bdraftkings\b/i;

export function tryGamblingGuard(message: string): string | null {
  if (!GAMBLE_RX.test(message)) return null;
  return (
    `Critical thinking on this one, because the math matters:\n\n` +
    `A prediction market is betting, not earning. Every dollar you win is a dollar someone else lost — ` +
    `it's zero-sum before costs, and negative-sum after spreads and fees. That means the average trader loses money, ` +
    `and most retail traders lose. You put real money up first, you can lose all of it, and winning depends on being ` +
    `right about uncertain events — not on doing work.\n\n` +
    `Two more real risks: legality is state-by-state (some states restrict prediction markets), and these products are ` +
    `designed to keep you trading, which is how gambling problems start.\n\n` +
    `I'd never file this under fixed income — it's variable with a negative expected value for most people. ` +
    `If you want a real plan for extra cash, ask me to make you $20 and I'll show you the fastest honest path.`
  );
}

// ---------- 4. Deterministic full walkthrough (DB-driven) ----------
// "walk me through X" renders the complete verified method: every step from
// the official-terms verification, exact link, payout, biggest catch.
// Data-driven: reads steps/catches/payout/provider_url straight from the
// verified route rows, so it can never drift from verification.
const WALK_ALIASES: Array<[RegExp, string]> = [
  [/fetch/, "R0119"], [/ibotta/, "R0118"], [/rakuten/, "R0116"],
  [/swagbucks/, "R0140"], [/prolific/, "R0220"],
  [/user\s?testing/, "R0221"], [/online\s?verdict/, "R0292"],
  [/google opinion/, "R0446"], [/missing\s?money|unclaimed/, "R0295"],
  [/class action|\bftc\b|settlement/, "R0302"],
  [/microsoft rewards|bing rewards/, "R0355"], [/nielsen/, "R0213"],
  [/\bchime\b/, "R0098"], [/\bsofi\b/, "R0096"], [/\bchase\b/, "R0036"],
];
const WALK_INTENT =
  /walk me through|guide me through|talk me through|step.by.step|show me the steps|how do i (actually |really )?(use|do|start|earn)/i;

export function tryWalkthrough(
  message: string,
  routes: any[],
): { reply: string; routeId: string } | null {
  if (!WALK_INTENT.test(message)) return null;
  const t = message.toLowerCase();
  let rid: string | null = null;
  const idm = t.match(/\br0\d{3}\b/);
  if (idm) rid = idm[0].toUpperCase();
  if (!rid) {
    for (const [re, id] of WALK_ALIASES) {
      if (re.test(t)) { rid = id; break; }
    }
  }
  if (!rid) {
    const hit = routes.find(
      (r) => String(r.provider ?? "").length > 3 &&
        t.includes(String(r.provider).toLowerCase()),
    );
    if (hit) rid = hit.route_id;
  }
  if (!rid) return null;
  const r = routes.find((x) => x.route_id === rid);
  if (!r) {
    return {
      reply:
        "I haven't verified that one yet, so I can't walk you through it " +
        "as a live offer — I'd be guessing at the steps and the payout, and I " +
        "don't do that. Ask me about one of my 14 verified routes instead.",
      routeId: rid,
    };
  }
  const steps: any[] = Array.isArray(r.steps) ? r.steps : [];
  const stepLines = steps
    .map((s, i) => `${i + 1}. ${typeof s === "string" ? s : s.text ?? ""}`)
    .join("\n");
  const catches: any[] = Array.isArray(r.catches) ? r.catches : [];
  const laneNote =
    r.lane && r.lane !== "Standard"
      ? `\nHeads up: this is a ${r.lane}-lane route (higher risk) — read the catches carefully.`
      : "";
  return {
    reply:
      `**${r.provider}** (${r.route_id}) — verified live.\n\n` +
      `${r.payout_text ?? ""}\n\n${stepLines}\n\n` +
      `Cash out: ${r.payout_timing ?? "see the official terms"}\n` +
      `Biggest catch: ${catches[0] ?? "see the official terms"}` +
      laneNote +
      `\n\nStart here: ${r.provider_url ?? r.link ?? ""}`,
    routeId: r.route_id,
  };
}

// ---------- 5. Privacy guard: never serve another user's data ----------
// Fires before the fast path so "show me another user's email" can never be
// misread as an offers question. Nothing is leaked; the refusal is explicit.
const PRIVACY_WHO = /another user|someone else'?s|other users?'?|other people'?s/i;
const PRIVACY_WHAT = /email|password|progress|data|account|info(rmation)?|name|profile|phone/i;

export function tryPrivacyGuard(message: string): string | null {
  if (PRIVACY_WHO.test(message) && PRIVACY_WHAT.test(message)) {
    return "I can't show you another person's data — every account here is " +
      "private, including yours. I can only see your own progress and the " +
      "public verified offers.\n\nWant to see your own progress instead?";
  }
  return null;
}

// ---------- 6. Scam guard ----------
// High-stakes safety patterns get a deterministic hard warning, not a
// model improvisation. Patterns are narrow (fee + gift cards, not gift
// cards alone — Microsoft Rewards legitimately pays in gift cards).
const SCAM_FEE_RX = /fee|upfront|pay.{0,20}(before|first|to start)/i;
const SCAM_CHECK_RX = /deposit.{0,40}check.{0,40}(wire|send.{0,20}back)|wire.{0,20}back/i;
const SCAM_CRYPTO_RX = /doubl(e|ing).{0,30}(crypto|bitcoin|btc)|send.{0,30}(btc|bitcoin|crypto).{0,20}first/i;
const SCAM_LOGIN_RX = /(bank|account).{0,25}(login|password|credentials).{0,40}(send|share|give|dm|tell me)|send.{0,40}(bank|account).{0,25}(login|password)/i;
const SCAM_RICHES_RX = /guarantee.{0,40}\$[\d,]+.{0,25}(a|per)\s*day/i;

export function tryScamGuard(message: string): string | null {
  const t = message.toLowerCase();
  let why: string | null = null;
  if (/gift\s*card/i.test(t) && SCAM_FEE_RX.test(t)) {
    why = "No legitimate job or earning route asks you to pay a fee in gift cards — gift cards are untraceable, which is exactly why scammers demand them.";
  } else if (SCAM_CHECK_RX.test(t)) {
    why = "This is the classic fake-check scam: their check bounces days later, but the money you wired is gone for good — and your bank holds you responsible.";
  } else if (SCAM_CRYPTO_RX.test(t)) {
    why = "Nobody doubles crypto for strangers. You send first, they vanish — it's one of the oldest crypto thefts there is.";
  } else if (SCAM_LOGIN_RX.test(t)) {
    why = "Never share bank logins or passwords with anyone, ever — not a person, not me, not a 'support agent'. Anyone asking is stealing.";
  } else if (SCAM_RICHES_RX.test(t)) {
    why = "Guaranteed thousands a day with no experience doesn't exist. Real routes pay real rates — anyone promising more is lying to get something from you.";
  }
  if (!why) return null;
  return (
    `Stop — that's a scam. Don't do it.\n\n${why}\n\n` +
    `The rule is simple: never pay to start earning, never share logins, ` +
    `and nobody hands you free money. If you want real earnings without ` +
    `the risk, ask me to walk you through one of my 14 verified routes.`
  );
}

export async function tryCapabilities(
  message: string,
  routes: RouteCard[],
): Promise<{ reply: string; routeId?: string } | null> {
  const gambling = tryGamblingGuard(message);
  if (gambling) return { reply: gambling };
  const privacy = tryPrivacyGuard(message);
  if (privacy) return { reply: privacy };
  const scam = tryScamGuard(message);
  if (scam) return { reply: scam };
  const makeMe = tryMakeMeX(message, routes);
  if (makeMe) return { reply: makeMe };
  const walk = tryWalkthrough(message, routes);
  if (walk) return walk;
  const stocks = await tryQuantStocks(message);
  if (stocks) return { reply: stocks };
  return null;
}
