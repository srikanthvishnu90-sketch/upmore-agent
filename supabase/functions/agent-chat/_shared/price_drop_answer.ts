// Price-drop claims in chat (overnight C5): "target dropped the price of my air fryer from $89.99 to $69.99". The window
// and exclusions come from the dated offer book, the purchase from the person's own card rows, and the request is a
// draft they send to the store (packages/domain/88-price-drop.js). Pure apart from the injected reader.
import { PriceDrop, OfferBook, OFFER_TERMS_JSON } from "../../_shared/router_core.js";

const BOOK = OfferBook.create(OFFER_TERMS_JSON);

export async function priceDropReply(message: string, today: string, readTx: () => Promise<any[]>): Promise<string | null> {
  if (!PriceDrop.parse(message, today)) return null;
  return PriceDrop.answer(message, today, await readTx(), BOOK);
}
