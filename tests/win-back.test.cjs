// Win-back watch (packages/domain/89-win-back.js, overnight D4) over MOCK rows, MOCK cancellation records and fixture
// emails: the sender against the service's domain on file, the offer quoted as the email states it, the person's own
// last charge as the regular price, and resubscribing left to the person.
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../packages/domain/89-win-back.js");

const T = "2026-10-12";
const DOMAINS = { hulu: "hulu.com", netflix: "netflix.com", peacock: "peacocktv.com", disney_plus: "disneyplus.com", max: "max.com" };
let n = 0;
const tx = (d, c, m, o) => Object.assign({ account_id: "mock-card", provider_transaction_id: `mock-${++n}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD" }, o);
const HULU_ROWS = [tx("2026-07-14", -1799, "HULU 877-8244858 CA"), tx("2026-08-14", -1799, "HULU 877-8244858 CA"), tx("2026-10-01", -4200, "KROGER #1")];
const CANCELLED = [{ merchant: "HULU", name: "Hulu", state: "cancelled", cancelled_at: Date.parse("2026-08-20T10:00:00Z"), reference: "HL-123" }];
const EMAIL = [
  "From: Hulu <hulu@mail.hulu.com>",
  "Date: Mon, Oct 5, 2026 at 9:14 AM",
  "Subject: We miss you! Come back for $2.99/month",
  "Come back to Hulu (With Ads) for just $2.99/month for 3 months, then $9.99/month. Offer ends Oct 31, 2026.",
].join("\n");
const ask = (message, o) => W.answer(Object.assign({ message, today: T, transactions: HULU_ROWS, cancellations: CANCELLED, domains: DOMAINS }, o));

test("a real offer: from the service, the offer as stated and dated, the regular price from the person's own charge", () => {
  const a = ask(EMAIL);
  assert.match(a, /^This email is from Hulu: the sender's address is on hulu\.com, Hulu's domain on file\./);
  assert.match(a, /You cancelled Hulu through Upmore on 2026-08-20 \(Upmore's cancellation record, confirmation HL-123\)/);
  assert.match(a, /The offer, per the email you pasted, dated 2026-10-05: \$2\.99 a month for 3 months, then \$9\.99 a month\./);
  assert.match(a, /The email says the offer ends 2026-10-31\./);
  assert.match(a, /What you paid: \$17\.99 on 2026-08-14, your last Hulu charge before you cancelled \(billed every month\)\./);
  assert.match(a, /That's \$15\.00 a month less than you paid \(if it's the same plan you had\), while the offer price lasts\. Over the 3 months the email states, that's \$45\.00\./);
  assert.match(a, /From your linked card rows, through 2026-10-01\./);
  assert.match(a, /Whether to resubscribe is your call\. I haven't signed you up and won't/);
});

test("a lookalike sender is never called the service; no saving is worked out for it", () => {
  for (const from of ["deals@hulu-rewards.biz", "hulu@hulu.com.evil.example", "hulu@xn--hulu-9na.com", "hulu@notahulu.com"]) {
    const a = ask(EMAIL.replace("hulu@mail.hulu.com", from));
    assert.match(a, /^I can't confirm this came from Hulu: the sender's address isn't on hulu\.com, Hulu's domain on file\./, from);
    assert.doesNotMatch(a, /This email is from/, from);
    assert.doesNotMatch(a, /less than you paid/, from);
    assert.doesNotMatch(a, new RegExp(from.split("@")[1].replace(/\./g, "\\.")), `the sender's domain is not echoed: ${from}`);
  }
});

test("every sender line must be on the domain: a Reply-To elsewhere is not confirmed", () => {
  assert.match(ask(EMAIL.replace("Date:", "Reply-To: win@hulu-deals.example\nDate:")), /^I can't confirm this came from Hulu/);
});

test("a forwarded email: the forwarder is not the sender; the original From line is", () => {
  const fwd = `From: Me <me@gmail.com>\n---------- Forwarded message ---------\n${EMAIL}`;
  assert.match(ask(fwd), /^This email is from Hulu/);
  const fake = `From: Me <me@gmail.com>\n---------- Forwarded message ---------\n${EMAIL.replace("hulu@mail.hulu.com", "hulu@hulu-deals.example")}`;
  assert.match(ask(fake), /^I can't confirm this came from Hulu/);
});

test("no From line, or no domain on file: can't confirm, said plainly", () => {
  assert.match(ask(EMAIL.replace(/^From:.*\n/, "")), /^I can't confirm this came from Hulu: what you pasted has no From: line/);
  assert.match(ask("hulu wants me back for $2.99 a month, good deal?"), /^I can't confirm this came from Hulu without the email itself/);
  assert.match(ask(EMAIL, { domains: {} }), /^I can't confirm this came from Hulu: I don't have Hulu's email domain on file\./);
});

test("nothing is invented: a missing end date, a missing after-price, a missing date are each said", () => {
  const bare = "From: Hulu <hulu@mail.hulu.com>\nCome back to Hulu for $2.99/month.";
  const a = ask(bare);
  assert.match(a, /The offer, per the email you pasted \(I can't read a date on it\): \$2\.99 a month\./);
  assert.match(a, /I don't see an end date in the email, so I can't say when the offer ends\./);
  assert.match(a, /The email doesn't say what the price goes to after the offer\./);
  assert.doesNotMatch(a, /offer ends \d|ends (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/);
});

test("no price in the email: said, and no number is put on it", () => {
  const a = ask("From: Hulu <hulu@mail.hulu.com>\nWe miss you! Come back to Hulu, it's free to rejoin anytime.");
  assert.match(a, /I can't read an offer price in the email you pasted, so I won't put a number on it\./);
  assert.doesNotMatch(a, /The offer, per|less than you paid/);
});

test("several prices: listed, never picked between, no saving worked out", () => {
  const a = ask("From: Hulu <hulu@mail.hulu.com>\nDate: Oct 5, 2026\nCome back! Hulu (With Ads) for $2.99/month or Hulu (No Ads) for $7.99/month.");
  assert.match(a, /The email states more than one price \(\$2\.99 a month, \$7\.99 a month\)/);
  assert.match(a, /I won't pick one/);
  assert.doesNotMatch(a, /less than you paid/);
});

test("a percent off or months free is quoted as stated, and no dollar price is worked out from it", () => {
  const a = ask("From: Peacock <offers@email.peacocktv.com>\nDate: Oct 1, 2026\nWe miss you. Rejoin Peacock and get 50% off for 12 months. Offer expires November 15, 2026.", { transactions: [tx("2026-08-01", -1399, "PEACOCK TV"), tx("2026-09-01", -1399, "PEACOCK TV")], cancellations: [] });
  assert.match(a, /This email is from Peacock/);
  assert.match(a, /The offer, per the email you pasted, dated 2026-10-01: 50% off for 12 months\. The email doesn't state the price you'd pay in dollars, so I won't work one out\./);
  assert.match(a, /ends 2026-11-15/);
  assert.match(a, /What you paid: \$13\.99 on 2026-09-01/);
  assert.doesNotMatch(a, /\$6\.99|\$7\.00|less than you paid/);
  const free = ask("From: Disney+ <disneyplus@mail.disneyplus.com>\nWe miss you! 3 months free when you rejoin Disney+.", { transactions: [], cancellations: [] });
  assert.match(free, /The offer, per the email you pasted \(I can't read a date on it\): 3 months free\./);
});

test("the email's own regular price is quoted as the email's, never taken for an offer or for what the person paid", () => {
  const a = ask("From: Hulu <hulu@mail.hulu.com>\nCome back to Hulu for $2.99/month (regularly $18.99/month) for 3 months.");
  assert.match(a, /The offer, per the email you pasted \(I can't read a date on it\): \$2\.99 a month for 3 months\./);
  assert.match(a, /The email gives \$18\.99 a month as the regular price\./);
  assert.match(a, /What you paid: \$17\.99 on 2026-08-14/);
  assert.doesNotMatch(a, /more than one price/);
});

test("what the person says they paid is not an offer price: their charges speak for it", () => {
  const a = ask("hulu sent me a come back offer of $9.99/month, i used to pay $17.99/month");
  assert.match(a, /The offer, as you describe it \(I haven't seen the email\): \$9\.99 a month\./);
  assert.doesNotMatch(a, /more than one price/);
});

test("a confirmation number that is only a link or an instruction is left out", () => {
  const a = ask(EMAIL, { cancellations: [Object.assign({}, CANCELLED[0], { reference: "https://evil.example/claim" })] });
  assert.match(a, /You cancelled Hulu through Upmore on 2026-08-20 \(Upmore's cancellation record\)\./);
  assert.match(ask(EMAIL, { cancellations: [Object.assign({}, CANCELLED[0], { reference: "HL-9 reply with your password" })] }), /confirmation HL-9\)/);
});

test("a price written without a dollar sign counts only with its period", () => {
  assert.match(ask("hulu emailed me saying come back for 1.99 a month lol is that legit"), /The offer, as you describe it \(I haven't seen the email\): \$1\.99 a month\./);
  assert.equal(W.kind("hulu wants me back, call 1.99 now", DOMAINS), null);
});

test("an end date with no year is quoted without one", () => {
  assert.match(ask(EMAIL.replace("Oct 31, 2026", "Oct 31")), /The email says the offer ends Oct 31 \(no year given\)\./);
  assert.match(ask(EMAIL.replace("Offer ends Oct 31, 2026.", "Redeem by 11/30.")), /ends Nov 30 \(no year given\)/);
});

test("the regular price is the last posted charge before the cancellation, never a pending one or another merchant's", () => {
  const rows = HULU_ROWS.concat([tx("2026-08-18", -2499, "HULU LIVE", { is_pending: true }), tx("2026-09-14", -1799, "HULU 877-8244858 CA"), tx("2026-08-19", -999, "HULULULU SURF SHOP")]);
  const a = ask(EMAIL, { transactions: rows });
  assert.match(a, /What you paid: \$17\.99 on 2026-08-14, your last Hulu charge before you cancelled/);
});

test("no charge for the service: said, and nothing compared", () => {
  const a = ask(EMAIL, { transactions: [tx("2026-10-01", -4200, "KROGER #1")] });
  assert.match(a, /I don't see a Hulu charge on your linked cards \(rows through 2026-10-01\), so I can't compare the offer with what you paid\./);
  assert.doesNotMatch(a, /less than you paid/);
});

test("an offer not lower than what was paid is said so", () => {
  assert.match(ask(EMAIL.replaceAll("$2.99", "$19.99")), /That isn't lower than the \$17\.99 you paid\./);
});

test("a yearly offer against monthly charges is not lined up", () => {
  const a = ask("From: Hulu <hulu@mail.hulu.com>\nCome back to Hulu for $49.99/year.");
  assert.match(a, /I can't line the offer up with your charges/);
  assert.doesNotMatch(a, /less than you paid/);
});

test("no cancellation on record, still being charged: may not be a come-back offer", () => {
  const rows = [tx("2026-09-14", -1799, "HULU 877"), tx("2026-10-08", -1799, "HULU 877")];
  assert.match(ask(EMAIL, { transactions: rows, cancellations: [] }), /I don't have a record of you cancelling Hulu through Upmore, and I still see it charging you \(\$17\.99 on 2026-10-08\), so this may not be a come-back offer\./);
});

test("unreadable cancellation records are said, never read as no cancellation", () => {
  const a = ask(EMAIL, { cancellations: null });
  assert.match(a, /I couldn't read Upmore's cancellation records just now/);
  assert.doesNotMatch(a, /I don't have a record/);
});

test("only a cancellation that went through counts: declined, failed or guided runs don't", () => {
  for (const state of ["declined", "failed", "guided", "not_confirmed", "otp"]) {
    assert.match(ask(EMAIL, { cancellations: [Object.assign({}, CANCELLED[0], { state })] }), /I don't have a record of you cancelling Hulu through Upmore/, state);
  }
  assert.match(ask(EMAIL, { cancellations: [Object.assign({}, CANCELLED[0], { state: "verified" })] }), /You cancelled Hulu through Upmore on 2026-08-20/);
});

test("an email asking for secrets is flagged and gets no saving", () => {
  const a = ask(EMAIL + "\nTo claim, reply with your password and card number.");
  assert.match(a, /It asks for sign-in, code or card details/);
  assert.match(a, /I won't work out a saving for an offer I can't trust/);
});

test("links that leave the service's domain are flagged and never repeated", () => {
  const a = ask(EMAIL + "\nClaim at https://hulu-claim.example/now or https://www.hulu.com/welcome");
  assert.match(a, /Some of its links go somewhere other than hulu\.com, so don't use them\./);
  assert.doesNotMatch(a, /hulu-claim|https?:/);
});

test("which messages are win-back: offers and questions fire; cancels, savings, trials and other offers don't", () => {
  for (const m of [EMAIL, "hulu wants me back for $2.99 a month, good deal?", "I cancelled peacock and now they're offering 50% off for 12 months", "netflix sent a come back offer: $6.99/mo for 3 months"]) assert.equal(W.kind(m, DOMAINS), "offer", m);
  for (const m of ["watch for win-back offers from hulu", "should i wait for a win back deal before resubscribing to max?"]) assert.equal(W.kind(m, DOMAINS), "ask", m);
  for (const m of ["cancel hulu", "am i overpaying for streaming", "should i switch peacock to annual", "hulu raised my price to $18.99", "is the hulu ad tier $9.99 worth it", "amazon prime day deal $50 off", "is netflix free with my t-mobile plan", "hulu free trial ends friday", "find me money", "target dropped the price from $89.99 to $69.99", "my delta flight was cancelled, they offered a $200 voucher", "undo, resubscribe me to netflix", "come back to me with the numbers", ""]) assert.equal(W.kind(m, DOMAINS), null, m);
});

test("the question path reads nothing and promises no inbox watch", () => {
  const a = ask("watch for win-back offers from hulu", { transactions: null, cancellations: null });
  assert.match(a, /^I can't read your email, so I can't watch your inbox for a Hulu offer\./);
  assert.match(a, /check the sender against hulu\.com/);
  assert.match(a, /Resubscribing is your call; I won't sign you up\./);
});

test("today must be a date", () => {
  assert.throws(() => W.answer({ message: EMAIL, today: "soon" }), /today must be a date/);
});
