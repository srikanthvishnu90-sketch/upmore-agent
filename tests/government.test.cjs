// Cluster K11 — government preparation (C119, C120, C160, C162, C166) over
// packages/domain/118-agent-government.js and the dated official data in packages/offers/government.json.
// Muse-parity: every dollar figure is recomputed here from the raw inputs by independent arithmetic
// (written out longhand) and compared to the cent. Adversarial variants sit next to the original cases.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const G = require("../packages/domain/118-agent-government.js");
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "../packages/offers/government.json"), "utf8"));

const TODAY = "2026-10-12";
const money = c => { const v = Math.round(c); const a = Math.abs(v); return `${v < 0 ? "-" : ""}$${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`; };

test("the dated government data validates", () => {
  assert.deepEqual(G.validate(DATA), []);
});

test("routing: the five asks, and the near-misses that must not route", () => {
  assert.equal(G.kind("My assessment jumped 20%. Appeal it."), "property_appeal");
  assert.equal(G.kind("Am I getting the homestead exemption? File it if not."), "homestead");
  assert.equal(G.kind("The IRS sent me a letter. What do I do?"), "irs_notice");
  assert.equal(G.kind("I got a CP2000 notice dated October 2, 2026 saying I owe $1,240"), "irs_notice");
  assert.equal(G.kind("Where's my tax refund?"), "refund_track");
  assert.equal(G.kind("I have a foreign account - handle the reporting."), "fbar");
  assert.equal(G.kind("do I need to file an FBAR?"), "fbar");
  // Near misses: merchant refunds and unrelated asks stay out.
  assert.equal(G.kind("where's my refund from REI?"), null);
  assert.equal(G.kind("did my refund from Amazon land?"), null);
  assert.equal(G.kind("what's my checking balance"), null);
  assert.equal(G.kind(""), null);
});

// ---- C119 ----
const APPEAL_CTX = {
  today: TODAY, data: DATA, county_id: "cook-il",
  property: { assessed_cents: 5200000, prior_assessed_cents: 4333300, notice_date: "2026-09-28", equalizer: "2.9237", tax_rate: "0.0693" },
  comps: [
    { address: "a similar home two doors down", assessed_cents: 4480000 },
    { address: "a similar home across the street", assessed_cents: 4620000 },
    { address: "a similar home on the next block", assessed_cents: 4550000 },
    { address: "a similar home around the corner", assessed_cents: 4710000 },
  ],
};
test("C119 original: comps packet, deadline and savings to the cent (Muse-parity)", () => {
  const out = G.propertyAppeal("My assessment jumped 20%. Appeal it.", APPEAL_CTX);
  // Independent parity math: median of 4,480,000 / 4,550,000 / 4,620,000 / 4,710,000 cents.
  const median = (4550000 + 4620000) / 2;
  assert.equal(out.median_comp_cents, median);
  const reductionAv = 5200000 - median; // 615,000 cents = $6,150.00
  const reductionEav = Math.floor((reductionAv * 29237 + 5000) / 10000); // x2.9237
  const savings = Math.floor((reductionEav * 693 + 5000) / 10000); // x0.0693
  assert.equal(out.savings_cents_per_year, savings);
  assert.equal(savings, 124607, "parity anchor: $1,246.07 a year");
  assert.match(out.text, /worth about \$1,246\.07 a year/);
  assert.match(out.text, /median assessed value is \$45,850\.00/);
  assert.match(out.text, /20\.0%|20%/);
  // Deadline: notice Sep 28, 2026 + 30 days = Oct 28, 2026, 16 days from Oct 12.
  assert.match(out.text, /due Wednesday October 28, 2026 — 16 days from today/);
  assert.match(out.text, /you submit it yourself/);
});

test("C119 adversarial: assessed at or below the comps' median — no invented case", () => {
  const ctx = { ...APPEAL_CTX, property: { ...APPEAL_CTX.property, assessed_cents: 4500000 } };
  const out = G.propertyAppeal("appeal my assessment", ctx);
  assert.equal(out.savings_cents_per_year, null);
  assert.match(out.text, /at or below the comps' median/);
  assert.doesNotMatch(out.text, /worth about/);
});

test("C119 adversarial: deadline already passed — Board of Review named as the next route", () => {
  const ctx = { ...APPEAL_CTX, property: { ...APPEAL_CTX.property, notice_date: "2026-08-01" } };
  const out = G.propertyAppeal("appeal my assessment", ctx);
  assert.match(out.text, /that date has passed; the Board of Review window/);
});

test("C119 adversarial: no figures on file — asks for them, computes nothing", () => {
  const out = G.propertyAppeal("appeal my assessment", { today: TODAY, data: DATA });
  assert.equal(out.ready, false);
  assert.doesNotMatch(out.text, /worth about \$/);
});

// ---- C120 ----
test("C120 original: eligible in Cook County, $693.00 a year to the cent (Muse-parity)", () => {
  const ctx = { today: TODAY, data: DATA, county_id: "cook-il", property: { tax_rate: "0.0693" },
    facts: { owns_or_responsible: true, primary_residence_jan1: true, not_already_on_record: true } };
  const out = G.homestead("Am I getting the homestead exemption? File it if not.", ctx);
  assert.equal(out.eligible, true);
  // Parity: $10,000 EAV x 0.0693 = $693.00.
  assert.equal(10000 * 0.0693, 693);
  assert.match(out.text, /worth \$693\.00 a year/);
  assert.match(out.text, /Met: you own the property/);
  assert.match(out.text, /you submit it yourself/);
});

test("C120 adversarial: a renter whose lease does not make him pay the taxes — not eligible, and why", () => {
  const ctx = { today: TODAY, data: DATA, county_id: "cook-il", facts: { owns_or_responsible: false, primary_residence_jan1: true, not_already_on_record: true } };
  const out = G.homestead("file my homestead exemption", ctx);
  assert.equal(out.eligible, false);
  assert.match(out.text, /do not qualify yet/);
});

test("C120 adversarial: already on the record — nothing to file", () => {
  const ctx = { today: TODAY, data: DATA, county_id: "cook-il", facts: { owns_or_responsible: true, primary_residence_jan1: true, not_already_on_record: false, already_receiving: true } };
  const out = G.homestead("file my homestead exemption", ctx);
  assert.match(out.text, /already shows the Homeowner Exemption/);
  assert.doesNotMatch(out.text, /worth \$693/);
});

test("C120 adversarial: unknown fact — the check refuses to guess", () => {
  const ctx = { today: TODAY, data: DATA, county_id: "cook-il", facts: { owns_or_responsible: true, primary_residence_jan1: null, not_already_on_record: true } };
  const out = G.homestead("file my homestead exemption", ctx);
  assert.equal(out.ready, false);
  assert.match(out.text, /can't finish the check/);
});

test("C120 variant: non-Cook Illinois county uses the $6,000 EAV on file", () => {
  const ctx = { today: TODAY, data: DATA, county_id: "illinois-general", property: { tax_rate: "0.0693" },
    facts: { owns_or_responsible: true, primary_residence_jan1: true, not_already_on_record: true } };
  const out = G.homestead("file my homestead exemption", ctx);
  assert.match(out.text, /reduces your equalized assessed value by \$6,000\.00/);
  assert.match(out.text, /worth \$415\.80 a year/); // 6000 x 0.0693 = 415.80
});

// ---- C160 ----
test("C160 original: CP2000 decoded, deadline Nov 1 2026, disagree draft (Muse-parity on the clock)", () => {
  const out = G.irsNotice("I got a CP2000 notice dated October 2, 2026 saying I owe $1,240. What do I do?",
    { today: TODAY, data: DATA, position: "disagree", tax_year: 2025 });
  assert.equal(out.code, "CP2000");
  assert.equal(out.deadline, "2026-11-01"); // Oct 2 + 30 days
  assert.equal(out.days_left, 20);
  assert.match(out.text, /This is not an audit and not a bill yet/);
  assert.match(out.text, /respond by Sunday November 1, 2026 — 20 days from today/);
  assert.match(out.text, /I do not agree with the proposed amount of \$1,240\.00/);
  assert.match(out.text, /you review, sign and send it yourself/);
  assert.equal(out.escalate, false);
});

test("C160 adversarial: LT11 levy notice escalates and carries the CDP right", () => {
  const out = G.irsNotice("I got an LT11 dated September 20, 2026 for $8,300",
    { today: TODAY, data: DATA });
  assert.equal(out.code, "LT11");
  assert.equal(out.deadline, "2026-10-20"); // Sep 20 + 30
  assert.equal(out.escalate, true);
  assert.match(out.text, /Collection Due Process \(CDP\) hearing/);
  assert.match(out.text, /tax professional/);
});

test("C160 adversarial: a code not on file is never decoded from a guess", () => {
  const out = G.irsNotice("I got a CP9999 notice, what is it?", { today: TODAY, data: DATA });
  assert.equal(out.unknown_code, "CP9999");
  assert.match(out.text, /don't have notice CP9999 on file, so I won't guess/);
});

test("C160 adversarial: past the deadline — respond immediately, rights said honestly", () => {
  const out = G.irsNotice("CP2000 dated August 1, 2026, $500", { today: TODAY, data: DATA });
  assert.ok(out.days_left < 0);
  assert.match(out.text, /that date has passed\. Respond immediately anyway/);
});

test("C160 adversarial: a large CP14 balance escalates on amount alone", () => {
  const out = G.irsNotice("CP14 dated October 5, 2026, $25,000", { today: TODAY, data: DATA });
  assert.equal(out.code, "CP14");
  assert.equal(out.escalate, true);
  assert.match(out.text, /the amount is large/);
});

// ---- C162 ----
test("C162 original: sent, and the deposit is detected in his own transactions to the cent", () => {
  const ctx = { today: TODAY, data: DATA, refund: { jurisdiction: "federal", amount_cents: 324000, stage: "sent", as_of: "2026-03-02" },
    transactions: [{ merchant_raw: "IRS TREAS 310 TAX REF", amount_cents: 324000, posted_on: "2026-03-04" }] };
  const out = G.refundTrack("Where's my tax refund?", ctx);
  assert.equal(out.landed, true);
  assert.match(out.text, /It has landed: \$3,240\.00 posted to your account on Mar 4, 2026/);
});

test("C162 adversarial: sent but a same-amount merchant credit is NOT the IRS deposit", () => {
  const ctx = { today: TODAY, data: DATA, refund: { jurisdiction: "federal", amount_cents: 324000, stage: "sent", as_of: "2026-03-02" },
    transactions: [{ merchant_raw: "AMAZON MARKETPLACE REFUND", amount_cents: 324000, posted_on: "2026-03-04" }] };
  const out = G.refundTrack("Where's my tax refund?", ctx);
  assert.equal(out.landed, false);
  assert.match(out.text, /not yet in your transactions/);
});

test("C162 variant: received with EITC — the PATH Act hold is stated", () => {
  const ctx = { today: TODAY, data: DATA, refund: { jurisdiction: "federal", amount_cents: 180000, stage: "received", filed_date: "2027-01-30", claims_eitc_actc: true, as_of: "2027-02-01" } };
  const out = G.refundTrack("track my tax refund", ctx);
  assert.match(out.text, /cannot issue a refund before mid-February/);
  assert.match(out.text, /Return received/);
});

test("C162 adversarial: no status on file — SSN never asked for in chat", () => {
  const out = G.refundTrack("Where's my tax refund?", { today: TODAY, data: DATA });
  assert.equal(out.ready, false);
  assert.match(out.text, /never into this chat/);
});

// ---- C166 ----
test("C166 original: aggregate maxima $11,430.50 exceed $10,000 — filing required, packet and clock (Muse-parity)", () => {
  const ctx = { today: TODAY, data: DATA, report_year: 2025, foreign_accounts: [
    { name: "HDFC Bank savings (India)", max_balance_cents: 725000 },
    { name: "TD chequing (Canada)", max_balance_cents: 418050 },
  ] };
  const out = G.fbar("I have a foreign account - handle the reporting.", ctx);
  // Parity: 725,000 + 418,050 = 1,143,050 cents.
  assert.equal(out.aggregate_cents, 1143050);
  assert.equal(out.required, true);
  assert.match(out.text, /Aggregate maximum: \$11,430\.50/);
  assert.match(out.text, /last day is Thursday October 15, 2026 — 3 days from today/);
  assert.match(out.text, /BSA E-Filing/);
  assert.match(out.text, /you submit it yourself/);
});

test("C166 adversarial: aggregate exactly $10,000.00 does NOT trigger filing (exceeds, not reaches)", () => {
  const ctx = { today: TODAY, data: DATA, report_year: 2025, foreign_accounts: [
    { name: "Account A", max_balance_cents: 600000 }, { name: "Account B", max_balance_cents: 400000 } ] };
  const out = G.fbar("do I need to file an FBAR?", ctx);
  assert.equal(out.aggregate_cents, 1000000);
  assert.equal(out.required, false);
  assert.match(out.text, /does not exceed/);
});

test("C166 adversarial: one cent over — $10,000.01 — triggers it; one cent under does not", () => {
  const over = G.fbar("FBAR?", { today: TODAY, data: DATA, report_year: 2025, foreign_accounts: [{ name: "A", max_balance_cents: 1000001 }] });
  assert.equal(over.required, true);
  const under = G.fbar("FBAR?", { today: TODAY, data: DATA, report_year: 2025, foreign_accounts: [{ name: "A", max_balance_cents: 999999 }] });
  assert.equal(under.required, false);
});

test("C166 variant: balances stated in the message itself are used, each $ figure one account maximum", () => {
  const out = G.fbar("I have $7,250 in an account in India and $4,180.50 in Canada — do I need an FBAR?", { today: TODAY, data: DATA, report_year: 2025 });
  assert.equal(out.aggregate_cents, 1143050);
  assert.equal(out.required, true);
});

test("C166 adversarial: no balances anywhere — asks, computes nothing", () => {
  const out = G.fbar("handle my FBAR", { today: TODAY, data: DATA });
  assert.equal(out.ready, false);
  assert.doesNotMatch(out.text, /Aggregate maximum/);
});
