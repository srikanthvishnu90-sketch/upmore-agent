// Free substitutes in chat (overnight D7, Methods 3 M3-SUBS-11 and M3-SHOP-06), [Read] suggestions only: Kanopy through
// a library card next to each paid streaming charge in the person's rows (its $0 price from the dated offer book, the gap
// from their own charge), and store-brand swaps from a receipt they paste (no store-brand price on file, so no number:
// the shelf tag has it). Thin wrapper over packages/domain/89-free-substitutes.js; nothing is cancelled or bought. Rows
// are read only for a library-streaming ask; a receipt reads nothing.
import { FreeSubstitutes, OfferBook, OFFER_TERMS_JSON } from "../../_shared/router_core.js";
import type { TxRow } from "./direct_answers.ts";

const BOOK = OfferBook.create(OFFER_TERMS_JSON);

export async function substitutesReply(message: string, today: string, readTx: () => Promise<TxRow[]>): Promise<string | null> {
  const kind = FreeSubstitutes.kind(message);
  if (!kind) return null;
  const transactions = kind === "library" ? await readTx() : [];
  return FreeSubstitutes.answer({ message, today, book: BOOK, transactions });
}
