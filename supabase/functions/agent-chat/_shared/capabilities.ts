// Upmore deterministic capability paths.
// These answer WITHOUT the model: faster, fully deterministic, and every
// number comes from verified route cards or live market data — never invented.
// They return complete replies and bypass the grounding post-check (which is
// only for model output).

import type { RouteCard } from "./agent.ts";
import { CANCEL_PATHS } from "./cancel_paths.ts";
import type { CancelPath } from "./cancel_paths.ts";

// ---------- shared ----------

// Capability precedence (documented): gambling guard > privacy guard > scam
// guard > sysprompt guard > make-me-$X > walkthrough > save-side five
// (subscription audit, receipt check, claim deadlines, bill prep, savings
// ledger). The safety-critical guards always fire before any money-planning
// path; a money request can never preempt a safety match.
// Save-side paths are explicitly ordered AFTER earn-side paths so a
// "save" keyword can never hijack an "earn" question.
// NOTE: there is deliberately NO stock-screening capability. The capital wall
// (SYSTEM_PROMPT) forbids securities recommendations; a ranked "top 5 stocks"
// screen violated it, so the old tryQuantStocks was removed 2026-09-27.

const fresh = (r: RouteCard): boolean =>
  r.status === "researched" &&
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
  R0098: { ios: "https://apps.apple.com/us/app/chime-mobile-banking/id836215269", android: "https://play.google.com/store/apps/details?id=com.onedebit.chime" },
  R0535: { ios: "https://apps.apple.com/us/app/fluz-cashback/id1419812499", android: "https://play.google.com/store/apps/details?id=com.fluznyc" },
  R0192: { ios: "https://apps.apple.com/us/app/attapoll-paid-surveys/id1107631390", android: "https://play.google.com/store/apps/details?id=com.requapp.requ" },
  R0360: { ios: "https://apps.apple.com/us/app/receipt-hog-shopping-rewards/id525373618", android: "https://play.google.com/store/apps/details?id=com.infoscout.receipthog" },
  R0221: { ios: "https://apps.apple.com/us/app/usertesting/id1485452102", android: "https://play.google.com/store/apps/details?id=com.usertesting.recorder.krsna" },
  R0515: { android: "https://play.google.com/store/apps/details?id=com.appnana.android.giftcardrewards" },
  R0363: { android: "https://play.google.com/store/apps/details?id=com.coinout.scan" },
  R0500: { android: "https://play.google.com/store/apps/details?id=com.lab465.SmoreApp" },
  R0358: { android: "https://play.google.com/store/apps/details?id=com.checkpoints.app" },
  R0364: { ios: "https://apps.apple.com/us/app/upside-cash-back-gas-food/id1099997174", android: "https://play.google.com/store/apps/details?id=com.upside.consumer.android" },
  R0438: { android: "https://play.google.com/store/apps/details?id=company.coinpop.coinpop" },
  R7242: { ios: "https://apps.apple.com/us/app/mindswarms/id490426157", android: "https://play.google.com/store/apps/details?id=com.mindswarms.consumerApp" },
};


// ---------- 1. "make me $X" ----------

// Honest earning math per route. dollars_per_hour is a CONSERVATIVE blended
// rate (accounts for availability, not the advertised best case). model tells
// how the money actually arrives. schedulable=false routes can never be the
// headline pick for "make me $X" (windfalls, needs-spend savings, slow
// trickles, bonus waits) — they only appear as "closest honest plays".
interface CashMath {
  dollars_per_hour: number | null;
  model: "hourly" | "needs_spend" | "windfall" | "slow" | "credit_only" | "bonus_wait" | "wager" | "variable" | "asset_sale" | "rental";
  math: string;      // one-line honest math, e.g. "~$10/hr of studies"
  min_cashout: string;
  catch: string;     // biggest catch in one line
  schedulable: boolean;
}
const CASH_MATH: Record<string, CashMath> = {
  R0221: { dollars_per_hour: 15, model: "hourly", math: "tests pay ~$10 per 20 min when available; blended ~$15/hr", min_cashout: "$10 per test, paid ~7 days later via PayPal", catch: "You must pass a practice test, and paid tests aren't always available.", schedulable: true },
  R0220: { dollars_per_hour: 10, model: "hourly", math: "studies pay at least $8/hr, typically ~$10/hr", min_cashout: "~$6.50 (£5) via PayPal", catch: "Studies appear in waves — some days are quiet.", schedulable: true },
  R0292: { dollars_per_hour: 30, model: "hourly", math: "Typical $30–$350 per case, ~1–2 hrs each — but only when a case is offered to you", min_cashout: "per case; payment terms stated upfront", catch: "Cases are scarce; you can't count on one being there today.", schedulable: true },
  R0140: { dollars_per_hour: 3, model: "hourly", math: "surveys run ~$0.20–$2 each; realistic ~$3/hr", min_cashout: "100 SB (~$1); first redemption needs ID verification (days)", catch: "Slow grind — $20 takes many hours, and first payout is delayed by verification.", schedulable: true },
  R0118: { dollars_per_hour: null, model: "needs_spend", math: "cash back on groceries you're already buying; $20 min to withdraw", min_cashout: "$20 to withdraw", catch: "You have to spend money on groceries first — it's savings, not earnings.", schedulable: false },
  R0119: { dollars_per_hour: null, model: "needs_spend", math: "~25+ pts per receipt ≈ a few cents; $20 takes hundreds of receipts", min_cashout: "$10 in points for first gift card", catch: "Very slow — months of receipts to reach $20.", schedulable: false },
  R0116: { dollars_per_hour: null, model: "slow", math: "1–15% cash back, but pays quarterly (Feb/May/Aug/Nov)", min_cashout: "$5.01", catch: "Payout takes 3–14 weeks to confirm, then quarterly. Too slow for fast cash.", schedulable: false },
  R0446: { dollars_per_hour: null, model: "credit_only", math: "$0.10–$1.00 per survey — paid as Google Play credit, NOT cash", min_cashout: "n/a — credit only", catch: "It's Play Store credit, not spendable cash. Doesn't count toward $20 cash.", schedulable: false },
  R0355: { dollars_per_hour: null, model: "slow", math: "~$5–$10/month in gift cards from daily searching", min_cashout: "gift card thresholds", catch: "Months to reach $20, and it's gift cards, not cash.", schedulable: false },
  R0213: { dollars_per_hour: null, model: "slow", math: "passive points for keeping the app installed; slow trickle", min_cashout: "varies", catch: "Passive but very slow — not a $20 plan.", schedulable: false },
  R0295: { dollars_per_hour: null, model: "windfall", math: "either $0 or a surprise — can't be planned", min_cashout: "n/a", catch: "Most searches find nothing. Check once, don't count on it.", schedulable: false },
  R0302: { dollars_per_hour: null, model: "windfall", math: "$5–$1000+ per settlement, but payouts take months", min_cashout: "n/a", catch: "Slow and uncertain — not a plan for $20 this week.", schedulable: false },
  R0098: { dollars_per_hour: null, model: "bonus_wait", math: "Your friend gets $100; your referral bonus varies by your offer — requires their direct deposit", min_cashout: "n/a — referral bonus", catch: "Needs a friend to sign up and fund — out of your control; pays after all qualifying steps.", schedulable: false },
  R0096: { dollars_per_hour: null, model: "bonus_wait", math: "$25–$300+ bonus with direct deposit; weeks to pay", min_cashout: "n/a — bank bonus", catch: "Bigger payout, but weeks out and needs direct deposit.", schedulable: false },
  R0036: { dollars_per_hour: null, model: "bonus_wait", math: "$400 bonus with qualifying direct deposit; pays in ~10 business days after qualifying", min_cashout: "n/a — bank bonus", catch: "Biggest payout here, but you need real direct deposits and patience.", schedulable: false },
};

// Derived earning math for the rest of the catalog, generated from the DB's
// verified numeric payout/time fields (all 1500 verified routes have them).
// Hand-curated CASH_MATH entries above always win when present.
const BONUS_WAIT_CATS = new Set([
  "Bank Bonus", "Business Banking",
  "Brokerage Promo", "Fintech Bonus", "Fintech/Neobank", "Telecom Promo",
  "Signup Bonus", "Store Signup", "Referral Bonus", "App Referral",
  "Crypto Reward", "Prediction Market",
]);
const NEEDS_SPEND_CATS = new Set([
  "Rebate/Incentive", "Cashback", "Cashback/Shopping", "Energy Switching", "Buyback",
  "Buyback/Resale", "Gift Card Resale",
  "Recycling", "Receipt/Loyalty", "Insurance/Quote", "Government",
  "Student Program", "Mystery Shopping",
  "Telecom Promo", // beta 2026-09-24: carrier promos require service purchase or pay in non-cash
]);
const WINDFALL_CATS = new Set(["Unclaimed/Recovery", "Competition"]);
// Wager routes (bet your own money to win): risk capital, not schedulable
// income. Tracked by route ID — deterministic, no text guessing.
const WAGER_IDS = new Set(["R0495"]); // HealthyWage: weight-loss wager
// Needs-spend routes miscategorized outside the needs-spend categories
// (cashback-on-purchases framed as earnings). Tracked by route ID —
// deterministic, no text guessing. Beta find 2026-09-24: Fluz App (R0535)
// headlined a $1,000 cash stack at "~$24/hr" when you must buy first.
const NEEDS_SPEND_IDS = new Set([
  "R0535", // Fluz App: cashback on gift-card purchases — no purchase, no reward
]);
// One-shot asset sales (sell something you already own): a payout midpoint
// divided by transaction minutes is NOT an hourly rate, and the work isn't
// repeatable. Schedulable=false — big swings only, never "~$/hr".
// Beta find 2026-09-24: JM Bullion rendered as "~$47,077/hr of work".
const ONE_SHOT_CATS = new Set(["Niche Buyback"]);
// Skill-gated windfalls (bug bounties): expected payout for an ordinary
// person is ~$0 (owner rule 2026-09-23 — top figures must never be presented
// as attainable). Excluded from earn stacks; still searchable in Explore.
const NO_EARN_STACK_CATS = new Set(["Code Bounties", "Promo Arbitrage",
  "Store Signup", // beta 2026-09-24: in-person violates online-only; pays in credits not cash
]);
// Rental income (rent out space/assets): monthly per-listing income. A payout
// midpoint over listing-setup minutes is NOT an hourly rate (beta find
// 2026-09-24: Neighbor rendered as "~$273/hr of work").
const RENTAL_CATS = new Set(["Rent Assets"]);
// Creator / referral / ambassador / freelance programs pay per conversion,
// per client, monthly commission tiers, or one-off bonuses — a payout
// midpoint divided by active minutes is NOT an hourly rate and must never
// be presented as one.
const VARIABLE_CATS = new Set(["UGC/Creator", "App Referral", "Brand Ambassador",
  "Translation", "Transcription", "Tutoring", "Tutoring & Gigs", "Voiceover/Audio", "AI Training",
  "Lead Sourcing", "Media/Music"]);

// Per-invitation work (surveys, user tests, studies): each payout is real,
// but volume is gated — you only earn when invited/qualified. The $/hr math
// must never be read as "do N hours, get $X", so the reply carries a
// reality check when the target needs many separate payouts.
const VOLUME_GATED_CATS = new Set([
  "Survey", "Regional Surveys", "User Testing", "Focus Group",
  "Research Study", "Mock Jury", "Accessibility", "Human Judgment",
]);

function deriveCashMath(r: RouteCard): CashMath | null {
  const pmin = r.payout_min == null ? NaN : Number(r.payout_min);
  const pmax = r.payout_max == null ? NaN : Number(r.payout_max);
  const tmin = r.time_min_minutes == null ? NaN : Number(r.time_min_minutes);
  const tmax = r.time_max_minutes == null ? NaN : Number(r.time_max_minutes);
  if (!isFinite(pmin) || !isFinite(pmax) || pmin < 0 || pmax < 0) return null;
  const pmid = (pmin + pmax) / 2;
  const tmid = isFinite(tmin) && isFinite(tmax) && tmin >= 0 && tmax >= 0
    ? Math.max(1, (tmin + tmax) / 2) : NaN;
  const cat = r.category ?? "";
  const catch1 = catchesOf(r)[0] ?? "Conditions apply — read the official terms before you start.";
  const cashout = r.payout_timing ?? "see the official terms";
  // Risk capital: you bet your own money (HealthyWage-style). Not schedulable
  // income — you can lose the stake. Never the headline pick.
  if (WAGER_IDS.has(r.route_id)) {
    return {
      dollars_per_hour: null, model: "wager",
      math: `wager-based — you stake your own money; prize only if you win the bet`,
      min_cashout: cashout, catch: "You can LOSE your stake. This is a bet, not earnings — never wager money you can't afford to lose.", schedulable: false,
    };
  }
  if (BONUS_WAIT_CATS.has(cat)) {
    // Percentage matches (1% ACAT etc.): the cap is NOT a payout. A pmid
    // midpoint would fabricate an "earnable" bonus — say what it actually is.
    // Beta find 2026-09-24: SoFi's $50k match cap rendered as "$25,000 bonus".
    const pct = (r.payout_text ?? "").match(/\d+(\.\d+)?\s*%/);
    if (pct) {
      return {
        dollars_per_hour: null, model: "bonus_wait",
        math: `${pct[0]} match on qualifying activity (caps at ~$${Math.round(pmax)}) — your bonus scales with what you move`,
        min_cashout: cashout, catch: catch1, schedulable: false,
      };
    }
    return {
      dollars_per_hour: null, model: "bonus_wait",
      math: `$${Math.round(pmid)} bonus with qualifying activity; pays weeks after you qualify`,
      min_cashout: cashout, catch: catch1, schedulable: false,
    };
  }
  if (NEEDS_SPEND_CATS.has(cat) || NEEDS_SPEND_IDS.has(r.route_id)) {
    return {
      dollars_per_hour: null, model: "needs_spend",
      math: pmid > 0 ? `up to ~$${Math.round(pmid)} back on spending you're already doing` : "savings on spending you're already doing",
      min_cashout: cashout, catch: "You have to spend first — it's savings on intended spending, not earnings.", schedulable: false,
    };
  }
  if (ONE_SHOT_CATS.has(cat)) {
    return {
      dollars_per_hour: null, model: "asset_sale",
      math: pmax > 0 ? `one-shot sale — up to ~$${Math.round(pmax)} for your asset` : "one-shot asset sale",
      min_cashout: cashout,
      catch: "You must already own the asset; one payout per item — liquidation, not recurring work.",
      schedulable: false,
    };
  }
  if (RENTAL_CATS.has(cat)) {
    return {
      dollars_per_hour: null, model: "rental",
      math: pmid > 0 ? `~$${Math.round(pmin)}\u2013$${Math.round(pmax)}/month per listing \u2014 not hourly work` : "monthly rental income \u2014 not hourly work",
      min_cashout: cashout,
      catch: "Income starts only when someone rents; payouts are monthly and slow to start.",
      schedulable: false,
    };
  }
  if (WINDFALL_CATS.has(cat)) {
    return {
      dollars_per_hour: null, model: "windfall",
      math: pmid > 0 ? `up to ~$${Math.round(pmid)} — but only if there's money with your name on it` : "either $0 or a surprise — can't be planned",
      min_cashout: "n/a", catch: "Most checks find nothing. Check once, don't count on it.", schedulable: false,
    };
  }
  if (VARIABLE_CATS.has(cat)) {
    return {
      dollars_per_hour: null, model: "variable",
      math: pmid > 0 ? `variable earnings — up to ~$${Math.round(pmid)} per conversion/payout, no reliable hourly rate` : "variable earnings — no reliable hourly rate",
      min_cashout: cashout, catch: "Earnings depend on conversions or volume, not hours worked — one payout could cover it, or nothing could.", schedulable: false,
    };
  }
  // Hourly math needs a real earnings floor. A $0 minimum (bounties,
  // competitions, winner-take-all tiers, finders fees) is variable income —
  // presenting a midpoint as "$/hr of active effort" would be a lie.
  if (pmin <= 0) {
    return {
      dollars_per_hour: null, model: "variable",
      math: pmax > 0 ? `variable — up to ~$${Math.round(pmax)} if it pays out, $0 floor` : "variable earnings — no reliable hourly rate",
      min_cashout: cashout, catch: "You could earn nothing here — only count money that's actually paid out.", schedulable: false,
    };
  }
  // Default: variable paid work — honest $/hr from the verified terms.
  if (!isFinite(tmid) || pmid <= 0) return null;
  const dph = pmid / (tmid / 60);
  const dphTxt = dph >= 20 ? `~$${Math.round(dph)}` : dph >= 1 ? `~$${dph.toFixed(1)}` : `~$${dph.toFixed(2)}`;
  return {
    dollars_per_hour: Math.round(dph * 10) / 10, model: "hourly",
    math: `${dphTxt}/hr of active effort from the verified terms`,
    min_cashout: cashout, catch: catch1, schedulable: true,
  };
}

const MAKE_X_RX = /\bmake me\s*\$?\s?([\d,]{1,7})\b|\bmake \$?\s?([\d,]{1,7})\b|\bi need\s*\$?\s?([\d,]{1,7})\b.{0,20}\b(fast|quick|today|now|asap)\b|\bearn\s*\$?\s?([\d,]{1,7})\b.{0,20}\b(fast|quick|today)\b|\bi want to make (some )?(extra )?money\b|\bhelp me make (some )?(extra )?money\b|\b(trying to make (some )?(extra )?money)\b/i;
const VAGUE_OPENER_RX = /i want to make (some )?(extra )?money|help me make (some )?(extra )?money|trying to make (some )?(extra )?money/i;

// Shared honest ranking for money targets: verified Standard-lane routes,
// ordered by hours of work to reach the target. Non-schedulable routes
// (windfalls, needs-spend, bonus waits, wagers, variable gigs) sort last
// with hours = Infinity — they can never be the headline pick, only
// closest honest plays. Owner direction 2026-09-23: same-day money wins.
function rankRoutesForTarget(
  routes: RouteCard[],
  target: number,
  message = "",
  hist: { role: string; content: string }[] = [],
  exclHist: { role: string; content: string }[] = hist,
) {
  // User payout exclusions ("no points", "no gift cards", "no credits"):
  // drop routes whose verified payout text shows they pay that way.
  // Owner rule: only withdrawable cash counts unless the user says otherwise.
  // A standing exclusion from earlier in the thread still applies — the FULL
  // thread is scanned via exclHist (beta fix 2026-09-24: the 30-message window
  // aged the original "no points" out and GrabPoints headlined the $1,000 plan
  // again). A later "points are fine" lifts it.
  const scope = message + "\n" + exclHist.map((h) => h.content).join("\n");
  const lift = /\bpoints? (are|is) (fine|ok|okay)\b|\ballow points\b/i.test(scope);
  const lastNo = Math.max(
    scope.toLowerCase().lastIndexOf("no points"),
    scope.toLowerCase().lastIndexOf("no gift card"),
    scope.toLowerCase().lastIndexOf("no credit"),
  );
  const lastLift = scope.toLowerCase().lastIndexOf("points are fine");
  const noPoints = /\bno\s+points\b/i.test(scope) && !(lift && lastLift > lastNo);
  const noGiftCards = /\bno\s+gift\s*cards?\b/i.test(scope);
  const noCredits = /\bno\s+credits\b/i.test(scope);
  const live = routes
    .filter(fresh)
    .filter((r) => (r.lane ?? "Standard") === "Standard")
    .filter((r) => !NO_EARN_STACK_CATS.has(r.category ?? ""))
    .filter((r) => {
      if (!noPoints && !noGiftCards && !noCredits) return true;
      const t = `${r.payout_text ?? ""} ${catchesOf(r).join(" ")}`.toLowerCase();
      if (noPoints && /\bpoints?\b|\bpts\b/.test(t)) return false;
      if (noGiftCards && /gift\s*cards?/.test(t)) return false;
      if (noCredits && /\bcredits\b|store credit|bill credit/.test(t)) return false;
      return true;
    });
  return live
    .map((r) => ({ r, cm: CASH_MATH[r.route_id] ?? deriveCashMath(r) }))
    .filter((x) => x.cm)
    .map((x) => ({
      ...x,
      hours: x.cm!.schedulable && x.cm!.dollars_per_hour
        ? target / x.cm!.dollars_per_hour
        : Infinity,
    }))
    .sort((a, b) => a.hours - b.hours);
}

export function tryMakeMeX(
  message: string,
  routes: RouteCard[],
  hist: { role: string; content: string }[] = [],
  exclHist: { role: string; content: string }[] = hist,
): string | null {
  const m = message.match(MAKE_X_RX);
  if (!m) return null;
  // Vague openers ("i want to make money") anchor on a concrete $20 plan.
  const rawTarget = m[1] ?? m[2] ?? m[3] ?? m[5] ?? "0";
  const target = VAGUE_OPENER_RX.test(message)
    ? 20
    : parseInt(rawTarget.replace(/,/g, ""), 10);
  if (!target || target <= 0 || target > 100000) return null;
  const ranked = rankRoutesForTarget(routes, target, message, hist, exclHist);
  if (!ranked.length) return null;
  const SPEED_TIERS = ["today", "days", "weeks"];
  // Volume-gated work (surveys, user tests) can never headline as "fastest
  // honest money" — invitations aren't a schedule (beta find 2026-09-24:
  // Mindswarms headlined "make me $1000" with "Pays today"). Same rule as
  // the plan stack: gated routes get per-hit reality text, never the pick.
  const isGatedX = (x: typeof ranked[number]) => VOLUME_GATED_CATS.has(x.r.category ?? "");
  let pick: typeof ranked[number] | undefined;
  for (const tier of SPEED_TIERS) {
    pick = ranked.find((x) => x.hours < Infinity && !isGatedX(x) && (x.r.speed ?? "weeks") === tier);
    if (pick) break;
  }
  if (!pick) {
    // Nothing verified can earn cash on a schedule — say so honestly.
    const alternates = ranked.filter((x) => x.hours === Infinity).slice(0, 3);
    return (
      `Real talk on $${target}: none of my verified routes can get you there on a schedule — ` +
      `they're cashback (needs spending), slow trickles, or one-time windfalls.\n\n` +
      `The closest honest plays:\n` +
      (alternates.length
        ? alternates.map((x) => `• ${x.r.provider} (${x.r.route_id}) — ${x.cm!.math}`).join("\n")
        : ranked.slice(0, 3).map((x) => `• ${x.r.provider} (${x.r.route_id}) — ${x.r.payout_text ?? ""}`).join("\n")) +
      `\n\nWant the full step-by-step for any of these?`
    );
  }

  const { r, cm, hours } = pick;
  const speedTag = (pick.r.speed === "today") ? " ⚡ Pays today."
    : (pick.r.speed === "days") ? " Pays within about a week." : "";
  // Volume-gated work (surveys, user tests): the $/hr math is per-hit, not a
  // wage. If the target needs many separate invitations, lead with the
  // per-hit reality instead of "hours to target" — otherwise "$1000 ≈ 2
  // hours of work" reads as a promise the catalog can't keep.
  const gated = (() => {
    if (!VOLUME_GATED_CATS.has(r.category ?? "")) return null;
    const ph = planPerHit({ r });
    if (!ph) return null;
    const n = Math.ceil(target / ph.per);
    if (n <= 5) return null;
    const perTxt = ph.wide ? `$${Math.round(ph.pmin)}–$${Math.round(ph.pmax)} (most land at the low end)` : `~$${Math.round(ph.per)}`;
    return {
      per: Math.round(ph.per), n,
      text: `\n\nReality check: that's about ${n} separate payouts at ${perTxt} each, and they only arrive when you qualify — expect weeks of waiting for invitations, not a straight shot at $${target}. Treat this as spare cash per hit, not a $${target} plan.`,
    };
  })();
  const honest = (() => {
    const h = Math.max(1, Math.round(hours));
    return hours <= 4
      ? `about ${h} hour${h === 1 ? "" : "s"} of work`
      : `roughly ${Math.round(hours)} hours of work`;
  })();
  // Gated routes: per-hit reality only — the derived $/hr parenthetical
  // would read as a wage promise for invitation-gated work.
  const mathLine = gated
    ? `Each hit pays ~$${gated.per} when one lands. `
    : `The math: ${cm.math}, so $${target} ≈ ${honest}. `;
  const steps = r.steps.slice(0, 5).map((s, i) => `${i + 1}. ${s.text}`).join("\n");
  const links = APP_LINKS[r.route_id];
  const iosUrl = (r as any).ios_url || links?.ios;
  const andUrl = (r as any).android_url || links?.android;
  const linkLine = r.provider_url +
    (iosUrl || andUrl ? `\nDownload the app: ${iosUrl ?? andUrl}` : "");
  // "Also real" alternates: gated (per-hit) routes never get an "~Xh"
  // figure — their derived hourly math reads as a wage promise (beta find
  // 2026-09-24: "Mindswarms (~2h)" implied 2 hours to $1000).
  const others = ranked.filter((x) => x.r.route_id !== r.route_id && x.hours < Infinity).slice(0, 2);
  const otherLine = (x: typeof others[number]) => {
    if (VOLUME_GATED_CATS.has(x.r.category ?? "")) {
      const ph = planPerHit({ r: x.r });
      return ph ? `${x.r.provider} (~$${Math.round(ph.per)}/hit, per-hit only)` : x.r.provider;
    }
    return Math.round(x.hours) > 0 ? `${x.r.provider} (~${Math.round(x.hours)}h)` : x.r.provider;
  };

  const headline = gated
    ? `Fastest honest money right now: **${r.provider}** (${r.route_id}).${speedTag}`
    : `Fastest honest path to $${target}: **${r.provider}** (${r.route_id}).${speedTag}`;

  return (
    headline + `\n\n` +
    mathLine +
    `Cash out: ${cm.min_cashout}.\n\n` +
    `Steps:\n${steps}\n\n` +
    `Start here: ${linkLine}\n\n` +
    `Biggest catch: ${cm.catch}` +
    (gated ? gated.text : "") +
    (others.length
      ? `\n\nAlso real: ` + others.map(otherLine).join(", ") + `.`
      : "") +
    `\n\nWant me to walk you through step 1?`
  );
}

// ---------- 1b. honest multi-route plan ("the stack") ----------
// Beta-test finding 2026-09-24 ($1,000 challenge): asking for "the actual
// plan" got the single-route recommendation repeated. No single verified
// route reaches a big target fast, so plan-language requests get a
// deterministic stack: verified routes across buckets, ordered by payout
// speed, each with its own honest math toward the target. Never promises
// the total — every line is one verified route with its own catch.
const PLAN_RX = /\b(game plan|full plan|the plan|a plan|my plan|roadmap|stack|strategy|playbook)\b|\bfastest realistic\b|\bhow do i (get|reach|hit)\b|\busing everything you know\b|\bbest (way|path|route)\b/i;

// Per-hit planning math. Extreme ranges (max >= 10x min) plan on the LOW end —
// the midpoint of a $100–$1,500 range is not a plan (beta find 2026-09-24:
// Focusinsite rendered "2 payouts to $1,000" when most studies land low).
// Ordinary ranges (e.g. $10–$50) keep the midpoint.
function planPerHit(x: { r: RouteCard }): { per: number; wide: boolean; pmin: number; pmax: number } | null {
  const pmin = (x.r as any).payout_min == null ? NaN : Number((x.r as any).payout_min);
  const pmax = (x.r as any).payout_max == null ? NaN : Number((x.r as any).payout_max);
  if (!isFinite(pmin) || !isFinite(pmax) || pmin <= 0 || pmax <= 0) return null;
  const wide = pmax >= 10 * pmin;
  return { per: wide ? pmin : (pmin + pmax) / 2, wide, pmin, pmax };
}

export function tryPlanStack(
  message: string,
  routes: RouteCard[],
  hist: { role: string; content: string }[] = [],
  exclHist: { role: string; content: string }[] = hist,
): string | null {
  if (!PLAN_RX.test(message)) return null;
  // Earn-context guard: "a plan" also appears in save-side requests ("I have
  // a plan to cancel Netflix"). Only build the money stack when the message
  // or the thread is about earning.
  const EARN_CTX_RX = /\b(earn|make|money|cash|income|paid|pay|payout|withdraw)\b|\$/i;
  const threadEarn = hist.some((h) => EARN_CTX_RX.test(h.content));
  if (!EARN_CTX_RX.test(message) && !threadEarn) return null;
  let target: number | null = null;
  const mm = message.match(/\$\s?([\d,]{1,7})/);
  if (mm) target = parseInt(mm[1].replace(/,/g, ""), 10);
  if (!target) {
    for (let i = hist.length - 1; i >= 0; i--) {
      const hm = hist[i].content.match(/\$\s?([\d,]{1,7})/);
      if (hm) { target = parseInt(hm[1].replace(/,/g, ""), 10); break; }
    }
  }
  if (!target || target <= 0 || target > 100000) {
    return "Tell me the target number and I'll build the stack — e.g. \"plan to get me $1,000\". What's the goal?";
  }
  const ranked = rankRoutesForTarget(routes, target, message, hist, exclHist);
  if (!ranked.length) return null;

  // Volume-gated work (surveys, user tests, research studies) is per-hit,
  // not a wage — it always renders with per-hit math, never "~$/hr".
  // (Same honesty rule as tryMakeMeX's gated block.)
  const isGated = (x: (typeof ranked)[number]) => VOLUME_GATED_CATS.has(x.r.category ?? "");
  const sched = ranked.filter((x) => x.hours < Infinity && !isGated(x));
  const gated = ranked.filter(isGated);
  const swings = ranked.filter((x) => x.hours === Infinity && !isGated(x));

  const entry = (x: (typeof ranked)[number], idx: number): string => {
    const r = x.r;
    const links = APP_LINKS[r.route_id];
    const iosUrl = (r as any).ios_url || links?.ios;
    const dl = iosUrl || (r as any).android_url || links?.android
      ? `\n   Download the app: ${iosUrl ?? (r as any).android_url ?? links?.android}` : "";
    const speedNote = (r.speed === "today") ? "pays today"
      : (r.speed === "days") ? "pays within about a week" : "pays in weeks";
    const mathBit = x.hours < Infinity && x.cm!.dollars_per_hour
      ? `~$${Math.round(x.cm!.dollars_per_hour)}/hr of work`
      : x.cm!.math;
    return `${idx}. **${r.provider}** (${r.route_id}) — ${mathBit}, ${speedNote}.${dl}\n   ${r.provider_url}\n   Catch: ${x.cm!.catch}`;
  };

  const lines: string[] = [];
  let idx = 0;
  const pushBucket = (title: string, items: typeof ranked, note?: string) => {
    if (!items.length) return;
    lines.push(`\n${title}`);
    if (note) lines.push(note);
    for (const x of items) lines.push(entry(x, ++idx));
  };

  // Anyone-can-do work leads: expert-gated routes (anyone_can_do=false)
  // get their own clearly-labeled bucket, never the top pick. Beta find
  // 2026-09-24: Kolabtree ("requires real advanced expertise") headlined the
  // $1,000 plan as the starting pick.
  const canDo = (x: (typeof ranked)[number]) => (x.r as any).anyone_can_do !== false;
  const doable = sched.filter(canDo);
  const expert = sched.filter((x) => !canDo(x));
  // Fastest schedulable work first: today-speed, then days-speed.
  pushBucket("START TODAY — fastest cash:", doable.filter((x) => x.r.speed === "today").slice(0, 2));
  pushBucket("THIS WEEK — solid per-hour work:", doable.filter((x) => x.r.speed !== "today").slice(0, 2));
  // Volume-gated per-hit routes with the honest unit math.
  const gatedShown = gated.slice(0, 2).map((x) => {
    const ph = planPerHit(x);
    const n = ph ? Math.ceil(target! / ph.per) : 0;
    const r = x.r;
    const links = APP_LINKS[r.route_id];
    const iosUrl = (r as any).ios_url || links?.ios;
    const dl = iosUrl || (r as any).android_url || links?.android
      ? `\n   Download the app: ${iosUrl ?? (r as any).android_url ?? links?.android}` : "";
    const hitTxt = ph
      ? (ph.wide
        ? `~$${Math.round(ph.pmin)}–$${Math.round(ph.pmax)}/hit (most land at the low end) — plan on ${n}+ payouts`
        : `~$${Math.round(ph.per)}/hit, ${n} separate payouts to reach $${target}`)
      : `per-hit payouts`;
    return `${++idx}. **${r.provider}** (${r.route_id}) — ${hitTxt} — only when you qualify, expect weeks.${dl}\n   ${r.provider_url}\n   Catch: ${x.cm!.catch}`;
  });
  if (gatedShown.length) {
    lines.push("\nPER-HIT — spare cash, not a schedule:");
    lines.push("These only pay when you qualify. Run them in the background of everything else.");
    lines.push(...gatedShown);
  }
  // Big swings: asset buyback, capital promos — real money, strict gates.
  const swingsShown = swings
    .slice()
    .sort((a, b) => (Number((b.r as any).payout_max) || 0) - (Number((a.r as any).payout_max) || 0))
    .slice(0, 2);
  pushBucket(
    "BIG SWINGS — only if you qualify:",
    swingsShown,
    "One payout here can cover the target — but each has a hard gate (assets you own, capital to move, approval).",
  );
  const rentals = ranked.filter((x) => x.cm!.model === "rental");
  pushBucket(
    "SLOW BURN \u2014 monthly, not fast:",
    rentals.slice(0, 2),
    "Recurring income once running \u2014 contributes over months, won't get you to $1,000 quickly.",
  );

  pushBucket(
    "EXPERT ONLY — needs real credentials:",
    expert.slice(0, 2),
    "Only if you already have the skills — not a starting point for most people.",
  );
  if (!lines.length) return null;
  // Top pick = first entry in display order (today-speed beats days-speed
  // beats per-hit beats swings), so the "walk me through step 1" continuity
  // fallback lands on the route the stack lists first.
  // Top pick prefers the fastest speed tier: a weeks-speed route with a
  // 2-4 week hiring delay is not the fastest first step even at a higher
  // $/hr (beta find 2026-09-24: TELUS outranked Userfeel as the $1,000 pick).
  const firstToday = doable.filter((x) => x.r.speed === "today")[0];
  const firstDays = doable.filter((x) => x.r.speed === "days")[0];
  const firstWeeks = doable.filter((x) => x.r.speed !== "today" && x.r.speed !== "days")[0];
  const top = firstToday ?? firstDays ?? firstWeeks ?? gated[0] ?? swingsShown[0];
  // The top pick is mentioned LAST so the existing "walk me through step 1"
  // continuity fallback (lastMentionedRouteId) resolves to it.
  const closer = top
    ? `\nMy pick to start with: **${top.r.provider}** (${top.r.route_id}) — fastest verified cash. Want me to walk you through its step 1?`
    : "";

  return (
    `Straight answer on $${target}: no single verified route gets you there fast. ` +
    `Here's the honest stack — run them in parallel, fastest cash first. Every line is one verified route:` +
    lines.join("\n") + closer
  );
}

// ---------- 2. server-side safety refusals (mirror the local chat walls) ----------
// The app's local guideAnswer catches these before the server is ever called,
// but the API must refuse on its own too — defense in depth. Deterministic:
// no model call, no grounding check needed (fixed strings).

const SECURITIES_REFUSAL =
  "I can't recommend what to invest in — that's outside what I do. I help with earning extra money through verified routes, not investing. " +
  "If you're looking to grow money you've already earned, that's a conversation for a fee-only financial advisor — they can match a strategy to your timeline and risk tolerance in ways I can't.";

const MONEY_MOVE_REFUSAL =
  "I can't move money for you — Upmore never touches your accounts. I can do the math and lay out the exact steps; you always make the final tap yourself.";

const CREDIT_CARD_REFUSAL =
  "I can't help with credit cards — Upmore never recommends them, not for bonuses, not for points. If you want cash without a card, tell me what you're open to and I'll find a real route.";

// Securities advice: "should I buy AAPL", "is Tesla a good investment",
// "best ETF to buy", "what stocks should I invest in", "buy 10 shares of X".
const SECURITIES_RX = new RegExp(
  "\\b(should i|should we|do you think i should)\\b.{0,40}\\b(buy|sell|short|invest in)\\b" +
  "|\\b(buy|sell|short)\\s+[A-Z]{2,5}\\b" +
  "|\\binvest\\s+\\$[\\d,]+\\s+in\\s+[A-Z]" +
  "|\\bis\\s+[A-Z][a-zA-Z&., ]{1,40}\\s+a good investment\\b" +
  "|\\b(are|is)\\b.{0,30}\\b(good investment|good buy|worth buying|worth investing in)\\b" +
  "|\\bbest\\b.{0,25}\\b(stocks?|etfs?|crypto|mutual funds?|index funds?)\\b.{0,25}\\b(to buy|to invest|right now|today)\\b" +
  "|\\bwhat\\b.{0,20}\\b(stocks?|etfs?|crypto|funds?)\\b.{0,20}\\bshould i\\b.{0,20}\\b(buy|invest)" +
  "|\\bwhich\\b.{0,15}\\b(stock|etf|crypto)\\b.{0,20}\\b(buy|pick|choose)\\b" +
  "|\\brecommend\\b.{0,20}\\b(stocks?|etfs?)\\b" +
  "|\\bstocks?\\b.{0,20}\\bto buy\\b",
  "i"
);

// Money movement: "invest $500 for me", "buy X for me", "sell my shares",
// "withdraw for me", "trade for me". (Cancellation requests are handled by
// the execution agent in the Save tab, not by chat.)
const MONEY_MOVE_RX = new RegExp(
  "\\b(invest|buy|sell|trade|withdraw|transfer|move)\\b.{0,30}\\b(for me|on my behalf|my money)\\b" +
  "|\\bfor me\\b.{0,20}\\b(invest|buy|sell|trade)\\b" +
  "|^(buy|sell|invest|withdraw)\\b.{0,40}\\bfor me\\b" +
  "|\\b(sell|buy)\\b.{0,20}\\bmy\\b",
  "i"
);
// Credit-card recommendations are out of the product (owner rule 2026-09-23).
const CREDIT_CARD_RX = /\b(which|what|best|recommend|suggest|should i get|need)\b.{0,30}\bcredit cards?\b|\b(chase sapphire|amex gold|citi double cash|capital one venture|discover it|wells fargo|bank of america)\b/i;

// Live news/market questions: the agent has no live data feed. Answering from
// the model risks hallucinated "today" numbers (seen in testing), and route
// matching hijacks them ("market" → Back Market). Deterministic boundary.
const NEWS_RX = /\bstock market\b.{0,25}\btoday\b|\bwhat did\b.{0,30}\b(the market|stocks?|the dow|nasdaq|s&p)\b.{0,20}\bdo today\b|\bhow is the market\b.{0,15}\btoday\b|\bwill the fed\b|\bfed\b.{0,25}\b(cut|raise|hike)\b.{0,25}\brates?\b|\bwho won\b.{0,40}\belection\b|\blatest\b.{0,20}\b(election|market)\b.{0,20}\b(results|news)\b/i;

const NEWS_BOUNDARY =
  "I don't have live market or news data, so I can't tell you what happened today — and I won't guess. " +
  "For today's numbers, check your brokerage app or a market site directly. What I can do: explain what market moves mean for your money, or help you earn extra cash through a verified route.";

export function tryServerGuards(message: string): string | null {
  if (SECURITIES_RX.test(message)) return SECURITIES_REFUSAL;
  if (MONEY_MOVE_RX.test(message)) return MONEY_MOVE_REFUSAL;
  if (CREDIT_CARD_RX.test(message)) return CREDIT_CARD_REFUSAL;
  if (NEWS_RX.test(message)) return NEWS_BOUNDARY;
  return null;
}

// ---------- 3. gambling / prediction-market guard ----------
const GAMBLE_RX = /\bpolymarket\b|\bkalshi\b|prediction markets?\b|\bpoly\s?market\b|\bsportsbook\b|\bparlay\b|\bfanduel\b|\bdraftkings\b|\bsports betting\b|\bbetting\b|\bbet\b/i;

export function tryGamblingGuard(message: string): string | null {
  if (!GAMBLE_RX.test(message)) return null;
  return (
    `I can't help with betting — it's a way to lose money, not earn it. Upmore has a hard rule: no betting, no crypto, and no routes where you can lose your own money.\n\n` +
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

// Fake documents: pay stubs, etc. (client has this; server needs it too)
const FAKE_DOC_RX = /\b(pay stub|paystub)\b|\b(fake|forged|falsified)\b.{0,20}\b(document|w-2|w2|bank statement|id)\b|\bforg(e|ing|ery)\b/i;
const FAKE_DOC_REFUSAL = "I can't help with that — I won't help create fake documents. Forging a pay stub is fraud, and it can get your application denied plus legal trouble. If you need proof of income, use your real pay stubs, bank statements, or ask your employer for a verification letter.";
export function tryFakeDocGuard(message: string): string | null {
  if (!FAKE_DOC_RX.test(message)) return null;
  return FAKE_DOC_REFUSAL;
}

// Contests/sweepstakes: standing owner rule — never contests.
const CONTEST_RX = /\b(contests?|sweepstakes?)\b/i;
const CONTEST_REFUSAL = "Upmore never does contests or sweepstakes \u2014 they're not a reliable way to earn, and I won't send you down that path. Want a route with a fixed, verified payout instead? Ask me about cashback, surveys, or bank bonuses.";
export function tryContestGuard(message: string): string | null {
  if (!CONTEST_RX.test(message)) return null;
  return CONTEST_REFUSAL;
}

// Crypto: standing rule — no betting, no crypto.
const CRYPTO_RX = /\b(crypto|bitcoin|ethereum|cryptocurrency)\b/i;
const CRYPTO_REFUSAL = "I can't help with that — Upmore has a hard rule: no betting, no crypto, and no routes where you can lose your own money. If you want to earn extra cash, ask me about verified routes with fixed payouts.";
export function tryCryptoGuard(message: string): string | null {
  if (!CRYPTO_RX.test(message)) return null;
  return CRYPTO_REFUSAL;
}

// Fake reviews: excluded topic
const FAKE_REVIEW_RX = /\b(fake|paid)\b.{0,10}\breviews?\b|\breviews?\b.{0,10}\b(fake|paid)\b/i;
const FAKE_REVIEW_REFUSAL = "We don't touch that one. Fake reviews are fraud — they violate consumer protection laws and platform terms. Want something legit? Ask me about cashback, surveys, or bank bonuses.";
export function tryFakeReviewGuard(message: string): string | null {
  if (!FAKE_REVIEW_RX.test(message)) return null;
  return FAKE_REVIEW_REFUSAL;
}

// Tax fraud: won't help
const TAX_FRAUD_RX = /\b(dodge taxes|evade taxes|tax evasion|not report income|hide income from irs)\b/i;
const TAX_FRAUD_REFUSAL = "I won't help with that — dodging taxes is illegal and the penalties are serious. But I can help you understand what you owe and find legitimate deductions you might be missing.";
export function tryTaxFraudGuard(message: string): string | null {
  if (!TAX_FRAUD_RX.test(message)) return null;
  return TAX_FRAUD_REFUSAL;
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

// Most recently mentioned route ID in assistant history, e.g. "(R6702)".
// Shared with index.ts's copy: the plan stack names its top pick last so a
// bare "walk me through step 1" resolves to it.
function lastMentionedRouteId(hist: { role: string; content: string }[]): string | null {
  for (let i = hist.length - 1; i >= 0; i--) {
    const h = hist[i];
    if (h.role !== "assistant") continue;
    // LAST match in the message: the plan stack names its top pick last
    // ("My pick to start with: ... (R3445)"), so "walk me through step 1"
    // resolves to the pick, not the first-listed route. Beta fix 2026-09-24:
    // first-match semantics resolved TELUS (listed #1) instead of Userfeel
    // (the actual pick, named last).
    const ms = String(h.content ?? "").match(/\((R\d{3,})\)/g);
    if (ms && ms.length) return ms[ms.length - 1].slice(1, -1);
  }
  return null;
}

export function tryWalkthrough(
  message: string,
  routes: any[],
  hist: { role: string; content: string }[] = [],
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
  if (!rid) {
    // Continuity fallback: "walk me through step 1" right after a plan that
    // named a route. Without this the request fell through to the model,
    // which invented details (beta find 2026-09-24: a "paid" TELUS
    // qualification test that the verified steps never mention).
    const lastId = lastMentionedRouteId(hist);
    if (lastId) rid = lastId;
  }
  if (!rid) return null;
  const r = routes.find((x) => x.route_id === rid);
  if (!r) {
    return {
      reply:
        "I haven't verified that one yet, so I can't walk you through it " +
        "as a live offer — I'd be guessing at the steps and the payout, and I " +
        "don't do that. Ask me about one of my verified routes instead.",
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
  // Wager routes (you stake your own money) are Standard-lane but still need
  // an explicit stake warning — the lane system alone won't flag them.
  const wagerNote = WAGER_IDS.has(rid)
    ? `\nHeads up: this is a wager — you stake your own money and can LOSE it. Never bet money you can't afford to lose.`
    : "";
  // If the route needs an app, say so plainly and link the store download.
  // Prefer the catalog's own ios_url/android_url (data model); APP_LINKS is
  // the fallback for routes not yet backfilled.
  const appLinks = APP_LINKS[rid];
  const iosUrl = (r as any).ios_url || appLinks?.ios;
  const andUrl = (r as any).android_url || appLinks?.android;
  const appLine = iosUrl || andUrl
    ? `\nDownload the app: ${iosUrl ?? andUrl}`
    : "";
  // Vishnu's 7 questions — include every answer the catalog has for this
  // route, nothing invented. demand_side names where the demand actually is.
  // repeatable is a {value, cadence} object in the catalog, not a string.
  const rep = (r as any).repeatable;
  const repText =
    rep != null && typeof rep === "object"
      ? `${rep.value ? "Yes" : "No"}${rep.cadence ? ` — ${String(rep.cadence).trim()}` : ""}`
      : rep;
  const answers: [string, any][] = [
    ["Who pays", r.who_pays],
    ["Who qualifies", r.who_qualifies],
    ["Work available", r.work_available],
    ["What gets accepted", r.what_gets_accepted],
    ["Costs + unpaid time", r.costs_and_unpaid_time],
    ["When cash arrives", r.when_cash_arrives],
    ["Repeatable", repText],
    ["Where demand is", r.demand_side],
  ];
  const answerLines = answers
    .filter(([, v]) => v != null && String(v).trim().length > 0)
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("\n");
  const answerBlock = answerLines ? `\n\n${answerLines}` : "";
  return {
    reply:
      `**${r.provider}** (${r.route_id}) — verified live.\n\n` +
      `${r.payout_text ?? ""}\n\n${stepLines}\n\n` +
      `Cash out: ${r.payout_timing ?? "see the official terms"}\n` +
      `Biggest catch: ${catches[0] ?? "see the official terms"}` +
      laneNote + wagerNote + answerBlock +
      `\n\nStart here: ${r.provider_url ?? r.link ?? ""}` + appLine,
    routeId: r.route_id,
  };
}

// ---------- Terms-change honesty guard ----------
// "Did Fetch raise their minimum to $25?" — a rumored terms change the agent
// cannot verify must never be confirmed, and must never be answered with a
// different company's data (the verb "raise" once matched the provider
// "Raise"). Deterministic: match did/has/have + change-verb + terms-noun,
// disambiguate the provider by earliest word-boundary mention, cite the
// verified route's terms, and refuse to confirm the rumor.
const TERMS_CHANGE_RX =
  /\b(did|has|have)\b[\s\S]{0,80}?\b(rais|lower|chang|increas|decreas|cut|drop)(e|ed|ing)?\b[\s\S]{0,80}?\b(minimum|min|cashout|cash out|payout|bonus|rates?|fees?)\b|\b(did|has|have)\b[\s\S]{0,80}?\b(minimum|min|cashout|cash out|payout|bonus|rates?|fees?)\b[\s\S]{0,80}?\b(rais|lower|chang|increas|decreas|cut|drop)(e|ed|ing)?\b/i;

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Shared provider disambiguation: prefer a full provider-name match, fall
// back to any significant word of a multi-word provider ("Fetch" for
// "Fetch Rewards"). Earliest mention in the message wins — a company name
// that IS a common verb ("Raise") must not outrank the actual subject
// mentioned earlier. Full-name matches win ties at nearby positions.
function findProviderRoute(
  message: string,
  routes: RouteCard[],
): RouteCard | null {
  const t = message.toLowerCase();
  let best: RouteCard | null = null;
  let bestKey = "";
  for (const r of routes) {
    const p = String(r.provider ?? "").toLowerCase().trim();
    if (p.length <= 3) continue;
    const words = p.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const cands: Array<[number, number]> = [];
    const full = new RegExp(`\\b${escRe(p)}\\b`).exec(t);
    if (full) cands.push([0, full.index ?? Infinity]);
    for (const w of words) {
      const m = new RegExp(`\\b${escRe(w)}\\b`).exec(t);
      if (m) cands.push([1, m.index ?? Infinity]);
    }
    if (!cands.length) continue;
    cands.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const key = `${String(cands[0][1]).padStart(8, "0")}:${cands[0][0]}`;
    if (!best || key < bestKey) {
      best = r;
      bestKey = key;
    }
  }
  return best;
}

export function tryTermsChangeQuestion(
  message: string,
  routes: RouteCard[],
): string | null {
  if (!TERMS_CHANGE_RX.test(message)) return null;
  const best = findProviderRoute(message, routes);
  const math = best ? CASH_MATH[best.route_id] : undefined;
  const termsBit = best
    ? ` The verified terms I have for ${best.provider} (${best.route_id}) list the minimum as ${
        math?.min_cashout ?? best.payout_text ?? "see the official terms"
      }.`
    : "";
  return (
    `I haven't seen a verified update on that, so I can't confirm the change — ` +
    `I won't state a terms change I can't check against the official page.${termsBit} ` +
    `If you read it somewhere, paste the link and I'll compare it against the official terms.`
  );
}

// ---------- Monthly earnings estimate ----------
// "How much will I make per month with Fetch if I scan 20 receipts a week?"
// Deterministic: parse the stated usage rate, multiply the card's verified
// per-unit figure, and label the result an estimate — never a promise.
// Points are reported as points; a cash conversion is only stated when the
// card itself verifies a rate, otherwise the commonly-reported rate is named
// as unverified. Deterministic replies bypass the grounding post-check, so
// every number here must come from the card or be flagged as an estimate.
const MONTHLY_RX =
  /\bhow much\b[\s\S]{0,60}?\b(make|earn)\b[\s\S]{0,40}?\bper month\b|\bper month\b[\s\S]{0,60}?\bwith\b/i;
const USAGE_RX =
  /(\d+)\s*(receipts?|surveys?|tests?|tasks?|videos?|hours?|photos?|offers?)\s*(a|per)\s*(day|week|month)/i;
const PER_UNIT_PTS_RX = /(\d[\d,]*)\+?\s*pts?\s*(?:per|\/)\s*(receipt|survey|test|task|video|hour|photo|offer)/i;

export function tryMonthlyEstimate(
  message: string,
  routes: RouteCard[],
): string | null {
  if (!MONTHLY_RX.test(message)) return null;
  const best = findProviderRoute(message, routes);
  if (!best) return null;
  const use = USAGE_RX.exec(message);
  const stepsText = Array.isArray(best.steps)
    ? best.steps.map((s: any) => s.text ?? s).join(" ")
    : "";
  const cardText = `${best.payout_text ?? ""} ${best.name ?? ""} ${stepsText}`;
  const perUnit = PER_UNIT_PTS_RX.exec(cardText);
  const name = best.provider ?? "this";
  const id = best.route_id ? ` (${best.route_id})` : "";
  const rateLine = best.payout_text ?? best.name ?? "see the route card";

  if (use && perUnit) {
    const qty = parseInt(use[1], 10);
    const unit = use[2].toLowerCase();
    const cadence = use[4].toLowerCase();
    const ptsPerUnit = parseInt(perUnit[1].replace(/,/g, ""), 10);
    const perWeek = cadence === "day" ? qty * 7 : cadence === "month" ? qty / 4.33 : qty;
    const ptsPerMonth = Math.round(perWeek * ptsPerUnit * 4.33);
    const conv = /1[\d,]*\s*pts?\s*[≈=~]\s*\$1|1000\s*pts?\s*(=|≈|~|per)\s*\$1/i.test(cardText)
      ? Math.round(ptsPerMonth / 1000)
      : null;
    let out =
      `Rough estimate for ${name}${id}: ${qty} ${unit} a ${cadence} × ${ptsPerUnit}+ points per ${perUnit[2]} ` +
      `≈ ${ptsPerMonth.toLocaleString()}+ points a month. `;
    out += conv !== null
      ? `At ~1,000 points ≈ $1 in gift cards, that's roughly $${conv}/month in gift cards. `
      : `The verified terms don't fix a cash value per point — users commonly report ~1,000 points ≈ $1 in gift cards, ` +
        `which would put you around $${(ptsPerMonth / 1000).toFixed(0)}/month, but that conversion isn't verified. `;
    out += `That's an estimate, not a promise — it varies with your ${unit} and point values can change.`;
    return out;
  }
  if (use) {
    return (
      `It depends on your volume, but here's the verified math for ${name}${id}: ` +
      `${rateLine}. ` +
      `Tell me roughly how many ${use[2].toLowerCase()} a ${use[4].toLowerCase()} and I'll estimate — roughly, since payouts vary.`
    );
  }
  return (
    `I can estimate it if you give me a volume — e.g. "how much per month with ${name} if I do 20 a week?" ` +
    `The verified rate for ${name}${id}: ${rateLine}. ` +
    `Any monthly figure is an estimate, never a promise.`
  );
}

// ---------- 8. Deterministic reminder intent ----------
// "remind me tomorrow to check my Fetch points for R0119" -> the server
// creates the reminder itself instead of relying on the model to emit an
// action line (the model sometimes promises in words and forgets the line).
const REMIND_RX = /\bremind me\b/i;
const WHEN_WORDS_RX = /\btomorrow\b|in\s+\d+\s*(hour|day|week)s?\b|\b\d{4}-\d{2}-\d{2}/i;

export function tryReminderIntent(
  message: string,
  routes: any[],
): { routeId: string; when: string; text: string } | null {
  if (!REMIND_RX.test(message)) return null;
  const t = message.toLowerCase();
  let rid: string | null = null;
  const idm = t.match(/\br0\d{3}\b/);
  if (idm) rid = idm[0].toUpperCase();
  let provider = "";
  if (!rid) {
    const hit = routes.find(
      (r) => String(r.provider ?? "").length > 3 &&
        t.includes(String(r.provider).toLowerCase()),
    );
    if (hit) { rid = hit.route_id; provider = String(hit.provider); }
  } else {
    const r = routes.find((x) => x.route_id === rid);
    if (r) provider = String(r.provider ?? "");
  }
  if (!rid) return null;
  const r = routes.find((x) => x.route_id === rid);
  if (!r) return null; // unknown route id — leave it to the model
  const whenM = message.match(WHEN_WORDS_RX);
  const when = whenM ? whenM[0] : "tomorrow";
  // Extract the "what": strip framing, when-words, route id, provider name.
  let text = message
    .replace(/\bremind me\b/i, " ")
    .replace(WHEN_WORDS_RX, " ")
    .replace(new RegExp(`\\b${rid}\\b`, "i"), " ");
  if (provider) text = text.replace(new RegExp(provider.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
  text = text.replace(/^\s*to\s+/i, "").replace(/\s+for\s*$/i, "")
    .replace(/\s{2,}/g, " ").trim();
  if (!text) text = `check on ${provider || rid}`;
  return { routeId: rid, when, text };
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

// ---------- 5b. System-prompt extraction guard ----------
// Deterministic refusal: the model sometimes leaks implementation details
// (table names, "edge function") when asked for its instructions. A fixed
// refusal is reliable and never leaks.
const SYSPROMPT_RX = /\bsystem prompt\b|reveal your (instructions|prompt)|show me your (instructions|prompt)/i;

export function trySyspromptGuard(message: string): string | null {
  if (SYSPROMPT_RX.test(message)) {
    return "I can't do that — my instructions stay private so I can do my job " +
      "reliably. I'm here to walk you through verified money-making routes: " +
      "real steps, real links, real catches. What do you want to earn first?";
  }
  return null;
}

// ---------- 5b. Gift-card reward safe clarification ----------
// "Can I get paid in gift cards with Microsoft Rewards, is that legit?"
// Receiving gift cards AS the payout from a legit rewards program is fine —
// most of them pay out that way. The scam is the reverse (pay THEM in gift
// cards). The scam guard owns pay-first language; this fires only on pure
// receive-as-payout phrasing, before the model fallback can false-positive.
const GIFT_RECEIVE_RX = /\b(get paid in|paid in|receive|receiving|redeem|redeeming|earn|earning|payout).{0,50}\bgift cards?\b/i;
const GIFT_PAYFIRST_RX = /\b(pay|send|buy|purchase).{0,40}\bgift cards?\b|\bgift cards?.{0,40}\b(fee|tax|payment|unlock|verification|send (it|them))\b/i;

export function tryGiftRewardSafe(message: string): string | null {
  if (!GIFT_RECEIVE_RX.test(message)) return null;
  if (GIFT_PAYFIRST_RX.test(message)) return null; // let the scam guard own it
  return (
    `Getting paid IN gift cards is legit — that's how most rewards programs actually pay out. ` +
    `Microsoft Rewards, Fetch, Swagbucks, and the other verified programs all pay in gift cards; receiving one is not a red flag.\n\n` +
    `The scam is the reverse: anyone who asks YOU to pay THEM in gift cards — a "fee", "tax", or "verification" via gift card — is always a scam. ` +
    `Real programs never ask you to buy gift cards to unlock a reward.`
  );
}

// ---------- 6. Scam guard ----------
// High-stakes safety patterns get a deterministic hard warning, not a
// model improvisation. Patterns are narrow (fee + gift cards, not gift
// cards alone — Microsoft Rewards legitimately pays in gift cards).
const SCAM_FEE_RX = /fee|upfront|pay.{0,20}(before|first|to start)/i;
const SCAM_CHECK_RX = /deposit.{0,40}check.{0,40}(wire|send.{0,20}back)|wire.{0,20}back/i;
// Crypto-doubling scams, widened: catches "double it" phrasing with a crypto
// noun anywhere in the message (not just adjacent), plus send-first and
// they'll-send-back variants. Still narrow enough not to fire on legit
// questions about a route's crypto reward (no "double"/send-first language).
const SCAM_CRYPTO_RX = /doubl(e|ing).{0,30}(crypto|bitcoin|btc)|(crypto|bitcoin|btc).{0,40}doubl(e|ing)|send.{0,30}(btc|bitcoin|crypto).{0,20}(first|back)|send.{0,30}(btc|bitcoin|crypto).{0,30}(he'll|they'll|it'll).{0,15}(double|send.{0,10}back)/i;
const SCAM_LOGIN_RX = /(bank|account).{0,25}(login|password|credentials).{0,40}(send|share|give|dm|tell me)|send.{0,40}(bank|account).{0,25}(login|password)|\bdm\b.{0,40}(bank|account).{0,25}(login|password|credentials)/i;
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
    `the risk, ask me to walk you through one of my verified routes.`
  );
}

// ---------- 9. Save-side deterministic capabilities ----------
// "Save Side": subscription audit, receipt check, claim deadlines, bill prep,
// and savings ledger. No model needed. These never invent money: every
// number comes from a DB row or the user's own message, and anything
// unverified is labeled an estimate or refused outright.
//
// Legal lines baked in: we never cancel, file, or move money for the user
// ("I can't do that for you — here's the exact path, you click it"); we
// never give tax/legal/investment advice (deflect to a licensed pro); we
// never state an unverified saving; we never ask for merchant credentials.

export interface CapCtx { supa: any; userId: string }

const fmtMoney = (n: number): string =>
  `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;

async function readSaveRows(supa: any, table: string, userId: string): Promise<any[]> {
  try {
    const { data, error } = await supa.from(table).select("*").eq("user_id", userId).limit(500);
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function findCancelPath(name: string): CancelPath | null {
  const n = name.toLowerCase().replace(/[^a-z0-9+]/g, "");
  for (const key of Object.keys(CANCEL_PATHS)) {
    const k = key.replace(/[^a-z0-9+]/g, "");
    if (k && (n.includes(k) || k.includes(n))) return CANCEL_PATHS[key];
  }
  return null;
}

// ---- 9a. Subscription audit ----
// Triggers: "audit my subscriptions", "review my subscriptions",
// "what am I paying for". DB read (save_subscriptions) when ctx is present;
// otherwise parse name+$ pairs the user pastes inline; otherwise ask.
const AUDIT_RX = /\b(audit|review)\b[^.?]{0,40}\bsubscriptions?\b|\bwhat am i paying for\b|\bsubscriptions?\b[^.?]{0,15}\b(audit|review)\b/i;

interface InlineSub { name: string; monthly: number; raw?: number; per?: string }

function parseInlineSubs(message: string): InlineSub[] {
  const out: InlineSub[] = [];
  const re =
    /([A-Za-z][\w+&' .()-]{1,40}?)\s*\$?\s*(\d{1,3}(?:\.\d{1,2})?)\s*(\/mo(?:nth)?|per month|a month|\/y(?:ea)?r|\/annual(?:ly)?|per year|a year|\/wk|\/week|per week|\/qtr|\/quarter(?:ly)?)?(?=[,.;\n]|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const name = m[1].trim().replace(/^(my|the|audit|review)\s+/i, "");
    const raw = parseFloat(m[2]);
    const iv = (m[3] ?? "").toLowerCase().replace(/^\//, "");
    // Normalize everything to monthly: a $139/yr plan is $11.58/mo, not $139/mo.
    let monthly = raw, per = "/mo";
    if (/^(yr|y|year|annual|annually)$/.test(iv) || iv === "per year" || iv === "a year") {
      monthly = raw / 12; per = "/yr";
    } else if (/^(wk|week)$/.test(iv) || iv === "per week") {
      monthly = (raw * 52) / 12; per = "/wk";
    } else if (/^(qtr|quarter|quarterly)$/.test(iv)) {
      monthly = raw / 3; per = "/qtr";
    }
    if (name.length >= 2 && raw > 0 && raw < 10000 && monthly > 0)
      out.push({ name, monthly, raw, per });
  }
  return out;
}

// Rough duplicate-family grouping by name keywords: two music services or
// three streamers is the classic leak. Used only for "cut candidate" flags,
// never for money claims.
function subFamily(name: string): string {
  const n = name.toLowerCase();
  if (/\bspotify\b|apple music|youtube music|amazon music|tidal|pandora/.test(n)) return "music";
  if (/\bnetflix\b|hulu|disney|peacock|paramount|max\b|hbo|crunchyroll|espn|apple tv/.test(n)) return "tv";
  if (/\baudible\b|kindle unlimited|scribd/.test(n)) return "books";
  if (/new york times|\bnyt\b|washington post|\bwsj\b|substack/.test(n)) return "news";
  if (/\bicloud\b|google one|dropbox/.test(n)) return "storage";
  return "other";
}

function cancelPathBlock(name: string): string {
  const cp = findCancelPath(name);
  if (!cp) {
    return (
      `Cancel path: I don't have a verified path for ${name} yet — cancel from the billing section of ` +
      `the merchant's own account page (or inside the app's Settings → Subscriptions), and get a written confirmation.`
    );
  }
  const lines = [`Cancel path:`];
  if (cp.url) lines.push(cp.url);
  cp.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  if (cp.phone) lines.push(`Phone: ${cp.phone}`);
  lines.push(`Watch for: ${cp.retention_warning}`);
  return lines.join("\n");
}

export async function trySubscriptionAudit(
  message: string,
  ctx?: CapCtx,
): Promise<string | null> {
  // Primary trigger: explicit "audit my subscriptions"-style phrasing.
  // Secondary trigger: "audit"/"review" plus a pasted list of 2+ priced
  // items ("audit: Netflix $15.49, Spotify $11.99") — a single priced item
  // with "audit" alone is not enough to fire, to avoid hijacking.
  const primary = AUDIT_RX.test(message);
  let inline: InlineSub[] = [];
  if (!primary) {
    if (!/\b(audit|review)\b/i.test(message)) return null;
    inline = parseInlineSubs(message);
    if (inline.length < 2) return null;
  }

  let subs: InlineSub[] = [];
  if (ctx) {
    const rows = await readSaveRows(ctx.supa, "save_subscriptions", ctx.userId);
    subs = rows
      // Cancelled subscriptions are dead money — never count them.
      .filter((r) => String(r.status ?? "active").toLowerCase() !== "cancelled")
      .map((r) => {
        const raw = Number(r.amount_monthly ?? r.monthly_amount ?? r.amount ?? r.cost) || 0;
        // Normalize to monthly: the app stores amount + billing_interval.
        // Reading a $139/year plan as $139/mo would triple-count it.
        let monthly = raw, per = "";
        if (r.amount_monthly == null && r.monthly_amount == null) {
          const iv = String(r.billing_interval ?? r.interval ?? "monthly").toLowerCase();
          if (iv === "yearly" || iv === "annual" || iv === "annually") { monthly = raw / 12; per = "/yr"; }
          else if (iv === "weekly") { monthly = raw * 52 / 12; per = "/wk"; }
          else if (iv === "quarterly") { monthly = raw / 3; per = "/qtr"; }
          else { per = "/mo"; }
        }
        return {
          name: String(r.name ?? r.merchant ?? r.service ?? "Unknown").slice(0, 60),
          monthly, raw, per,
        };
      })
      .filter((s) => s.monthly > 0 || s.name !== "Unknown");
  }
  if (!subs.length) {
    if (!inline.length) inline = parseInlineSubs(message);
    if (inline.length) subs = inline;
  }
  if (!subs.length) {
    return (
      `Let's audit your subscriptions. I don't have any on file — tell me each one like this:\n\n` +
      `"Netflix $15.49, Spotify $11.99, Amazon Prime $14.99"\n\n` +
      `Name + dollars is all I need — monthly, yearly, weekly, whatever's on the bill, I'll normalize it. I'll rank them by yearly cost, flag the ones that look cuttable, ` +
      `and give you the exact cancel path for each.`
    );
  }

  const ranked = subs
    .map((s) => ({ ...s, yearly: s.monthly * 12 }))
    .sort((a, b) => b.yearly - a.yearly);
  const seenFamilies = new Set<string>();
  const blocks = ranked.map((s, i) => {
    const fam = subFamily(s.name);
    let verdict: string, reason: string;
    if (fam !== "other" && seenFamilies.has(fam)) {
      verdict = "CUT CANDIDATE";
      reason = `you're paying for two services that do the same thing (${fam}) — pick one, cut the other.`;
    } else if (s.yearly >= 180) {
      verdict = "QUESTION";
      reason = `at ${fmtMoney(s.yearly)}/year this one has to earn its spot — if you don't use it weekly, it's cut #1.`;
    } else {
      verdict = "QUESTION";
      reason = `only you know if ${fmtMoney(s.monthly)}/mo is worth it — but ${fmtMoney(s.yearly)}/year for something you barely touch is the leak.`;
    }
    seenFamilies.add(fam);
    const script =
      `"Hi — please cancel my ${s.name} subscription effective today. ` +
      `I don't want any other offers or plan changes. Please confirm in writing that billing has stopped."`;
    const priceBit = s.raw != null && s.per && s.per !== "/mo"
      ? `${fmtMoney(s.raw)}${s.per} (${fmtMoney(s.monthly)}/mo, ${fmtMoney(s.yearly)}/year)`
      : `${fmtMoney(s.monthly)}/mo (${fmtMoney(s.yearly)}/year)`;
    return (
      `**${i + 1}. ${s.name}** — ${priceBit}\n` +
      `${verdict}: ${reason}\n` +
      `${cancelPathBlock(s.name)}\n` +
      `Say this to kill it: ${script}`
    );
  });

  const total = ranked.reduce((a, s) => a + s.monthly, 0);
  return (
    `Here's your subscription audit, ranked by yearly cost:\n\n` +
    blocks.join("\n\n") +
    `\n\nTotal: ${fmtMoney(total)}/mo — that's ${fmtMoney(total * 12)}/year walking out the door. ` +
    `Tell me you don't use one and I'll move it to cut #1.\n\n` +
    `I can't cancel these for you — you click the link and confirm. Tell me when one dies and I'll log the saving.`
  );
}

// ---- 9b. Receipt check ----
// Triggers on pasted receipt text: "receipt", "order #", a dollar total.
// Extracts merchant, order no, date, total via regex. Flags risks but never
// states an unverified saving and never invents a return window.
const RECEIPT_RX = /(\breceipt\b|\border\s*#|\border\s*(?:number|no\.?)\b)[\s\S]*\$\s*\d|\$\s*\d[\d,]*(?:\.\d{2})?[\s\S]*(\breceipt\b|\border\s*#)/i;

export function tryReceiptCheck(message: string): string | null {
  if (!RECEIPT_RX.test(message)) return null;
  const t = message;
  let lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^(receipt|order|date|total|subtotal|tax)\b/i.test(l))
    // Chat framing ("here's a receipt:", "my receipt below") is not the merchant.
    .filter((l) => !/^here'?s\b/i.test(l) && !/\bhere'?s (a|my|the) receipts?\b/i.test(l));
  let merchant = lines.length ? lines[0].slice(0, 60) : "the merchant";
  // A framing line ending in ":" (e.g. "Receipt:") precedes the real merchant.
  if (/:[\s]*$/.test(merchant) && lines[1]) merchant = lines[1].slice(0, 60);
  const orderM = t.match(/\border\s*(?:#|number|no\.?)?\s*:?\s*([a-z0-9-]{3,30})/i);
  const dateM = t.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2},?\s*\d{2,4})/i);
  const totalM = t.match(/\btotal\b[^$\n]{0,25}\$\s*(\d[\d,]*(?:\.\d{2})?)/i);
  const total = totalM ? totalM[1].replace(/,/g, "") : null;
  const flags: string[] = [];
  if (/\btrial\b/i.test(t)) {
    flags.push(
      `Free-trial conversion risk: this mentions a trial. Find the renewal date now, set a phone reminder 2 days before it, ` +
      `and cancel before it bills you.`,
    );
  }
  if (/\b(warranty|protection plan|care plan|support plan|installation|setup fee)\b/i.test(t)) {
    flags.push(
      `Add-on leak: this receipt has an add-on (warranty, protection plan, or setup fee). Those are usually where the money leaks — ` +
      `check whether you can return the add-on separately.`,
    );
  }
  flags.push(
    `Return window: check the return policy on the receipt — most are 14–30 days, but confirm yours there, not from me. ` +
    `If the item is within the window and you don't need it, that's money back.`,
  );
  flags.push(
    `Double-buy: I can't check your purchase history automatically — did you buy this same thing in the last 90 days? ` +
    `If yes, one of them should go back.`,
  );
  return (
    `Here's what I pulled from the receipt:\n\n` +
    `• Merchant: ${merchant}\n` +
    (orderM ? `• Order #: ${orderM[1]}\n` : "") +
    (dateM ? `• Date: ${dateM[1]}\n` : "") +
    (total ? `• Total: $${total}\n` : `• No labeled total found — I won't guess the amount.\n`) +
    `\nWatch for:\n` +
    flags.map((f) => `• ${f}`).join("\n")
  );
}

// ---- 9c-i. Deterministic claim-tracking intent ----
// "track a claim: $12.50 price adjustment at Target, deadline 2026-10-15"
// The server inserts the claim itself (mirrors the reminder-intent pattern).
// Without this, "ask the Guide and I'll log it" is a promise nothing keeps.
// Runs BEFORE the deadlines view: the intent message contains "claim", which
// would otherwise trigger the read-only deadlines path.
const CLAIM_INTENT_RX = /\b(track|log|add|save)\b[^.?]{0,40}\bclaims?\b/i;

const CLAIM_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseClaimDeadline(message: string): string | null {
  const iso = message.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const md = message.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d\d))?/i);
  if (md) {
    const year = md[3] ? parseInt(md[3], 10) : new Date().getUTCFullYear();
    const m = CLAIM_MONTHS[md[1].slice(0, 3).toLowerCase()];
    return `${year}-${String(m).padStart(2, "0")}-${md[2].padStart(2, "0")}`;
  }
  const inN = message.match(/\bin\s+(\d{1,3})\s+days?\b/i);
  if (inN) return new Date(Date.now() + parseInt(inN[1], 10) * 86400000).toISOString().slice(0, 10);
  if (/\btomorrow\b/i.test(message)) return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return null;
}

export interface ClaimIntent { what: string; merchant: string | null; amount: number | null; deadline: string | null }

export function tryClaimIntent(message: string): ClaimIntent | null {
  if (!CLAIM_INTENT_RX.test(message)) return null;
  const amtM = message.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  const amount = amtM ? parseFloat(amtM[1].replace(/,/g, "")) : null;
  const merchM = message.match(/\bat\b\s+([A-Za-z][\w&' .()-]{1,40}?)(?=[,.;\n]|$|\s+(?:deadline|due\b|in\s+\d))/i);
  const merchant = merchM ? merchM[1].trim() : null;
  const deadline = parseClaimDeadline(message);
  // "what": strip the intent framing, amount, merchant, and deadline bits.
  let what = message
    .replace(/\b(track|log|add|save)\b[^.?]{0,40}?\bclaims?:?\s*/i, " ")
    .replace(/\$\s*\d[\d,]*(?:\.\d{1,2})?/, " ")
    .replace(/\bat\b\s+[A-Za-z][\w&' .()-]{1,40}?(?=[,.;\n]|$|\s+(?:deadline|due\b|in\s+\d))/i, " ")
    .replace(/\b20\d\d-\d\d-\d\d\b/, " ")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d\d)?/i, " ")
    .replace(/\bin\s+\d{1,3}\s+days?\b/i, " ")
    .replace(/\btomorrow\b/i, " ")
    .replace(/\bdeadline\b:?\s*/i, " ")
    .replace(/\b(due|by)\b\s*/i, " ")
    .replace(/[.,;:\s]+$/g, "").replace(/\s{2,}/g, " ").trim();
  if (!what) what = "claim";
  return { what: what.slice(0, 80), merchant, amount, deadline };
}

async function insertClaimIntent(
  intent: ClaimIntent,
  ctx?: CapCtx,
): Promise<string | null> {
  if (!ctx) return null;
  const { error } = await ctx.supa.from("save_claims").insert({
    user_id: ctx.userId,
    kind: intent.what,
    merchant: intent.merchant,
    amount: intent.amount,
    deadline: intent.deadline,
    status: "open",
  });
  if (error) {
    return (
      `I tried to log that claim but the save failed — use the Save tab's "Add a claim" form instead and I'll pick it up from there.`
    );
  }
  return (
    `Logged: **${intent.what}**${intent.merchant ? ` at ${intent.merchant}` : ""}` +
    `${intent.amount != null ? ` — ${fmtMoney(intent.amount)}` : ""}` +
    `${intent.deadline ? `, deadline ${intent.deadline}` : `, no deadline set — add one or it will rot`}. ` +
    `I'll count it down with your other claims.`
  );
}

// ---- 9c. Claim deadlines ----
// Triggers on "refund", "claim", "price adjustment", "deadline". Reads
// save_claims open claims and renders countdowns — the deadline is the
// product. If none, explains the claim types and offers to track one.
const CLAIM_RX = /\bprice adjustment\b|\bclaims?\b|\brefund\b|\bdeadline\b/i;

export async function tryClaimDeadlines(
  message: string,
  ctx?: CapCtx,
): Promise<string | null> {
  if (!CLAIM_RX.test(message)) return null;

  let claims: any[] = [];
  if (ctx) {
    const rows = await readSaveRows(ctx.supa, "save_claims", ctx.userId);
    claims = rows.filter((r) => {
      const st = String(r.status ?? "").toLowerCase();
      return !st || ["open", "active", "pending"].includes(st);
    });
  }
  if (claims.length) {
    const now = Date.now();
    const parsed = claims.map((r) => {
      const dl = r.deadline ?? r.due_date ?? r.claim_deadline ?? null;
      const dms = dl ? new Date(dl).getTime() : NaN;
      return { r, days: isFinite(dms) ? Math.ceil((dms - now) / 86400000) : NaN };
    // Upcoming deadlines first (most urgent), then no-deadline rows, then
    // past-due ones last — they're still visible, just not actionable first.
    }).sort((a, b) => {
      const k = (d: number) => !isFinite(d) ? 99998 : d < 0 ? 99999 : d;
      return k(a.days) - k(b.days);
    });
    const lines = parsed.map(({ r, days }) => {
      const what = String(r.kind ?? r.what ?? r.title ?? r.name ?? "claim").slice(0, 60);
      const merch = String(r.merchant ?? "").slice(0, 40);
      const amt = Number(r.amount) || 0;
      const tag = isFinite(days)
        ? days < 0
          ? `PAST DUE by ${-days} days — contact the merchant anyway, it may still be fixable`
          : days === 0
            ? `due TODAY — the deadline is the product, miss it and the money is gone`
            : `${days} days left — the deadline is the product, miss it and the money is gone`
        : `no deadline on file — add one or it will rot`;
      return `• ${what}${merch ? ` (${merch})` : ""}${amt ? ` — ${fmtMoney(amt)}` : ""}: ${tag}`;
    });
    return `Open claims, sorted by urgency:\n\n${lines.join("\n")}`;
  }
  return (
    `No open claims on file. Here's what deadlines actually matter on the save side:\n\n` +
    `• Price adjustments: if a store drops the price after you bought, they may refund the difference — ` +
    `but their window is short. Each store sets its own; I won't guess yours, check it on the receipt.\n` +
    `• Warranty claims: you have until the warranty expires — dig out what the warranty actually covers.\n` +
    `• Settlement and rebate claims: the filing deadline on the official notice is a hard cutoff. Miss it, the money's gone.\n` +
    `• Bill errors and double charges: the sooner you dispute, the easier the fix.\n\n` +
    `Want me to track one? Say it like this: "Track a claim: $12.50 price adjustment at Target, deadline 2026-10-15".`
  );
}

// ---- 9d. Bill negotiation prep ----
// Triggers on "negotiat" or "lower my (internet|phone|insurance|medical)
// bill". Emits a prep sheet: what to say, what they'll offer, what it's
// worth, what NOT to accept. Honest about what doesn't work.
const BILL_RX = /\bnegotiat/i;
const BILL_LOWER_RX = /\blower my\b.{0,40}\b(bill|internet|phone|insurance|medical|cable|mobile|utility|utilities|property tax)\b/i;

export function tryBillPrep(message: string): string | null {
  if (!BILL_RX.test(message) && !BILL_LOWER_RX.test(message)) return null;
  const t = message.toLowerCase();
  const cat = /\binsurance\b/.test(t) ? "insurance"
    : /\bmedical\b|hospital|doctor/.test(t) ? "medical bill"
    : /\butility|utilities|electric|gas|water\b/.test(t) ? "utility"
    : /\bproperty tax\b/.test(t) ? "property tax"
    : /\bphone\b|mobile|wireless/.test(t) ? "mobile"
    : "internet";

  const worth = `I can't promise a dollar amount — it depends on your bill and their current promos. ` +
    `Worth = the gap between what you pay now and the best current price for the SAME service. ` +
    `Don't accept any "deal" that's still above that number.`;

  const sheets: Record<string, string> = {
    internet: `Before you call: have your current bill, the contract end date, your tenure (years as a customer), and a competitor's current new-customer price ready.\nWhat to say: "Hi, I've been a customer for [X] years paying $[X]/mo. I see [competitor]'s new-customer price is $[Y]/mo. Can you match it or apply a loyalty or retention discount?"\nWhat they'll offer: a retention discount, a free channel bundle, a speed upgrade for the same price.\nWhat NOT to accept: a longer contract for a tiny discount, a faster tier you don't need, or "we'll call you back" — ask for the decision now.`,
    mobile: `Before you call: know your data usage (check your phone's settings), your bill, and competing prepaid/MVNO prices.\nWhat to say: "I'm paying $[X]/mo and using about [X]GB. Can you match your current new-customer deal, or move me to a cheaper plan that fits my usage?"\nWhat they'll offer: a loyalty discount, a switch to a cheaper tier, a device credit.\nWhat NOT to accept: a new phone contract that locks you in, or add-on insurance you didn't ask for.`,
    insurance: `Before you call: get 2–3 competing quotes (same coverage levels) — that quote is your leverage.\nWhat to say: "I've been with you [X] years and my premium is $[X]. I have a quote for $[Y] with the same coverage. What can you do to keep me?"\nWhat they'll offer: loyalty or tenure discount, bundled-policy discount, a rate review.\nWhat NOT to accept: lower coverage just to hit a price — make sure coverage matches before you compare dollars.`,
    "medical bill": `Before you call: request an ITEMIZED bill first — errors are common. Check whether your insurance paid what it should.\nWhat to say: "I'm looking at this itemized bill and I have questions about [line item]. What is the cash-pay price, and do you offer a payment plan or financial-assistance discount?"\nWhat they'll offer: itemized review and error corrections, a cash-pay price (often lower), a payment plan, financial-assistance programs.\nWhat NOT to accept: paying the first number on the bill without the itemized version — that's where the errors hide.`,
    utility: `Your utility has assistance programs you don't have to negotiate for: low-income discounts, weatherization help, and payment plans.\nWhat to do: call the number on your bill and ask "what assistance and payment-plan programs do I qualify for?" Your state's utility commission site also lists them.\nWhat NOT to accept: late fees piling up while you wait — ask about a payment plan on the first call.`,
    "property tax": `This one is paperwork, not a phone call: appeal your assessment. Compare your assessment with similar homes in your neighborhood — that comparison is the whole case.\nWhat to do: check your county assessor's site for the appeal form and the filing deadline. Filing is free in most counties.\nWhat NOT to accept: missing the deadline — the appeal window is set by your county and it's usually once a year. That's a licensed pro's call if you hire help; I can only point you at the process.`,
  };
  const sheet = sheets[cat] ?? sheets.internet;
  return (
    `Let's prep your ${cat} negotiation.\n\n${sheet}\n\nWhat it's worth: ${worth}\n\n` +
    `What doesn't work, honestly: rent (landlords don't cut existing leases — you shop around at renewal) and ` +
    `mid-term fixed contracts (you're paying the early-termination fee either way — check it before you call).`
  );
}

// ---- 9e. Savings ledger ----
// Triggers on "savings", "ledger", "how much have I saved". Sums save_ledger
// by bucket with honesty rules: Received vs others separated, "saved is
// never earned", reversals subtracted and shown, "annualized = projection",
// Upmore subscription cost never invented.
const LEDGER_RX = /\bsavings ledger\b|\bmy savings\b|\bhow much have i saved\b|\bwhat have i saved\b|\bsavings so far\b|\bmy ledger\b/i;

export async function tryLedgerSummary(
  message: string,
  ctx?: CapCtx,
): Promise<string | null> {
  if (!LEDGER_RX.test(message)) return null;

  let rows: any[] = [];
  if (ctx) rows = await readSaveRows(ctx.supa, "save_ledger", ctx.userId);
  if (!rows.length) {
    return `Nothing logged yet — nothing counts on intent. Kill a subscription or win a price adjustment, ` +
      `tell me about it, and I'll put it on the ledger.`;
  }
  // Buckets mirror the Save tab's ledger grid exactly, so the Guide and the
  // tab can never disagree. Honesty rules: the reversed flag always wins
  // (a clawed-back entry subtracts even if its bucket says "Received");
  // pending never counts; annualized is a projection, never cash.
  const UI_BUCKETS = ["received", "avoided", "reduced", "cash flow", "found"];
  const LEGACY_RECEIVED = new Set(["confirmed", "paid", "collected"]);
  const PENDING = new Set(["pending", "claimed", "filed", "in progress"]);
  const REVERSAL = new Set(["reversal", "clawback", "refunded"]);
  const sums: Record<string, number> = { received: 0, avoided: 0, reduced: 0, "cash flow": 0, found: 0 };
  let pending = 0, reversals = 0, annualized = 0;
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    const bucket = String(r.bucket ?? "").toLowerCase().trim();
    if (r.annualized === true || bucket === "annualized") {
      annualized += amt;
      continue; // projections are not cash — excluded from totals
    }
    if (r.reversed === true || REVERSAL.has(bucket) || amt < 0) {
      reversals += Math.abs(amt);
      continue;
    }
    if (PENDING.has(bucket)) {
      pending += amt;
      continue;
    }
    const key = UI_BUCKETS.includes(bucket) ? bucket
      : LEGACY_RECEIVED.has(bucket) ? "received" : "found";
    sums[key] += amt;
  }
  const kept = UI_BUCKETS.reduce((t, b) => t + sums[b], 0);
  const net = kept - reversals;
  const disp = (b: string) => b === "cash flow" ? "Cash flow" : b[0].toUpperCase() + b.slice(1);
  const note: Record<string, string> = {
    received: "cash actually back in your pocket",
    avoided: "spending you skipped — not cash in hand",
    reduced: "lower bills, not cash in hand",
    "cash flow": "timing wins, not cash in hand",
    found: "money found, counted when received",
  };
  let out = `Here's your savings ledger.\n\n`;
  for (const b of UI_BUCKETS) {
    out += `• ${disp(b)}: ${fmtMoney(sums[b])} — ${note[b]}.\n`;
  }
  if (pending) out += `• Pending: ${fmtMoney(pending)} — claimed but not confirmed. Doesn't count until it's real.\n`;
  if (reversals) out += `• Reversals: -${fmtMoney(reversals)} — clawed back; already subtracted.\n`;
  if (annualized) out += `• Annualized: ${fmtMoney(annualized)}/yr — a projection, not cash in hand. Excluded from the total.\n`;
  out += `\nNet kept: ${fmtMoney(net)}.\n\n` +
    `Saved is never earned — this is money kept, not made.`;
  out += `\nFigures shown before any Upmore subscription cost — minus any Upmore subscription cost. I don't know your plan, so I won't guess it.`;
  return out;
}

export async function tryCapabilities(
  message: string,
  routes: RouteCard[],
  ctx?: CapCtx,
  hist: { role: string; content: string }[] = [],
  exclHist: { role: string; content: string }[] = hist,
): Promise<{ reply: string; routeId?: string } | null> {
  // Note: gambling/privacy/scam guards run even earlier in index.ts (before
  // the catalog fetch) for speed; they're listed here as a fallback in case
  // that path is ever bypassed.
  const gambling = tryGamblingGuard(message);
  if (gambling) return { reply: gambling };
  const privacy = tryPrivacyGuard(message);
  if (privacy) return { reply: privacy };
  const scam = tryScamGuard(message);
  if (scam) return { reply: scam };
  const sysprompt = trySyspromptGuard(message);
  if (sysprompt) return { reply: sysprompt };
  const plan = tryPlanStack(message, routes, hist, exclHist);
  if (plan) return { reply: plan };
  const makeMe = tryMakeMeX(message, routes, hist, exclHist);
  if (makeMe) return { reply: makeMe };
  const walk = tryWalkthrough(message, routes, hist);
  if (walk) return walk;
  const monthly = tryMonthlyEstimate(message, routes);
  if (monthly) return { reply: monthly };
  const termsChange = tryTermsChangeQuestion(message, routes);
  if (termsChange) return { reply: termsChange };
  // Save-side five, explicitly AFTER earn-side paths so a "save" keyword can
  // never preempt an "earn" intent. ctx is optional: without it the DB-backed
  // paths degrade gracefully (ask-for-input, inline parsing) instead of
  // failing.
  const audit = await trySubscriptionAudit(message, ctx);
  if (audit) return { reply: audit };
  const receipt = tryReceiptCheck(message);
  if (receipt) return { reply: receipt };
  const claimIntent = tryClaimIntent(message);
  if (claimIntent) {
    const logged = await insertClaimIntent(claimIntent, ctx);
    if (logged) return { reply: logged };
  }
  const claims = await tryClaimDeadlines(message, ctx);
  if (claims) return { reply: claims };
  const bill = tryBillPrep(message);
  if (bill) return { reply: bill };
  const ledger = await tryLedgerSummary(message, ctx);
  if (ledger) return { reply: ledger };
  return null;
}
