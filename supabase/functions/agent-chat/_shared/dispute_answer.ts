// "Dispute this charge" answered from code (live gauntlet S16-17, 2026-10-12): the charge is found in the person's own
// transactions and the reply is a pre-filled dispute they send themselves (the merchant first, then the card issuer or
// bank), every amount and date from their rows with the source and as-of date. Upmore never sends or submits a dispute.
// A photo with no details in the text is left to the photo reader (null here). Thin wrapper over packages/domain/79-dispute.js
// (AgentDispute, through the router bundle); pure apart from the injected reader, so tests/edge/dispute-answer.test.ts
// drives it with fixtures. Mirrors findMoneyReply in direct_answers.ts.
import { AgentDispute } from "../../_shared/router_core.js";
import type { TxRow } from "./direct_answers.ts";

export type PhotoFields = { merchant?: string | null; amount_cents?: number | null; date?: string | null };

const usable = (rows: TxRow[]) => rows.filter((r) => r && r.posted_on && Number.isFinite(r.amount_cents));

export function isDisputeAsk(message: string): boolean {
  return AgentDispute.isDisputeAsk(message);
}

export async function disputeReply(message: string, today: string, readTx: () => Promise<TxRow[]>, opts: { hasPhoto?: boolean } = {}): Promise<string | null> {
  if (!AgentDispute.isDisputeAsk(message)) return null;
  const rows = usable(await readTx());
  const a = AgentDispute.answer(message, rows, { today, has_photo: !!opts.hasPhoto });
  return a.text ?? null;
}

// Fields the host already read from a photo of the charge, matched against the person's rows the same way.
export async function disputePhotoReply(fields: PhotoFields, today: string, readTx: () => Promise<TxRow[]>): Promise<string> {
  const rows = usable(await readTx());
  return AgentDispute.fromPhoto(fields, rows, { today }).text;
}
