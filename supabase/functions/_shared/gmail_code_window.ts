// Which sign-in email may supply a code or link. Gmail search has no minutes: in `newer_than:15m` the m is MONTHS, so the
// old query let a code from mail up to 15 months old be entered. The search now asks for the last day (the finest unit
// Gmail has) and only a message Gmail received in the last 15 minutes, by its own internalDate, is used.
export const CODE_WINDOW_MS = 15 * 60 * 1000;
export const gmailCodeQuery = (sender: string) => `from:${sender} newer_than:1d`;
export function freshForCode(message: { internalDate?: string | number }, now: number, windowMs = CODE_WINDOW_MS): boolean {
  const at = Number(message?.internalDate);
  return Number.isFinite(at) && at > 0 && at <= now + 60_000 && now - at <= windowMs;
}
