// Cluster K8 transcript harness: drives the production code path for all 43 portal items and writes the
// word-for-word conversations to ~/workspace/your_files/upmore-conversations/<C#>-<slug>.md + .messages.json,
// plus /tmp/k8-surfaces.json for the surface screenshots. The card/answer turn runs PortalCases.prepare (the
// function agent-chat's _shared/portal_answer.ts serves, through the router bundle); the yes turn runs
// PortalCases.execute against a sandbox provider whose own record is the proof. C74/C93/C95 open with their
// pre-existing production answers (SubscriptionList, PriceDrop, RewardsMath) before the portal case runs.
// Data: stand-in facts from tests/portal-cases-facts.cjs, labeled per item in each file's header.
const fs = require("node:fs");
const path = require("node:path");
const P = require("../../packages/domain/118-portal-cases.js");
const FACTS = require("../../tests/portal-cases-facts.cjs");
const SubscriptionList = require("../../packages/domain/100-subscription-list.js");
const PriceDrop = require("../../packages/domain/88-price-drop.js");
const RewardsMath = require("../../packages/domain/87-rewards-math.js");
const OfferBook = require("../../packages/domain/82-offer-book.js");
const book = OfferBook.create(require("../../packages/offers/terms.json"));

const OUT = path.join(process.env.HOME, "workspace/your_files/upmore-conversations");
fs.mkdirSync(OUT, { recursive: true });

const SAY = {
  C73: "cancel my netflix", C74: "what am i paying for every month? cancel the ones i don't use", C75: "i signed up for a fubo trial last week - don't let it bill me",
  C76: "my internet bill went up again. get it back down", C78: "amazon charged me for a return i sent back. get my refund", C80: "cancel my gym. they make it impossible",
  C81: "what am i paying apple for? purge the dead app store subscriptions", C82: "the er sent me a $2,300 bill. this can't be right", C84: "my internet was down all weekend. get me an outage credit",
  C85: "don't let my domain tools renew for another year", C86: "my headphones died and they're under warranty", C87: "this tv is $100 cheaper at best buy - price-match it",
  C88: "they charged a $45/day resort fee i never agreed to", C89: "get me out of the storage unit contract", C92: "my flight to london was 5 hours late. get me the eu261 money",
  C93: "watch my recent purchases. if the price drops, get me the difference", C95: "am i using the right card for everything? maximize my rewards", C100: "track down my pending referral bonuses",
  C109: "file the rebate for those tires i bought", C112: "my lease renewal came in $150 higher. push back", C113: "put my utilities on autopay but warn me before big drafts",
  C117: "get pmi off my mortgage", C121: "my water bill tripled. fight it", C122: "my landlord is ghosting me on the security deposit", C123: "make my rent count toward my credit - report my rent to the credit bureaus",
  C124: "stay on top of my hoa dues and violations", C143: "someone rear-ended me. start my claim", C144: "my laptop was stolen from my apartment. claim it on my renters insurance claim",
  C145: "i lost my wallet. lock everything down", C147: "get my info off those people-search sites - remove me from data brokers", C148: "my trip got cancelled - claim the travel insurance",
  C149: "my new phone shattered and i bought it on my card - purchase protection claim", C150: "lock my number down - sim-swap hardening", C152: "give me a burner card for this sketchy site",
  C171: "am i on the right repayment plan for my student loans", C183: "the vet bill was $1,800 - claim it on pet insurance", C185: "make sure my family is protected if something happens to me - estate basics audit",
  C188: "keep my toll account from screwing me", C192: "never let a flight credit expire again - airline credit ledger", C194: "i'm going to japan - cash, card, or atm?",
  C195: "add my wife as beneficiary on all my accounts - update beneficiaries everywhere", C200: "i moved. update my address everywhere", C206: "this transfer form needs a medallion stamp - handle it",
};
// The exact owner information a live proof needs, per item (brief law 5).
const NEEDS = {
  C73: "his real Netflix account session (guided sign-in) and the card it bills", C74: "his linked-account rows (already readable) plus a live session per picked provider",
  C75: "the real trial's provider, its conversion date from the receipt in his inbox, and a live provider session", C76: "his real internet provider, current rate and account session",
  C78: "his real Amazon order/return record and the refund amount owed", C80: "his real gym's name, its contract terms and the card it drafts",
  C81: "his real Apple ID / Google account subscription pages", C82: "the real ER provider, the itemized bill and its total",
  C84: "his real internet provider and the real outage dates", C85: "the real annual subscription, its renewal date and provider session",
  C86: "the real product, its maker, purchase receipt and warranty end date", C87: "the real retailer, item and the live competitor listing",
  C88: "the real hotel/rental booking, the fee per day and the days charged", C89: "his real storage vendor, its contract and deposit",
  C92: "the real flight record (airline, flight, delay) from his receipt", C93: "his real purchase rows (readable) plus live retailer prices",
  C95: "his real wallet (issuers readable via accounts) and a live issuer session per activation", C100: "his real referral programs, links and pending amounts",
  C109: "the real purchase receipt and rebate amount", C112: "his real lease renewal letter (current rent, ask) and neighborhood comps",
  C113: "his real utility accounts and the warning threshold he picks", C117: "his real servicer, loan balance and a current home value (he has no mortgage on file in Upmore today)",
  C121: "his real water utility, the bill and his normal bill", C122: "his real prior landlord, deposit amount and move-out record",
  C123: "the rent-reporting service he picks and his lease", C124: "his real HOA, dues and any open violation notice",
  C143: "his real auto insurer, policy and the accident facts", C144: "his real Lemonade policy LP491F6A784 is on file; live proof needs the real stolen/damaged item and its receipt (the laptop here is a stand-in)",
  C145: "his real wallet contents (which cards) and live issuer sessions", C147: "his real name/address details as listed and each broker's opt-out flow",
  C148: "his real travel policy and the cancelled trip's cost", C149: "his real card, the item, its price and purchase date",
  C150: "his real carrier and live carrier session; each account's 2FA change is his own tap", C152: "his real virtual-card service session and the limit he picks",
  C171: "his real servicer, loan balances, rates and income for plan math (no loans on file in Upmore today)", C183: "his real pet insurer, policy, pet and vet invoice (no pet on file today)",
  C185: "his real account list and each institution's beneficiary record", C188: "his real I-PASS account and its transactions",
  C192: "his real airline credits from receipts/accounts", C194: "his real destination, spend and the live rates on the day (rates here are supplied stand-ins)",
  C195: "the real beneficiary's legal name and his real account list", C200: "his real account list per institution; his old (Hawthorn Woods) and new (1210 S Indiana Ave Apt 1702, Chicago) addresses are his real ones on file",
  C206: "the real form, the institution requiring the medallion, and his ID for the visit",
};

const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let n = 0;
const tx = (d, c, m) => ({ account_id: "mock-card", provider_transaction_id: `k8-${++n}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD" });

function specialTurns(id, msgs) {
  if (id === "C74") {
    const rows = [
      tx("2026-07-22", -1549, "NETFLIX.COM"), tx("2026-08-22", -1549, "NETFLIX.COM"), tx("2026-09-22", -1549, "NETFLIX.COM"),
      tx("2026-07-27", -1199, "SPOTIFY PREMIUM"), tx("2026-08-27", -1199, "SPOTIFY PREMIUM"), tx("2026-09-27", -1199, "SPOTIFY PREMIUM"),
      tx("2026-07-25", -299, "APPLE.COM/BILL"), tx("2026-08-25", -299, "APPLE.COM/BILL"), tx("2026-09-25", -299, "APPLE.COM/BILL"),
    ];
    msgs.push({ who: "user", text: "what subscriptions do i have?" });
    msgs.push({ who: "agent", text: SubscriptionList.answer(rows, "what subscriptions do i have", new Date("2026-10-12T14:00:00Z"), { tz: "America/Chicago" }) });
  }
  if (id === "C93") {
    msgs.push({ who: "user", text: "target dropped the price of my air fryer from $89.99 to $69.99" });
    msgs.push({ who: "agent", text: PriceDrop.answer("target dropped the price of my air fryer from $89.99 to $69.99", "2026-10-12", [tx("2026-10-03", -9630, "TARGET 00012345")], book) });
  }
  if (id === "C95") {
    const accounts = [
      { account_id: "mock-ff", name: "Chase Freedom Flex", institution: "Mock Chase", account_kind: "credit", status: "active" },
      { account_id: "mock-csp", name: "Sapphire Preferred", institution: "Mock Chase", account_kind: "credit", status: "active" },
    ];
    const rows = [tx("2026-10-02", -12000, "KROGER #0042"), tx("2026-10-05", -4500, "CHIPOTLE 1234")];
    rows[0].account_id = "mock-ff"; rows[1].account_id = "mock-ff";
    msgs.push({ who: "user", text: "how am i doing on my freedom flex 5% this quarter" });
    msgs.push({ who: "agent", text: RewardsMath.answer("how am i doing on my freedom flex 5% this quarter", "2026-10-12", accounts, rows, book) });
  }
}

const summary = [];
for (const c of P.CASES) {
  const id = c.id, f = FACTS[id];
  const msgs = [];
  specialTurns(id, msgs);
  msgs.push({ who: "user", text: SAY[id] });
  const provider = P.createProvider({ [id]: { state: "active" } });
  const prep = P.prepare(id, f);
  msgs.push({ who: "agent", text: prep.text });
  let outcome = prep.text, state = "read-only answer", ref = null;
  if (prep.kind === "card") {
    // Adversarial beat inside the same conversation: a non-yes must not execute; the record stays active.
    const refuse = P.execute(id, f, provider, "do it", prep.fingerprint);
    msgs.push({ who: "user", text: "do it" });
    msgs.push({ who: "agent", text: refuse.text });
    const done = P.execute(id, f, provider, "yes", prep.fingerprint);
    msgs.push({ who: "user", text: "yes" });
    msgs.push({ who: "agent", text: done.text });
    outcome = done.text; ref = done.reference; state = done.state;
    const v = P.verify(id, provider, f);
    if (!v.done) throw new Error(`${id} did not verify: ${v.reason}`);
  }
  // C74 second pick: iCloud, its own card and its own yes, on its own provider record.
  if (id === "C74") {
    const f2 = { merchant: "iCloud", plan: "iCloud+ 50GB", monthly_cents: 299, account: "Apple ID / Chase Visa ending 4417", next_charge: "Oct 25, 2026" };
    const provider2 = P.createProvider({ C74: { state: "active" } });
    const prep2 = P.prepare("C74", f2);
    msgs.push({ who: "user", text: "cancel the icloud one too" });
    msgs.push({ who: "agent", text: prep2.text });
    const done2 = P.execute("C74", f2, provider2, "yes", prep2.fingerprint);
    msgs.push({ who: "user", text: "yes" });
    msgs.push({ who: "agent", text: done2.text });
    outcome = done2.text; ref = done2.reference;
  }
  const base = `${id}-${slug(c.title)}`;
  const title = `${id} — ${c.title}`;
  const header = [
    `# ${title}: full conversation`, "",
    `Cluster K8 sandbox proof, run 2026-10-12, America/Chicago, through the production code path: the card/answer`,
    `turn is PortalCases.prepare — the function agent-chat's _shared/portal_answer.ts serves through the router`,
    `bundle — and the yes turn is PortalCases.execute on the sandbox provider rail, where done is read back from`,
    `the provider's own record (state after the run: ${state}${ref ? `, reference ${ref}` : ""}), never from the agent's say-so.`,
    `The "do it" turn is the adversarial beat: it is not a yes to the card, so nothing executes.`,
    `Data: stand-in facts (tests/portal-cases-facts.cjs in the repo) — NOT the owner's real facts, except where`,
    `the facts file says so. Live proof needs: ${NEEDS[id]}.`,
    `Provider portals are NOT_WIRED live; the conversation itself states that boundary. Every message below is`,
    `complete and word-for-word, both directions, nothing trimmed.`, "",
  ].join("\n");
  const body = msgs.map(m => `${m.who === "user" ? "USER" : "UPMORE"}: ${m.text}`).join("\n---\n");
  fs.writeFileSync(path.join(OUT, `${base}.md`), header + body + "\n");
  fs.writeFileSync(path.join(OUT, `${base}.messages.json`), JSON.stringify({ title, messages: msgs }, null, 2));
  summary.push({ id, title: c.title, base, mode: c.mode, state, reference: ref, amount_cents: c.amount(f), outcome, card: prep.kind === "card" ? prep.text : null, answer: prep.kind === "answer" ? prep.text : null });
}
fs.writeFileSync("/tmp/k8-surfaces.json", JSON.stringify(summary, null, 2));
console.log(`wrote ${summary.length} conversations to ${OUT}`);
