// Market and news intelligence answered from code (owner's capability list items C17-C21, C23, C25-C27, C31-C39,
// C42-C45): briefings, mover explainers, watchlist, digest, explainers, deep dives, screens, comparisons and the
// read-backs for the alert items. Thin wrapper over packages/domain/118-market-intel.js (MarketIntel, through the
// router bundle) over the dated stand-in dataset packages/offers/market-data.json (MARKET_DATA_JSON): no live
// market feed is connected, so every reply carries the dataset's source line and calls the data stand-in. Setting,
// listing and stopping the watches themselves is a settings command (_shared/proactive.ts parseCommand, same
// module's command()); this answer leaves those alone except through the module's own ask routing. Data and math
// only — no investment advice, no verdicts.
import { MarketIntel, MARKET_DATA_JSON } from "../../_shared/router_core.js";

export function marketKind(message: string): string | null {
  return (MarketIntel as any).ask(message);
}

export async function marketReply(message: string, now: Date, o: { watches?: () => Promise<any[]> | any[]; data?: any } = {}): Promise<string | null> {
  if (!(MarketIntel as any).ask(message)) return null;
  const watches = o.watches ? await o.watches() : [];
  return (MarketIntel as any).answer(message, now.getTime(), { data: o.data || MARKET_DATA_JSON, watches: Array.isArray(watches) ? watches : [] });
}
