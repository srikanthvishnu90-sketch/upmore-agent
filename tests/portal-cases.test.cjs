// Portal cases (packages/domain/118-portal-cases.js, cluster K8): every one of the 43 items detects, asks for a
// costly missing detail instead of guessing, shows an Operating Model card, and finishes ONLY on the sandbox
// provider's own read-back (execute mode) or as a packet_ready record that is never called filed (packet mode).
// Adversarial: no yes / stale yes / changed amount / say-so record / double execution. Facts are stand-ins
// (tests/portal-cases-facts.cjs), labeled as such there.
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../packages/domain/118-portal-cases.js");
const FACTS = require("./portal-cases-facts.cjs");

const IDS = ["C73","C74","C75","C76","C78","C80","C81","C82","C84","C85","C86","C87","C88","C89","C92","C93","C95","C100","C109","C112","C113","C117","C121","C122","C123","C124","C143","C144","C145","C147","C148","C149","C150","C152","C171","C183","C185","C188","C192","C194","C195","C200","C206"];
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

test("all 43 items exist, detect from the capability doc's own Say phrasing, and no other item steals the message", () => {
  assert.equal(P.CASES.length, 43);
  for (const id of IDS) {
    assert.equal(P.detect(SAY[id]), id, `${id}: ${SAY[id]}`);
  }
});

test("unrelated messages detect nothing (the cancel flow, balances and sends keep their owners)", () => {
  for (const m of ["what's my balance", "send maya 40", "buy $5 of voo", "how much did i spend on groceries", "remind me to pay rent on the 28th", "cancel my spotify subscription and the hulu one too please", "what subscriptions do i have"]) {
    // Bare Spotify/Hulu cancels belong to the production cancel flow (AgentCancel); the portal table fires on
    // its own distinctive phrasings only, and in the handler it is checked after the flows for the same reason.
    assert.equal(P.detect(m), null, m);
  }
});

test("every item: missing facts ask ONE exact question and produce no card", () => {
  for (const id of IDS) {
    const p = P.prepare(id, {});
    assert.equal(p.kind, "ask", id);
    assert.ok(p.missing.length >= 1, id);
    assert.doesNotMatch(p.text, /Yes\?/, id);
  }
});

test("every execute/packet item: the card carries action, exact amount, account, counterparty, fees and reversibility", () => {
  for (const id of IDS) {
    const c = P.get(id);
    if (c.mode === "readonly") { const p = P.prepare(id, FACTS[id]); assert.equal(p.kind, "answer", id); continue; }
    const p = P.prepare(id, FACTS[id]);
    assert.equal(p.kind, "card", id);
    assert.match(p.text, /Amount: \$/, id);
    assert.match(p.text, /Fees: \$0\.00/, id);
    assert.match(p.text, /Counterparty: /, id);
    assert.match(p.text, /Yes\?$/, id);
    if (c.mode === "packet") assert.match(p.text, /Nothing is filed, sent or signed/, id);
  }
});

function run(id) {
  const provider = P.createProvider({ [id]: { state: "active" } });
  const prep = P.prepare(id, FACTS[id]);
  const out = P.execute(id, FACTS[id], provider, "yes", prep.fingerprint);
  return { provider, prep, out };
}

test("every execute item finishes only on the provider read-back, with the finished state named", () => {
  for (const id of IDS) {
    const c = P.get(id);
    if (c.mode !== "execute") continue;
    const { provider, out } = run(id);
    assert.equal(out.ok, true, `${id}: ${out.text}`);
    assert.equal(P.verify(id, provider, FACTS[id]).done, true, id);
    assert.ok(out.reference.startsWith("SBX-"), id);
  }
});

test("every packet item is packet_ready, never filed, and the text says the owner submits", () => {
  for (const id of IDS) {
    const c = P.get(id);
    if (c.mode !== "packet") continue;
    const { provider, out } = run(id);
    assert.equal(out.ok, true, `${id}: ${out.text}`);
    assert.equal(provider.read(id).state, "packet_ready", id);
    assert.match(out.text, /I did not (file|send|submit|book)/, id);
    assert.doesNotMatch(out.text, /claim (number|reference)[: ]+ ?[A-Z0-9-]*\d[A-Z0-9-]*/i, id);
  }
});

test("no yes, no execution: the provider record is untouched", () => {
  for (const id of ["C73", "C117", "C145", "C82"]) {
    const provider = P.createProvider({ [id]: { state: "active" } });
    const prep = P.prepare(id, FACTS[id]);
    for (const approval of ["ok", "do it", "yes please cancel it", "", "yeah"]) {
      const out = P.execute(id, FACTS[id], provider, approval, prep.fingerprint);
      assert.equal(out.ok, false, `${id} approval=${approval}`);
    }
    assert.equal(provider.read(id).state, "active", id);
    assert.equal(provider.credits().length, 0, id);
  }
});

test("a yes to a changed card does not execute (amount or counterparty moved)", () => {
  const provider = P.createProvider({ C73: { state: "active" } });
  const prep = P.prepare("C73", FACTS.C73);
  const changed = Object.assign({}, FACTS.C73, { monthly_cents: 2299 });
  const out = P.execute("C73", changed, provider, "yes", prep.fingerprint);
  assert.equal(out.ok, false);
  assert.match(out.text, /changed since the card/);
  assert.equal(provider.read("C73").state, "active");
});

test("double execution is idempotent: same reference, one credit, state flips once", () => {
  const { provider, prep } = run("C121");
  const again = P.execute("C121", FACTS.C121, provider, "yes", prep.fingerprint);
  assert.equal(again.ok, true);
  assert.equal(provider.credits().length, 1);
  const run2 = run("C73");
  const again2 = P.execute("C73", FACTS.C73, run2.provider, "yes", run2.prep.fingerprint);
  assert.equal(again2.reference, run2.out.reference);
});

test("say-so is not proof: a record that reads active, or a bare 'cancelled' report, verifies nothing", () => {
  const provider = P.createProvider({ C73: { state: "active" } });
  assert.equal(P.verify("C73", provider, FACTS.C73).done, false);
  const provider2 = P.createProvider({ C73: { state: "cancelled", next_charge_at: "2026-10-22" } });
  assert.equal(P.verify("C73", provider2, FACTS.C73).done, false);
  assert.match(P.verify("C73", provider2, FACTS.C73).reason, /next charge is still scheduled/);
});

test("Muse-parity dollars, computed by hand first: PMI, water, renters, pet, loans, rent renewal, currency", () => {
  // C117: 312000/410000 = 76.0975..% -> 76.1%; PMI $118/mo -> $1,416/yr
  assert.match(run("C117").out.text, /Loan-to-value is 76\.1% \(\$312,000\.00 balance on a \$410,000\.00 value\)/);
  assert.match(run("C117").out.text, /saves \$118\.00 a month, \$1,416\.00 a year/);
  // C121: 264.00 - 86.00 = 178.00
  assert.match(run("C121").out.text, /credit of \$178\.00 posted/);
  // C144: 1200 - 500 deductible = 700 expected
  assert.match(run("C144").out.text, /expected payout is \$700\.00/);
  assert.match(run("C144").out.text, /policy LP491F6A784/);
  // C183: (1800-250)*0.8 = 1240
  assert.match(run("C183").out.text, /expected payout is \$1,240\.00/);
  // C171: 0.25% of 18400 = 46.00 first-year interest saving
  assert.match(run("C171").out.text, /worth about \$46\.00 of interest in the first year on your \$18,400\.00 balance at 5\.50%/);
  // C112: (2000-1900)*12 = 1200/yr
  assert.match(run("C112").out.text, /saves \$1,200\.00 a year versus the ask/);
  // C194: 80 - 5 = 75 saved on $1,000
  assert.match(P.prepare("C194", FACTS.C194).text, /saves \$75\.00 versus the airport desk/);
  // C76: 95 -> 75 = 20/mo, 240/yr
  assert.match(run("C76").out.text, /That is \$20\.00 less a month, \$240\.00 a year/);
  // C73: monthly and yearly on the card
  assert.match(P.prepare("C73", FACTS.C73).text, /\$15\.49 a month, \$185\.88 a year/);
  // C92: the €600 label is carried, never silently converted
  assert.match(run("C92").out.text, /claims €600 \(about \$648\.00 at the supplied 1\.08 rate\)/);
});

test("readonly items change nothing and say so", () => {
  for (const id of ["C185", "C192", "C194"]) {
    const p = P.prepare(id, FACTS[id]);
    assert.equal(p.kind, "answer", id);
    assert.match(p.text, /nothing (was|were) changed|Nothing was changed|Nothing was ordered/i, id);
  }
});
