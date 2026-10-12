// "What's new": the review inbox in chat (overnight H1; packages/domain/92-whats-new.js). What posted since the person
// last asked, from their own rows, with what deserves a look flagged; the "reviewed through" date is read back from
// Upmore's own last "what's new" reply in the thread. Read-only. Pure apart from the injected readers, so
// tests/edge/whats-new-answer.test.ts drives it with fixtures.
import { WhatsNew } from "../../_shared/router_core.js";
import type { TxRow } from "./direct_answers.ts";

export function isWhatsNew(message: string): boolean {
  return WhatsNew.isAsk(message);
}

export async function whatsNewReply(message: string, today: string, readTx: () => Promise<TxRow[]>, readPrevious: () => Promise<{ role: string; content: string }[]>): Promise<string | null> {
  // "Anything unusual?" (capability list item 9): the same flags over the last 30 days (7 for "this week"), read-only.
  if (WhatsNew.isUnusualAsk(message)) return WhatsNew.unusual(message, { today, transactions: await readTx() })?.text ?? null;
  if (!WhatsNew.isAsk(message)) return null;
  const [transactions, previous] = await Promise.all([readTx(), readPrevious().catch(() => [])]);
  return WhatsNew.answer(message, { today, transactions, previous })?.text ?? null;
}
