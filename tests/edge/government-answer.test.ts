// Government preparation through the production chat path (cluster K11; C119, C120, C160, C162, C166):
// packages/domain/118-agent-government.js (Government) as bundled into the router core, driven through
// supabase/functions/agent-chat/_shared/government_answer.ts with fixture readers. The profile fixtures are
// STAND-IN data (flagged in the cluster doc): the owner rents in Chicago and no county, IRS or FinCEN
// connector exists, so no real property, notice, refund or foreign-account record was available to run on.
// Permission-free: JSON and text imports only.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { governmentReply, governmentKind } from "../../supabase/functions/agent-chat/_shared/government_answer.ts";
import { GOVERNMENT_JSON } from "../../supabase/functions/_shared/router_core.js";
import DATA from "../../packages/offers/government.json" with { type: "json" };

const TODAY = "2026-10-12";
const noProfile = async () => null;
const noTx = async () => [];

Deno.test("the bundle carries the dated government file as it is on disk", () => {
  assertEquals(GOVERNMENT_JSON, DATA);
});

Deno.test("C160 from the message alone: CP2000 decoded with its deadline clock", async () => {
  const reply = await governmentReply("I got a CP2000 notice dated October 2, 2026 saying I owe $1,240. What do I do?", TODAY, { profile: noProfile, transactions: noTx });
  assert(reply);
  assertMatch(reply!, /CP2000 — Proposed changes to your return/);
  assertMatch(reply!, /respond by Sunday November 1, 2026 — 20 days from today/);
  assertMatch(reply!, /you submit it yourself/);
});

Deno.test("C166 from the message alone: stated balances run the aggregate math", async () => {
  const reply = await governmentReply("I have $7,250 in an account in India and $4,180.50 in Canada — do I need an FBAR?", TODAY, { profile: noProfile, transactions: noTx });
  assertMatch(reply!, /Aggregate maximum: \$11,430\.50/);
  assertMatch(reply!, /an FBAR \(FinCEN Form 114\) is required/);
});

Deno.test("C119 with a stand-in profile: the comps packet and $1,246.07 a year", async () => {
  const profile = async () => ({
    county_id: "cook-il",
    property: { assessed_cents: 5200000, prior_assessed_cents: 4333300, notice_date: "2026-09-28", equalizer: "2.9237", tax_rate: "0.0693" },
    comps: [
      { address: "a similar home two doors down", assessed_cents: 4480000 },
      { address: "a similar home across the street", assessed_cents: 4620000 },
      { address: "a similar home on the next block", assessed_cents: 4550000 },
      { address: "a similar home around the corner", assessed_cents: 4710000 },
    ],
  });
  const reply = await governmentReply("My assessment jumped 20%. Appeal it.", TODAY, { profile, transactions: noTx });
  assertMatch(reply!, /median assessed value is \$45,850\.00/);
  assertMatch(reply!, /worth about \$1,246\.07 a year/);
  assertMatch(reply!, /due Wednesday October 28, 2026 — 16 days from today/);
});

Deno.test("C120 with a stand-in profile: eligible, $693.00 a year", async () => {
  const profile = async () => ({ county_id: "cook-il", property: { tax_rate: "0.0693" }, facts: { owns_or_responsible: true, primary_residence_jan1: true, not_already_on_record: true } });
  const reply = await governmentReply("Am I getting the homestead exemption? File it if not.", TODAY, { profile, transactions: noTx });
  assertMatch(reply!, /You meet every Cook County, Illinois rule on file/);
  assertMatch(reply!, /worth \$693\.00 a year/);
});

Deno.test("C162 with a stand-in profile: the deposit is detected in the person's transactions", async () => {
  const profile = async () => ({ refund: { jurisdiction: "federal", amount_cents: 324000, stage: "sent", as_of: "2026-03-02" } });
  const tx = async () => [{ merchant_raw: "IRS TREAS 310 TAX REF", amount_cents: 324000, posted_on: "2026-03-04" }];
  const reply = await governmentReply("Where's my tax refund?", TODAY, { profile, transactions: tx as any });
  assertMatch(reply!, /It has landed: \$3,240\.00 posted to your account on Mar 4, 2026/);
});

Deno.test("routing discipline: merchant refunds and balances never reach the government path", async () => {
  assertEquals(governmentKind("where's my refund from REI?"), null);
  assertEquals(governmentKind("what's my checking balance"), null);
  assertEquals(await governmentReply("where's my refund from REI?", TODAY, { profile: noProfile, transactions: noTx }), null);
});
