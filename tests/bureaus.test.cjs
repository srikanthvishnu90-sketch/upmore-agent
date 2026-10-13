// K9 credit-bureau guided flows (C139 freeze, C140 report dispute, C151 identity theft, C205 minor
// freeze) — packages/domain/118-agent-bureaus.js. The submissions are the person's own taps at each
// bureau; these tests pin the guidance, the honest boundary, the clocks and the never-store-a-PIN rule
// on the original asks and adversarial variants.
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../packages/domain/118-agent-bureaus.js");
const Control = require("../packages/domain/58-agent-control.js");

const TODAY = "2026-10-12";
// Stand-in report (labeled stand-in in the cluster doc): a collections item that is not his.
const REPORT = { bureau: "Experian", as_of: "2026-10-01", collections: [{ name: "Meridian Recovery Services (original creditor: Cascade Store Card)", amount_cents: 41237, opened_on: "2025-11-14" }], accounts: [] };

test("C139 original ask: the three-bureau walkthrough with real links, phones and the boundary", () => {
  const a = B.answer("Freeze my credit. There was a breach at my doctor's office.", { today: TODAY });
  assert.equal(a.kind, "freeze"); assert.equal(a.capability, "C139");
  for (const s of ["https://www.equifax.com/personal/credit-report-services/credit-freeze/", "https://www.experian.com/freeze/center.html", "https://www.transunion.com/credit-freeze", "1-888-298-0045", "1-888-397-3742", "1-800-916-8800"]) assert.ok(a.text.includes(s), s);
  assert.match(a.text, /the identity steps and the final tap at each bureau are yours/);
  assert.match(a.text, /paid lock or monitoring offer/);
  assert.deepEqual(a.remaining, ["Equifax", "Experian", "TransUnion"]);
});

test("C139 follow-ups record progress bureau by bureau, into the vault-shaped store", () => {
  const store = Control.createStore ? Control.createStore() : null;
  let state = { bureaus: [] };
  let a = B.answer("Equifax is frozen", { today: TODAY, freeze_state: state });
  assert.equal(a.kind, "freeze_record");
  assert.deepEqual(a.records.map(r => r.bureau), ["Equifax"]);
  assert.match(a.text, /Experian, TransUnion to go/);
  state = { bureaus: a.records };
  a = B.answer("experian done too, and I froze transunion", { today: TODAY, freeze_state: state });
  assert.equal(a.records.length, 2);
  const all = { bureaus: [{ bureau: "Equifax", state: "frozen" }, { bureau: "Experian", state: "frozen" }, { bureau: "TransUnion", state: "frozen" }] };
  const done = B.answer("all three are frozen", { today: TODAY, freeze_state: all });
  assert.match(done.text, /That is all three/);
  if (store && store.freezes) { const f = store.freezes.record("Equifax", "frozen", TODAY, "in my password manager"); assert.equal(f.state, "frozen"); assert.equal(store.freezes.status().all_frozen, false); }
});

test("C139 adversarial: failures and plans are not recorded as frozen", () => {
  for (const msg of ["Equifax failed to freeze, it locked me out", "I couldn't freeze Experian", "Equifax froze my account by mistake", "I will freeze TransUnion tomorrow", "trying to freeze experian now"]) {
    const a = B.answer(msg, { today: TODAY });
    assert.ok(!a || a.kind !== "freeze_record", msg + " -> " + (a && a.kind));
  }
});

test("C139 adversarial: card freezes, information questions and PIN pastes never enter the flow", () => {
  assert.equal(B.answer("freeze my card", { today: TODAY }), null);
  assert.equal(B.answer("freeze my credit card", { today: TODAY }), null);
  assert.equal(B.answer("what is a credit freeze", { today: TODAY }), null);
  assert.equal(B.answer("does a credit freeze hurt my score", { today: TODAY }), null);
  const pin = B.answer("Equifax is frozen, my PIN is 482916", { today: TODAY });
  assert.equal(pin.kind, "secret_refused");
  assert.ok(!pin.text.includes("482916"), "the PIN must never be echoed");
  const ssn = B.answer("freeze my credit, my SSN is 123-45-6789", { today: TODAY });
  assert.equal(ssn.kind, "secret_refused");
  assert.ok(!ssn.text.includes("123-45-6789") && !ssn.text.includes("123"), "no identity digits echoed");
  assert.throws(() => B.freezeRecord("Equifax", TODAY, null, "482916"), /Never store a freeze PIN/);
  const rec = B.freezeRecord("equifax", TODAY, "web confirmation", "in 1Password");
  assert.equal(rec.bureau, "Equifax"); assert.equal(rec.pin_location_hint, "in 1Password");
});

test("C139 thaw: timing and per-bureau steps", () => {
  const a = B.answer("unfreeze my credit temporarily, I am applying for an apartment", { today: TODAY, freeze_state: { bureaus: [{ bureau: "Equifax", state: "frozen" }, { bureau: "Experian", state: "frozen" }, { bureau: "TransUnion", state: "frozen" }] } });
  assert.equal(a.kind, "thaw");
  assert.match(a.text, /within one hour/);
  assert.match(a.text, /all three frozen/);
});

test("C140 original ask with no report connected: honest pull-first reply, no packet invented", () => {
  const a = B.answer("There's a collections account on my report that isn't mine.", { today: TODAY });
  assert.equal(a.kind, "dispute"); assert.equal(a.capability, "C140");
  assert.match(a.text, /annualcreditreport\.com/);
  assert.match(a.text, /do not send any account or identity number/);
});

test("C140 packet from a stand-in report: error documented in dollars, letter clean, channels and clock", () => {
  const a = B.answer("There's a collections account on my report that isn't mine.", { today: TODAY, report: REPORT, dispute_item: REPORT.collections[0], dispute_reason: "This account is not mine; I did not open it and I do not owe it." });
  assert.match(a.text, /\$412\.37/);
  assert.match(a.text, /Meridian Recovery Services/);
  assert.match(a.text, /opened 2025-11-14/);
  assert.match(a.text, /about 30 days to investigate/);
  assert.match(a.text, /consumerfinance\.gov\/complaint/);
  assert.equal(a.contains_identity_numbers, false);
  const letter = B.disputeLetter(REPORT, REPORT.collections[0], "not mine, SSN 123-45-6789 was used");
  assert.equal(letter.contains_identity_numbers, false);
  assert.ok(!letter.text.includes("123-45-6789"));
});

test("C140 clock: 30 days computed exactly, due-soon and overdue escalate (Muse parity, hand-computed)", () => {
  // Filed 2026-09-12 -> 30 days is 2026-10-12 (today): due today.
  const due = B.disputeClock("2026-09-12", "2026-10-12");
  assert.equal(due.due_on, "2026-10-12"); assert.equal(due.days_left, 0); assert.equal(due.status, "due_soon");
  // Filed 2026-10-02 -> due 2026-11-01, 20 days left.
  const open = B.disputeClock("2026-10-02", "2026-10-12");
  assert.equal(open.due_on, "2026-11-01"); assert.equal(open.days_left, 20); assert.equal(open.status, "investigating");
  // Filed 2026-08-20 -> due 2026-09-19, 23 days overdue.
  const over = B.disputeClock("2026-08-20", "2026-10-12");
  assert.equal(over.due_on, "2026-09-19"); assert.equal(over.days_left, -23); assert.equal(over.status, "overdue");
  assert.match(over.text, /escalation time/);
  // Chat follow-ups.
  const filed = B.answer("I filed the dispute today", { today: TODAY });
  assert.equal(filed.kind, "dispute_clock"); assert.match(filed.text, /Nov 11, 2026/);
  const late = B.answer("it's been weeks, the collections is still on my report", { today: TODAY, dispute_filed_on: "2026-08-20" });
  assert.equal(late.kind, "dispute_clock"); assert.equal(late.clock.status, "overdue");
  const gone = B.answer("the collections is gone from my report", { today: TODAY });
  assert.equal(gone.kind, "dispute_outcome"); assert.match(gone.text, /verified correction/);
});

test("C151 original ask: FTC first, one-bureau alert rule, freeze, issuer disputes, verification", () => {
  const fraud = [{ name: "Cascade Store Card", amount_cents: 118742, opened_on: "2026-09-28" }];
  const a = B.answer("Someone opened a card in my name. Fix my identity.", { today: TODAY, fraud_accounts: fraud });
  assert.equal(a.kind, "identity_theft"); assert.equal(a.capability, "C151");
  assert.match(a.text, /identitytheft\.gov/);
  assert.match(a.text, /Identity Theft Report/);
  assert.match(a.text, /call ONE bureau/);
  assert.match(a.text, /must pass the alert to the other two/);
  assert.match(a.text, /one year/); assert.match(a.text, /seven years/);
  assert.match(a.text, /\$1,187\.42/);
  assert.equal(a.fraudulent_total_cents, 118742);
  assert.match(a.text, /annualcreditreport\.com/);
  assert.ok(a.text.indexOf("identitytheft.gov") < a.text.indexOf("Fraud alerts"), "FTC before alerts");
});

test("C205 original ask: mail-based protected-consumer process, documents, addresses, milestones", () => {
  const a = B.answer("Freeze my child's credit before someone abuses it.", { today: TODAY, minor: { first_name: "Alex" } });
  assert.equal(a.kind, "minor_freeze"); assert.equal(a.capability, "C205");
  assert.match(a.text, /protected consumer freeze/);
  assert.match(a.text, /under 16/);
  assert.match(a.text, /birth certificate/);
  assert.match(a.text, /Social Security card/);
  assert.match(a.text, /P\.O\. Box 105788, Atlanta, GA 30348-5788/);
  assert.match(a.text, /P\.O\. Box 9554, Allen, TX 75013/);
  assert.match(a.text, /P\.O\. Box 380, Woodlyn, PA 19094/);
  assert.match(a.text, /creates one and freezes it/);
  assert.match(a.text, /at 16/); assert.match(a.text, /at 18/);
  assert.match(a.text, /Never send me the Social Security number/);
  assert.deepEqual(a.remaining, ["Equifax", "Experian", "TransUnion"]);
});

test("routing hygiene: bureau flows never steal bank-charge disputes or money asks", () => {
  for (const msg of ["dispute this charge", "chargeback the uber ride", "wrong charge at trader joes", "how much did I spend in september", "cancel netflix", "what is my credit score", "pay my credit card"]) {
    assert.equal(B.answer(msg, { today: TODAY }), null, msg);
  }
});

test("C151 follow-ups: FTC filed and alert set are recorded with the next step named", () => {
  const ftc = B.answer("The FTC report is filed", { today: TODAY });
  assert.equal(ftc.kind, "identity_theft_step"); assert.equal(ftc.step, "ftc_filed");
  assert.match(ftc.text, /extended alert/);
  const alert = B.answer("fraud alert is set at all three", { today: TODAY });
  assert.equal(alert.step, "alert_set");
  assert.match(alert.text, /freeze all three reports/);
});

test("C205 follow-up: a bureau confirmation records against the child's case", () => {
  const a = B.answer("Equifax confirmed the freeze for Alex", { today: TODAY, minor: { first_name: "Alex" }, minor_state: { bureaus: [] } });
  assert.equal(a.kind, "minor_freeze_record"); assert.equal(a.capability, "C205");
  assert.deepEqual(a.records.map(r => r.bureau), ["Equifax"]);
  assert.match(a.text, /TransUnion: complete a letter/);
  assert.match(a.text, /Equifax — confirmation recorded/);
});

test("C205 adversarial: a 16/17-year-old is routed to the direct freeze, under-16 stays mail", () => {
  const teen = B.minorFreezePlan({ first_name: "Sam", age: 17 }, { bureaus: [] });
  assert.match(teen.text, /places the freeze directly/);
  const young = B.minorFreezePlan({ first_name: "Sam", age: 9 }, { bureaus: [] });
  assert.match(young.text, /protected consumer freeze/);
});
