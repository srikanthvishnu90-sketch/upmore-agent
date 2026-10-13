// K12 transcripts, edge harness: the production chat path for found money and scam triage, end to end.
// C90/C94 run through supabase/functions/agent-chat/_shared/found_money_answer.ts (the handler's own wrapper) over
// the bundled FoundMoney; C91's plan needs the person's name and states, which no production store supplies yet, so
// its turns run the same bundled module with the wrapper's exact dataset (the wrapper's header says this plainly);
// C146 runs the bundled ScamCheck the handler's early guard calls. All person data is STAND-IN (a fictional Sam
// Rivera and invented purchases), labeled MOCK; the datasets are the real verified rows (packages/offers/).
// The conversations are saved at ~/workspace/your_files/upmore-conversations/C90-find-class-actions.md,
// C91-recover-unclaimed-property.md, C94-cash-in-on-a-product-recall.md and C146-scam-triage.md.
import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { foundMoneyReply } from "../../supabase/functions/agent-chat/_shared/found_money_answer.ts";
import { FoundMoney, ScamCheck, SETTLEMENTS_JSON, RECALLS_JSON, STATE_UNCLAIMED_SEARCH_JSON } from "../../supabase/functions/_shared/router_core.js";

const TODAY = "2026-10-12";
const TX = [
  ["2024-06-14", -2500, "MDLIVE"], ["2021-03-02", -4000, "GETTINGOUT"], ["2024-01-15", -1499, "AMAZON PRIME"],
  ["2026-02-10", -3000, "TARGET MELISSA DOUG FIRE TRUCK ACTIVITY BOARD"], ["2025-03-03", -4599, "AMAZON JKMAX HEATED BLANKET"], ["2025-05-20", -1999, "AMAZON"],
].map(([d, c, m], i) => ({ account_id: "mock-chk", provider_transaction_id: `mock-${i}`, posted_on: d as string, amount_cents: c as number, merchant_raw: m as string, is_pending: false, is_transfer: false }));
const readTx = async () => TX as any[];
const FM = FoundMoney as any;
const CTX = { today: TODAY, settlements: SETTLEMENTS_JSON, recalls: RECALLS_JSON, stateSearch: STATE_UNCLAIMED_SEARCH_JSON, transactions: TX.map((t) => ({ date: t.posted_on, amount_cents: t.amount_cents, merchant: t.merchant_raw })), person: { name: "Sam Rivera", first: "Sam", last: "Rivera" }, states: ["IL", "CA"], properties: [
  { id: "IL-2026-88410", holder: "Springfield Utility District", amount_cents: 18642, address: "400 W Elm St", city: "Springfield", state: "IL", reported_on: "2023-05-01" },
  { id: "CA-77-2210", holder: "Bay City Water", amount_cents: 5910, address: "88 Mission St", city: "San Francisco", state: "CA", reported_on: "2022-11-15" },
] };

Deno.test("K12 C90 transcript: match, packet, filed — through the handler's wrapper", async () => {
  const a = await foundMoneyReply("Find any class action settlements I qualify for and claim them.", TODAY, readTx);
  assertMatch(a!, /^3 open settlements match your evidence:/);
  assertMatch(a!, /MDLIVE \/ Evernorth privacy settlement \(Kingsbury, et al\. v\. Evernorth Health Inc\., et al\., Case No\. 26-CA-006880\): Up to \$15\.00 cash/);
  assertMatch(a!, /Claim by Dec 1, 2026 at https:\/\/www\.ehisettlement\.com\./);
  assertMatch(a!, /Nothing has been filed\./);
  const p = await foundMoneyReply("prepare the mdlive claim", TODAY, readTx);
  assertMatch(p!, /^Claim packet — MDLIVE \/ Evernorth privacy settlement\. Prepared for you to file; nothing has been submitted\./);
  assertMatch(p!, /Deadline: Dec 1, 2026 \(50 days left\)/);
  const f = await foundMoneyReply("i filed the mdlive claim", TODAY, readTx);
  assertMatch(f!, /^Recorded: you filed the MDLIVE \/ Evernorth privacy settlement claim\./);
  assertEquals(await foundMoneyReply("what's my balance", TODAY, readTx), null);
});

Deno.test("K12 C94 transcript: confirmed and unconfirmed recalls — through the handler's wrapper", async () => {
  const a = await foundMoneyReply("Anything I own been recalled?", TODAY, readTx);
  assertMatch(a!, /^2 of your purchases match an open recall:/);
  assertMatch(a!, /JKMAX Heated Blanket: your AMAZON JKMAX HEATED BLANKET charge of \$45\.99 on Mar 3, 2025\. CPSC recall 26-778/);
  assertMatch(a!, /Melissa & Doug Lights & Sounds Fire Truck Activity Board: your TARGET MELISSA DOUG FIRE TRUCK ACTIVITY BOARD charge of \$30\.00 on Feb 10, 2026\. CPSC recall 26-780/);
  assertMatch(a!, /I won't put a dollar on an unconfirmed match\./);
  const p = await foundMoneyReply("prepare the JKMAX recall claim", TODAY, readTx);
  assertMatch(p!, /^Recall claim packet — JKMAX Heated Blanket\. Prepared for you to submit; nothing has been sent\./);
  assertMatch(p!, /Expected back: \$45\.99 \(your full purchase price\)/);
});

Deno.test("K12 C91 transcript: the search plan and the claim packet (bundled module, stand-in facts)", () => {
  const plan = FM.answer("Check if any state is holding money for me.", CTX);
  assertEquals(plan.kind, "unclaimed_search");
  assertMatch(plan.text, /Illinois: I-Cash \(Illinois State Treasurer\) — search "Rivera, Sam" at https:\/\/icash\.illinoistreasurer\.gov\//);
  assertMatch(plan.text, /\$186\.42 from Springfield Utility District/);
  assertMatch(plan.text, /\$59\.10 from Bay City Water/);
  const packet = FM.answer("claim the Springfield Utility District", CTX);
  assertEquals(packet.kind, "property_packet");
  assertMatch(packet.text, /Prepared for you to file; nothing has been submitted\./);
});

Deno.test("K12 C146 transcript: the bank-text verdict and the recovery case (bundled ScamCheck, the handler's early guard)", () => {
  const S = ScamCheck as any;
  const verdict = S.answer("Is this text from my bank real? It says: CHASE ALERT your account is locked, verify within 24 hours at chase-verify-secure.com or it will be closed");
  assertMatch(verdict, /^Treat that text as fake\. The link's address puts your bank's name inside a different website's address/);
  const moved = "i think i got scammed, i already sent $500 by zelle to a guy who said he was from my bank's fraud team";
  assertMatch(S.answer(moved), /^This is a recovery case now, and minutes matter/);
  const r = S.recovery(moved, { today: TODAY });
  assertEquals(r.kind, "scam_recovery");
  assertEquals(r.status, "open");
  assertEquals(r.steps.length, 5);
  assertEquals(S.answer("is my bank open today"), null);
});
