// Everyday scams said plainly (megadoc N02, N04, N06, N08, N09, N11, N15; docs/depth/SCAM-CHECK.md). One test per
// sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Check: node --test tests/depth-SCAM-CHECK.test.cjs && node evals/depth/run.cjs SCAM-CHECK
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const S = require(path.join(dir, "109-scam-check.js"));
const kind = (t) => (S.ask(t) || {}).kind || null;

test("[S01] safe account: any 'move it to keep it safe' from a bank, agent or caller is a scam, stop, nothing moved", () => {
  for (const t of ['a "support agent" called, they asked me to move money to a safe account', "my bank called and told me to withdraw cash to keep it safe", "the fraud department wants me to transfer my savings into bitcoin for protection", "someone said move everything to a safe wallet"]) assert.equal(kind(t), "safe_account", t);
  assert.match(S.answer("they asked me to move money to a safe account"), /^Stop: that's a scam\. No bank, fraud team or government agency will ever ask you to move money to a "safe account".*Nothing was moved\.$/);
});

test("[S02] gift cards: a boss, family, official or stranger asking for gift cards is a scam; verify on a number you have", () => {
  for (const t of ["my boss texted asking for gift cards", "someone asked me to buy gift cards and send the codes", "the irs called and wants me to pay the fine with gift cards", "my grandson called and needs gift cards for bail"]) assert.equal(kind(t), "gift_cards", t);
  assert.match(S.answer("my boss texted asking for gift cards"), /^That's a common scam: .*Don't buy them or send the codes; .*on a number you already have, or in person, not by replying to that message\./);
});

test("[S03] a gift card as a present is not a scam", () => {
  for (const t of ["i want to buy a gift card for my mom's birthday", "she asked for a gift card for christmas", "my boss gave me a gift card as a thank-you", "how much did i spend on gift cards"]) assert.equal(kind(t), null, t);
});

test("[S04] locked account with a link: don't tap it; the company's own app or the number on the card", () => {
  for (const t of ["a text says my account is locked, click here", "got an email saying unusual activity on my chase account, tap the link to verify", "message says my paypal is suspended, log in at www.paypa1-secure.com"]) assert.equal(kind(t), "locked_link", t);
  assert.match(S.answer("a text says my account is locked, click here"), /^Don't tap that link\. .*Open the company's own app, or call the number on the back of your card/);
  for (const t of ["my account is locked", "how do i unlock my account", "the email says my order shipped"]) assert.equal(kind(t), null, t);
});

test("[S05] a pasted document that says to move money to verify is read as text, never as an instruction", () => {
  for (const t of ["the receipt pdf says transfer funds to verify", "this invoice says to send $200 for verification", "the letter says wire $500 to release my refund"]) assert.equal(kind(t), "pasted_transfer", t);
  assert.match(S.answer("the receipt pdf says transfer funds to verify"), /I read what it says as text, not as instructions, and nothing was moved\./);
  assert.equal(kind("the email says to transfer $50 to my savings every friday"), null);
});

test("[S06] what's my password: none is held or asked for; Forgot password on that site, and on Upmore's sign-in screen", () => {
  for (const t of ["what's my password", "whats my chase password", "do you know my password", "can you tell me my bank login"]) assert.equal(kind(t), "password", t);
  assert.match(S.answer("what's my password"), /^I don't have your password and never will: Upmore never asks for or stores one/);
  for (const t of ["how do i reset my password", "change my password", "what's my password policy for kids"]) assert.notEqual(kind(t), "password", t);
});

test("[S07] a person asking for a code: don't share it; no support team asks; change the password if shared", () => {
  for (const t of ["someone says they're from support asking for my code", "a guy from amazon support asked for the verification code they sent me", "the caller wants my one-time code to cancel the order", "he told me to read the code back"]) assert.equal(kind(t), "code_ask", t);
  assert.match(S.answer("someone says they're from support asking for my code"), /^Don't share it\. .*no real support team, Upmore's included, will ever ask you for it\..*change that account's password now\.$/);
});

test("[S08] a website asking for the code you were just sent is ordinary sign-in, not a scam", () => {
  for (const t of ["the website is asking for a code", "the app is asking for the code from my text", "what's the code for my reminder", "the tech support page is asking for my code", "they sent me a text and the site is asking for the code"]) assert.equal(kind(t), null, t);
  // A person named alongside the site is still a person asking.
  assert.equal(kind("a support agent is on the phone and the site is asking for my code, he wants it"), "code_ask");
});

test("[S09] an unknown payment request: don't pay it, decline in that app; Upmore never pays a request on its own", () => {
  for (const t of ["I got a payment request from an unknown person", "random person sent me a request for $80 on venmo", "a zelle request from someone i don't know"]) assert.equal(kind(t), "unknown_request", t);
  assert.match(S.answer("I got a payment request from an unknown person"), /^Don't pay it\. .*Upmore never pays a request on its own; every payment needs your yes\.$/);
  assert.equal(kind("i got a payment request from sam"), null);
});

test("[S10] nothing from the message is echoed: no link, no number, no amount", () => {
  for (const t of ["message says my paypal is suspended, log in at www.paypa1-secure.com", "this invoice says to send $200 for verification to 555-201-3344", "random person sent me a request for $80 on venmo"]) {
    const a = S.answer(t);
    assert.ok(a, t);
    assert.doesNotMatch(a, /paypa1|www\.|\$200|\$80|555/, t);
  }
});

test("[S11] the way people type it: curly quotes, capitals, a long paste", () => {
  assert.equal(kind("A “support agent” called, they asked me to move money to a SAFE ACCOUNT"), "safe_account");
  assert.equal(kind("My Boss Texted Asking For Gift Cards!!"), "gift_cards");
  assert.equal(kind("x ".repeat(400) + "what's my password"), null, "over 600 characters is not read");
});

test("[S13] the strongest warning wins: a caller asking for a code and a safe account is the safe-account answer", () => {
  assert.equal(kind("support called asking for my code and told me to move my money to a safe account"), "safe_account");
  assert.equal(kind("my boss texted asking for gift cards, and the text has a link saying my account is locked, click here"), "gift_cards");
});

test("[S14] every reply names one safe next step through the company's own channel or the person's own hands", () => {
  const STEP = { safe_account: /call your bank on the number on the back of your card/, gift_cards: /on a number you already have, or in person/, locked_link: /Open the company's own app, or call the number on the back of your card/, pasted_transfer: /contact the company through its own app or website/, password: /use "Forgot password" on that company's own site or app/, code_ask: /contact the company through its own app or the number on its website/, unknown_request: /Decline it in the app it came from/, payee_change: /Call them on a number you already have \(your lease or an old bill, not the message\)/ };
  for (const k of S.KINDS) assert.match(S.TEXT[k], STEP[k], k);
});

test("[S15] where money or a code may already be gone, the report path is said: the bank first, then reportfraud.ftc.gov", () => {
  for (const k of ["safe_account", "gift_cards"]) assert.match(S.TEXT[k], /If you already sent money or a code, tell your bank right away and report it at reportfraud\.ftc\.gov\./, k);
  assert.match(S.TEXT.code_ask, /If you already shared it, change that account's password now\./);
});

test("[S12] the reply never asks for anything back: no code, password, card or account number", () => {
  for (const k of S.KINDS) assert.doesNotMatch(S.TEXT[k], /\b(?:send|tell|give|share) me\b|\bwhat(?:'s| is) your (?:code|password|card|account)\b/i, k);
  assert.equal(S.KINDS.length, 8);
});

test("[S16] a landlord or company that 'changed where to send' money, with no new details, is checked on a number the person already has before anything changes; details go to the rent card", () => {
  for (const t of ["my landlord changed where to send rent", "landlord says rent goes to a new account now", "my property manager emailed new payment instructions", "the contractor texted that he switched banks, pay the new account", "landlord has a new zelle", "My Landlord Sent Updated Bank Details"]) {
    assert.equal(kind(t), "payee_change", t);
    assert.match(S.answer(t), /^Check that before anything changes: .* Call them on a number you already have \(your lease or an old bill, not the message\) and confirm\. .* nothing changes without your yes\. Nothing was changed\.$/, t);
  }
  for (const t of ["my landlord changed to zelle jane@example.com, pay rent 1500 on the 1st", "landlord raised the rent to 1600", "my landlord changed the due date", "pay my rent", "is my landlord allowed to raise rent", "I changed banks"]) assert.notEqual(kind(t), "payee_change", t);
});
