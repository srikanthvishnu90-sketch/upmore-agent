// Rewards math in chat (overnight F1-F3): "how am i doing on my freedom flex 5%", "how close am i to my sapphire
// preferred bonus? $5,000 in 3 months, opened sep 15", "is my sapphire preferred annual fee worth it". The numbers and
// wording come from packages/domain/87-rewards-math.js (RewardsMath, through the router bundle) over the person's own
// card rows, with outside terms from the dated offer book. Nothing is applied for, activated or called. Pure apart from
// the injected readers; tests/edge/rewards-answer.test.ts.
import { RewardsMath, OfferBook, OFFER_TERMS_JSON } from "../../_shared/router_core.js";

const BOOK = OfferBook.create(OFFER_TERMS_JSON);

export async function rewardsReply(message: string, today: string, readAccounts: () => Promise<any[]>, readTx: () => Promise<any[]>): Promise<string | null> {
  if (!RewardsMath.kind(message)) return null;
  const [accounts, tx] = await Promise.all([readAccounts(), readTx()]);
  return RewardsMath.answer(message, today, accounts, tx, BOOK);
}
