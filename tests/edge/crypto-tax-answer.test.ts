// Crypto tax export (real-world C163; TAX-007) through the edge wrapper (_shared/crypto_tax_answer.ts over the
// bundled CryptoTax), and the crypto guard's one carve-out: tax words with no trade verb, and a pasted CSV,
// reach the export; every trade ask keeps the refusal. All rows are stand-in data, labeled as such.
// Permission-free.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { cryptoTaxReply } from "../../supabase/functions/agent-chat/_shared/crypto_tax_answer.ts";
import { tryCryptoGuard } from "../../supabase/functions/agent-chat/_shared/capabilities.ts";

const CSV = [
  "Date,Type,Asset,Quantity,Price,Total,Fee,Exchange,Note",
  "2024-03-10,buy,BTC,0.5,40000,20000,50,StandIn Exchange,first buy",
  "2024-06-15,buy,BTC,0.25,52000,13000,25,StandIn Exchange,",
  "2025-02-20,buy,ETH,2,2500,5000,10,StandIn Exchange,",
  "2025-05-01,sell,BTC,0.6,60000,36000,60,StandIn Exchange,",
  "2025-08-10,sell,ETH,1,3200,3200,5,StandIn Exchange,",
  "2025-09-05,reward,SOL,0.8,200,160,0,StandIn Exchange,staking reward",
  "2025-11-01,sell,BTC,0.3,70000,21000,0,StandIn Exchange,",
].join("\n");

Deno.test("the guard: tax asks pass, trade asks keep the refusal, a pasted CSV passes", () => {
  for (const a of ["Get my crypto taxes sorted.", "what's my bitcoin cost basis for my 1099", "crypto tax export please", "form 8949 for my ethereum sales taxes"])
    assertEquals(tryCryptoGuard(a), null, a);
  assertEquals(tryCryptoGuard("here's the file:\n" + CSV), null, "a pasted CSV is data for the export");
  for (const a of ["buy some ETH", "sell my bitcoin and do my taxes", "swap my btc for eth", "should i invest in solana"])
    assert(tryCryptoGuard(a), a);
});

Deno.test("the ask with no file: the honest prompt, nothing invented", async () => {
  const r = (await cryptoTaxReply("Get my crypto taxes sorted."))!;
  assertMatch(r, /no crypto venue is connected to Upmore and no crypto transactions are on file/);
  assertMatch(r, /This is an export, not a filing/);
});

Deno.test("the ask with the file in the same message: the full export, hand-parity totals", async () => {
  const r = (await cryptoTaxReply("Get my crypto taxes sorted. Tax year 2025, FIFO. My 1099-DA says gross proceeds $60,200.\n" + CSV))!;
  assertMatch(r, /Gains: short-term \$1,470\.00, long-term \$12,585\.00, total \$14,055\.00\./);
  assertMatch(r, /Missing data, listed honestly: \$10,500\.00 of proceeds have no basis in the file/);
  assertMatch(r, /1099-DA check: the export's gross proceeds \$60,200\.00 match the \$60,200\.00 you quoted from the form, to the cent\./);
  assertMatch(r, /Form 8949 export \(one row per lot portion\):/);
  assertMatch(r, /Nothing was filed or sent anywhere\./);
});

Deno.test("a bare CSV following the prompt in the thread is claimed, with the earlier turn's words", async () => {
  const thread = [
    { role: "assistant", content: await cryptoTaxReply("Get my crypto taxes sorted. Tax year 2025, use LIFO.") },
    { role: "user", content: "Get my crypto taxes sorted. Tax year 2025, use LIFO." },
  ];
  const previous = async () => thread.slice().reverse(); // the handler's reader is newest first
  const r = (await cryptoTaxReply(CSV, previous))!;
  assertMatch(r, /Crypto tax export for 2025, LIFO/);
  assertMatch(r, /short-term \$2,640\.00, long-term \$11,415\.00, total \$14,055\.00/);
});

Deno.test("a bare CSV with no tax conversation in the thread is not claimed", async () => {
  const previous = async () => [{ role: "assistant", content: "Your checking balance is $10.00." }];
  assertEquals(await cryptoTaxReply(CSV, previous), null);
  assertEquals(await cryptoTaxReply("buy some bitcoin"), null);
  assertEquals(await cryptoTaxReply("what's my checking balance"), null);
});
