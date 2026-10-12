// Earn and purchase-time surfaces, one sub-capability at a time (docs/depth/SURFACES.md): packages/domain/63-agent-surfaces.js
// (AgentSurfaces) rates side income by its effective hourly rate, filters signup bonuses by what the person can meet,
// keeps portal money pending until it lands, routes a purchase through a portal and a card offer, stages a card-linked
// offer activation as a request the person approves, picks the card for a purchase from their own reward table, and
// drafts dispute packets, complaint letters, energy plan comparisons, move budgets, a crypto tax CSV and the bill
// calendar. Nothing here calls a portal or an issuer. Not reachable in production today: no edge function or app path
// loads it (it is in neither the router bundle nor the financial core). Its bonus catalog ("Example National" and
// others) and portal table ("Portal A", "Portal B") are placeholder rows, labeled here as MOCK. It needs no other module
// (AgentLedger is optional for the bill calendar: S19 uses the bills the person names; S22 loads 57-agent-ledger.js, with
// 33 and 48 before it, to read recurring rows next to a named bill).
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Every card, offer, bill and row is MOCK.
// Check: node --test tests/depth-SURFACES.test.cjs && node evals/depth/run.cjs SURFACES
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(dir, "63-agent-surfaces.js"), "utf8") + "\nthis.S = AgentSurfaces;", ctx);
const { S } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const T = "2026-10-12";

test("[S01] side income fits the person's skills, gear and hours, best effective rate first, and says why the rest do not", () => {
  const m = plain(S.sideIncomeMatch({ skills: ["Driving"], gear: ["car", "smartphone"], hours_per_week: 10 }));
  assert.deepEqual(m.fits.filter(f => !["earn_apps", "benefits_screening", "selling_used"].includes(f.id)).map(f => [f.id, f.effective_hourly_cents, f.per_month_cents]), [["rideshare", 1020, 40800], ["delivery", 888, 35520]]);
  assert.deepEqual(["task_errands", "freelance_dev", "tutoring_online"].map(id => m.rest.find(r => r.id === id).why_not), ["needs tools", "needs programming or data or analytics", "needs teaching or math or writing or languages or science"]);
  assert.equal(plain(S.sideIncomeMatch({ skills: ["programming"], gear: ["laptop"], hours_per_week: 4 })).rest.find(r => r.id === "freelance_dev").why_not, "needs 5 hours a week");
});

test("[S02] the effective hourly rate takes off platform fees, unpaid time, vehicle cost and the cash-out fee", () => {
  assert.equal(S.effective({ typical_hourly_cents: [2000, 4000], unpaid_minutes_per_hour: 15, fee_bps: 1000 }, 5), 2160);
  assert.equal(S.effective({ typical_hourly_cents: [2000, 4000], unpaid_minutes_per_hour: 0, fee_bps: 0, vehicle_cost_per_hour_cents: 700 }, 5), 2300);
  assert.equal(plain(S.sideIncomeMatch({ gear: ["smartphone"], hours_per_week: 10 })).fits.find(f => f.id === "earn_apps").effective_hourly_cents, 295, "$4.00 midpoint, a quarter of the time unpaid, a $2.00 cash-out over 40 hours");
});

test("[S03] when no work fits, it says so in a whole sentence and still points to the benefits screening", () => {
  const m = plain(S.sideIncomeMatch({ skills: [], gear: [], hours_per_week: 0 }));
  assert.deepEqual(m.fits.map(f => f.id), ["benefits_screening"]);
  // It read "With 0 hours a week and no stated skills: . Also worth ten minutes: ...".
  assert.equal(m.text, "Nothing in the catalog fits the skills, gear and hours you gave me. Still worth ten minutes: a benefits screening, which is not work. Typical ranges, 2026-10.");
});

test("[S04] a state-only bonus reads the person's state in any case; the new-customer rule counts from when the old account closed", () => {
  const b = plain(S.bonusFinder({ today: T, state: "tx", monthly_direct_deposit_cents: 300000, recent_banks: [{ bank: "example national", closed_on: "2025-01-01" }, { bank: "Example Credit Union", closed_on: "2025-10-11" }] }));
  assert.deepEqual(b.rest.find(r => r.id === "ex1").why_not, ["you had an account there within 2 years"]);
  assert.ok(b.fits.some(f => f.id === "ex2"), "a Texan typing \"tx\" was told the bonus is \"only in TX, OK\"");
  assert.deepEqual(plain(S.bonusFinder({ today: T, state: "TX", recent_banks: [{ bank: "Example Credit Union", opened_on: "2024-01-01", closed_on: "2025-10-13" }] })).rest.find(r => r.id === "ex2").why_not, ["you had an account there within 1 years"]);
});

test("[S05] a direct-deposit requirement is met over its window, not by one month's pay", () => {
  const fits = cents => plain(S.bonusFinder({ today: T, state: "CA", monthly_direct_deposit_cents: cents })).fits.map(f => f.id);
  assert.ok(fits(300000).includes("ex3"), "$3,000 a month is $6,000 in 60 days, enough for $5,000 within 60 days");
  assert.deepEqual(plain(S.bonusFinder({ today: T, state: "CA", monthly_direct_deposit_cents: 200000 })).rest.find(r => r.id === "ex3").why_not, ["needs $5,000.00 of direct deposit within 60 days; your paycheck is $2,000.00 a month"]);
  assert.ok(fits(66667).includes("ex1") && !fits(66666).includes("ex1"), "$2,000 within 90 days is three paychecks");
});

test("[S06] a bonus that parks cash is netted for the interest it forgoes, word for word", () => {
  const b = plain(S.bonusFinder({ today: T, state: "CA", monthly_direct_deposit_cents: 900000, movable_cash_cents: 2000000, reference_apy_bps: 400 }));
  assert.deepEqual(b.fits.map(f => [f.id, f.net_cents, f.effective_hourly_cents]), [["ex3", 40000, 80000], ["ex1", 30000, 40000], ["ex4", 205, 492]]);
  assert.equal(b.text, "3 bonuses you can meet: Example Online Bank $400.00 for $5,000.00 direct deposit within 60 days, about $800.00 an hour for the chores; Example National $300.00 for $2,000.00 direct deposit within 90 days, about $400.00 an hour for the chores, keep it 180 days; Example Savings $150.00 for $15,000.00 held 90 days ($147.95 of interest forgone, net $2.05), about $4.92 an hour for the chores. Terms as of 2026-10; I track the requirements once you open one.");
});

test("[S07] portal money is pending, confirmed or landed, never mixed; only credits that posted have landed", () => {
  const pe = plain(S.portalEarnings([{ portal: "Mock Portal A", pending_cents: 1250, confirmed_cents: 3400, as_of: T, next_payout_on: "2026-11-15" }, { portal: "Mock Portal B", confirmed_cents: 500 }],
    [{ id: "mock-r1", posted_at: "2026-08-15", amount: 21.5, merchant_raw: "RAKUTEN CASH BACK" }, { id: "mock-r2", posted_at: "2026-08-16", amount: -21.5, merchant_raw: "RAKUTEN" }], T));
  assert.equal(pe.text, "$39.00 confirmed and $12.50 pending across 2 portals; $21.50 has actually landed in your accounts; next payout Mock Portal A 2026-11-15. Pending is the portal's number, not money.");
  assert.deepEqual([pe.landed_cents, pe.source, pe.as_of], [2150, "portal statements and your transactions", T]);
  // A card's own cash-back credit is the card's reward, not portal money; a credit from a portal the person has a statement for is.
  const card = plain(S.portalEarnings([{ portal: "Mock Portal A", confirmed_cents: 3400 }],
    [{ id: "mock-c1", posted_at: "2026-09-30", amount: 25, merchant_raw: "CASHBACK BONUS REDEMPTION" }, { id: "mock-c2", posted_at: "2026-10-01", amount: 12.4, merchant_raw: "MOCK CARD CASH BACK REWARD" },
      { id: "mock-c3", posted_at: "2026-10-02", amount: 8, merchant_raw: "MOCK PORTAL A PAYOUT" }], T));
  assert.deepEqual(card.payouts_landed.map(p => p.id), ["mock-c3"], "a card's $25.00 and $12.40 cash-back credits read as portal money landed");
  assert.equal(card.text, "$34.00 confirmed and $0.00 pending across 1 portal; $8.00 has actually landed in your accounts. Pending is the portal's number, not money.");
});

test("[S08] a purchase is routed through the best portal and the best live card offer; expired or unmet offers are left out", () => {
  const user = { today: T, card_offers: [{ id: "o1", card: "Mock Blue", merchant: "ShoeCo", percent_bps: 1000, activated: false, expires_on: "2026-10-31" }, { id: "o2", card: "Mock Blue", merchant: "ShoeCo", amount_cents: 3000, activated: true, expires_on: "2026-10-11" },
    { id: "o3", card: "Mock Gold", merchant: "ShoeCo", amount_cents: 2000, min_cents: 20000 }, { id: "o4", card: "Mock Gold", merchant: "ShoeCo", amount_cents: 500, expires_on: T, activated: true }] };
  const r = plain(S.routePurchase({ merchant: "ShoeCo running shoes", amount_cents: 12000 }, null, user));
  assert.deepEqual([r.offers.map(o => o.id), r.best_offer.id, r.total_back_cents], [["o1", "o4"], "o1", 2640]);
  assert.equal(r.text, "ShoeCo running shoes $120.00: start from Portal B for $14.40 back (12 percent, monthly, 30-day lock); activate the Mock Blue offer for $12.00. $26.40 total, as of 2026-10. Portal and card offers usually stack; coupon codes at checkout usually void the portal.");
});

test("[S09] activating a card offer is only ever a staged request the person approves once; it never executes here", () => {
  // Today is passed in, as bestCard and portalEarnings take it (the old calls here had no date, which is how an expired offer was staged).
  const a = plain(S.activateOffer({ id: "o1", card: "Mock Blue", merchant: "ShoeCo", percent_bps: 250, expires_on: "2026-10-31" }, null, T));
  assert.deepEqual(Object.keys(a), ["request", "text"]);
  assert.deepEqual(a.request, { capability_id: "EARN-010", key: "offer:Mock Blue:o1", idempotency_key: "offer:Mock Blue:o1", params: { card: "Mock Blue", offer_id: "o1", merchant: "ShoeCo" }, describe: "Activate the Mock Blue offer at ShoeCo",
    confirm: { restate: "activate the Mock Blue offer: 2.5 percent back at ShoeCo, through 2026-10-31.", context: "On your card's offers page," } });
  assert.equal(a.text, "I'll stage the activation; you approve it once. Activation is free and does not commit you to buying.");
  assert.equal(plain(S.activateOffer({ id: "o2", card: "Mock Gold", merchant: "Mock Cafe", amount_cents: 1000 })).request.confirm.restate, "activate the Mock Gold offer: $10.00 back at Mock Cafe.");
  assert.deepEqual(plain(S.activateOffer({ id: "o3", card: "Mock Gold", merchant: "Mock Cafe", activated: true, expires_on: "2026-11-30" }, null, T)), { done: true, text: "Mock Gold Mock Cafe is already activated through 2026-11-30." });
  assert.deepEqual(plain(S.activateOffer({ card: "Mock Gold" })), { ask: "Which offer? Give me the card and merchant." });
});

test("[S21] an offer that has expired is refused in words and nothing is staged; the last day still stages; no date, no staging", () => {
  const o = { id: "o9", card: "Mock Blue", merchant: "ShoeCo", amount_cents: 3000, expires_on: "2026-10-11" };
  assert.deepEqual(plain(S.activateOffer(o, null, T)), { expired: true, text: "The Mock Blue offer at ShoeCo expired on 2026-10-11, so there is nothing to activate. Nothing is staged." }, "yesterday's $30.00 offer was staged for activation");
  assert.deepEqual(plain(S.activateOffer(o, { today: T })).expired, true, "today read from the person, as routePurchase reads it");
  assert.equal(plain(S.activateOffer(Object.assign({}, o, { expires_on: T }), null, T)).request.key, "offer:Mock Blue:o9", "an offer expiring today is still open");
  assert.deepEqual(plain(S.activateOffer(o)), { ask: "What is today's date? The Mock Blue offer at ShoeCo runs through 2026-10-11, and I check it is still open before staging it." });
  assert.equal(plain(S.activateOffer(Object.assign({}, o, { activated: true }), null, T)).expired, true, "an expired offer is not \"already activated through\" a past date");
});

test("[S10] a rotating category counts only inside its own dates, whichever end is given", () => {
  const card = cat => [{ name: "Mock Freedom", base_bps: 100, categories: [Object.assign({ category: "gas", bps: 500 }, cat)] }];
  const best = cat => plain(S.bestCard({ category: "gas", amount_cents: 10000 }, card(cat), T)).text;
  assert.equal(best({ to: "2026-09-30" }), "Use Mock Freedom: 1 percent everywhere, $1.00 back on $100.00.", "last quarter's 5 percent was still offered in October");
  assert.equal(best({ from: "2026-10-13" }), "Use Mock Freedom: 1 percent everywhere, $1.00 back on $100.00.");
  assert.equal(best({ from: "2026-10-01", to: T }), "Use Mock Freedom: 5 percent on gas through 2026-10-12, $5.00 back on $100.00.");
});

test("[S11] a category cap that is partly used pays the bonus rate on what is left of it and the base rate on the rest", () => {
  const cards = [{ name: "Mock Cash", base_bps: 100, categories: [{ category: "groceries", bps: 500, cap_cents: 150000, used_cents: 130000 }] }, { name: "Mock Flat", base_bps: 200 }];
  const r = plain(S.bestCard({ category: "groceries", amount_cents: 100000 }, cards, T));
  assert.equal(r.text, "Use Mock Flat: 2 percent everywhere, $20.00 back on $1,000.00 (Mock Cash would give $18.00).", "it said Mock Cash, \"$50.00 back on $1,000.00\" with $200.00 of the cap left");
  assert.equal(plain(S.bestCard({ category: "groceries", amount_cents: 8000 }, cards, T)).text, "Use Mock Cash: 5 percent on groceries ($200.00 of the cap left), $4.00 back on $80.00 (Mock Flat would give $1.60).");
  assert.equal(r.ranked[1].why, "5 percent on groceries for the first $200.00 (what is left of the cap), then 1 percent");
});

test("[S12] an offer that needs activating says which, by name; frozen and closed cards are never suggested", () => {
  const cards = [{ name: "Mock Card", base_bps: 100, categories: [{ merchant: "Mock Shoes", bps: 500, activation_required: true, activated: false }] }, { name: "Mock Frozen", base_bps: 900, frozen: true }, { name: "Mock Closed", base_bps: 900, closed: true }];
  const r = plain(S.bestCard({ merchant: "Mock Shoes", amount_cents: 10000 }, cards, T));
  assert.deepEqual(r.ranked.map(c => c.card), ["Mock Card"]);
  assert.equal(r.ranked[0].why, "1 percent everywhere; 5 percent on Mock Shoes needs activating first", "it read \"5 percent on undefined needs activating first\"");
});

test("[S13] abroad, the foreign fee comes off the reward; a card that earns nothing is not given 1 percent", () => {
  const cards = [{ name: "Mock Blue", base_bps: 150, categories: [{ category: "dining", bps: 300 }], foreign_fee_bps: 300 }, { name: "Mock Travel", base_bps: 200, foreign_fee_bps: 0 }];
  const r = plain(S.bestCard({ category: "dining", amount_cents: 10000, abroad: true }, cards, T));
  assert.equal(r.text, "Use Mock Travel: 2 percent everywhere, $2.00 back on $100.00 (Mock Blue would give $0.00).");
  assert.equal(r.ranked[1].note, "charges 3 percent abroad, which eats the reward");
  assert.equal(plain(S.bestCard({ category: "dining", amount_cents: 10000 }, [{ name: "Mock Debit", base_bps: 0 }], T)).text, "Use Mock Debit: 0 percent everywhere, $0.00 back on $100.00.");
});

test("[S14] a dispute packet restates the exact charge, reason and evidence for the person to file", () => {
  const t = { id: "mock-t9", posted_at: "2026-10-02", amount: -89.99, merchant_raw: "MOCK GADGET STORE" };
  const d = plain(S.disputePacket(t, "duplicate", { original_id: "mock-t8", receipt: "r-1" }));
  assert.equal(d.request.confirm.restate, "file a dispute for $89.99 at MOCK GADGET STORE on 2026-10-02, reason: duplicate charge, evidence: receipt r-1, original charge mock-t8.");
  assert.deepEqual([d.request.capability_id, d.request.params.amount_cents, d.steps[0]], ["CARD-010", 8999, "Contact the merchant first and keep the thread; issuers ask whether you tried."]);
  assert.equal(plain(S.disputePacket(t, "unauthorized", {})).steps[0], "Lock the card now so nothing else lands.");
  assert.deepEqual(plain(S.disputePacket(t, "because", {})), { ask: "Which reason: not_received, not_as_described, duplicate, wrong_amount, cancelled, unauthorized?" });
});

test("[S15] a complaint letter is specific and dated, and a missing detail is asked for in words", () => {
  const c = plain(S.complaintDraft({ company: "Mock Hotels", what_happened: "the room had no hot water for two nights", on: "2026-09-28", ask_cents: 15000, evidence: ["photos"], today: T }));
  assert.equal(c.text, "To Mock Hotels customer care: On 2026-09-28, the room had no hot water for two nights. I was a paying customer and I am asking for a credit of $150.00. I have photos if you need them. Please reply within 10 business days. Thank you.");
  assert.equal(c.follow_up_on, "2026-10-26");
  assert.deepEqual(plain(S.complaintDraft({ company: "Mock Hotels" })), { ask: "I need what happened and the date to write it." }, "it asked \"I need what_happened, on to write it.\"");
  assert.deepEqual(plain(S.complaintDraft({})), { ask: "I need the company, what happened and the date to write it." });
});

test("[S16] energy plans are priced on the person's own usage; with no usage it asks instead of pricing zero", () => {
  const plans = [{ id: "a", name: "Mock Fixed", rate_cents_per_kwh_x100: 1450, monthly_fee_cents: 995, term_months: 12, current: true }, { id: "b", name: "Mock Variable", rate_cents_per_kwh_x100: 1320 }];
  const e = plain(S.energyPlans([{ kwh: 900 }, { kwh: 1100 }, { kwh: null }, { kwh: 1000 }], plans));
  assert.equal(e.text, "On your 12000 kWh a year: Mock Variable costs about $1,584.00, $275.40 less than Mock Fixed. Rates as quoted; a plan's rate can step up after the term.");
  const none = plain(S.energyPlans([], plans));
  assert.deepEqual([none.best, none.text], [null, "I need at least one month of your usage, in kWh, to compare plans."], "it said \"On your 0 kWh a year: Mock Variable costs about $0.00\"");
});

test("[S17] a move budget lists each line with its basis; no deposit means no deposit line", () => {
  const m = plain(S.moveBudget({ new_rent_cents: 200000, deposit_months: 0, old_rent_cents: 180000, overlap_days: 10, miles: 30 }));
  assert.deepEqual(m.lines.map(l => [l.what, l.cents]), [["First month at the new place", 200000], ["Overlap on the old place", 60000], ["Movers or truck", 60000], ["Packing supplies", 15000], ["Utility setup and transfers", 20000], ["Application and admin fees", 10000]], "a $2,000.00 deposit was added when the person said none");
  assert.deepEqual([m.subtotal_cents, m.contingency_cents, m.total_cents], [365000, 36500, 401500]);
  assert.deepEqual(plain(S.moveBudget({ new_rent_cents: 200000, miles: 30 })).lines[0], { what: "Deposit on the new place", cents: 200000, basis: "1 month(s) rent" });
});

test("[S18] the crypto tax CSV writes what was given: tiny quantities in plain decimals, quoted text, and no invented basis", () => {
  const x = plain(S.cryptoExport([{ id: "c1", on: "2026-03-01", type: "buy", asset: "BTC", quantity: 0.00000012, cost_basis_cents: 1, fee_cents: 0, exchange: "Mock X" },
    { id: "c2", on: "2026-09-01T10:00:00Z", type: "sell", asset: "ETH", quantity: 0.5, proceeds_cents: 120050, cost_basis_cents: null, fee_cents: 125, exchange: "Mock X", note: "moved \"to\" cash, finally" }, { id: "c3", on: "2026-09-02", type: "trade", asset: "SOL", quantity: 2, proceeds_cents: 30000 }]));
  assert.deepEqual(x.csv.split("\n").slice(1), ["2026-03-01,buy,BTC,0.00000012,,0.01,0.00,Mock X,", "2026-09-01,sell,ETH,0.5,1200.50,,1.25,Mock X,\"moved \"\"to\"\" cash, finally\"", "2026-09-02,trade,SOL,2,300.00,,,,"]);
  assert.deepEqual(x.missing_basis, ["c2", "c3"]);
  assert.equal(x.text, "3 rows exported. 2 sales have no cost basis on file; the tool will ask, and I will not guess one.");
});

test("[S19] the bill calendar holds the bills due from today through the window's last day, and counts the ones to pay by hand", () => {
  const c = plain(S.billCalendar({ today: T, days: 30, bills: [{ name: "Mock Power", amount_cents: 8400, due_on: T }, { name: "Mock Insurance", amount_cents: 14200, due_on: "2026-11-11", autopay: true }, { name: "Mock Rent", amount_cents: 200000, due_on: "2026-11-12" }, { name: "Mock Water", amount_cents: 4000, due_on: "2026-10-11" }] }));
  assert.equal(c.text, "2 bills in the next 30 days, $226.00: 2026-10-12 Mock Power $84.00; 2026-11-11 Mock Insurance $142.00 (autopay). 1 needs a manual payment.");
  assert.deepEqual([c.total_cents, c.manual.map(i => i.name)], [22600, ["Mock Power"]]);
  assert.equal(plain(S.billCalendar({ today: T, bills: [{ name: "Mock Power", amount_cents: 8400, due_on: T }] })).text, "1 bill in the next 30 days, $84.00: 2026-10-12 Mock Power $84.00. 1 needs a manual payment.", "it read \"1 bills ... 1 need a manual payment\"");
});

test("[S22] a bill the person names that is also in their recurring rows is listed once, from what they said, and says the rows show it too", () => {
  // The recurring half needs AgentLedger (57-agent-ledger.js, with 33 and 48 it loads after), loaded here alongside the module.
  const lctx = vm.createContext({});
  vm.runInContext(["33-agent-monitors.js", "48-money-math.js", "57-agent-ledger.js", "63-agent-surfaces.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.S = AgentSurfaces;", lctx);
  const rows = [];
  for (const m of ["07", "08", "09"]) rows.push({ id: `mock-p${m}`, account_id: "mock-chk", posted_at: `2026-${m}-15`, amount: -84, merchant_raw: "MOCK POWER CO" }, { id: `mock-i${m}`, account_id: "mock-chk", posted_at: `2026-${m}-20`, amount: -142, merchant_raw: "MOCK AUTO INSURANCE" });
  const c = plain(lctx.S.billCalendar({ today: T, transactions: rows, days: 30, autopay: ["Mock Auto Insurance"], bills: [{ name: "Mock Power", amount_cents: 9000, due_on: "2026-10-16" }, { name: "Mock Water", amount_cents: 4000, due_on: "2026-10-25" }] }));
  assert.equal(c.text, "3 bills in the next 30 days, $272.00: 2026-10-16 Mock Power $90.00 (as you told me, also in your recurring payments at $84.00); 2026-10-20 Mock Auto Insurance $142.00 (autopay); 2026-10-25 Mock Water $40.00. 2 need a manual payment.",
    "it read \"4 bills ... $356.00: 2026-10-15 Mock Power Co $84.00; 2026-10-16 Mock Power $90.00; ...\", the power bill twice");
  assert.deepEqual(c.items.map(i => [i.name, i.source, i.also_in || null, i.category]), [["Mock Power", "you", "recurring pattern", "utilities"], ["Mock Auto Insurance", "recurring pattern", null, "insurance"], ["Mock Water", "you", null, "bills"]]);
  const auto = plain(lctx.S.billCalendar({ today: T, transactions: rows, days: 30, bills: [{ name: "Mock Auto Insurance", amount_cents: 14200, due_on: "2026-10-20", autopay: true }] }));
  assert.equal(auto.text, "2 bills in the next 30 days, $226.00: 2026-10-15 Mock Power Co $84.00; 2026-10-20 Mock Auto Insurance $142.00 (autopay; as you told me, also in your recurring payments). 1 needs a manual payment.");
  const far = plain(lctx.S.billCalendar({ today: T, transactions: rows, days: 30, bills: [{ name: "Mock Power", amount_cents: 9000, due_on: "2026-10-30" }] }));
  assert.deepEqual(far.items.filter(i => /Mock Power/.test(i.name)).map(i => [i.on, i.source]), [["2026-10-15", "recurring pattern"], ["2026-10-30", "you"]], "15 days apart is not the same bill");
});

test("[S20] every money answer names its source and as-of", () => {
  const card = plain(S.bestCard({ category: "gas", amount_cents: 1000 }, [{ name: "Mock Card", base_bps: 100 }], T));
  const cal = plain(S.billCalendar({ today: T, bills: [] }));
  const side = plain(S.sideIncomeMatch({ gear: ["smartphone"], hours_per_week: 1 }));
  const bon = plain(S.bonusFinder({ today: T, state: "CA" }));
  assert.deepEqual([card.source, card.as_of, cal.source, cal.as_of, cal.text], ["your reward table", T, "your transactions and what you told me", T, "No bills due in the window."]);
  assert.deepEqual([side.as_of, side.source, bon.as_of, bon.source], ["2026-10", "platform terms and payout pages as published; rates are typical ranges, not promises", "2026-10", "bank offer pages as published; terms change monthly, verify before opening"]);
});
