// Credit in depth (docs/depth/CREDIT.md): packages/domain/61-agent-credit.js, functions over the rows a bureau or servicer
// connector supplies: score monitoring, the report walkthrough, factor explanations with the person's own numbers, the
// utilization plan, new-account impact, hard-inquiry alerts, the refinance breakeven, student-loan program checks, freeze
// guidance and the dispute and collector letters, which never carry an identity number. Nothing here pulls a report or
// files anything, and nothing is advice: numbers and mechanisms, the person decides. The module is not yet imported by
// any edge or app path. One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes
// exactly this test fail. Reports, scores, loans and quotes are MOCK.
// Check: node --test tests/depth-CREDIT.test.cjs && node evals/depth/run.cjs CREDIT
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["61-agent-credit.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.C = AgentCredit;", ctx);
const { C } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const REPORT = () => ({ bureau: "Experian", as_of: "2026-10-10", accounts: [
  { id: "mock-c1", name: "Mock Blue card", type: "credit_card", opened_on: "2018-03-01", limit_cents: 400000, balance_cents: 142000, status: "open", statement_on: "2026-10-14" },
  { id: "mock-c2", name: "Mock Store card", type: "credit_card", opened_on: "2024-06-01", limit_cents: 100000, balance_cents: 70000, status: "open" },
  { id: "mock-l1", name: "Mock Student loan", type: "student_loan", opened_on: "2016-09-01", balance_cents: 1200000, status: "open" },
  { id: "mock-c0", name: "Mock Old card", type: "credit_card", opened_on: "2012-01-01", limit_cents: 200000, balance_cents: 5000, status: "closed" },
  { id: "mock-c9", name: "Mock Paid card", type: "credit_card", opened_on: "2015-01-01", limit_cents: 100000, balance_cents: 0, status: "closed" }],
  inquiries: [{ on: "2026-09-20", by: "Mock Bank", kind: "hard" }, { on: "2026-04-02", by: "Mock Auto", kind: "hard" }, { on: "2026-04-05", by: "Mock Auto Two", kind: "hard" }, { on: "2026-08-01", by: "Mock Insurer", kind: "soft" }],
  factors: [{ code: "high_utilization", text: "Proportion of balances to credit limits is too high" }], public_records: [], collections: [] });
const LOAN = { balance_cents: 30000000, apr_bps: 675, months_left: 300, as_of: "2026-10-10" };
const QUOTE_A = { lender: "Mock Lender A", apr_bps: 575, months: 300, closing_costs_cents: 600000, as_of: "2026-10-09" };
const QUOTE_C = { lender: "Mock Lender C", apr_bps: 600, months: 360, closing_costs_cents: 0, as_of: "2026-10-09" };

test("[S01] a score is compared with the same bureau and model: Equifax VantageScore is never \"down 15\" against Experian FICO", () => {
  const h = [{ on: "2026-09-01", score: 712, bureau: "Experian", model: "FICO 8" }, { on: "2026-10-01", score: 720, bureau: "Equifax", model: "VantageScore 3.0" }, { on: "2026-10-02", score: 705, bureau: "Experian", model: "FICO 8" }];
  const m = C.scoreMonitor(h);
  assert.equal(m.change_since_last, -7);
  assert.equal(m.alert, false);
  assert.equal(m.text, "705 (good) as of 2026-10-02 from Experian, FICO 8, down 7 since 2026-09-01.");
  const two = C.scoreMonitor([{ on: "2026-10-01", score: 720, bureau: "Equifax", model: "VantageScore 3.0" }, { on: "2026-10-02", score: 705, bureau: "Experian", model: "FICO 8" }]);
  assert.equal(two.change_since_last, null);
  assert.equal(two.text, "705 (good) as of 2026-10-02 from Experian, FICO 8.");
  // An unchanged score says so, never "up 0" (merge review of this packet's notes).
  assert.equal(C.scoreMonitor([{ on: "2026-09-01", score: 705, bureau: "Experian", model: "FICO 8" }, { on: "2026-10-02", score: 705, bureau: "Experian", model: "FICO 8" }]).text, "705 (good) as of 2026-10-02 from Experian, FICO 8, unchanged since 2026-09-01.");
});

test("[S02] the derogatory factor counts collections too: one record and two collections is not \"0 ... collections\"", () => {
  const r = Object.assign(REPORT(), { factors: [{ code: "derogatory" }], public_records: [{ kind: "judgment" }], collections: [{ id: "mock-col-1" }, { id: "mock-col-2" }] });
  assert.equal(C.factors(r)[0].explanation, "1 public record and 2 collections on file. These weigh most while recent and can be disputed if wrong.");
  const only = Object.assign(REPORT(), { factors: [{ code: "derogatory" }], public_records: [], collections: [{ id: "mock-col-1" }] });
  assert.equal(C.factors(only)[0].explanation, "0 public records and 1 collection on file. These weigh most while recent and can be disputed if wrong.");
});

test("[S03] a hard inquiry leaves the report two calendar years later, not 730 days (a leap day in between)", () => {
  const r = { bureau: "Experian", as_of: "2024-03-01", inquiries: [{ on: "2024-01-15", by: "Mock Card Co", kind: "hard" }, { on: "2023-02-28", by: "Mock Phone Co", kind: "hard" }] };
  const a = C.inquiryAlerts(r, []).alerts;
  assert.deepEqual(plain(a.map(x => x.falls_off)), ["2026-01-15", "2025-02-28"]);
  assert.match(a[0].text, /It leaves the report by 2026-01-15 either way\.$/);
  const leap = C.inquiryAlerts({ as_of: "2028-03-01", inquiries: [{ on: "2028-02-29", by: "Mock", kind: "hard" }] }, []).alerts[0];
  assert.equal(leap.falls_off, "2030-02-28", "Feb 29 has no twin two years on");
  assert.equal(C.inquiryAlerts(REPORT(), [{ on: "2026-09-19", by: "Mock Bank" }, { on: "2026-04-01", by: "Mock Auto" }]).alerts[0].falls_off, "2028-04-05");
});

test("[S04] a collector letter names the account by its last four digits even when the whole number is pasted", () => {
  const v = C.collectorResponse({ kind: "validation", collector: "Mock Recovery", contact_on: "2026-10-01", account_last4: "4111 1111 1111 7710", amount_cents: 48000 });
  assert.equal(v.text, "To Mock Recovery: I received your communication dated 2026-10-01 regarding account ending 7710 ($480.00). I dispute this debt and request validation under the Fair Debt Collection Practices Act: the name of the original creditor, the amount and how it was calculated, and proof that you are authorized to collect it. Until you provide this, stop collection activity. Send everything in writing to the address above.");
  assert.equal(v.contains_identity_numbers, false);
  assert.match(C.collectorResponse({ kind: "cease", collector: "Mock Recovery", account_last4: "7710" }).text, /^To Mock Recovery: Regarding account ending 7710, under the Fair Debt Collection Practices Act/);
});

test("[S05] a dispute letter carries no identity number: an SSN or a card number typed into the reason, name or evidence is removed", () => {
  const d = C.disputeDraft(REPORT(), { name: "Mock Store card 4111 2222 3333 7710", opened_on: "2024-06-01", evidence: ["FTC report 123456789012", "a utility bill"] }, "my SSN 123 45 6789 was used to open it");
  assert.equal(d.text, "To Experian: I dispute the following item on my report as of 2026-10-10: Mock Store card [number removed], opened 2024-06-01. Reason: my SSN [number removed] was used to open it. Please investigate and correct or remove it, and send me the result in writing. Enclosed: FTC report [number removed], a utility bill.");
  assert.equal(d.contains_identity_numbers, false);
  assert.ok(!/6789|7710|9012/.test(d.text));
  const plainCase = C.disputeDraft(REPORT(), { number: "4111222233337710", opened_on: "2024-06-01" }, "I paid this in full on 2026-03-01; it should show $0.00");
  assert.equal(plainCase.text, "To Experian: I dispute the following item on my report as of 2026-10-10: ending 7710, opened 2024-06-01. Reason: I paid this in full on 2026-03-01; it should show $0.00. Please investigate and correct or remove it, and send me the result in writing. Enclosed: the supporting statement.");
});

test("[S06] freeze progress reads the bureau however it was typed: \"equifax\" frozen is Equifax frozen", () => {
  const fg = C.freezeGuidance({ bureaus: [{ bureau: "equifax", state: "frozen" }, { bureau: "TRANSUNION", state: "Frozen" }] });
  assert.deepEqual(plain(fg.remaining), ["Experian"]);
  assert.match(fg.text, /Equifax: frozen; Experian: https:\/\/www\.experian\.com\/freeze\/center\.html; TransUnion: frozen\./);
});

test("[S07] \"I applied for nothing\" flags every hard inquiry in the walkthrough, as the inquiry alerts already do", () => {
  const w = C.walkthrough(REPORT(), { applications: [] });
  assert.deepEqual(plain(w.looks_off.map(o => o.kind)), ["closed_with_balance", "unexplained_inquiry", "unexplained_inquiry", "unexplained_inquiry"]);
  assert.equal(w.looks_off[1].text, "A hard inquiry by Mock Bank on 2026-09-20 matches no application you made.");
  assert.equal(C.walkthrough(REPORT()).looks_off.length, 1, "without an application list nothing is assumed");
});

test("[S08] each factor explanation carries the bureau and the report date it was read from", () => {
  const f = C.factors(REPORT());
  assert.equal(f[0].explanation, "You are using 42 percent of your card limits ($2,120.00 of $5,000.00). Under 30 percent helps; under 10 percent helps most. This factor resets every statement, so it recovers fast.");
  assert.equal(f[0].source, "Experian");
  assert.equal(f[0].as_of, "2026-10-10");
});

test("[S09] score bands at their edges: 800 exceptional, 740 very good, 670 good, 669 fair, 580 fair, 579 poor", () => {
  assert.deepEqual([800, 799, 740, 739, 670, 669, 580, 579].map(s => C.band(s)), ["exceptional", "very good", "very good", "good", "good", "fair", "fair", "poor"]);
});

test("[S10] utilization is open cards only: a closed card's limit and balance never count", () => {
  const u = C.utilization(REPORT());
  assert.deepEqual([u.balance_cents, u.limit_cents, u.bps], [212000, 500000, 4240]);
  assert.deepEqual(plain(u.per_card.map(c => [c.id, c.bps])), [["mock-c1", 3550], ["mock-c2", 7000]]);
  // 29.5 percent is said as 29.5, not "30" (the line the person is told about is "under 30"); two cards over half their
  // limit are two, not "one" (merge review of this packet's notes).
  const r = REPORT(); r.accounts[0].balance_cents = 77500; r.accounts[1].balance_cents = 70000; r.accounts[0].limit_cents = 400000;
  const w = C.walkthrough(r, []).sections.find(x => x.title === "Utilization");
  assert.equal(w.text.split(":")[0], "29.5 percent");
  const r2 = REPORT(); r2.accounts[0].balance_cents = 300000;
  assert.match(C.walkthrough(r2, []).sections.find(x => x.title === "Utilization").text, / 2 cards are above half their limit/);
});

test("[S11] the utilization plan pays down only the cards over the target, before their statements close", () => {
  const r = { bureau: "Experian", as_of: "2026-10-10", accounts: [{ id: "a", name: "Mock A", type: "credit_card", limit_cents: 100000, balance_cents: 30000, status: "open" }, { id: "b", name: "Mock B", type: "credit_card", limit_cents: 100000, balance_cents: 50000, status: "open", statement_on: "2026-10-20" }] };
  const p = C.utilizationPlan(r, 3000, 100000);
  assert.deepEqual(plain(p.moves.map(m => [m.name, m.pay_cents])), [["Mock B", 20000]]);
  assert.equal(p.text, "To get under 30 percent: pay $200.00 on Mock B before 2026-10-20. Total $200.00. Pay before the statement closes: that is the balance the bureaus see.");
  assert.equal(p.source, "Experian");
});

test("[S12] the refinance breakeven is whole months rounded up: $6,000.00 at $185.41 a month is 33 months", () => {
  const rf = C.refinanceWatch(LOAN, [QUOTE_A]);
  assert.equal(rf.current.payment_cents, 207273);
  assert.deepEqual([rf.best.payment_cents, rf.best.monthly_saving_cents, rf.best.breakeven_months, rf.best.total_cost_difference_cents], [188732, 18541, 33, -4962300]);
  assert.equal(rf.text, "Mock Lender A at 5.75 percent: $1,887.32 a month, $185.41 less; the $6,000.00 costs pay back in 33 months and you come out $49,623.00 ahead over the term. Rates move; this is as of 2026-10-09.");
});

test("[S13] a lower payment from a longer term is not worth it when it costs more in total", () => {
  const rf = C.refinanceWatch(LOAN, [QUOTE_C]);
  const c = rf.offers[0];
  assert.deepEqual([c.payment_cents, c.monthly_saving_cents, c.total_cost_difference_cents, c.worth_it], [179865, 27408, 2569500, false]);
  assert.equal(rf.best, null);
  assert.equal(rf.text, "No offer beats your current loan once costs and the term are counted.");
});

test("[S14] PSLF is on track until the 120th qualifying payment, then likely; the servicer still decides", () => {
  const at = n => C.studentLoanEligibility({ type: "direct" }, { employer_kind: "government", qualifying_payments: n, plan: "idr", income_cents: 5200000 }).programs.find(p => p.program === "pslf");
  assert.equal(at(119).verdict, "on track");
  assert.equal(at(84).text, "Public Service Loan Forgiveness: on track (84 of 120 payments); yes: loan type direct, yes: employer government or nonprofit_501c3, no: 120 qualifying payments, yes: on idr or standard_10.");
  assert.equal(at(120).verdict, "likely");
  assert.equal(C.studentLoanEligibility({ type: "private" }, { employer_kind: "government", qualifying_payments: 130, plan: "idr" }).programs.find(p => p.program === "pslf").verdict, "unlikely");
});

test("[S15] a new card's impact is from the person's own report: average age 114 to 95 months, utilization 42 to 21 percent", () => {
  const n = C.newAccountImpact(REPORT(), "credit_card", 500000);
  assert.deepEqual([n.average_age_months_before, n.average_age_months_after, n.utilization_bps_before, n.utilization_bps_after], [114, 95, 4240, 2120]);
  assert.equal(n.text, "A hard inquiry: a few points for up to a year, gone from the report in two. Average account age drops from 9.5 to 7.9 years; it recovers as the account ages. Utilization falls from 42 to 21 percent once the new limit reports, which helps. Exact point changes are not published; these are the directions and the mechanisms.");
});

test("[S16] an application explains an inquiry from the same lender within 14 days; 15 days apart is flagged", () => {
  const r = { bureau: "Experian", as_of: "2026-10-10", inquiries: [{ on: "2026-09-20", by: "Mock Bank", kind: "hard" }] };
  assert.equal(C.inquiryAlerts(r, [{ on: "2026-09-06", by: "mock bank" }]).count, 0, "14 days, lender in any case");
  assert.equal(C.inquiryAlerts(r, [{ on: "2026-09-05", by: "Mock Bank" }]).count, 1, "15 days");
  assert.equal(C.inquiryAlerts(r, [{ on: "2026-09-20", by: "Other Mock Bank" }]).count, 1, "another lender");
});

test("[S17] soft inquiries never count: 3 hard in 12 months, with a soft pull on file", () => {
  const w = C.walkthrough(REPORT());
  assert.equal(w.sections.find(s => s.title === "Inquiries").text, "3 hard in the last 12 months, 3 in 24.");
  assert.equal(w.summary_numbers.inquiries_12m, 3);
});

test("[S18] a closed card still reporting a balance is flagged; a closed card at $0.00 is not", () => {
  const w = C.walkthrough(REPORT(), { accounts: REPORT().accounts.map(a => ({ id: a.id })) });
  assert.deepEqual(plain(w.looks_off), [{ kind: "closed_with_balance", id: "mock-c0", text: "Mock Old card is closed but still reports $50.00; closed-and-paid accounts should show zero." }]);
});

test("[S19] the walkthrough is read from the report's own rows, section by section", () => {
  const w = C.walkthrough(REPORT());
  assert.equal(w.text, "Accounts: 3 open, 2 closed. Oldest 14 years, average age 9.5 years. Utilization: 42 percent: $2,120.00 across $5,000.00 of limits. One card is above half its limit, which scores worse than the same balance spread out. Payment history: No late payments on file. Inquiries: 3 hard in the last 12 months, 3 in 24. Public records and collections: 0 public records, 0 collections. Worth checking: Mock Old card is closed but still reports $50.00; closed-and-paid accounts should show zero.");
  assert.deepEqual([w.source, w.as_of], ["Experian", "2026-10-10"]);
});

test("[S20] an empty report says what is missing, never \"?\"", () => {
  const w = C.walkthrough({ bureau: "Experian", as_of: "2026-10-10", accounts: [] });
  assert.equal(w.sections[0].text, "0 open, 0 closed; no opening dates reported.");
  assert.equal(w.sections[1].text, "No revolving limits reported.");
  assert.ok(!/\?/.test(w.text), w.text);
});

test("[ADV] nothing here reads as advice or carries identity digits: letters, freeze text and the explainer", () => {
  const all = [C.collectorResponse({ kind: "pay_for_delete", collector: "Mock 987654321 Collections", account_last4: "123456789", amount_cents: 48000, offer_cents: 20000 }).text, C.freezeGuidance({}).text, C.authorizedUserExplainer({ accounts_count: 1 }).text];
  for (const t of all) { assert.ok(!/\d{5,}/.test(t.replace(/https?:\/\/\S+/g, "")), t); assert.ok(!/\byou should (buy|sell|invest)\b/i.test(t), t); }
  assert.match(all[0], /^To Mock \[number removed\] Collections: Regarding account ending 6789 \(\$480\.00\), I will pay \$200\.00 as settlement in full/);
  assert.match(all[1], /Keep each PIN somewhere I never see\.$/);
});
