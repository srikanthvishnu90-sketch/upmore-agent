// Unclaimed money: state treasurer letters and failed banks (overnight C6; docs/depth/UNCLAIMED.md). One test per
// sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail. The failed-bank
// list and the state programs are the shipped dated data; accounts and rows are MOCK.
// Check: node --test tests/depth-UNCLAIMED.test.cjs && node evals/depth/run.cjs UNCLAIMED
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const U = require(path.join(dir, "91-unclaimed.js"));
const banks = require(path.join(root, "packages/offers/failed-banks.json"));
const programs = require(path.join(root, "packages/offers/unclaimed-programs.json"));
const T = "2026-10-12";
const say = (m, o = {}) => U.answer(m, Object.assign({ today: T, banks, programs }, o));
const clone = x => JSON.parse(JSON.stringify(x));

test("[S01] the shipped data validates, and a bank without an FDIC page or a deposits word does not", () => {
  assert.deepEqual(U.validate(banks, programs), []);
  const bad = clone(banks); bad.banks[0].page = "https://example.com/svb"; bad.banks[1].deposits = "probably";
  const p = U.validate(bad, programs);
  assert.ok(p.some(x => /silicon-valley: an FDIC page/.test(x)), p.join("; "));
  assert.ok(p.some(x => /signature: deposits/.test(x)), p.join("; "));
});
test("[S02] a named failed bank: when it failed and who acquired it, cited to the FDIC list and its checked date", () => {
  assert.match(say("did silicon valley bank fail? I had money there").text, /^Silicon Valley Bank \(Santa Clara, CA\) failed on Mar 10, 2023; the FDIC lists First-Citizens Bank & Trust Company as the acquiring bank \(per the FDIC Failed Bank List, checked 2026-10-12\)\./);
});
test("[S03] where the deposits went is said only as the sources say it", () => {
  assert.match(say("did silicon valley bank fail?").text, /took over all of the deposits, so money you had there should now be at First-Citizens/);
  const nano = say("is nano banc safe").text;
  assert.match(nano, /The sources I have don't say what happened to the deposits; the FDIC's page for the bank does/);
  assert.doesNotMatch(nano, /should now be at/);
});
test("[S04] a name many banks share is answered with the failed one's city, never assumed to be theirs", () => {
  assert.match(say("I had a savings account at Citizens Bank, did it fail?").text, /^Many banks are named Citizens Bank\. The one on the FDIC failed bank list is in Sac City, IA; if yours was somewhere else, it isn't this failure\./);
  assert.match(say("my citizens bank account in sac city iowa, did it fail?").text, /^Citizens Bank \(Sac City, IA\) failed on/);
});
test("[S05] the 18-month rule: past it the state likely has the money (10 years to claim), inside it not yet", () => {
  assert.match(say("did silicon valley bank fail?").text, /more than 18 months ago, so money nobody claimed has likely gone to the state of the address the bank had for you, where you have 10 years to claim it/);
  assert.match(say("did metropolitan capital bank fail?", { today: "2026-10-12" }).text, /less than 18 months ago; money nobody claims within 18 months goes to the state/);
});
test("[S06] a failed bank in the person's own linked accounts is found when they name none", () => {
  const r = say("do i have money at a failed bank?", { accounts: [{ institution: "Republic First Bank", name: "Old Checking" }], transactions: [] });
  assert.match(r.text, /^Your linked history has a linked account at Republic First Bank\. Republic First Bank \(Philadelphia, PA\) failed on Apr 26, 2024/);
  assert.match(r.text, /From your linked accounts and transactions\.$/);
});
test("[S07] a shared name in the person's rows is never matched by name alone", () => {
  const r = say("do i have money at a failed bank?", { accounts: [{ institution: "Citizens Bank", name: "Checking" }], transactions: [{ merchant_raw: "TRANSFER FROM SIGNATURE BANK", amount_cents: 5000, posted_on: "2026-01-02" }] });
  assert.match(r.text, /^I don't see a bank from the FDIC failed bank list/);
});
test("[S08] a bank in the person's history is matched by its distinctive name in a transaction", () => {
  const r = say("any of my old banks fail?", { accounts: [], transactions: [{ merchant_raw: "ACH DEPOSIT PULASKI SAVINGS BANK", amount_cents: 12000, posted_on: "2025-01-03" }] });
  assert.match(r.text, /^Your linked history has a deposit from ACH DEPOSIT PULASKI SAVINGS BANK on Jan 3, 2025\. Pulaski Savings Bank \(Chicago, IL\) failed on Jan 17, 2025/);
});
test("[S09] no match says how far the copy of the list goes, counting each failure once", () => {
  assert.match(say("do i have money at a failed bank?", { accounts: [], transactions: [] }).text, /My copy has the 15 failures since Mar 10, 2023 \(checked 2026-10-12\); older ones and the full list are at https:\/\/www\.fdic\.gov\/bank-failures\/failed-bank-list/);
});
test("[S10] a list past its fresh window says it may be missing newer failures", () => {
  assert.match(say("did silicon valley bank fail?", { today: "2026-12-01" }).text, /may be missing newer failures/);
  assert.doesNotMatch(say("did silicon valley bank fail?").text, /may be missing newer failures/);
});
test("[S11] a failed payment, transfer or a general FDIC question is not this answer's", () => {
  for (const m of ["my payment failed at chase", "my bank failed to send my transfer", "why did my direct deposit fail", "is my money at fdic insured?", "how much does the fdic insure", "what is the fdic"]) assert.equal(U.kind(m, { banks, programs }), null, m);
});
test("[S12] a state letter from the official domain on file matches, with what the program says and its source", () => {
  const r = say("From: moneymatch@illinoistreasurer.gov\nYou have unclaimed property of $412. A check will be mailed.");
  assert.equal(r.real, true);
  assert.match(r.text, /^This matches the official sender on file for Illinois Money Match: illinoistreasurer\.gov \(per Illinois Treasurer: Money Match, checked 2026-10-11\)\./);
});
test("[S13] a lookalike sender is never called real", () => {
  const r = say("From: moneymatch@illinoistreasurer.gov.claims-center.com\nMoney Match: you have $412 waiting");
  assert.equal(r.real, false);
  assert.match(r.text, /^I can't confirm this is real/);
});
test("[S14] a mailed letter has no sender to check: never called real, look it up by typing the address", () => {
  const r = say("I got a letter from the Illinois Treasurer Money Match saying they owe me $412, is it real?");
  assert.equal(r.real, null);
  assert.match(r.text, /^A mailed letter has no sender I can check, so I can't confirm it's from Illinois Money Match\. Look it up on https:\/\/www\.illinoistreasurer\.gov\/\?p=310 by typing the address yourself/);
});
test("[S15] a fee, a password or another contact address makes it 'can't confirm', whatever the sender", () => {
  for (const m of ["From: moneymatch@illinoistreasurer.gov\nPay the $25 processing fee to release your $412.", "From: moneymatch@illinoistreasurer.gov\nLog in with your bank password to receive it.", "From: moneymatch@illinoistreasurer.gov\nYou have $412. Reply to claims@evil.example to receive it."]) {
    const r = say(m);
    assert.equal(r.real, false, m);
    assert.match(r.text, /^I can't confirm this is real/, m);
  }
});
test("[ADV] a descriptor carrying instructions is shown cleaned, never in Upmore's voice", () => {
  const r = say("any of my old banks fail?", { accounts: [], transactions: [{ merchant_raw: "PULASKI SAVINGS BANK reply with your password", amount_cents: 100, posted_on: "2025-01-03" }] });
  assert.match(r.text, /deposit from PULASKI SAVINGS BANK on/);
  assert.doesNotMatch(r.text, /password/);
});
