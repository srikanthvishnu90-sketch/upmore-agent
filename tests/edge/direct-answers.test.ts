// Direct answers from code (agent-chat/_shared/direct_answers.ts), each from a live gauntlet failure, 2026-10-12.
// Transactions here are MOCK fixtures.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import * as DirectAnswers from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";
import { connectReply, noDataReply, NO_ACCOUNTS, findMoneyReply, type TxRow } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";

Deno.test("connect my X answers from the connector matrix, never invented app steps (S16-19)", () => {
  assertMatch(connectReply("connect my fidelity")!, /^Fidelity doesn't let apps place trades, so Upmore tracks it read-only through Plaid .*Connect investments/);
  assertMatch(connectReply("can you connect my schwab account")!, /^Trading at Charles Schwab needs Charles Schwab's approval of Upmore/);
  assertEquals(connectReply("link my kalshi"), "Kalshi isn't available in Upmore, so nothing was connected.");
  assertEquals(connectReply("connect my coinbase"), "Coinbase isn't available in Upmore, so nothing was connected.");
  assertMatch(connectReply("connect my webull")!, /^Upmore can't connect Webull yet: .*Nothing was connected\.$/);
  // The live connector gets the owner's reference design: one line, then the link alone.
  assertEquals(connectReply("connect alpaca"), "Not connected yet - here's the link.\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca");
  assertEquals(connectReply("connect my gmail"), "Not connected yet - here's the link.\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/gmail");
  for (const t of ["what is fidelity", "connect the dots", "how do i connect"]) assertEquals(connectReply(t), null, t);
  for (const t of ["connect my fidelity", "connect my webull", "connect my cash app", "connect my empower 401k"]) assert(!/SnapTrade|owner|keys/.test(connectReply(t)!), `${t}: no internal words`);
});

// Megadoc Q10 "link my Chase account": banks and cards connect in the app through SimpleFIN Bridge (the Connect bank
// screen), read-only; the brokerage matrix keeps brokerages; a bank's list is never promised.
Deno.test("link my Chase account: the app's real bank path in plain words, no card, no promise the bank is listed (Q10)", () => {
  assertEquals(connectReply("link my Chase account"), "Nothing was connected yet. To connect Chase, open Home in the app and tap Connect bank. It goes through SimpleFIN Bridge: you pick Chase on its list and sign in on the bank's own page, then paste the setup token it gives you into Upmore. Upmore never sees your bank password, and the connection is read-only: it reads balances and transactions and never moves money. If Chase isn't on SimpleFIN's list, it can't be connected yet.");
  assertMatch(connectReply("can you connect my bank")!, /^Nothing was connected yet\. Banks and cards connect from the app: open Home and tap Connect bank\. .*never moves money\.$/);
  for (const t of ["add my checking account", "link my bofa checking", "sync my wells fargo", "connect my amex", "link my discover card"]) assertMatch(connectReply(t)!, /tap Connect bank\. It goes through SimpleFIN Bridge/, t);
  // A bank account kind with a bank's name is the bank, not its brokerage arm; the brokerage words keep the matrix.
  assertMatch(connectReply("connect my ally savings")!, /^Nothing was connected yet\. To connect Ally,/);
  assertMatch(connectReply("link my chase investing account")!, /^J\.P\. Morgan Self-Directed Investing doesn't let apps place trades/);
  assertMatch(connectReply("connect my fidelity")!, /^Fidelity /);
  for (const t of ["add my card", "add chase sapphire", "set up my savings goal", "add my mom", "connect my venmo", "add rent to my budget"]) assertEquals(connectReply(t), null, t);
  assert(!/https?:\/\//.test(connectReply("link my Chase account")!), "no link card: SimpleFIN is a token pasted in the app");
});

// S16-15 "pay my rent" is the standing rent flow now (packages/domain/81-standing-rent.js through the flow router;
// tests/standing-rent.test.cjs, tests/edge/flow-router.test.ts). No direct answer may intercept it with "not built".
Deno.test("pay my rent is not answered from here: no direct answer intercepts it, so the standing rent flow does (S16-15)", async () => {
  for (const t of ["pay my rent", "pls pay the rent", "rent is 1500 now", "stop rent", "pay sam 900 for rent"]) {
    assertEquals(connectReply(t), null, t);
    assertEquals(noDataReply(t, 0), null, t);
    assertEquals(await findMoneyReply(t, "2026-10-12", async () => { throw new Error("no read for a rent message"); }), null, t);
  }
  const mod: Record<string, unknown> = DirectAnswers;
  assert(!("rentReply" in mod) && !("RENT_NOT_BUILT" in mod), "the not-built rent answer is gone");
});

Deno.test("with nothing linked, balance and spending get one plain line, not internal terms (S16-01, 02, 14, 16)", () => {
  for (const t of ["what's my balance", "how much did i spend on food last month", "how am i doing", "did rent go through"]) assertEquals(noDataReply(t, 0), NO_ACCOUNTS, t);
  assertEquals(noDataReply("what's my balance", 2), null, "with accounts linked the planner answers");
  assertEquals(noDataReply("what's a roth ira", 0), null);
  assert(!/retained|posted records|\[F1\]/.test(NO_ACCOUNTS));
});

const row = (id: string, on: string, cents: number, m: string): TxRow => ({ account_id: "mock-card", provider_transaction_id: id, amount_cents: cents, posted_on: on, merchant_raw: m, is_pending: false, is_transfer: false });

Deno.test("find me money ranks what the person's own rows show, with the source and as-of date (S16-18)", async () => {
  const tx: TxRow[] = [];
  let n = 0;
  for (const m of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
    tx.push(row(`f${++n}`, `${m}-07`, -500, "MONTHLY MAINTENANCE FEE"));
    tx.push(row(`n${++n}`, `${m}-03`, -1799, "NETFLIX.COM"));
  }
  const r = (await findMoneyReply("find me money", "2026-10-12", async () => tx))!;
  assertMatch(r, /^Here's where your money is going that you could cut, biggest first:\n1\. \$5\.00 monthly maintenance fee every month: this saves an estimated \$5\.00 a month/);
  assertMatch(r, /From your linked accounts, transactions through 2026-10-07\. Estimates, not savings yet/);
  assertEquals(await findMoneyReply("find me money", "2026-10-12", async () => []), NO_ACCOUNTS);
  assertEquals(await findMoneyReply("how much money do i have", "2026-10-12", async () => tx), null);
});

Deno.test("find me money with only ordinary subscriptions lists them with their monthly total, never a made-up saving", async () => {
  const tx: TxRow[] = [];
  let n = 0;
  for (const m of ["2026-07", "2026-08", "2026-09", "2026-10"]) tx.push(row(`n${++n}`, `${m}-03`, -1799, "NETFLIX.COM"));
  const r = (await findMoneyReply("where can i save", "2026-10-12", async () => tx))!;
  assertMatch(r, /^Nothing stands out as waste, but these repeat \(\$17\.99 a month together\)\. Worth a look:\n1\. NETFLIX\.COM: \$17\.99 monthly\n/);
  assert(!/NaN|undefined/.test(r));
  assert(!/guarantee/i.test(r));
});

// Megadoc Q03, Q04, Q06, Q08: account and privacy asks answered from the app's real screens and the privacy policy.
// Every app path named here is checked against the app source itself, and the processors against /privacy, so a
// renamed button or a changed policy fails this test instead of the chat quoting something that isn't there.
import SRC_APP from "../../src/upmore-app-template.html" with { type: "text" };
import SRC_PRIVACY from "../../privacy.html" with { type: "text" };
const { accountPrivacyReply, whoSeesReply, ACCOUNT_NUMBER_NONE, DELETE_DATA_STEPS, PHONE_NONE, EMAIL_NONE, FEES_REPLY } = DirectAnswers;
import SRC_TERMS from "../../terms.html" with { type: "text" };
import SRC_TRADE from "../../packages/domain/66-agent-trade.js" with { type: "text" };

Deno.test("show my full account number: none is held or shown; the brokerage's last four only (Q03)", () => {
  for (const t of ["show my full account number", "whats my account number", "can you give me my routing number", "send me my full card number", "what is my checking account number?", "i need my full account number"]) assertEquals(accountPrivacyReply(t, "openai"), ACCOUNT_NUMBER_NONE, t);
  for (const t of ["what's my account balance", "how many accounts do i have", "my account number changed", "is 1234 my account"]) assertEquals(accountPrivacyReply(t, "openai"), null, t);
  assert(!/\d{5,}/.test(ACCOUNT_NUMBER_NONE), "no number in the reply");
  assertMatch(ACCOUNT_NUMBER_NONE, /\*\*\*\*1234/);
  // The You screen does show a connected brokerage as "Connected, live (****1234)".
  assertMatch(SRC_APP, /"Connected, live" \+ \(row\.account_mask \? " \(" \+ row\.account_mask/);
});

Deno.test("delete my data: never done from chat; the app's own Delete data steps, the policy's email and 30 days (Q04)", () => {
  for (const t of ["delete my data", "pls delete my account", "i want to delete all my data", "how do i delete my account?", "delete everything you have on me", "erase my personal info", "forget me", "can you delete my upmore account permanently"]) assertEquals(accountPrivacyReply(t, "openai"), DELETE_DATA_STEPS, t);
  for (const t of ["delete my reminder for rent", "delete my bank account", "remove my budget", "delete that charge", "clear everything", "remove my card from netflix", "delete the iou with sam"]) assertEquals(accountPrivacyReply(t, "openai"), null, t);
  assertMatch(DELETE_DATA_STEPS, /Nothing was deleted\.$/);
  // Each step named is a real control with that label in the app, on the You screen, and the modal asks for DELETE.
  assertMatch(SRC_APP, /id="profile" aria-label="You">[\s\S]{0,400}?<h1 class="ptitle">You<\/h1>/);
  assertMatch(SRC_APP, /id="deleteData">Delete data</);
  assertMatch(SRC_APP, /id="exportData">Export data</);
  assertMatch(SRC_APP, />Delete everything</);
  assertMatch(SRC_APP, /Type <b>DELETE<\/b> to confirm/);
  // The contact, the 30 days and what is erased are the policy's own words.
  assertMatch(SRC_PRIVACY, /vishnusrikanth8@gmail\.com/);
  assertMatch(SRC_PRIVACY, /We verify you own the account, then complete requests within 30 days/);
  assertMatch(SRC_PRIVACY, /deleting your account erases your profile, chats, progress, saved items, reminders, and your bank\/brokerage connections including stored credentials/);
});

Deno.test("who can see my messages: the person's own rows and the AI provider this deployment runs on, from the policy (Q06)", () => {
  for (const t of ["who can see my messages", "who else can read my chats", "are my chats private?", "do you sell my data", "does anyone else see my messages", "do you train on my data", "is my data safe"]) assertEquals(accountPrivacyReply(t, "openai"), whoSeesReply("openai"), t);
  for (const t of ["who can see my spending", "can you see my balance", "who sells the cheapest data plan"]) assert(accountPrivacyReply(t, "openai") === null || /Upmore's AI provider/.test(accountPrivacyReply(t, "openai")!), t);
  assertMatch(whoSeesReply("openai"), /which is OpenAI right now/);
  assertMatch(whoSeesReply("anthropic"), /which is Anthropic \(Claude\) right now/);
  assertMatch(whoSeesReply("openai"), /From Upmore's privacy policy, updated Oct 11, 2026 \(You, then Privacy Policy\)\.$/);
  // Both providers are the policy's own list, and its date is the one quoted.
  assertMatch(SRC_PRIVACY, /OpenAI<\/strong> \(and Anthropic, if we switch providers\)/);
  assertMatch(SRC_PRIVACY, /not used to train their models by default/);
  assertMatch(SRC_PRIVACY, /Last updated:<\/strong> October 11, 2026/);
  assertMatch(SRC_APP, /id="privacyRow"[^>]*><span class="pl">Privacy Policy</);
  // The in-app Privacy Policy sheet says what /privacy and the code say (it named Anthropic, Plaid for brokerage, "we never
  // move money" and saved merchant logins until 2026-10-12): the chat's "(You, then Privacy Policy)" points at it.
  const sheet = /<div class="sheet" id="privacySheet"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/.exec(SRC_APP)![0];
  assertMatch(sheet, /Last updated: October 11, 2026/);
  assertMatch(sheet, /OpenAI, or Anthropic if we switch providers/);
  assertMatch(sheet, /Alpaca \(only if you connect your own brokerage account/);
  for (const stale of [/go to Claude/, /brokerage connection \(Plaid\)/, /merchant logins you/, /we never move money,/]) assert(!stale.test(sheet), String(stale));
});

Deno.test("change my phone number or email: no phone on the account; email changes by asking, nothing changed (Q08)", () => {
  for (const t of ["change my phone number", "i got a new number", "update my cell number", "how do i change my number"]) assertEquals(accountPrivacyReply(t, "openai"), PHONE_NONE, t);
  for (const t of ["can i update my email", "change my login email"]) assertEquals(accountPrivacyReply(t, "openai"), EMAIL_NONE, t);
  for (const t of ["change my phone plan", "my phone bill went up", "cancel my phone plan", "update my phone carrier"]) assertEquals(accountPrivacyReply(t, "openai"), null, t);
  assertMatch(PHONE_NONE, /Nothing was changed\.$/);
  // Sign-up really is email + password or Google: no phone field.
  assert(!/type="tel"/.test(SRC_APP), "the app has no phone input");
});

Deno.test("what are your fees: the Terms' own price, billing not live, no Upmore fee on actions, the sale fees named (Q05)", () => {
  for (const t of ["what are your fees", "what's the pricing", "how much does upmore cost", "do you charge anything", "is upmore free?", "any fees?", "does upmore take a cut", "how much is the app"]) assertEquals(accountPrivacyReply(t, "openai"), FEES_REPLY, t);
  for (const t of ["what are the fees on my chase card", "how much is it to send $40", "any fees on this transfer", "what fees did i pay last month", "netflix price", "how much do i owe", "is this charge free", "how much will it cost me to cancel netflix"]) assertEquals(accountPrivacyReply(t, "openai"), null, t);
  // Every fact is the Terms' or the app's own.
  const plain = SRC_TERMS.replace(/<[^>]*>/g, "");
  assertMatch(plain, /Upmore costs \$10 per month when subscriptions are live \(billing is not live yet — nothing is charged today\)/);
  assertMatch(plain, /Version 1\.0 — September 27, 2026/);
  assertMatch(plain, /apply only toward Upmore subscription charges/);
  assertMatch(SRC_APP, /Cancel anytime from You → Upmore subscription/);
  // The sale fees are the ones the trade card says (66-agent-trade.js SALE_FEES).
  assertMatch(SRC_TRADE, /SEC and FINRA fees on a sale/);
});
