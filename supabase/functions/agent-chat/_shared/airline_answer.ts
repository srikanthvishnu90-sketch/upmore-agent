// Airline refunds under the DOT rules answered from code (overnight C1, 2026-10-12): a cancelled or badly changed
// flight, a late checked bag, a paid extra not delivered, an involuntary bump. Every threshold, multiple and cap comes
// from the offer book (packages/offers/terms.json) with its source and checked date; every amount from the person's own
// card rows with the date and as-of. The person sends the request themselves: Upmore never contacts the airline, files
// or pays. Thin wrapper over packages/domain/83-airline-refunds.js (AirlineRefunds, through the router bundle); pure
// apart from the injected reader, so tests/edge/airline-answer.test.ts drives it with fixtures. Mirrors dispute_answer.ts.
import { AirlineRefunds, OfferBook, OFFER_TERMS_JSON } from "../../_shared/router_core.js";
import type { TxRow } from "./direct_answers.ts";

let book: any = null;
const usable = (rows: TxRow[]) => rows.filter((r) => r && r.posted_on && Number.isFinite(r.amount_cents));

export function isAirlineAsk(message: string): boolean {
  return AirlineRefunds.isAirlineAsk(message);
}

export async function airlineReply(message: string, today: string, readTx: () => Promise<TxRow[]>): Promise<string | null> {
  if (!AirlineRefunds.isAirlineAsk(message)) return null;
  book ??= OfferBook.create(OFFER_TERMS_JSON);
  const rows = usable(await readTx());
  return AirlineRefunds.answer(message, rows, { today, book }).text ?? null;
}
