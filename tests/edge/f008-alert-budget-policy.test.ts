// Repository-only policy verification for audit F-008; no provider, delivery or database.
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { AgentLoop } from "../../supabase/functions/_shared/router_core.js";
import { accountRows, txRows, NOW } from "./lib/proactive_fixture.ts";

function assert(ok: unknown, why: string) { if (!ok) throw new Error(why); }
const HOUR = 3_600_000;
const extra = (id: string, cents: number, merchant: string) => ({
  account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents,
  posted_on: "2026-10-11", merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed",
});
function input(sent: { key: string; sent_at: number; cadence: boolean }[] = []) {
  return { accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows([
    extra("big", -89900, "BEST BUY 00123"), extra("fee", -3500, "OVERDRAFT FEE"),
  ])), settings: null, sent };
}

Deno.test("F008: exactly one unrequested ordinary finding fits, the next has a named budget refusal", () => {
  const out = plan(input(), NOW);
  assert(out.messages.filter(m => m.kind === "finding" && !m.cadence).length === 1, "ordinary finding budget exceeded");
  assert(out.suppressed.some(s => s.reason === "daily_budget" && /fee/.test(s.key)), "second ordinary finding did not wait");
});

Deno.test("F008: persisted sent rows suppress repetition and another ordinary finding in the next hour", () => {
  const first = plan(input(), NOW);
  const sent = first.messages.map(m => ({ key: m.key, sent_at: NOW, cadence: m.cadence }));
  const again = plan(input(sent), NOW + HOUR);
  assert(again.messages.filter(m => m.kind === "finding" && !m.cadence).length === 0, "ordinary budget reset inside the day");
});

Deno.test("F008: requested cadence is explicitly exempt, so total finding count is not the ordinary budget", () => {
  const out = plan(input(), NOW);
  assert(out.messages.filter(m => m.kind === "finding").length === 2, "fixture no longer exercises the reported two-findings shape");
  assert(out.messages.some(m => m.kind === "finding" && m.cadence && /upcoming_large/.test(m.key)), "standing requested radar missing");
  assert(out.messages.some(m => m.kind === "finding" && !m.cadence), "ordinary finding missing");
});

Deno.test("F008: urgent findings retain the explicit registry exemption", () => {
  const verdict = AgentLoop.budgetAllows([NOW - 1], { urgent: true }, NOW);
  assert(verdict.allowed && verdict.reason === "urgent", "urgent policy changed without owner instruction");
});

Deno.test("F008: a real near deadline retains its exemption and a distant deadline does not", () => {
  const near = AgentLoop.budgetAllows([NOW - 1], { deadline: NOW + HOUR, reason: "synthetic deadline" }, NOW);
  const far = AgentLoop.budgetAllows([NOW - 1], { deadline: NOW + 72 * HOUR, reason: "synthetic deadline" }, NOW);
  assert(near.allowed && near.reason === "deadline", "near deadline exemption missing");
  assert(!far.allowed && far.reason === "daily_budget", "distant deadline bypassed budget");
});

Deno.test("F008: ALRT-012 registry specifies non-urgent budget with named exceptions", async () => {
  const registry = JSON.parse(await Deno.readTextFile(new URL("../../packages/capabilities/registry.json", import.meta.url)));
  const rows = Array.isArray(registry) ? registry : registry.capabilities;
  const note = rows.find((x: { id: string }) => x.id === "ALRT-012")?.note;
  assert(typeof note === "string" && /one non-urgent message per day/.test(note) && /urgent, requested cadence and real deadlines bypass/.test(note), "registry contract changed; revisit policy classification");
});
