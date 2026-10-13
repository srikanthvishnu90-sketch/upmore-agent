// Found money answered from code (cluster K12: C90 class action settlements, C91 unclaimed property search, C94
// product recalls): eligibility matched against the person's own transactions and notices, claim packets prepared
// for the person's own filing, official state search portals named per state, and recalls matched on the product,
// not only the store. Thin wrapper over packages/domain/118-found-money.js (FoundMoney, through the router bundle)
// and its three dated datasets (packages/offers/settlements.json, state-unclaimed-search.json, recalls.json).
// Pure apart from the injected transaction reader, so tests/edge/found-money-answer.test.ts drives it with fixtures.
//
// What is NOT wired, said plainly: there is no store yet for the person's name/states-lived, for administrator
// notices, or for state property rows, so the handler passes none. Settlements and recalls therefore match on
// transactions alone; a notice the person names in their message is picked up by the module itself; and the
// unclaimed answer asks for the name and states when it has none. Nothing is filed from here — filing is the
// person's own tap on the administrator's or state's site.
import { FoundMoney, SETTLEMENTS_JSON, RECALLS_JSON, STATE_UNCLAIMED_SEARCH_JSON } from "../../_shared/router_core.js";
import type { TxRow } from "./direct_answers.ts";

const DATA = { settlements: SETTLEMENTS_JSON, recalls: RECALLS_JSON, stateSearch: STATE_UNCLAIMED_SEARCH_JSON };

export function foundMoneyKind(message: string): string | null {
  return (FoundMoney as any).kind(message, DATA);
}

export async function foundMoneyReply(message: string, today: string, readTx: () => Promise<TxRow[]>): Promise<string | null> {
  const k = (FoundMoney as any).kind(message, DATA);
  if (!k) return null;
  const ctx: Record<string, unknown> = { today, ...DATA };
  if (k === "settlements" || k === "settlements_notice" || k === "settlement_packet" || k === "recalls") {
    const rows = await readTx();
    ctx.transactions = rows.filter((r) => !r.is_pending && r.posted_on).map((r) => ({ id: r.provider_transaction_id, date: r.posted_on, amount_cents: r.amount_cents, merchant: r.merchant_raw, account: r.account_id }));
  }
  const r = (FoundMoney as any).answer(message, ctx);
  return r ? (r.text ?? null) : null;
}
