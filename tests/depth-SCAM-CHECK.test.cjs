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
  const STEP = { safe_account: /call your bank on the number on the back of your card/, gift_cards: /on a number you already have, or in person/, locked_link: /Open the company's own app, or call the number on the back of your card/, pasted_transfer: /contact the company through its own app or website/, password: /use "Forgot password" on that company's own site or app/, code_ask: /contact the company through its own app or the number on its website/, unknown_request: /Decline it in the app it came from/, payee_change: /Call them on a number you already have \(your lease or an old bill, not the message\)/, mistaken_payment: /ask them to cancel or dispute it in the app, or contact the app's support from inside the app/, bank_text: /call the number on the back of your card/, money_moved: /Call your bank's fraud team right now on the number on the back of your card/ };
  for (const k of S.KINDS) assert.match(S.TEXT[k], STEP[k], k);
});

test("[S15] where money or a code may already be gone, the report path is said: the bank first, then reportfraud.ftc.gov", () => {
  for (const k of ["safe_account", "gift_cards"]) assert.match(S.TEXT[k], /If you already sent money or a code, tell your bank right away and report it at reportfraud\.ftc\.gov\./, k);
  assert.match(S.TEXT.code_ask, /If you already shared it, change that account's password now\./);
});

test("[S12] the reply never asks for anything back: no code, password, card or account number", () => {
  for (const k of S.KINDS) assert.doesNotMatch(S.TEXT[k], /\b(?:send|tell|give|share) me\b|\bwhat(?:'s| is) your (?:code|password|card|account)\b/i, k);
  assert.equal(S.KINDS.length, 11);
});

test("[S16] a landlord or company that 'changed where to send' money, with no new details, is checked on a number the person already has before anything changes; details go to the rent card", () => {
  for (const t of ["my landlord changed where to send rent", "landlord says rent goes to a new account now", "my property manager emailed new payment instructions", "the contractor texted that he switched banks, pay the new account", "landlord has a new zelle", "My Landlord Sent Updated Bank Details"]) {
    assert.equal(kind(t), "payee_change", t);
    assert.match(S.answer(t), /^Check that before anything changes: .* Call them on a number you already have \(your lease or an old bill, not the message\) and confirm\. .* nothing changes without your yes\. Nothing was changed\.$/, t);
  }
  for (const t of ["my landlord changed to zelle jane@example.com, pay rent 1500 on the 1st", "landlord raised the rent to 1600", "my landlord changed the due date", "pay my rent", "is my landlord allowed to raise rent", "I changed banks"]) assert.notEqual(kind(t), "payee_change", t);
});

test("[S18] C146: 'is this text from my bank real?' gets a verdict with computed reasoning — a lookalike link address is fake, an official one is said as only the signs checking out, and nothing from the message is echoed", () => {
  const fake = "is this text from my bank real? it says: CHASE ALERT your account is locked, verify within 24 hours at chase-verify-secure.com or it will be closed";
  assert.equal(kind(fake), "bank_text");
  const a = S.answer(fake);
  assert.match(a, /^Treat that text as fake\. .*not your bank's real website\./);
  assert.match(a, /call the number on the back of your card/);
  assert.doesNotMatch(a, /chase-verify-secure|\$|24 hours/, "no link or detail echoed");
  const short = "is this text from my bank real? 'wells fargo: unusual sign-in, check it here bit.ly/3xYz'";
  assert.equal(kind(short), "bank_text");
  assert.match(S.answer(short), /^Treat that text as fake\. The link is a shortened address/);
  assert.doesNotMatch(S.answer(short), /bit\.ly/);
  const ok = "is this text from my bank real? 'chase: card ending soon, see chase.com/alerts'";
  assert.equal(kind(ok), "bank_text");
  assert.match(S.answer(ok), /^The signs I can check look right/);
  assert.match(S.answer("is this text from my bank real?"), /^I can't confirm that text is real/);
  for (const t of ["is my bank open today", "text my bank about the fee", "my bank texted me a code and the site is asking for it"]) assert.notEqual(kind(t), "bank_text", t);
});

test("[S19] C146: money already moved to a scammer opens the recovery case at once — the fraud-team call first, timed steps, nothing echoed, no bank contacted by the agent", () => {
  const t = "i think i got scammed, i already sent $500 by zelle to a guy who said he was from my bank's fraud team";
  assert.equal(kind(t), "money_moved");
  const a = S.answer(t);
  assert.match(a, /^This is a recovery case now, and minutes matter/);
  assert.match(a, /Call your bank's fraud team right now on the number on the back of your card/);
  assert.match(a, /reportfraud\.ftc\.gov/);
  assert.match(a, /I haven't contacted the bank/);
  assert.doesNotMatch(a, /\$500|zelle to a guy/, "no amount or detail echoed");
  const r = S.recovery(t, { today: "2026-10-12" });
  assert.equal(r.kind, "scam_recovery"); assert.equal(r.status, "open"); assert.equal(r.opened_on, "2026-10-12");
  assert.equal(r.steps.length, 5); assert.equal(r.steps[0].when, "now");
  assert.equal(S.recovery("i sent sam $40 for dinner", { today: "2026-10-12" }), null, "an ordinary payment is not a recovery case");
  assert.equal(kind("i sent money to my landlord"), null);
});

test("[S17] money sent \"by mistake\" and asked back: don't send it back yourself; the money in can be pulled back, what goes out can't; a person's own mistaken send is not this", () => {
  for (const t of ["someone sent me $50 by mistake and wants it back", "a stranger venmoed me 200 by accident and asked me to send it back", "somebody accidentally zelled me $300, they want it back", "got $40 on cash app from a random person who says it was the wrong person, asking me to send it back"]) {
    assert.equal(kind(t), "mistaken_payment", t);
    assert.match(S.answer(t), /^Careful: money that arrives "by mistake" .* what you send can't\. Don't send it back yourself: .* Nothing was sent\.$/, t);
    assert.doesNotMatch(S.answer(t), /\$\d/, "no amount echoed");
  }
  for (const t of ["i sent sam 40 by mistake", "i accidentally paid the wrong person", "sam sent me 40 for dinner", "did sam send me the 40"]) assert.notEqual(kind(t), "mistaken_payment", t);
});
