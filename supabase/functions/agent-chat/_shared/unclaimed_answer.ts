// Unclaimed money answered from code (overnight C6; owner cards M2-UNCLAIMED-01 and M2-UNCLAIMED-10): whether a state
// treasurer letter or email comes from the official sender on file, and whether a bank the person names, or one in their
// linked accounts and history, is on the FDIC failed bank list kept as dated data, with who took the deposits and the
// FDIC's 18-month and 10-year rules. Upmore searches no records and files nothing. Thin wrapper over
// packages/domain/91-unclaimed.js (Unclaimed, through the router bundle); pure apart from the injected readers, so
// tests/edge/unclaimed-answer.test.ts drives it with fixtures.
import { Unclaimed, FAILED_BANKS_JSON, UNCLAIMED_PROGRAMS_JSON } from "../../_shared/router_core.js";
import type { TxRow } from "./direct_answers.ts";
import type { AccountRow } from "./money_answers.ts";

const DATA = { banks: FAILED_BANKS_JSON, programs: UNCLAIMED_PROGRAMS_JSON };

export function unclaimedKind(message: string): string | null {
  return Unclaimed.kind(message, DATA);
}

// A pasted letter reads nothing. A failed-bank question reads the person's accounts (closed ones included: an old bank
// is usually a closed account) and transactions only when they name no bank, to look for one in their own history.
export async function unclaimedReply(message: string, today: string, readTx: () => Promise<TxRow[]>, readAccounts: () => Promise<AccountRow[]>): Promise<string | null> {
  const kind = Unclaimed.kind(message, DATA);
  if (!kind) return null;
  const ctx: Record<string, unknown> = { today, ...DATA };
  if (kind === "failed_bank" && !Unclaimed.failedBank(message, { today, ...DATA }).named.length) {
    const [accounts, tx] = await Promise.all([readAccounts(), readTx()]);
    ctx.accounts = accounts;
    ctx.transactions = tx;
  }
  return Unclaimed.answer(message, ctx).text ?? null;
}
