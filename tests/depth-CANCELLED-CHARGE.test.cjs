// "I got charged for something I cancelled" (megadoc J08; docs/depth/CANCELLED-CHARGE.md). One test per
// sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Rows MOCK.
// Check: node --test tests/depth-CANCELLED-CHARGE.test.cjs && node evals/depth/run.cjs CANCELLED-CHARGE
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const C = require(path.join(dir, "104-cancelled-charge.js"));

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00Z");
let i = 0;
const r = (d, c, m, o) => Object.assign({ account_id: "card", provider_transaction_id: `mock-${i++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" }, o);
const TX = [r("2026-08-05", -1549, "NETFLIX.COM"), r("2026-09-05", -1549, "NETFLIX.COM"), r("2026-10-05", -1549, "NETFLIX.COM"), r("2026-08-22", -1799, "HULU 877-8244858"), r("2026-09-22", -1799, "HULU 877-8244858"), r("2026-10-09", -1000, "X")];
// Cancelled by the cancel flow at 10 p.m. Sep 20 in New York (Sep 21 in UTC): the merchant's own record.
const NF = { merchant: "NETFLIX.COM", name: "Netflix", state: "cancelled", cancelled_at: Date.parse("2026-09-21T02:00:00Z"), reference: "NF-88A" };
const ans = (message, o) => C.answer(Object.assign({ message, now: NOW, tz: TZ, transactions: TX, cancellations: [NF] }, o));
const first = (t) => t.split("\n")[0];
const SRC = "From your linked accounts, transactions through Oct 9, 2026, as of Oct 12, 8:00 AM EDT.";

test("[S01] from the cancel flow's own record: the charge after it, to the cent, with the merchant's confirmation", () => {
  assert.equal(first(ans("netflix charged me after i cancelled")), "Yes: Netflix charged you $15.49 on Oct 5, after you cancelled on Sep 20 (Netflix's own record when I cancelled it for you, confirmation NF-88A).");
});

test("[S02] from the day the person says: 'on Sep 20', '9/20'; a day not yet come this year is last year's", () => {
  assert.equal(first(ans("i cancelled hulu on sep 10 but they still charged me")), "Yes: Hulu charged you $17.99 on Sep 22, after you cancelled on Sep 10 (the day you gave).");
  assert.equal(first(ans("i cancelled hulu on 9/10 and still got charged")), "Yes: Hulu charged you $17.99 on Sep 22, after you cancelled on Sep 10 (the day you gave).");
  assert.deepEqual(C.dateIn("i cancelled hulu on dec 20", "2026-10-12"), { date: "2025-12-20", said: "Dec 20, 2025" });
});

test("[S03] a month said is the whole month: only charges after its last day count", () => {
  assert.equal(first(ans("why is hulu still charging me? i cancelled in august")), "Yes: Hulu charged you $17.99 on Sep 22, after you cancelled in August (the month you gave).");
  assert.match(ans("i cancelled hulu in september and still got charged"), /^I don't see a charge from Hulu after you cancelled in September/);
});

test("[S04] a charge within 2 days of the cancel may predate it: said, never called a yes", () => {
  const t = ans("i cancelled hulu on sep 20 but they still charged me");
  assert.equal(first(t), "Hulu charged you $17.99 on Sep 22, after you cancelled on Sep 20 (the day you gave).");
  assert.match(t, /\nIt posted within 2 days of the cancel, so it may have been made before you cancelled: banks post charges a day or two late\. Check its date against Hulu's cancellation email\.\n/);
  assert.match(first(ans("i cancelled hulu on sep 19 but they still charged me")), /^Yes: Hulu charged you \$17\.99 on Sep 22,/, "3 days after is after");
  assert.match(first(ans("i cancelled hulu on sep 19 but they still charged me", { transactions: TX.concat([r("2026-10-08", -1799, "HULU 877-8244858")]) })), /^Yes: Hulu charged you 2 times, \$17\.99 on Sep 22 and \$17\.99 on Oct 8,/);
});

test("[S05] nothing after the cancel is said, with a watch offered; a pending one is said as pending", () => {
  const t = ans("i cancelled spotify last month and they charged me again", { transactions: TX.concat([r("2026-10-11", -1199, "SPOTIFY USA", { is_pending: true })]) });
  assert.equal(t, `I don't see a charge from Spotify after you cancelled last month (the month you gave). There is a pending charge from Spotify: $11.99; pending charges can still change or drop off.\nIf you see one in your card's app that isn't here yet, it may not have reached your linked accounts. Say "tell me when Spotify charges me" and I'll watch for it.\n${SRC}`);
});

test("[S06] no cancel day on file or said: the last 90 days of charges listed and the day asked, never assumed", () => {
  assert.equal(ans("i cancelled hulu but got charged"), `Your charges from Hulu in the last 90 days: $17.99 on Sep 22, $17.99 on Aug 22.\nWhen did you cancel? Say it like "I cancelled Hulu on Sep 20", or check the date on Hulu's cancellation email, and I'll tell you which of these came after it.\n${SRC}`);
});

test("[S07] a cancel the merchant never confirmed is never called cancelled", () => {
  const t = ans("netflix charged me after i cancelled", { cancellations: [{ merchant: "NETFLIX.COM", name: "Netflix", state: "not_confirmed", cancelled_at: null }] });
  assert.match(t, /^I tried to cancel Netflix for you, but Netflix's record never said cancelled \(it reads not confirmed\), so I can't call it cancelled\.\nYour charges from Netflix in the last 90 days: \$15\.49 on Oct 5, \$15\.49 on Sep 5, \$15\.49 on Aug 5\.\n/);
  assert.doesNotMatch(t, /^Yes/);
});

test("[S08] which service: none named and one cancelled with Upmore is that one; two are asked; unreadable records are said", () => {
  assert.match(first(ans("I got charged for something I cancelled")), /^Yes: Netflix charged you \$15\.49 on Oct 5/);
  const two = [NF, { merchant: "HULU", name: "Hulu", state: "verified", cancelled_at: Date.parse("2026-09-01T16:00:00Z") }];
  assert.equal(ans("I got charged for something I cancelled", { cancellations: two }), "You've cancelled Netflix, Hulu with me. Which service charged you after you cancelled? Say it like \"I cancelled Hulu on Sep 20 and still got charged\", and I'll check your charges from it.");
  assert.match(ans("I got charged for something I cancelled", { cancellations: null }), /^I can't read the cancellations I've done for you right now, and you didn't say which service\./);
});

test("[S09] the merchant is asked first in a draft the person sends; the dispute flow is named; nothing is sent", () => {
  const t = ans("netflix charged me after i cancelled");
  assert.match(t, /\nAsk Netflix for the money back first\. A message you can send them:\n"Hi, I cancelled my Netflix subscription on Sep 20 \(confirmation NF-88A\), but I was charged \$15\.49 on Oct 5\. Please refund this charge to my card and confirm my account is closed\."\nIf Netflix won't refund it, say "dispute this charge" and I'll draft the dispute for your card company\. Nothing was sent\.\n/);
});

test("[S10] the name is whole words: Hulu is not HULULAND; run-together words still match", () => {
  assert.match(ans("i cancelled hulu on sep 1 and still got charged", { transactions: [r("2026-10-01", -900, "HULULAND ARCADE"), r("2026-10-02", -100, "X")] }), /^I don't see a charge from Hulu after/);
  assert.match(first(ans("i cancelled planet fitness on sep 1 and still got charged", { transactions: [r("2026-10-01", -2499, "PLANETFITNESS 123"), r("2026-10-02", -100, "X")] })), /^Yes: Planet Fitness charged you \$24\.99 on Oct 1/);
});

test("[S11] the ways people say it; a dispute, how to cancel, a trial, a win-back offer and a plain charge are not this", () => {
  const n = (m) => { const q = C.ask(m); return q && q.name; };
  assert.equal(n("netflix charged me after i cancelled"), "netflix");
  assert.equal(n("still being billed for planet fitness even though i cancelled"), "planet fitness");
  assert.equal(n("i cancelled my spotify subscription last month and they charged me again"), "spotify");
  assert.equal(n("why is hulu still charging me? i cancelled in august"), "hulu");
  assert.equal(n("I got charged for something I cancelled"), null);
  assert.ok(C.ask("I got charged for something I cancelled"));
  for (const m of ["dispute the netflix charge i cancelled", "how do i cancel netflix", "my trial was cancelled but they charged me", "netflix sent a come back offer after i cancelled, charged 6.99", "netflix charged me twice", "cancel netflix", "i cancelled netflix"]) assert.equal(C.ask(m), null, m);
});

test("[S12] the cancel day is the person's own day: 10 p.m. Sep 20 in New York is Sep 20, not UTC's Sep 21", () => {
  const t = ans("netflix charged me after i cancelled", { transactions: [r("2026-09-21", -1549, "NETFLIX.COM"), r("2026-10-01", -100, "X")] });
  assert.match(first(t), /^Netflix charged you \$15\.49 on Sep 21, after you cancelled on Sep 20/);
});

test("[S13] a credit, a transfer or another currency is not a charge", () => {
  const rows = [r("2026-10-05", 1549, "NETFLIX.COM"), r("2026-10-06", -1549, "NETFLIX.COM", { is_transfer: true }), r("2026-10-07", -1549, "NETFLIX.COM", { currency: "EUR" }), r("2026-10-08", -100, "X")];
  assert.match(ans("netflix charged me after i cancelled", { transactions: rows }), /^I don't see a charge from Netflix after you cancelled on Sep 20/);
});

test("[S14] 'two weeks ago' is counted back exactly, with slack in which a charge is said as maybe before, never a yes", () => {
  assert.equal(C.dateIn("i cancelled hulu 2 weeks ago", "2026-10-12").date, "2026-09-28");
  const t = ans("i cancelled hulu 2 weeks ago and still got charged", { transactions: TX.concat([r("2026-09-30", -1799, "HULU 877-8244858")]) });
  assert.match(t, /^Hulu charged you \$17\.99 on Sep 30, after you cancelled, about 2 weeks ago \(counted from when you said\)\.\nIt posted within 5 days of about when you cancelled, so it may have been made before you cancelled\./);
});

test("[S15] every answer from rows ends with the source line", () => {
  for (const m of ["netflix charged me after i cancelled", "i cancelled hulu but got charged", "i cancelled spotify last month and they charged me again"]) assert.ok(ans(m).endsWith(`\n${SRC}`), m);
});
