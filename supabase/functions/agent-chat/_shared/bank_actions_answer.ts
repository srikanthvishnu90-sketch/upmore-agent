// Bank-action packets (real-world C77/C79/C96/C99/C141/C168/C199), thin wrapper over
// packages/domain/118-bank-actions.js (BankActions, through the router bundle): the written-channel
// preparation layer — fee-reversal packets from the person's real fee rows, a dispute case record with
// its deadlines around the draft the person sends, signup-bonus matching against the learned
// direct-deposit pattern, retention and APR math with drafts, closure disclosure, and the fraud
// 'not me' packet. Nothing here sends, files, submits, locks or closes: the person does that at the
// issuer; outcomes are tracked against later rows. Pure apart from the injected readers, so
// tests/edge/bank-actions.test.ts drives it with fixtures.
import { BankActions } from "../../_shared/router_core.js";

const B: any = BankActions as any;

export function feePacketText(rows: any[], today: string, institution: string, sourceLine: string): string | null {
  return B.feePacketText(rows, today, institution, sourceLine);
}
export function feeStatusText(fee: any, rowsAfter: any[], sourceLine: string | null): string {
  return B.feeStatusText(fee, rowsAfter, sourceLine);
}
export function disputeCaseText(charge: any, opts: any): string {
  return B.disputeCaseText(charge, opts);
}
export function disputeCase(charge: any, opts: any): any {
  return B.disputeCase(charge, opts);
}
export function disputeStatusText(caseRec: any, rowsAfter: any[], sourceLine: string | null): string {
  return B.disputeStatusText(caseRec, rowsAfter, sourceLine);
}
export function bonusText(offers: any[], rows: any[], today: string, sourceLine: string): string {
  return B.bonusText(offers, B.ddPattern(rows), today, sourceLine);
}
export function ddPattern(rows: any[]): any {
  return B.ddPattern(rows);
}
export function retentionText(input: any): string {
  return B.retentionPacket(input).text;
}
export function aprText(input: any): string {
  return B.aprPacket(input).text;
}
export function closureText(input: any): string {
  return B.closurePacket(input).text;
}
export function fraudText(firing: any, charges: any[], opts: any): string {
  return B.fraudPacket(firing, charges, opts).text;
}
