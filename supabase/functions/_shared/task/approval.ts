// Task intelligence, the answer to a plan's batch card (D-MS-1, D-MN-2). No new grammar: the card answers are trunk's
// (career_apply_cards.ts parseCardReply: "yes", "yes but not 2", "approve all", "no") and the numbered subsets are the
// outreach grammar's number lists (career_outreach.ts parseNumbers: "1-3,5"), behind "only" / "just" / "send". When lane
// B's grammar (PR #223) lands, this delegates to it (spec P2: one grammar). Ambiguous answers approve nothing.
import { parseCardReply } from "../career_apply_cards.ts";
import { parseNumbers } from "../career_outreach.ts";

export type CardAnswer =
  | { kind: "approve"; numbers: number[] } // exactly these, each by the hash shown
  | { kind: "decline" }
  | { kind: "unclear"; why: "not_on_card" | "nothing_left" } // looked like an answer, approves nothing
  | null; // not an answer to the card

export function cardAnswer(message: string, count: number): CardAnswer {
  const all = Array.from({ length: count }, (_, i) => i + 1);
  const r = parseCardReply(message);
  if (r?.kind === "no") return { kind: "decline" };
  if (r?.kind === "yes") {
    if (r.except.some((n) => n < 1 || n > count)) return { kind: "unclear", why: "not_on_card" };
    const numbers = all.filter((n) => !r.except.includes(n));
    return numbers.length ? { kind: "approve", numbers } : { kind: "unclear", why: "nothing_left" };
  }
  const t = String(message ?? "").toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  const only = /^(?:yes,? )?(?:only|just|send|approve) (?:numbers? |#)?([\d ,&\-and]+)$/.exec(t);
  if (only) {
    const p = parseNumbers(only[1]);
    if (!p || !p.ok) return { kind: "unclear", why: "not_on_card" };
    if (p.ns.some((n) => n > count)) return { kind: "unclear", why: "not_on_card" };
    return { kind: "approve", numbers: p.ns };
  }
  return null;
}
