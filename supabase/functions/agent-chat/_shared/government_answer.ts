// Government preparation answered from code (cluster K11; owner capabilities C119, C120, C160, C162, C166):
// a property tax appeal packet with comps math and the county deadline, a homestead eligibility check against
// the county rules on file, an IRS notice decoded in plain words with its deadline clock and a drafted
// response, tax-refund tracking over the Where's My Refund stages with the deposit detected in the person's
// own transactions, and the FBAR aggregate-maximum math with the guided BSA filing packet. PREPARATION ONLY:
// every filing is the person's own legal tap; this path files, submits and sends nothing, and says so.
// Thin wrapper over packages/domain/118-agent-government.js (Government, through the router bundle) with the
// dated official data (packages/offers/government.json). Facts come from the message itself (a notice code,
// its date and amount; stated foreign balances) and from an injected profile reader; there is no government
// profile store yet, so the production reader returns null and the answers ask for the missing figures
// rather than inventing them. tests/edge/government-answer.test.ts drives it with fixtures.
import { Government, GOVERNMENT_JSON } from "../../_shared/router_core.js";
import type { TxRow } from "./direct_answers.ts";

export function governmentKind(message: string): string | null {
  return (Government as any).kind(message);
}

export async function governmentReply(
  message: string,
  today: string,
  readers: { profile?: () => Promise<any | null>; transactions?: () => Promise<TxRow[]> } = {},
): Promise<string | null> {
  const kind = (Government as any).kind(message);
  if (!kind) return null;
  const profile = readers.profile ? await readers.profile().catch(() => null) : null;
  const ctx: Record<string, unknown> = { today, data: GOVERNMENT_JSON, ...(profile || {}) };
  // Refund tracking watches the person's own transactions for the deposit (C162's proof).
  if (kind === "refund_track" && readers.transactions && !(profile && Array.isArray(profile.transactions))) {
    ctx.transactions = await readers.transactions().catch(() => []);
  }
  const out = (Government as any).answer(message, ctx);
  return out && out.text ? out.text : null;
}
