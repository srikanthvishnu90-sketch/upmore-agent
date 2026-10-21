// WO-096: how long Trainee waits for the code an employer's form just emailed the person, and how often it looks. Shared
// by the worker (scripts/apply.ts through career_email_code.ts) and the browser extension (bundled into
// extension/lib/trainee-core.js), so both wait the same way. No mail is read here: `once` is one look, done elsewhere.
//
// The first look is at once (the mail may already be there); then 3, 4, 6, 9, 13, 20 and 30-second gaps, about three
// minutes in all. Anything but "not_yet" ends the wait at once: a found code, a missing Google connection, a grant without
// mail reading, or two different codes (ambiguous) are all answers.
export const CODE_POLL_DELAYS_MS = [3000, 4000, 6000, 9000, 13000, 20000, 30000, 30000, 30000, 30000];
export const CODE_MAX_WAIT_MS = 180_000;

export async function pollForCode<T extends { status: string }>(
  once: (attempt: number) => Promise<T>,
  o: { now: () => number; sleep?: (ms: number) => Promise<void>; maxWaitMs?: number } = { now: Date.now },
): Promise<T> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const max = Math.max(0, Math.min(o.maxWaitMs ?? CODE_MAX_WAIT_MS, CODE_MAX_WAIT_MS));
  const start = o.now();
  for (let i = 0;; i++) {
    const r = await once(i);
    if (r.status !== "not_yet") return r;
    const gap = CODE_POLL_DELAYS_MS[Math.min(i, CODE_POLL_DELAYS_MS.length - 1)];
    if (o.now() - start + gap > max) return r;
    await sleep(gap);
  }
}
