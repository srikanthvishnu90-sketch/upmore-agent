// Crypto tax export answered from code (real-world capability C163; registry TAX-007): "get my crypto taxes
// sorted", with the venue export CSV pasted in the same message or following the prompt. Read-only: no venue is
// connected, nothing is traded, filed or sent. The pasted rows are normalized and matched lot by lot (FIFO by
// default; LIFO and HIFO on the person's word) by packages/domain/118-crypto-tax.js (CryptoTax, through the
// router bundle); the reply is the gain/loss summary, the honest missing-basis list, the wash-sale note for
// crypto's current rules, the 1099-DA comparison when the person quotes the form, and the Form 8949 and
// tax-tool exports. With no file, the reply is the prompt that says what to paste and why nothing is invented.
// Trade asks are never this (the crypto guard in _shared/capabilities.ts keeps them, with a narrow carve-out
// for tax words with no trade verb, and for a pasted CSV itself).
import { CryptoTax } from "../../_shared/router_core.js";

export function cryptoTaxKind(message: string): unknown {
  return (CryptoTax as any).ask(message);
}

export async function cryptoTaxReply(message: string, previous?: () => Promise<any[]> | any[]): Promise<string | null> {
  const CT = CryptoTax as any;
  if (!CT.ask(message) && !CT.looksLikeCsv(message)) return null;
  // A message that is only a CSV (no tax words of its own) is claimed only when this thread already holds the
  // tax conversation — the prompt, or the person's own earlier tax ask; a stray paste elsewhere is not this.
  const csvPart = CT.extractCsv(message);
  const ownWords = csvPart ? message.replace(csvPart, "") : message;
  if (csvPart && !/\btax/i.test(ownWords)) {
    if (!previous) return null;
    const msgs = await previous().catch(() => []);
    const prior = (Array.isArray(msgs) ? msgs : []).some((m: any) => m && /crypto tax|nothing to sort yet|1099/i.test(String(m.content || "")));
    if (!prior) return null;
  }
  let context = "";
  if (previous) {
    const msgs = await previous().catch(() => []);
    if (Array.isArray(msgs)) context = msgs.slice().reverse().map((m: any) => `${m && m.role === "user" ? "user" : "agent"}: ${String((m && m.content) || "")}`).join("\n");
  }
  return CT.handle(message, { context });
}
