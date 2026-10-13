// Payroll, benefits and equity PREPARATION answered from code (cluster K10: C101, C103, C108, C159, C172,
// C184, C196, C202, C204): forgotten-401(k) search workflow, FSA claim packet, benefits audit math, W-4
// worksheet lines, PSLF tracker, dependent care FSA packet, direct-deposit change PREPARED (never
// submitted), open-enrollment total-cost math, equity deadline checklist. Portal rails are not wired, so
// every reply is a preparation surface on the facts passed in and ends with the owner's own submission
// step. Thin wrapper over packages/domain/118-payroll-benefits.js (PayrollBenefits, through the router
// bundle); pure apart from the injected profile, so tests/edge/k10-payroll-transcript.test.ts drives it.
// NOTE: the production handler passes no real employer profile yet (no payroll/benefits connection exists),
// so in production this fires only when a profile is supplied; the edge test supplies the stand-in fixture.
import { PayrollBenefits, PAYROLL_REF_JSON } from "../../_shared/router_core.js";

export function payrollKind(message: string): string | null {
  return (PayrollBenefits as any).kind(message);
}

export function payrollReply(message: string, today: string, profile: unknown): string | null {
  const out = (PayrollBenefits as any).answer(message, { profile, ref: PAYROLL_REF_JSON, today });
  return out ? (out.text as string) : null;
}
