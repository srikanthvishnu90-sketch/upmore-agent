// Money actions Upmore can't do yet, said plainly before any flow can misread them (megadoc D06, D07, E25, F03, J09, J14,
// K08-K11, M02, M12; docs/depth/NOT-YET.md). One test per sub-capability, tagged so evals/depth/run.cjs can prove its
// planted defect makes exactly this test fail.
// Check: node --test tests/depth-NOT-YET.test.cjs && node evals/depth/run.cjs NOT-YET
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const N = require(path.join(dir, "111-not-yet.js"));
const kind = (t) => (N.ask(t) || {}).kind || null;

test("[S01] own-account transfers: not built, nothing moved, the bank's own app", () => {
  for (const t of ["move 500 to savings", "transfer 1000 from savings to brokerage", "put $200 into my emergency fund", "can you move everything to my hysa", "sweep the rest into savings"]) assert.equal(kind(t), "own_transfer", t);
  assert.equal(N.answer("move 500 to savings"), "Moving money between your own accounts isn't built yet, so nothing was moved. Your bank's own app does it, usually under Transfers.");
});

test("[S02] a send to a person is never an own-account transfer, even from savings", () => {
  for (const t of ["send sam 50 from savings", "transfer sam $50", "send maya 40", "venmo sam 20 from checking", "send 50 to sam", "transfer $200 to maya"]) assert.equal(kind(t), null, t);
  // Rent money moved between the person's own accounts is still an own-account transfer.
  assert.equal(kind("put $1200 into checking for rent"), "own_transfer");
});

test("[S03] lock, freeze, unlock: Upmore can't; the card's own app or the number on the back", () => {
  for (const t of ["lock my card", "unlock my card", "freeze my debit card", "can you turn off my chase card", "pause my credit card"]) assert.equal(kind(t), "card_lock", t);
  assert.match(N.answer("lock my card"), /^Upmore can't lock or unlock a card\. Your card's own app does it \(look for Lock card or Freeze\), or call the number on the back of the card\. Nothing was changed\.$/);
});

test("[S04] lost or stolen: report it to the issuer now; Upmore can't; then check charges", () => {
  for (const t of ["report my card stolen", "i lost my credit card", "someone stole my card", "my card was stolen", "can't find my debit card"]) assert.equal(kind(t), "card_lost", t);
  const a = N.answer("report my card stolen");
  assert.match(a, /^Report it to your card issuer now, in their app or by phone; the number is on their website and your statements\./);
  assert.match(a, /Upmore can't report or cancel a card\./);
  assert.doesNotMatch(a, /back of the card/, "a stolen card's back isn't in hand");
});

test("[S05] a stolen card is urgent even mid-sentence about money", () => {
  assert.equal(kind("how much did i spend, i think someone stole my card"), "card_lost");
});

test("[S06] block a merchant: can't; cancel a subscription by name, or the card's app", () => {
  for (const t of ["block this merchant", "block charges from netflix", "block payments to that company"]) assert.equal(kind(t), "block_merchant", t);
  assert.match(N.answer("block this merchant"), /^Upmore can't block a merchant\. To stop a subscription, say "cancel" and its name and I'll put up a cancel card for your yes;/);
});

test("[S07] bill pay: not built, nothing paid, the biller's own app; rent is the one bill set up here", () => {
  for (const t of ["pay the electric bill", "pay my phone bill", "pay electric bill 0", "pay my comcast bill", "pay my credit card bill", "pay my bills"]) assert.equal(kind(t), "bill_pay", t);
  assert.match(N.answer("pay the electric bill"), /^Paying bills isn't built yet, so nothing was paid\. .*Rent is the one bill I can set up: say "pay my rent"\.$/);
});

test("[S08] rent, a split and paying a person for a bill keep their own flows", () => {
  for (const t of ["pay my rent", "split the electric bill with sam", "pay sam 40 for the electric bill", "did my phone bill go through", "how much is my electric bill"]) assert.equal(kind(t), null, t);
});

test("[S09] pause or downgrade a subscription: not built; the service's page, or cancel by name", () => {
  for (const t of ["pause my subscription for 2 months", "downgrade my plan", "pause my netflix membership", "switch to a cheaper plan"]) assert.equal(kind(t), "pause_plan", t);
  assert.match(N.answer("downgrade my plan"), /^Pausing or downgrading a subscription isn't built yet, so nothing was changed; the service's own account page does it\./);
});

test("[S10] a savings plan or round-ups is not a subscription to pause", () => {
  for (const t of ["pause my savings plan", "pause my round-ups"]) assert.notEqual(kind(t), "pause_plan", t);
});

test("[S11] open an account: Upmore opens none; the bank's or broker's own site, then connect it", () => {
  for (const t of ["open a high yield account", "open a roth ira", "open me a new checking account", "can you open a brokerage account"]) assert.equal(kind(t), "open_account", t);
  assert.match(N.answer("open a roth ira"), /^Upmore doesn't open accounts, so nothing was opened\./);
});

test("[S12] recurring investing: not built; buy now, each order a yes, $5 cap", () => {
  for (const t of ["set up 50 a week into VOO", "auto invest 100 every payday", "i want recurring investments", "can you dollar cost average into VTI"]) assert.equal(kind(t), "recurring_invest", t);
  assert.equal(N.answer("set up 50 a week into VOO"), "Recurring investing isn't built yet, so nothing was set up. You can buy now, like \"buy $5 of VOO\": each order needs your yes and is capped at $5 for now.");
});

test("[S13] questions about money are not actions", () => {
  for (const t of ["whats my savings balance", "how much did i move to savings", "when is my phone bill due", "what's my card balance", "my card got declined", "what card should i use", "move on", "how do i save money", "how much did my recurring investment make", "what's my auto investment doing"]) assert.equal(kind(t), null, t);
});

test("[S14] every reply says nothing was done, or (stolen card) that Upmore can't act on the card", () => {
  for (const k of N.KINDS) assert.match(N.TEXT[k], /nothing was (?:moved|changed|paid|opened|set up)|Upmore can't report or cancel a card/i, k);
  assert.equal(N.KINDS.length, 8);
});

test("[S15] the way people type it: lead words, curly apostrophes, capitals", () => {
  assert.equal(kind("Hey, can you MOVE $500 to my Savings?"), "own_transfer");
  assert.equal(kind("i can’t find my debit card"), "card_lost");
  assert.equal(kind("ok please pay the electric bill"), "bill_pay");
});
