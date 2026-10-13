// Provider-portal cases in chat (cluster K8; packages/domain/118-portal-cases.js): cancels, claims, disputes and
// provider-state items whose live portals are NOT_WIRED. This answer detects the case, then either asks the ONE
// costly question the case needs, shows the Operating Model approval card, or gives the read-only audit/ledger
// answer. Execution never happens here: a card's yes is handled only where the case state and the sandbox
// provider record live (PortalCases.execute), and packet items are prepared for the person's own tap, never
// filed. Facts come from the injected reader; with no portal-facts store wired, the reader returns {} and the
// person is asked — the agent never invents the missing fact.
import { PortalCases } from "../../_shared/router_core.js";

export async function portalReply(message: string, readFacts?: (id: string) => Promise<any>): Promise<string | null> {
  const id = PortalCases.detect(message);
  if (!id) return null;
  const facts = readFacts ? (await readFacts(id)) || {} : {};
  const p = PortalCases.prepare(id, facts);
  if (!p) return null;
  if (p.kind === "ask") {
    return `${p.text}\nLive boundary: that provider's portal is not wired to Upmore yet, so today I prepare the exact card or packet here and nothing runs on a live provider.`;
  }
  return p.text;
}
