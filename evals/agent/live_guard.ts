// The owner's live test envelope (2026-10-11): $200 in all, $5 an order, every order live in the tester's own account.
// The guard refuses a plan before anything is sent when it would cross either line; spend is recorded with its receipt in
// evals/agent/live-ledger.json (committed), so the envelope survives across runs and machines.
export const ENVELOPE_CENTS = 20000, ORDER_CAP_CENTS = 500;
export const BUDGET_LINES: Record<string, number> = { recurring: 5000, copy: 5000, manual_and_dividends: 2500, payments: 2500, buffer: 5000 };
export function guardPlan(p: { spent_cents: number; orders: { cents: number; line?: string }[]; line_spent?: Record<string, number> }) {
  const planned = p.orders.reduce((a, o) => a + o.cents, 0);
  if (p.orders.some(o => !Number.isInteger(o.cents) || o.cents <= 0 || o.cents > ORDER_CAP_CENTS)) return { ok: false, reason: `every order is at most $${ORDER_CAP_CENTS / 100}` };
  if (p.spent_cents + planned > ENVELOPE_CENTS) return { ok: false, reason: `this would take spend to $${((p.spent_cents + planned) / 100).toFixed(2)}, over the $${ENVELOPE_CENTS / 100} envelope` };
  for (const o of p.orders) if (o.line) { const used = ((p.line_spent || {})[o.line] || 0) + p.orders.filter(x => x.line === o.line).reduce((a, x) => a + x.cents, 0); if (BUDGET_LINES[o.line] === undefined || used > BUDGET_LINES[o.line]) return { ok: false, reason: `the ${o.line} line is $${(BUDGET_LINES[o.line] || 0) / 100}` }; }
  return { ok: true, reason: null };
}
