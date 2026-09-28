// Curated finance facts: the ONLY numeric/official source the agent may use
// when answering general finance questions (FINANCE Q&A mode).
//
// Philosophy: same as route cards — the model reasons and explains in its own
// words, but every figure, limit, threshold, and official URL must come from
// here (or the user's own message). Anything not covered here → the agent
// must say it doesn't have a verified figure and point at the official source,
// never invent one.
//
// Sources: IRS Rev. Proc. 2025-32 (2026 tax figures), Rev. Proc. 2025-19 (HSA),
// IRS Notice 2025-67 (401k), research/tax-positioning-2026.md (IRS-verified).
// as_of marks the tax year / verification date. Amounts are stored normalized
// (digits only) for the grounding post-check.

export interface FinanceFact {
  id: string;
  // keywords the server uses to decide this fact answers the question
  match: string[];
  // short plain-words answer the model may quote or paraphrase
  text: string;
  source: string;
  as_of: string;
  // normalized amounts/URLs appearing in text, for checkGrounding allowlist
  amounts: string[];
  urls: string[];
}

export const FINANCE_FACTS: FinanceFact[] = [
  {
    id: "std-deduction-2026",
    match: ["standard deduction", "std deduction", "deduction amount 2026", "how much is the standard deduction"],
    text: "For 2026 the standard deduction is $16,100 single or married filing separately, $32,200 married filing jointly, and $24,150 head of household. Add $1,650 more for each married filer (or $2,050 if single) who is 65 or older or blind. About 90% of filers take the standard deduction instead of itemizing.",
    source: "IRS Rev. Proc. 2025-32",
    as_of: "tax year 2026",
    amounts: ["16100", "32200", "24150", "2050"],
    urls: [],
  },
  {
    id: "hsa-limits-2026",
    match: ["hsa limit", "hsa contribution", "health savings account limit", "hsa max 2026"],
    text: "2026 HSA contribution limits: $4,400 self-only, $8,750 family (employer + employee combined). If you're 55 or older and not on Medicare you can add a $1,000 catch-up; if both spouses are 55+, the family total can reach $10,750 (the spouse's $1,000 must go into their own HSA). An HSA is triple tax-advantaged: deductible contributions, tax-free growth, tax-free withdrawals for medical costs.",
    source: "IRS Rev. Proc. 2025-19",
    as_of: "tax year 2026",
    amounts: ["4400", "8750", "1000", "10750"],
    urls: [],
  },
  {
    id: "401k-limits-2026",
    match: ["401k limit", "401(k) limit", "401k max", "403b limit", "457 limit", "elective deferral"],
    text: "For 2026 you can put $24,500 of your own pay into a 401(k), 403(b), 457, or TSP. At 50+ the catch-up is $8,000 (total $32,500); ages 60–63 get a super catch-up of $11,250 (total $35,750). Combined employee + employer contributions cap at $72,000.",
    source: "IRS Notice 2025-67",
    as_of: "tax year 2026",
    amounts: ["24500", "8000", "32500", "11250", "35750", "72000"],
    urls: [],
  },
  {
    id: "ira-limits-2026",
    match: ["ira limit", "ira contribution", "roth ira limit", "traditional ira limit", "ira max 2026"],
    text: "2026 IRA contribution limit (traditional + Roth combined): $7,500, plus a $1,100 catch-up at 50+ (total $8,600). Roth eligibility phases out at higher incomes — single $153,000–$168,000, joint $242,000–$252,000. Check IRS.gov for this year's exact phase-out ranges before contributing.",
    source: "IRS Notice 2025-67",
    as_of: "tax year 2026",
    amounts: ["7500", "1100", "8600", "153000", "168000", "242000", "252000"],
    urls: ["https://www.irs.gov"],
  },
  {
    id: "se-tax-2026",
    match: ["self employment tax", "self-employment tax", "se tax", "freelance tax rate", "1099 tax rate", "social security wage base"],
    text: "Self-employment tax is 15.3%: 12.4% Social Security on earnings up to the $184,500 wage base, plus 2.9% Medicare with no cap, applied to 92.35% of net earnings — on top of income tax. There's an extra 0.9% Medicare tax above $200K single / $250K joint. Half of SE tax is deductible. Rule of thumb: set aside 25–30% of every freelance dollar the day it arrives.",
    source: "IRS (2026 figures)",
    as_of: "tax year 2026",
    amounts: ["15.3", "12.4", "184500", "2.9", "92.35", "0.9", "200000", "250000"],
    urls: [],
  },
  {
    id: "quarterly-taxes",
    match: ["quarterly tax", "estimated tax", "pay estimated taxes", "safe harbor", "underpayment penalty"],
    text: "If you earn freelance/gig income with no withholding, the IRS expects quarterly estimated payments (April, June, September, January). Safe harbor: pay 100% of last year's total tax (110% if last year's AGI was over $150,000) or 90% of this year's — and you avoid the underpayment penalty even if you still owe at filing.",
    source: "IRS",
    as_of: "tax year 2026",
    amounts: ["150000", "100", "110", "90"],
    urls: ["https://www.irs.gov"],
  },
  {
    id: "w4-two-jobs",
    match: ["w-4 two jobs", "w4 multiple jobs", "withholding two jobs", "owe taxes two jobs", "step 2(c)"],
    text: "IRS withholding tables treat each job as if it were your only income — so two jobs often withhold too little and you owe at filing. Fix: check the Step 2(c) box on BOTH W-4s (most accurate when pay is similar), or put expected other income in Step 4(a) on the higher-paying job's W-4. The free IRS Tax Withholding Estimator at irs.gov/W4App takes about 10 minutes with your latest pay stub.",
    source: "IRS",
    as_of: "2026",
    amounts: [],
    urls: ["https://www.irs.gov/W4App"],
  },
  {
    id: "senior-deduction-2026",
    match: ["senior deduction", "senior tax", "65 deduction", "older adult deduction", "bonus deduction 65"],
    text: "New for 2026: filers 65 or older get an extra $6,000 deduction per person ($12,000 if both spouses qualify), on top of the standard deduction. It phases out above $75K single / $150K joint income (shrinks 6% per dollar over, gone at $175K / $350K). You need a valid SSN.",
    source: "OBBBA / IRS (2026)",
    as_of: "tax year 2026",
    amounts: ["6000", "12000", "75000", "150000", "175000", "350000"],
    urls: [],
  },
  {
    id: "tips-overtime-2026",
    match: ["no tax on tips", "tax on tips", "tips deduction", "overtime deduction", "no tax on overtime"],
    text: "\"No tax on tips/overtime\" doesn't make the income disappear — it's a deduction you claim when you file, up to $25,000 of qualified tips per return for 2025–2028. It phases out above $150K single / $300K joint MAGI. Withholding (including Social Security and Medicare) still comes out of your paychecks all year — the deduction only reduces federal income tax. The overtime deduction covers only the premium half of overtime pay, not the whole paycheck. If you earn tips or overtime, run the IRS Withholding Estimator mid-year so you aren't surprised in April.",
    source: "OBBBA §224 / IRS final regs T.D. 10044 (2026)",
    as_of: "tax years 2025–2028",
    amounts: ["25000", "150000", "300000"],
    urls: ["https://www.irs.gov/W4App"],
  },
  {
    id: "1099-threshold",
    match: ["1099 threshold", "1099-k", "1099k", "venmo 1099", "venmo", "cash app 1099", "report income", "1099-nec", "1099-misc"],
    text: "Two different 1099 rules changed for 2026 — don't mix them up. (1) Payment apps and marketplaces (Form 1099-K, e.g. Venmo, PayPal, eBay): they report only if you get MORE than $20,000 AND more than 200 transactions in the year — both conditions. (2) A business paying you directly (Forms 1099-NEC / 1099-MISC): the reporting threshold rose from $600 to $2,000 for 2026. Either way, the reporting threshold is NOT the taxable threshold — every dollar of income is taxable whether or not you get a form. Keep your own records.",
    source: "OBBBA §§70432–70433 / IRS (2026)",
    as_of: "tax year 2026",
    amounts: ["20000", "200", "2000", "600"],
    urls: [],
  },
  {
    id: "roth-vs-traditional",
    match: ["roth vs traditional", "roth or traditional", "which ira", "pre-tax or roth"],
    text: "The core tradeoff: Roth = pay tax now at today's rate, never again. Traditional = deduct now, pay later. Young or in a low-earning year (10–12% bracket) → Roth usually wins. Peak-earning years (22%+) → traditional usually wins. Compare your marginal rate now vs. your expected marginal rate in retirement. I'm not a tax advisor — for big decisions, a CPA's hour is money well spent.",
    source: "general tax principle",
    as_of: "2026",
    amounts: [],
    urls: [],
  },
  {
    id: "apr-vs-apy",
    match: ["apr vs apy", "apr apy difference", "what is apr", "what is apy"],
    text: "APR is the yearly cost of borrowing WITHOUT compounding — use it to compare loans and credit cards. APY is the yearly return WITH compounding — use it to compare savings accounts. Same number, different meaning: a 5% APR loan costs less over a year than a 5% APY savings account earns, because APY includes compounding.",
    source: "general finance definition",
    as_of: "2026",
    amounts: [],
    urls: [],
  },
  {
    id: "emergency-fund",
    match: ["emergency fund", "how much savings", "rainy day fund", "months of expenses"],
    text: "The standard target is 3–6 months of essential expenses in a separate high-yield savings account. Start smaller if that's daunting: even $500–$1,000 covers the most common emergencies (car repair, phone replacement) that otherwise become credit-card debt. Build it before investing beyond a 401(k) match.",
    source: "general financial planning",
    as_of: "2026",
    amounts: ["500", "1000"],
    urls: [],
  },
  {
    id: "credit-score-factors",
    match: ["credit score", "improve credit", "fico factors", "what affects credit score", "build credit"],
    text: "FICO publishes its weights: payment history ~35%, amounts owed / utilization ~30% (balances ÷ limits — under 30% is the commonly cited line, under 10% is the lower band), length of history ~15%, new credit ~10%, credit mix ~10%. The mechanics: on-time payments build the history slice; lower balances lower the utilization slice; closing the oldest card shortens average account age, which is the mechanism behind the length-of-history effect. General education about how the models work — not steps for your situation.",
    source: "FICO / CFPB",
    as_of: "2026",
    amounts: ["35", "30", "15", "10"],
    urls: [],
  },
  {
    id: "overdraft",
    match: ["overdraft", "overdraft fee", "nsf fee", "account overdrawn"],
    text: "An overdraft fee hits when you spend more than your checking balance — many banks charge around $30+ per transaction. Protections: turn on low-balance alerts, link a savings account for overdraft transfer (usually cheaper), or ask your bank about no-overdraft-fee accounts. If fees already hit, call and ask for a courtesy reversal — banks often waive the first one.",
    source: "CFPB",
    as_of: "2026",
    amounts: ["30"],
    urls: ["https://www.consumerfinance.gov"],
  },
  {
    id: "unclaimed-property",
    match: ["unclaimed property", "unclaimed money", "missing money", "state unclaimed"],
    text: "States hold billions in forgotten money — old paychecks, deposits, refunds. Search your state's official unclaimed-property site (find it via missingmoney.com, run by the states themselves, or search \"[your state] unclaimed property\"). It's free — never pay a site to search. Claims take a few weeks and need an ID plus proof of address.",
    source: "NAUPA",
    as_of: "2026",
    amounts: [],
    urls: ["https://www.missingmoney.com"],
  },
  {
    id: "savers-credit-2026",
    match: ["saver's credit", "savers credit", "retirement savings credit", "form 8880"],
    text: "The Saver's Credit (Form 8880) gives low-to-moderate earners a credit of 10–50% on the first $2,000 of retirement contributions ($4,000 joint) — up to $1,000 per person. You must be 18+, not a full-time student, not a dependent. Many 401(k) contributors miss it because they never file the form. Starting 2027, SECURE 2.0 replaces it with a federal Saver's Match deposited directly to your account.",
    source: "IRS",
    as_of: "tax year 2026",
    amounts: ["2000", "4000", "1000"],
    urls: ["https://www.irs.gov"],
  },
  {
    id: "cdctc-2026",
    match: ["child care credit", "dependent care credit", "cdctc", "childcare expenses"],
    text: "The 2026 Child and Dependent Care Credit expansion is worth up to $3,000 (vs $2,100 before). It covers care costs so you can work — daycare, after-school, summer day camp. Keep receipts; you'll need the provider's name, address, and tax ID at filing.",
    source: "IRS (2026)",
    as_of: "tax year 2026",
    amounts: ["3000", "2100"],
    urls: [],
  },
  {
    id: "qbi-2026",
    match: ["qbi", "20% deduction", "pass-through deduction", "199a"],
    text: "The 20% qualified business income (QBI) deduction for pass-through owners (sole props, S-corps, partnerships) is now permanent. It phases out for higher earners in certain service businesses — if your taxable income is near the phase-in range, a CPA is worth it.",
    source: "OBBBA / IRS (2026)",
    as_of: "tax year 2026",
    amounts: ["20"],
    urls: [],
  },
  {
    id: "charitable-2026",
    match: ["charitable deduction", "donation deduction", "itemize charity", "bunching donations"],
    text: "New for 2026: itemizers can only deduct charitable gifts above 0.5% of AGI (at $100K income, the first $500 doesn't count — the rest carries forward). Strategy: \"bunch\" two years of giving into one tax year to clear the standard-deduction hurdle, then take the standard deduction the next year.",
    source: "OBBBA / IRS (2026)",
    as_of: "tax year 2026",
    amounts: ["0.5", "100000", "500"],
    urls: [],
  },
  {
    id: "amended-return",
    match: ["amend return", "amended return", "missed credit", "fix tax return", "1040-x"],
    text: "Missed a credit or deduction? You can amend with Form 1040-X — generally up to 3 years from filing (or 2 years from paying) to claim a refund. E-file amendments are accepted now; paper takes much longer.",
    source: "IRS",
    as_of: "2026",
    amounts: [],
    urls: ["https://www.irs.gov"],
  },
  {
    id: "debt-avalanche",
    match: ["avalanche vs snowball", "pay off debt", "which debt first", "debt payoff method"],
    text: "Two proven methods: avalanche = pay minimums everywhere, throw extra at the HIGHEST rate first (saves the most money). Snowball = throw extra at the SMALLEST balance first (fastest psychological win). Avalanche wins on math; snowball wins on momentum — pick the one you'll actually stick with. Either way, stop adding new debt first.",
    source: "general financial planning",
    as_of: "2026",
    amounts: [],
    urls: [],
  },
  {
    id: "hysa",
    match: ["high yield savings", "hysa", "best savings account", "savings rate"],
    text: "High-yield savings accounts pay far more than traditional big-bank savings — compare APY (not APR), check for monthly fees and minimums, and confirm FDIC insurance. Rates move with the Fed, so a rate I quote today may be stale — check the bank's site for the current number before opening.",
    source: "general financial planning",
    as_of: "2026",
    amounts: [],
    urls: [],
  },
  {
    id: "fdic",
    match: ["fdic", "fdic insured", "is my money safe", "bank fails"],
    text: "FDIC insurance covers up to $250,000 per depositor, per bank, per ownership category. Checking + savings in your name at one bank combine toward that limit. If you hold more, spread it across banks or ownership categories.",
    source: "FDIC",
    as_of: "2026",
    amounts: ["250000"],
    urls: ["https://www.fdic.gov"],
  },
  {
    id: "gig-taxes",
    match: ["doordash taxes", "doordash", "uber taxes", "gig taxes", "gig tax", "side hustle taxes", "freelancer taxes", "earnings taxed"],
    text: "Gig platforms don't withhold taxes — you're on the hook for income tax AND 15.3% self-employment tax. Track mileage and expenses from day one (they're deductible). Set aside 25–30% of every payout immediately, and make quarterly estimated payments or you'll face an underpayment penalty.",
    source: "IRS",
    as_of: "tax year 2026",
    amounts: ["15.3"],
    urls: ["https://www.irs.gov"],
  },
  {
    id: "overtime-deduction-2026",
    match: ["overtime deduction", "no tax on overtime", "overtime tax", "deduct overtime"],
    text: "Overtime deduction for 2025–2028: up to $12,500 (single) or $25,000 (joint) of qualified overtime pay. Only the premium portion — the extra half of time-and-a-half — counts, not the base wage. Same $150K single / $300K joint MAGI phaseout as the tips deduction. It's a deduction you claim when you file, not withholding-free paychecks.",
    source: "OBBBA §225",
    as_of: "tax years 2025–2028",
    amounts: ["12500", "25000", "150000", "300000"],
    urls: [],
  },
  {
    id: "marginal-brackets-2026",
    match: ["tax bracket", "marginal tax", "tax brackets 2026", "what bracket am i in"],
    text: "Marginal means only the income inside each bracket is taxed at that rate — moving into a higher bracket never taxes your whole income at the higher rate. For 2026, the single brackets start at 10% up to $11,925 and top out at 37% above $640,600 (joint: 10% to $23,850, 37% above $768,700). Your 'bracket' is just the rate on your last dollar.",
    source: "IRS Rev. Proc. 2025-32",
    as_of: "tax year 2026",
    amounts: ["11925", "640600", "23850", "768700"],
    urls: [],
  },
  {
    id: "compound-interest-72",
    match: ["compound interest", "rule of 72", "how does compounding work", "compound growth"],
    text: "Compound interest means you earn returns on your returns — growth accelerates over time. The Rule of 72 estimates doubling time: divide 72 by your annual return. At 7%, money doubles roughly every 10 years; at 10%, every 7. Starting early beats saving more later because compounding needs time.",
    source: "rule of thumb",
    as_of: "timeless",
    amounts: ["72"],
    urls: [],
  },
];

// Official domains the finance mode may link. Anything else → violation.
export const FINANCE_URL_ALLOWLIST = [
  "irs.gov",
  "consumerfinance.gov",
  "fdic.gov",
  "missingmoney.com",
  "ssa.gov",
  "studentaid.gov",
  "usa.gov",
  "federalreserve.gov",
  "sec.gov",
  "investor.gov",
];

// Scoped allowlist: amounts from ONLY the given fact IDs. Used by the
// grounding post-check so a finance answer can't launder numbers from
// unrelated facts (cross-fact leakage killed the emergency-fund probe).
export function financeAmountsFor(ids: string[]): Set<string> {
  const s = new Set<string>();
  const want = new Set(ids);
  for (const f of FINANCE_FACTS) {
    if (!want.has(f.id)) continue;
    for (const m of f.text.match(/\$[\d,]+(\.\d+)?/g) ?? [])
      s.add(m.replace(/[^0-9.]/g, ""));
    for (const a of f.amounts) s.add(a);
  }
  return s;
}

// Normalized-amount allowlist for the grounding post-check in finance mode.
// Auto-extracted from the fact texts with the SAME regex the checker uses,
// so a figure quoted from a fact can never false-positive as "invented".
export function financeAllowedAmounts(): Set<string> {
  const s = new Set<string>();
  for (const f of FINANCE_FACTS) {
    for (const m of f.text.match(/\$[\d,]+(\.\d+)?/g) ?? [])
      s.add(m.replace(/[^0-9.]/g, ""));
    for (const a of f.amounts) s.add(a);
  }
  return s;
}

// Deterministic finance-intent match: returns the IDs of facts whose keywords
// appear in the message. Used to nudge the model into FINANCE Q&A mode so a
// finance question can't be hijacked by route matching ("credit score" must
// not return a credit-union bank bonus).
export function financeFactMatch(message: string): string[] {
  const t = " " + message.toLowerCase() + " ";
  return FINANCE_FACTS.filter((f) =>
    f.match.some((k) => t.includes(k.toLowerCase()))
  ).map((f) => f.id);
}

// Deterministic fact answers: when a question matches a curated fact AND asks
// for a figure/definition ("how much", "what is the limit", "what is X"), answer
// straight from the fact — no model call, no marker lottery, no grounding risk.
const FIGURE_Q_RX = /\b(how much|how many|what is|what('s| is) the|limit|amount|rate|threshold|deductible|cover|worth|2026|percent|%|taxed)\b/i;

export function tryFinanceFact(message: string): string | null {
  const t = " " + message.toLowerCase() + " ";
  // Dynamic composite handlers (mirror client FINANCE_FACTS_LOCAL fn handlers)
  // Debt with APR: echo the user's rate
  if (t.includes("owe") && t.includes("credit card")) {
    const m = t.match(/(\d+(?:\.\d+)?)\s*%\s*(?:apr)?/);
    const aprBit = m ? ` At ${m[1]}% APR, every $1,000 of balance costs ~$${Math.round(parseFloat(m[1]) * 10)}/year in interest.` : "";
    return `Two payoff methods, explained: avalanche puts extra payments toward the highest-rate balance first (minimizes total interest); snowball puts extra toward the smallest balance first (fastest account closed).${aprBit} People compare them because at 20%+ APR, interest compounds fast enough that the method choice changes the total paid. General education, not advice for your situation.`;
  }
  // Bonus split: emergency vs debt
  if (t.includes("bonus") && t.includes("emergency") && t.includes("debt")) {
    return `The general framework people use: a small starter buffer (one month of expenses, or $1,000 from zero, are the commonly cited figures) covers the surprise bill that would otherwise become new debt; high-APR balances get attention because 20%+ APR compounds faster than savings grow, while lower-rate debt (under ~7%) is often weighed against building the full 3–6 month fund. Which tradeoff fits depends on the numbers — general education, not a plan for your situation.`;
  }
  // Gig taxes: DoorDash
  if ((t.includes("doordash") || t.includes("gig") || t.includes("freelance")) && t.includes("tax")) {
    return `Gig platforms don't withhold taxes — you're on the hook for income tax AND 15.3% self-employment tax (Social Security + Medicare) on 92.35% of net earnings. Set aside 25-30% of each payout. If you'll owe $1,000+ at filing, pay quarterly estimated taxes (Apr 15, Jun 15, Sep 15, Jan 15) to avoid penalties. Track mileage — it's your biggest deduction.`;
  }
  // Credit building for car loan
  if (t.includes("no credit") && (t.includes("car loan") || t.includes("auto loan"))) {
    return `With no credit history, a car loan will be expensive — expect a high APR or a required co-signer. Build credit first: get a secured credit card, use it for small purchases, pay in full monthly. After 6-12 months of on-time payments you'll qualify for better auto rates. Never take a 20%+ APR car loan if you can avoid it — the interest can exceed the car's value.`;
  }
  // Overdraft + credit score
  if (t.includes("overdraft") && t.includes("credit")) {
    return `Overdraft fees don't directly hurt your credit score — but the cascade does. If the negative balance goes to collections, THAT hits your score hard. Fix it now: bring the account positive today, ask the bank to waive the fees (first-time courtesy often works), then set up low-balance alerts and link a savings account for overdraft protection. A single collections account can drop a score 50-100 points.`;
  }
  if (!FIGURE_Q_RX.test(message)) return null;
  const ids = financeFactMatch(message);
  if (!ids.length) return null;
  const f = FINANCE_FACTS.find((x) => x.id === ids[0]);
  if (!f) return null;
  return f.text;
}

export function financeModeNudge(ids: string[]): string {
  return (
    `FINANCE-MODE DIRECTIVE: this message is a general finance question, NOT a route request. ` +
    `Answer in FINANCE Q&A mode using the FINANCE FACTS entries [${ids.join(", ")}] and end your reply with [FINANCE]. ` +
    `Do NOT match it to an earning route. Do NOT recommend securities.`
  );
}

// Rendered into the system prompt as the finance source of truth.
export function renderFinanceFacts(): string {
  return FINANCE_FACTS.map(
    (f) => `[${f.id}] (${f.source}, ${f.as_of})\n${f.text}`
  ).join("\n\n");
}
