// "What's this charge?" (megadoc K01, K02, K05; docs/depth/CHARGE-CHECK.md). One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Rows MOCK.
// Check: node --test tests/depth-CHARGE-CHECK.test.cjs && node evals/depth/run.cjs CHARGE-CHECK
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const C = require(path.join(dir, "102-charge-check.js"));

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00Z");
let i = 0;
const r = (d, c, m, o) => Object.assign({ account_id: "card", provider_transaction_id: `mock-${i++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" }, o);
const AC = [{ account_id: "card", name: "Freedom Flex", institution: "Chase" }];
const TX = [r("2026-10-08", -4723, "SQ *ALLEY CAT COFFEE"), r("2026-09-08", -4723, "SQ *ALLEY CAT COFFEE"), r("2026-10-09", -1299, "ACME INC 800-555-0100"),
  r("2026-10-04", -3500, "CHIPOTLE 1234"), r("2026-10-05", -3500, "CHIPOTLE 1234"), r("2026-10-11", -2200, "TST* BLUE BOTTLE", { is_pending: true })];
const ans = (words, rows = TX, now = NOW) => C.answer(AC, rows, words, now, { tz: TZ });
const first = (t) => t.split("\n")[0];

test("[S01] the charge found by its text and amount: the amount, the day, the card, the bank's own words", () => {
  assert.equal(first(ans("whats this 47.23 charge from SQ *ALLEY")), 'The latest of 2 matching charges: $47.23 on Oct 8 (Chase Freedom Flex), shown by your bank as "Alley Cat Coffee".');
});

test("[S02] the processor in front of the name is explained; the business itself is never looked up or guessed", () => {
  assert.match(ans("whats this 47.23 charge from SQ *ALLEY"), /\nSQ \* means it was paid through Square, a card reader many small businesses use; the name after it is the business's own label, and I can't look up who that is\.\n/);
  assert.match(ans("what is the $22 charge"), /\nTST\* means it was paid through Toast/);
  assert.doesNotMatch(ans("I dont recognize a charge from ACME INC"), /means it was paid through/);
});

test("[S03] earlier charges from the same text, and a monthly repeat said as likely a bill or subscription", () => {
  assert.match(ans("whats this 47.23 charge from SQ *ALLEY"), /\nOne earlier charge came from the same text, the first on Sep 8; it repeats monthly, so it's likely a subscription or bill you pay\.\n/);
  assert.match(ans("I dont recognize a charge from ACME INC"), /\nNo earlier charge in your linked accounts came from the same text\.\n/);
});

test("[S04] a pending charge's hold is explained", () => {
  assert.match(first(ans("what is the $22 charge")), /It's still pending: hotels, gas stations and restaurants often hold a different amount than they finally charge\.$/);
});

test("[S05] charged twice: two of the same amount from the same text within 3 days", () => {
  assert.equal(first(ans("chipotle charged me twice")), "Yes, it looks like a double charge: Chipotle $35.00 on Oct 4 and again on Oct 5.");
  assert.match(ans("this merchant charged me twice"), /^Yes, it looks like a double charge: Chipotle/);
});

test("[S06] one charge is never a double charge; 4 days apart is not within the window", () => {
  assert.match(first(ans("was i double charged at acme")), /^I see one charge from Acme Inc in the last 90 days, but no two of the same amount within 3 days: \$12\.99 on Oct 9\.$/);
  const apart = [r("2026-10-01", -3500, "CHIPOTLE 1234"), r("2026-10-05", -3500, "CHIPOTLE 1234")];
  assert.match(first(ans("chipotle charged me twice", apart)), /^I see 2 charges from Chipotle in the last 90 days, but no two/);
});

test("[S07] different amounts at the same place are not a double charge", () => {
  assert.match(first(ans("chipotle charged me twice", [r("2026-10-04", -3500, "CHIPOTLE 1234"), r("2026-10-05", -1250, "CHIPOTLE 1234")])), /^I see 2 charges/);
});

test("[S08] nothing is disputed or sent; the dispute flow is named", () => {
  assert.match(ans("I dont recognize a charge from ACME INC"), /say "dispute this charge" and I'll draft the dispute for you to file\. Nothing was sent\./);
  assert.match(ans("chipotle charged me twice"), /Ask Chipotle to refund the second one first; if they don't, say "dispute this charge" and I'll draft the dispute for you to file\. Nothing was sent\./);
});

test("[S09] not found: said, with where the newest charges are", () => {
  assert.match(ans("whats this $9.99 charge from zzzflix"), /^I don't see a \$9\.99 charge from "zzzflix" in your linked accounts in the last 90 days\. If it's still pending or on a card that isn't linked, it won't show here yet; your card's app has the newest charges\.\n/);
});

test("[S10] a dispute ask is the dispute answer's; vague and non-charge questions go on", () => {
  for (const m of ["dispute the acme charge", "what is this unauthorized charge from acme", "why did acme charge me, i never authorized it", "i didn't authorize this charge from acme", "unauthorized charge from acme", "what is this charge", "what is my balance", "what is a credit score", "what is netflix", "what is my credit card fee"]) assert.equal(C.ask(m), null, m);
});

test("[S11] the ways people ask", () => {
  const p = (m) => { const q = C.ask(m); return q && [q.term, q.amount_cents, q.twice]; };
  assert.deepEqual(p("whats this 47.23 charge from SQ *ALLEY"), ["SQ *ALLEY", 4723, false]);
  assert.deepEqual(p("I dont recognize a charge from ACME INC"), ["ACME INC", null, false]);
  assert.deepEqual(p("why did acme charge me"), ["acme", null, false]);
  assert.deepEqual(p("i dont know what this 12.99 charge is"), [null, 1299, false]);
  assert.deepEqual(p("was i double charged at acme"), ["acme", null, true]);
});

test("[S12] the amount is matched to the cent", () => {
  assert.match(ans("what is the $35.01 charge"), /^I don't see a \$35\.01 charge/);
  assert.match(ans("what is the $35 charge"), /\$35\.00 on Oct 5/);
});

test("[S13] the text is matched as whole words: ACME does not match ACMEPAY", () => {
  assert.match(ans("I dont recognize a charge from ACME", [r("2026-10-09", -1299, "ACMEPAY SERVICES"), r("2026-09-01", -100, "X")]), /^I don't see a charge from "ACME"/);
});

test("[S14] 90 days back; a credit or a transfer is not a charge", () => {
  assert.match(ans("whats this charge from oldco", [r("2026-07-01", -500, "OLDCO"), r("2026-10-01", -100, "X")]), /^I don't see a charge from "oldco"/);
  assert.match(ans("whats this charge from acme", [r("2026-10-09", 1299, "ACME INC"), r("2026-10-08", -1299, "ACME INC", { is_transfer: true }), r("2026-10-01", -100, "X")]), /^I don't see a charge from "acme"/);
});

test("[S15] every answer ends with the source line; nothing posted is said, never 'not found'", () => {
  for (const m of ["whats this 47.23 charge from SQ *ALLEY", "chipotle charged me twice", "whats this $9.99 charge from zzzflix"]) assert.match(ans(m), /\nFrom your linked accounts, transactions through Oct 9, 2026, as of Oct 12, 8:00 AM EDT\.$/, m);
  assert.match(ans("whats this charge from acme", [r("2026-10-11", -1299, "ACME INC", { is_pending: true })]), /^I don't see any posted transactions in your linked accounts yet/);
});
