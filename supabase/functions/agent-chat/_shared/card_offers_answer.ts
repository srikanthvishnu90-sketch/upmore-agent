// Card-linked offers in chat (overnight F4, Methods 1 M1-CARD-08): the person pastes or forwards Amex Offers, Chase
// Offers, BankAmeriDeals and the like; each offer's terms come only from the pasted text and are matched against the
// person's own posted purchases (packages/domain/90-card-offers.js, CardOffers, through the router bundle). Upmore never
// adds, activates or enrolls an offer, and instructions inside the pasted text change nothing. Pure apart from the
// injected readers; tests/edge/card-offers-answer.test.ts.
import { CardOffers } from "../../_shared/router_core.js";

export async function cardOffersReply(message: string, today: string, readAccounts: () => Promise<any[]>, readTx: () => Promise<any[]>): Promise<string | null> {
  const kind = CardOffers.kind(message, today);
  if (!kind) return null;
  if (kind === "ask") return CardOffers.answer(message, today, [], []);
  const [accounts, tx] = await Promise.all([readAccounts(), readTx()]);
  return CardOffers.answer(message, today, accounts, tx);
}
